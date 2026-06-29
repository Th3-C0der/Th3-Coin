import * as net from 'net';
import { EventEmitter } from 'events';
import { IP2PNetwork, Transaction, Block, NetworkMessage, IBlockchain, IMempool } from '../interfaces';
import { ProtocolHandler } from './protocol';

export interface Peer {
  id: string;
  host: string;
  port: number;
  socket: net.Socket;
  connected: boolean;
  lastSeen: number;
}

export class NetworkNode extends EventEmitter {
  private server: net.Server | null = null;
  private peers: Map<string, Peer> = new Map();
  private port: number = 0;
  private isRunning: boolean = false;
  private protocolHandler: ProtocolHandler;
  private maxConnections: number = 10;

  constructor() {
    super();
    this.protocolHandler = new ProtocolHandler();
  }

  async startServer(port: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('Node is already running');
    }

    this.port = port;
    this.server = net.createServer();

    this.server.on('connection', (socket) => {
      this.handleIncomingConnection(socket);
    });

    this.server.on('error', (error) => {
      this.emit('error', error);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(port, () => {
        this.isRunning = true;
        this.emit('nodeStarted', { port });
        resolve();
      });

      this.server!.on('error', reject);
    });
  }

  async connectToPeer(host: string, port: number): Promise<void> {
    const peerId = `${host}:${port}`;
    
    if (this.peers.has(peerId)) {
      throw new Error(`Already connected to peer ${peerId}`);
    }

    if (this.peers.size >= this.maxConnections) {
      throw new Error('Maximum number of connections reached');
    }

    const socket = new net.Socket();
    
    return new Promise((resolve, reject) => {
      socket.connect(port, host, () => {
        const peer: Peer = {
          id: peerId,
          host,
          port,
          socket,
          connected: true,
          lastSeen: Date.now()
        };

        this.peers.set(peerId, peer);
        this.setupPeerHandlers(peer);
        this.emit('peerConnected', peer);
        resolve();
      });

      socket.on('error', (error) => {
        reject(error);
      });
    });
  }

  private handleIncomingConnection(socket: net.Socket): void {
    const remoteAddress = socket.remoteAddress;
    const remotePort = socket.remotePort;
    
    if (!remoteAddress || !remotePort) {
      socket.destroy();
      return;
    }

    const peerId = `${remoteAddress}:${remotePort}`;
    
    if (this.peers.has(peerId) || this.peers.size >= this.maxConnections) {
      socket.destroy();
      return;
    }

    const peer: Peer = {
      id: peerId,
      host: remoteAddress,
      port: remotePort,
      socket,
      connected: true,
      lastSeen: Date.now()
    };

    this.peers.set(peerId, peer);
    this.setupPeerHandlers(peer);
    this.emit('peerConnected', peer);
  }

  private setupPeerHandlers(peer: Peer): void {
    peer.socket.on('data', (data) => {
      try {
        const messages = this.parseMessages(data);
        messages.forEach(message => {
          peer.lastSeen = Date.now();
          this.handleMessage(peer, message);
        });
      } catch (error) {
        this.emit('error', new Error(`Failed to parse message from ${peer.id}: ${error}`));
      }
    });

    peer.socket.on('close', () => {
      peer.connected = false;
      this.peers.delete(peer.id);
      this.emit('peerDisconnected', peer);
    });

    peer.socket.on('error', (error) => {
      this.emit('error', new Error(`Peer ${peer.id} error: ${error}`));
      this.disconnectPeer(peer.id);
    });
  }

  private parseMessages(data: Buffer): NetworkMessage[] {
    const messages: NetworkMessage[] = [];
    const dataStr = data.toString();
    
    // Split by newlines to handle multiple messages
    const lines = dataStr.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (this.isValidMessage(message)) {
          messages.push(message);
        }
      } catch (error) {
        // Skip invalid JSON
      }
    }
    
    return messages;
  }

  private isValidMessage(obj: any): obj is NetworkMessage {
    return obj && 
           typeof obj.type === 'string' && 
           obj.data !== undefined && 
           typeof obj.timestamp === 'number';
  }

  private handleMessage(peer: Peer, message: NetworkMessage): void {
    this.emit('message', { peer, message });
    
    // Handle protocol-specific messages
    switch (message.type) {
      case 'ping':
        this.sendToPeer(peer.id, this.protocolHandler.createMessage('pong', {}));
        break;
      case 'pong':
        // Update last seen time (already done above)
        break;
      default:
        // Let the protocol handler deal with other message types
        this.protocolHandler.handleMessage(message);
    }
  }

  sendToPeer(peerId: string, message: NetworkMessage): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.connected) {
      return false;
    }

    try {
      const messageStr = JSON.stringify(message) + '\n';
      peer.socket.write(messageStr);
      return true;
    } catch (error) {
      this.emit('error', new Error(`Failed to send message to ${peerId}: ${error}`));
      return false;
    }
  }

  broadcast(message: NetworkMessage, excludePeer?: string): void {
    for (const [peerId, peer] of this.peers) {
      if (excludePeer && peerId === excludePeer) {
        continue;
      }
      
      if (peer.connected) {
        this.sendToPeer(peerId, message);
      }
    }
  }

  disconnectPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.socket.destroy();
      peer.connected = false;
      this.peers.delete(peerId);
      this.emit('peerDisconnected', peer);
    }
  }

  getPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  isNodeRunning(): boolean {
    return this.isRunning;
  }

  async stopNode(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Disconnect all peers
    for (const peer of this.peers.values()) {
      peer.socket.destroy();
    }
    this.peers.clear();

    // Close server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.isRunning = false;
          this.emit('nodeStopped');
          resolve();
        });
      });
    }

    this.isRunning = false;
  }
}

