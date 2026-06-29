import { P2PNetwork } from '../p2p';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../../core/transaction';
import { BlockImpl, BlockHeaderImpl } from '../../core/block';
import { Transaction, Block } from '../../interfaces';

describe('P2P Network Broadcasting Simple Tests', () => {
  let network1: P2PNetwork;
  let network2: P2PNetwork;

  const port1 = 18101;
  const port2 = 18102;

  beforeEach(async () => {
    // Create networks without blockchain/mempool to test pure broadcasting
    network1 = new P2PNetwork();
    network2 = new P2PNetwork();

    // Start nodes
    await network1.startNode(port1);
    await network2.startNode(port2);

    // Connect networks
    await network1.connectToPeer('localhost', port2);
    
    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await network1.stopNode();
    await network2.stopNode();
  });

  describe('Transaction Broadcasting', () => {
    it('should broadcast and receive transactions', async () => {
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      // Set up event listener for network2
      const transactionReceived = new Promise<Transaction>((resolve) => {
        network2.once('transactionReceived', ({ transaction }) => {
          resolve(transaction);
        });
      });

      // Broadcast transaction from network1
      network1.broadcastTransaction(transaction);

      // Wait for transaction to be received
      const receivedTransaction = await transactionReceived;
      expect(receivedTransaction.id).toBe(transaction.id);
      expect(receivedTransaction.outputs[0].amount).toBe(1000);
    });

    it('should not relay duplicate transactions', async () => {
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      let receivedCount = 0;
      network2.on('transactionReceived', () => {
        receivedCount++;
      });

      // Broadcast same transaction twice
      network1.broadcastTransaction(transaction);
      
      // Wait a bit then broadcast again
      await new Promise(resolve => setTimeout(resolve, 100));
      network1.broadcastTransaction(transaction);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should only receive once
      expect(receivedCount).toBe(1);
    });

    it('should validate transaction format before broadcasting', () => {
      const invalidTransaction = {
        id: 'invalid',
        inputs: 'not-an-array', // Invalid
        outputs: [],
        timestamp: Date.now()
      } as any;

      expect(() => {
        network1.broadcastTransaction(invalidTransaction);
      }).toThrow('Invalid transaction format');
    });
  });

  describe('Block Broadcasting', () => {
    it('should broadcast and receive blocks', async () => {
      const outputs = [new TransactionOutputImpl('miner-address', 2500000000)];
      const transactions = [new TransactionImpl([], outputs, Date.now())];

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );

      const block = new BlockImpl(header, transactions);

      // Set up event listener for network2
      const blockReceived = new Promise<Block>((resolve) => {
        network2.once('blockReceived', ({ block }) => {
          resolve(block);
        });
      });

      // Broadcast block from network1
      network1.broadcastBlock(block);

      // Wait for block to be received
      const receivedBlock = await blockReceived;
      expect(receivedBlock.header.version).toBe(1);
      expect(receivedBlock.transactions.length).toBe(1);
    });

    it('should not relay duplicate blocks', async () => {
      const outputs = [new TransactionOutputImpl('miner-address', 2500000000)];
      const transactions = [new TransactionImpl([], outputs, Date.now())];

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );

      const block = new BlockImpl(header, transactions);

      let receivedCount = 0;
      network2.on('blockReceived', () => {
        receivedCount++;
      });

      // Broadcast same block twice
      network1.broadcastBlock(block);
      
      // Wait a bit then broadcast again
      await new Promise(resolve => setTimeout(resolve, 100));
      network1.broadcastBlock(block);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should only receive once
      expect(receivedCount).toBe(1);
    });

    it('should validate block format before broadcasting', () => {
      const invalidBlock = {
        header: 'not-an-object', // Invalid
        transactions: []
      } as any;

      expect(() => {
        network1.broadcastBlock(invalidBlock);
      }).toThrow('Invalid block format');
    });
  });

  describe('Message Validation and Relay Logic', () => {
    it('should track seen transactions and blocks', () => {
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );
      const block = new BlockImpl(header, []);

      // Initially should not have seen items
      expect(network1.hasSeenTransaction(transaction.id)).toBe(false);
      expect(network1.getSeenBlockCount()).toBe(0);

      // After broadcasting, should track as seen
      network1.broadcastTransaction(transaction);
      network1.broadcastBlock(block);

      expect(network1.hasSeenTransaction(transaction.id)).toBe(true);
      expect(network1.getSeenTransactionCount()).toBe(1);
      expect(network1.getSeenBlockCount()).toBe(1);
    });

    it('should clear seen items when requested', () => {
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      network1.broadcastTransaction(transaction);
      expect(network1.getSeenTransactionCount()).toBe(1);

      network1.clearSeenItems();
      expect(network1.getSeenTransactionCount()).toBe(0);
      expect(network1.getSeenBlockCount()).toBe(0);
    });

    it('should relay transactions to multiple peers', async () => {
      // Create a third network to test relaying
      const network3 = new P2PNetwork();
      await network3.startNode(18103);
      await network2.connectToPeer('localhost', 18103);
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 200));

      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      // Set up event listener for network3
      const transactionReceived = new Promise<Transaction>((resolve) => {
        network3.once('transactionReceived', ({ transaction }) => {
          resolve(transaction);
        });
      });

      // Broadcast from network1, should reach network3 via network2
      network1.broadcastTransaction(transaction);

      // Wait for transaction to be relayed
      const receivedTransaction = await transactionReceived;
      expect(receivedTransaction.id).toBe(transaction.id);

      await network3.stopNode();
    });

    it('should relay blocks to multiple peers', async () => {
      // Create a third network to test relaying
      const network3 = new P2PNetwork();
      await network3.startNode(18104);
      await network2.connectToPeer('localhost', 18104);
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 200));

      const outputs = [new TransactionOutputImpl('miner-address', 2500000000)];
      const transactions = [new TransactionImpl([], outputs, Date.now())];

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );

      const block = new BlockImpl(header, transactions);

      // Set up event listener for network3
      const blockReceived = new Promise<Block>((resolve) => {
        network3.once('blockReceived', ({ block }) => {
          resolve(block);
        });
      });

      // Broadcast from network1, should reach network3 via network2
      network1.broadcastBlock(block);

      // Wait for block to be relayed
      const receivedBlock = await blockReceived;
      expect(receivedBlock.header.version).toBe(1);

      await network3.stopNode();
    });
  });

  describe('Network Event Handling', () => {
    it('should emit events when peers connect and disconnect', async () => {
      const network3 = new P2PNetwork();
      
      let peerConnectedCount = 0;
      let peerDisconnectedCount = 0;

      network1.on('peerConnected', () => {
        peerConnectedCount++;
      });

      network1.on('peerDisconnected', () => {
        peerDisconnectedCount++;
      });

      // Start and connect to network3
      await network3.startNode(18105);
      await network1.connectToPeer('localhost', 18105);
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(peerConnectedCount).toBe(1);

      // Disconnect
      await network3.stopNode();
      
      // Wait for disconnection
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(peerDisconnectedCount).toBe(1);
    });

    it('should handle network errors gracefully', () => {
      let errorCount = 0;
      network1.on('error', () => {
        errorCount++;
      });

      // Try to connect to non-existent peer
      expect(async () => {
        await network1.connectToPeer('localhost', 99999);
      }).rejects.toThrow();
    });
  });
});