export class P2PNetwork extends EventEmitter implements IP2PNetwork {
  private networkNode: NetworkNode;
  private knownPeers: string[] = [];
  private blockchain?: IBlockchain;
  private mempool?: IMempool;
  private seenTransactions: Set<string> = new Set();
  private seenBlocks: Set<string> = new Set();
  private maxSeenItems: number = 1000;

  constructor(blockchain?: IBlockchain, mempool?: IMempool) {
    super();
    this.networkNode = new NetworkNode();
    this.blockchain = blockchain;
    this.mempool = mempool;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.networkNode.on('message', ({ peer, message }) => {
      // Handle different message types for blockchain operations
      switch (message.type) {
        case 'transaction':
          this.handleTransactionMessage(peer, message);
          break;
        case 'block':
          this.handleBlockMessage(peer, message);
          break;
        case 'getBlocks':
          this.handleGetBlocksMessage(peer, message);
          break;
        case 'getBlock':
          this.handleGetBlockMessage(peer, message);
          break;
        case 'blocks':
          this.handleBlocksMessage(peer, message);
          break;
        case 'blockNotFound':
          this.handleBlockNotFoundMessage(peer, message);
          break;
      }
    });

    this.networkNode.on('peerConnected', (peer) => {
      console.log(`Connected to peer: ${peer.id}`);
      this.emit('peerConnected', peer);
    });

    this.networkNode.on('peerDisconnected', (peer) => {
      console.log(`Disconnected from peer: ${peer.id}`);
      this.emit('peerDisconnected', peer);
    });

    this.networkNode.on('error', (error) => {
      console.error('Network error:', error);
      this.emit('error', error);
    });
  }

  private handleTransactionMessage(peer: Peer, message: NetworkMessage): void {
    try {
      const transaction = message.data as Transaction;
      
      // Check if we've already seen this transaction
      if (this.seenTransactions.has(transaction.id)) {
        return;
      }

      // Validate transaction format
      if (!this.isValidTransactionMessage(transaction)) {
        console.warn(`Invalid transaction format from ${peer.id}`);
        return;
      }

      // Add to seen transactions
      this.addSeenTransaction(transaction.id);

      // Try to add to mempool if available
      if (this.mempool) {
        const added = this.mempool.addTransaction(transaction);
        if (added) {
          console.log(`Added transaction ${transaction.id} to mempool from ${peer.id}`);
          // Relay to other peers (excluding the sender)
          this.relayTransaction(transaction, peer.id);
          this.emit('transactionReceived', { transaction, peer });
        } else {
          console.warn(`Failed to add transaction ${transaction.id} to mempool`);
        }
      } else {
        // No mempool available, just relay the transaction
        this.relayTransaction(transaction, peer.id);
        this.emit('transactionReceived', { transaction, peer });
      }
    } catch (error) {
      console.error(`Error handling transaction from ${peer.id}:`, error);
    }
  }

  private handleBlockMessage(peer: Peer, message: NetworkMessage): void {
    try {
      const block = message.data as Block;
      const blockHash = this.calculateBlockHash(block);
      
      // Check if we've already seen this block
      if (this.seenBlocks.has(blockHash)) {
        return;
      }

      // Validate block format
      if (!this.isValidBlockMessage(block)) {
        console.warn(`Invalid block format from ${peer.id}`);
        return;
      }

      // Add to seen blocks
      this.addSeenBlock(blockHash);

      // Try to add to blockchain if available
      if (this.blockchain) {
        this.blockchain.addBlock(block).then((added) => {
          if (added) {
            console.log(`Added block ${blockHash} to blockchain from ${peer.id}`);
            // Remove transactions from mempool if available
            if (this.mempool) {
              block.transactions.forEach(tx => {
                this.mempool!.removeTransaction(tx.id);
              });
            }
            // Relay to other peers (excluding the sender)
            this.relayBlock(block, peer.id);
            this.emit('blockReceived', { block, peer });
          } else {
            console.warn(`Failed to add block ${blockHash} to blockchain`);
          }
        }).catch((error) => {
          console.error(`Error adding block to blockchain:`, error);
        });
      } else {
        // No blockchain available, just relay the block
        this.relayBlock(block, peer.id);
        this.emit('blockReceived', { block, peer });
      }
    } catch (error) {
      console.error(`Error handling block from ${peer.id}:`, error);
    }
  }

  private handleGetBlocksMessage(peer: Peer, message: NetworkMessage): void {
    try {
      const request = message.data;
      console.log(`Received getBlocks request from ${peer.id}`, request);

      if (!this.blockchain) {
        console.warn('No blockchain available to serve getBlocks request');
        return;
      }

      // Get blocks starting from the requested height
      const startHeight = request.startHeight || 0;
      const maxBlocks = Math.min(request.maxBlocks || 100, 500); // Limit to prevent abuse

      const blocks: Block[] = [];
      const currentHeight = this.blockchain.getBlockHeight();

      for (let height = startHeight; height <= currentHeight && blocks.length < maxBlocks; height++) {
        // Get block by height (we'll need to implement this in blockchain)
        // For now, we'll get the latest block as an example
        if (height === currentHeight) {
          const latestBlock = this.blockchain.getLatestBlock();
          if (latestBlock) {
            blocks.push(latestBlock);
          }
        }
      }

      // Send blocks response
      const response = this.networkNode['protocolHandler'].createMessage('blocks', {
        blocks,
        startHeight,
        totalBlocks: blocks.length
      });

      this.networkNode.sendToPeer(peer.id, response);
      console.log(`Sent ${blocks.length} blocks to ${peer.id}`);
    } catch (error) {
      console.error(`Error handling getBlocks request from ${peer.id}:`, error);
    }
  }

  private handleGetBlockMessage(peer: Peer, message: NetworkMessage): void {
    try {
      const request = message.data;
      console.log(`Received getBlock request from ${peer.id}`, request);

      if (!this.blockchain) {
        console.warn('No blockchain available to serve getBlock request');
        return;
      }

      const blockHash = request.blockHash;
      if (!blockHash || typeof blockHash !== 'string') {
        console.warn(`Invalid block hash in getBlock request from ${peer.id}`);
        return;
      }

      // Get specific block by hash
      this.blockchain.getBlock(blockHash).then((block) => {
        if (block) {
          const response = this.networkNode['protocolHandler'].createMessage('block', block);
          this.networkNode.sendToPeer(peer.id, response);
          console.log(`Sent block ${blockHash} to ${peer.id}`);
        } else {
          // Send not found response
          const response = this.networkNode['protocolHandler'].createMessage('blockNotFound', {
            blockHash
          });
          this.networkNode.sendToPeer(peer.id, response);
          console.log(`Block ${blockHash} not found for ${peer.id}`);
        }
      }).catch((error) => {
        console.error(`Error retrieving block ${blockHash}:`, error);
      });
    } catch (error) {
      console.error(`Error handling getBlock request from ${peer.id}:`, error);
    }
  }

  async startNode(port: number): Promise<void> {
    await this.networkNode.startServer(port);
  }

  async connectToPeer(host: string, port: number): Promise<void> {
    await this.networkNode.connectToPeer(host, port);
    const peerAddress = `${host}:${port}`;
    if (!this.knownPeers.includes(peerAddress)) {
      this.knownPeers.push(peerAddress);
    }
  }

  broadcastTransaction(transaction: Transaction): void {
    // Validate transaction before broadcasting
    if (!this.isValidTransactionMessage(transaction)) {
      throw new Error('Invalid transaction format');
    }

    // Add to seen transactions to avoid processing our own broadcast
    this.addSeenTransaction(transaction.id);

    const message = this.networkNode['protocolHandler'].createMessage('transaction', transaction);
    this.networkNode.broadcast(message);
    console.log(`Broadcasted transaction ${transaction.id} to ${this.getPeerCount()} peers`);
  }

  broadcastBlock(block: Block): void {
    // Validate block before broadcasting
    if (!this.isValidBlockMessage(block)) {
      throw new Error('Invalid block format');
    }

    const blockHash = this.calculateBlockHash(block);
    
    // Add to seen blocks to avoid processing our own broadcast
    this.addSeenBlock(blockHash);

    const message = this.networkNode['protocolHandler'].createMessage('block', block);
    this.networkNode.broadcast(message);
    console.log(`Broadcasted block ${blockHash} to ${this.getPeerCount()} peers`);
  }

  async syncBlockchain(): Promise<void> {
    if (!this.blockchain) {
      throw new Error('No blockchain available for synchronization');
    }

    const peers = this.networkNode.getPeers();
    if (peers.length === 0) {
      console.log('No peers available for blockchain synchronization');
      return;
    }

    console.log(`Starting blockchain synchronization with ${peers.length} peers`);

    try {
      // Get our current blockchain height
      const currentHeight = this.blockchain.getBlockHeight();
      console.log(`Current blockchain height: ${currentHeight}`);

      // Request blocks from all peers
      const syncPromises = peers.map(peer => this.syncWithPeer(peer, currentHeight));
      
      // Wait for all sync attempts to complete
      const results = await Promise.allSettled(syncPromises);
      
      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`Blockchain sync completed: ${successful} successful, ${failed} failed`);
      
      if (successful === 0) {
        throw new Error('Failed to sync with any peers');
      }
    } catch (error) {
      console.error('Blockchain synchronization failed:', error);
      throw error;
    }
  }

  getPeerCount(): number {
    return this.networkNode.getPeerCount();
  }

  async stopNode(): Promise<void> {
    await this.networkNode.stopNode();
  }

  // Additional methods for peer management
  getKnownPeers(): string[] {
    return [...this.knownPeers];
  }

  addKnownPeer(peerAddress: string): void {
    if (!this.knownPeers.includes(peerAddress)) {
      this.knownPeers.push(peerAddress);
    }
  }

  getNetworkNode(): NetworkNode {
    return this.networkNode;
  }

  // Set blockchain and mempool references
  setBlockchain(blockchain: IBlockchain): void {
    this.blockchain = blockchain;
  }

  setMempool(mempool: IMempool): void {
    this.mempool = mempool;
  }

  // Private helper methods for transaction and block handling
  private isValidTransactionMessage(transaction: Transaction): boolean {
    return transaction &&
           typeof transaction.id === 'string' &&
           Array.isArray(transaction.inputs) &&
           Array.isArray(transaction.outputs) &&
           typeof transaction.timestamp === 'number' &&
           transaction.inputs.every(this.isValidTransactionInput) &&
           transaction.outputs.every(this.isValidTransactionOutput);
  }

  private isValidTransactionInput(input: any): boolean {
    return input &&
           typeof input.txId === 'string' &&
           typeof input.outputIndex === 'number' &&
           typeof input.signature === 'string' &&
           typeof input.publicKey === 'string';
  }

  private isValidTransactionOutput(output: any): boolean {
    return output &&
           typeof output.address === 'string' &&
           typeof output.amount === 'number' &&
           output.amount > 0;
  }

  private isValidBlockMessage(block: Block): boolean {
    return block &&
           this.isValidBlockHeader(block.header) &&
           Array.isArray(block.transactions) &&
           block.transactions.every((tx: Transaction) => this.isValidTransactionMessage(tx));
  }

  private isValidBlockHeader(header: any): boolean {
    return header &&
           typeof header.version === 'number' &&
           typeof header.previousHash === 'string' &&
           typeof header.merkleRoot === 'string' &&
           typeof header.timestamp === 'number' &&
           typeof header.difficulty === 'number' &&
           typeof header.nonce === 'number';
  }

  private calculateBlockHash(block: Block): string {
    // Simple hash calculation for tracking purposes
    // In a real implementation, this would use the same hash function as the blockchain
    const headerStr = JSON.stringify(block.header);
    return require('crypto').createHash('sha256').update(headerStr).digest('hex');
  }

  private relayTransaction(transaction: Transaction, excludePeerId: string): void {
    const message = this.networkNode['protocolHandler'].createMessage('transaction', transaction);
    this.networkNode.broadcast(message, excludePeerId);
  }

  private relayBlock(block: Block, excludePeerId: string): void {
    const message = this.networkNode['protocolHandler'].createMessage('block', block);
    this.networkNode.broadcast(message, excludePeerId);
  }

  private addSeenTransaction(txId: string): void {
    this.seenTransactions.add(txId);
    
    // Limit the size of seen transactions to prevent memory issues
    if (this.seenTransactions.size > this.maxSeenItems) {
      const firstItem = this.seenTransactions.values().next().value;
      if (firstItem) {
        this.seenTransactions.delete(firstItem);
      }
    }
  }

  private addSeenBlock(blockHash: string): void {
    this.seenBlocks.add(blockHash);
    
    // Limit the size of seen blocks to prevent memory issues
    if (this.seenBlocks.size > this.maxSeenItems) {
      const firstItem = this.seenBlocks.values().next().value;
      if (firstItem) {
        this.seenBlocks.delete(firstItem);
      }
    }
  }

  // Public methods for getting seen items (useful for testing)
  getSeenTransactionCount(): number {
    return this.seenTransactions.size;
  }

  getSeenBlockCount(): number {
    return this.seenBlocks.size;
  }

  hasSeenTransaction(txId: string): boolean {
    return this.seenTransactions.has(txId);
  }

  hasSeenBlock(blockHash: string): boolean {
    return this.seenBlocks.has(blockHash);
  }

  // Clear seen items (useful for testing)
  clearSeenItems(): void {
    this.seenTransactions.clear();
    this.seenBlocks.clear();
  }

  // Blockchain synchronization helper methods
  private async syncWithPeer(peer: Peer, currentHeight: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Sync with peer ${peer.id} timed out`));
      }, 30000); // 30 second timeout

      // Set up one-time listener for blocks response
      const handleBlocksMessage = (data: { peer: Peer; message: NetworkMessage }) => {
        if (data.peer.id === peer.id && data.message.type === 'blocks') {
          clearTimeout(timeout);
          this.networkNode.off('message', handleBlocksMessage);
          
          try {
            this.processReceivedBlocks(data.message.data);
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      };

      this.networkNode.on('message', handleBlocksMessage);

      // Request blocks from this peer
      const request = this.networkNode['protocolHandler'].createMessage('getBlocks', {
        startHeight: currentHeight + 1,
        maxBlocks: 100
      });

      const sent = this.networkNode.sendToPeer(peer.id, request);
      if (!sent) {
        clearTimeout(timeout);
        this.networkNode.off('message', handleBlocksMessage);
        reject(new Error(`Failed to send sync request to peer ${peer.id}`));
      }
    });
  }

  private handleBlocksMessage(peer: Peer, message: NetworkMessage): void {
    try {
      console.log(`Received blocks response from ${peer.id}`);
      // The actual processing is handled in syncWithPeer method
      // This handler just emits the event for the sync process to catch
    } catch (error) {
      console.error(`Error handling blocks message from ${peer.id}:`, error);
    }
  }

  private handleBlockNotFoundMessage(peer: Peer, message: NetworkMessage): void {
    try {
      const data = message.data;
      console.log(`Block not found response from ${peer.id} for hash: ${data.blockHash}`);
      this.emit('blockNotFound', { peer, blockHash: data.blockHash });
    } catch (error) {
      console.error(`Error handling blockNotFound message from ${peer.id}:`, error);
    }
  }

  private async processReceivedBlocks(data: any): Promise<void> {
    if (!this.blockchain) {
      throw new Error('No blockchain available to process received blocks');
    }

    const { blocks, startHeight, totalBlocks } = data;
    
    if (!Array.isArray(blocks)) {
      throw new Error('Invalid blocks data received');
    }

    console.log(`Processing ${blocks.length} received blocks starting from height ${startHeight}`);

    let addedCount = 0;
    let rejectedCount = 0;

    for (const blockData of blocks) {
      try {
        // Validate block format
        if (!this.isValidBlockMessage(blockData)) {
          console.warn('Received invalid block format during sync');
          rejectedCount++;
          continue;
        }

        // Try to add block to blockchain
        const added = await this.blockchain.addBlock(blockData);
        if (added) {
          addedCount++;
          console.log(`Added synced block to blockchain`);
          
          // Remove transactions from mempool if available
          if (this.mempool) {
            blockData.transactions.forEach((tx: Transaction) => {
              this.mempool!.removeTransaction(tx.id);
            });
          }
          
          this.emit('blockSynced', { block: blockData });
        } else {
          rejectedCount++;
          console.warn('Failed to add synced block to blockchain');
        }
      } catch (error) {
        rejectedCount++;
        console.error('Error processing synced block:', error);
      }
    }

    console.log(`Sync processing complete: ${addedCount} added, ${rejectedCount} rejected`);
    
    // Only throw error if we received blocks but couldn't add any due to errors
    // It's normal for some blocks to be rejected if they're already in the blockchain
    if (addedCount === 0 && blocks.length > 0 && rejectedCount === blocks.length) {
      console.warn('All received blocks were rejected during sync');
      // Don't throw error - this is handled gracefully
    }
  }

  // Request specific block by hash
  async requestBlock(blockHash: string, timeoutMs: number = 10000): Promise<Block | null> {
    const peers = this.networkNode.getPeers();
    if (peers.length === 0) {
      throw new Error('No peers available to request block');
    }

    // Try each peer until we get the block
    for (const peer of peers) {
      try {
        const block = await this.requestBlockFromPeer(peer, blockHash, timeoutMs);
        if (block) {
          return block;
        }
      } catch (error) {
        console.warn(`Failed to get block ${blockHash} from peer ${peer.id}:`, error);
      }
    }

    return null;
  }

  private async requestBlockFromPeer(peer: Peer, blockHash: string, timeoutMs: number): Promise<Block | null> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Block request timed out for peer ${peer.id}`));
      }, timeoutMs);

      // Set up one-time listeners
      const handleBlockMessage = (data: { peer: Peer; message: NetworkMessage }) => {
        if (data.peer.id === peer.id && data.message.type === 'block') {
          clearTimeout(timeout);
          this.networkNode.off('message', handleBlockMessage);
          this.networkNode.off('message', handleBlockNotFoundMessage);
          resolve(data.message.data as Block);
        }
      };

      const handleBlockNotFoundMessage = (data: { peer: Peer; message: NetworkMessage }) => {
        if (data.peer.id === peer.id && data.message.type === 'blockNotFound') {
          clearTimeout(timeout);
          this.networkNode.off('message', handleBlockMessage);
          this.networkNode.off('message', handleBlockNotFoundMessage);
          resolve(null);
        }
      };

      this.networkNode.on('message', handleBlockMessage);
      this.networkNode.on('message', handleBlockNotFoundMessage);

      // Send request
      const request = this.networkNode['protocolHandler'].createMessage('getBlock', {
        blockHash
      });

      const sent = this.networkNode.sendToPeer(peer.id, request);
      if (!sent) {
        clearTimeout(timeout);
        this.networkNode.off('message', handleBlockMessage);
        this.networkNode.off('message', handleBlockNotFoundMessage);
        reject(new Error(`Failed to send block request to peer ${peer.id}`));
      }
    });
  }

  // Get blockchain synchronization status
  getSyncStatus(): { isSyncing: boolean; currentHeight: number; peerCount: number } {
    return {
      isSyncing: false, // We could add a flag to track this
      currentHeight: this.blockchain ? this.blockchain.getBlockHeight() : 0,
      peerCount: this.networkNode.getPeerCount()
    };
  }
}