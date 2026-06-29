import { Command } from 'commander';
import { P2PNetwork } from '../network/p2p';
import { BlockchainImpl } from '../core/blockchain';
import { Mempool } from '../core/mempool';
import { Storage } from '../storage/storage';
import { NetworkConfig, Th3CoinConfig } from '../interfaces';

/**
 * Network-related CLI commands
 * Handles peer connections, network status, and node management
 */
export class NetworkCommands {
  private p2pNetwork: P2PNetwork;
  private blockchain: BlockchainImpl;
  private mempool: Mempool;
  private storage: Storage;
  private isNodeRunning: boolean = false;
  private nodeConfig: Th3CoinConfig;

  constructor() {
    this.storage = new Storage();
    this.blockchain = new BlockchainImpl();
    this.mempool = new Mempool(() => this.blockchain.getUTXOs(''));
    
    // Default network configuration
    this.nodeConfig = {
      network: {
        port: 8333,
        peers: [],
        maxConnections: 10
      },
      mining: {
        difficulty: 1,
        blockReward: 2500000000,
        targetBlockTime: 600
      },
      dataDir: './data'
    };
    
    this.p2pNetwork = new P2PNetwork(this.blockchain, this.mempool);
  }

  /**
   * Initialize network components
   */
  private async initialize(): Promise<void> {
    await this.blockchain.initialize();
  }

  /**
   * Add network commands to the CLI program
   * @param program - Commander program instance
   */
  addCommands(program: Command): void {
    const networkCmd = program
      .command('network')
      .description('Network and peer management commands');

    // Show network status
    networkCmd
      .command('status')
      .description('Show network status and peer connections')
      .action(async () => {
        try {
          await this.initialize();
          await this.showNetworkStatus();
        } catch (error) {
          console.error(`Failed to get network status: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Start node
    networkCmd
      .command('start')
      .description('Start the Th3Coin node')
      .option('-p, --port <port>', 'Port to listen on', '8333')
      .option('-c, --config <file>', 'Configuration file path')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.startNode(parseInt(options.port), options.config);
        } catch (error) {
          console.error(`Failed to start node: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Stop node
    networkCmd
      .command('stop')
      .description('Stop the Th3Coin node')
      .action(async () => {
        try {
          await this.stopNode();
        } catch (error) {
          console.error(`Failed to stop node: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Connect to peer
    networkCmd
      .command('connect')
      .description('Connect to a peer node')
      .requiredOption('-h, --host <host>', 'Peer host address')
      .option('-p, --port <port>', 'Peer port', '8333')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.connectToPeer(options.host, parseInt(options.port));
        } catch (error) {
          console.error(`Failed to connect to peer: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // List peers
    networkCmd
      .command('peers')
      .description('List connected peers')
      .action(async () => {
        try {
          await this.initialize();
          await this.listPeers();
        } catch (error) {
          console.error(`Failed to list peers: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Disconnect from peer
    networkCmd
      .command('disconnect')
      .description('Disconnect from a peer')
      .requiredOption('-h, --host <host>', 'Peer host address')
      .option('-p, --port <port>', 'Peer port', '8333')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.disconnectFromPeer(options.host, parseInt(options.port));
        } catch (error) {
          console.error(`Failed to disconnect from peer: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Sync blockchain
    networkCmd
      .command('sync')
      .description('Synchronize blockchain with network peers')
      .action(async () => {
        try {
          await this.initialize();
          await this.syncBlockchain();
        } catch (error) {
          console.error(`Failed to sync blockchain: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Show node configuration
    networkCmd
      .command('config')
      .description('Show current node configuration')
      .action(async () => {
        try {
          await this.showNodeConfig();
        } catch (error) {
          console.error(`Failed to show config: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Test network connectivity
    networkCmd
      .command('ping')
      .description('Test connectivity to a peer')
      .requiredOption('-h, --host <host>', 'Peer host address')
      .option('-p, --port <port>', 'Peer port', '8333')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.pingPeer(options.host, parseInt(options.port));
        } catch (error) {
          console.error(`Failed to ping peer: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });
  }

  /**
   * Show network status
   */
  private async showNetworkStatus(): Promise<void> {
    console.log('Network Status');
    console.log('==============');
    
    console.log(`Node Status: ${this.isNodeRunning ? 'Running' : 'Stopped'}`);
    console.log(`Listen Port: ${this.nodeConfig.network.port}`);
    console.log(`Max Connections: ${this.nodeConfig.network.maxConnections}`);
    
    const peerCount = this.p2pNetwork.getPeerCount();
    console.log(`Connected Peers: ${peerCount}`);
    
    if (this.isNodeRunning) {
      console.log(`Data Directory: ${this.nodeConfig.dataDir}`);
      console.log(`Blockchain Height: ${this.blockchain.getBlockHeight()}`);
      console.log(`Mempool Size: ${this.mempool.getTransactionCount()}`);
    }
    
    console.log('\nNetwork Configuration:');
    console.log('======================');
    console.log(`Target Block Time: ${this.nodeConfig.mining.targetBlockTime}s`);
    console.log(`Block Reward: ${this.formatBalance(this.nodeConfig.mining.blockReward)} Th3Coin`);
    console.log(`Current Difficulty: ${this.nodeConfig.mining.difficulty}`);
  }

  /**
   * Start the node
   */
  private async startNode(port: number, configFile?: string): Promise<void> {
    if (this.isNodeRunning) {
      console.log('Node is already running');
      return;
    }

    // Load configuration if provided
    if (configFile) {
      try {
        await this.loadConfig(configFile);
      } catch (error) {
        console.warn(`Failed to load config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('Using default configuration');
      }
    }

    // Update port if specified
    if (port !== 8333) {
      this.nodeConfig.network.port = port;
    }

    console.log(`Starting Th3Coin node on port ${this.nodeConfig.network.port}...`);
    
    try {
      await this.p2pNetwork.startNode(this.nodeConfig.network.port);
      this.isNodeRunning = true;
      
      console.log('✅ Node started successfully!');
      console.log(`Listening on port: ${this.nodeConfig.network.port}`);
      console.log(`Data directory: ${this.nodeConfig.dataDir}`);
      console.log(`Max connections: ${this.nodeConfig.network.maxConnections}`);
      
      // Set up graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nShutting down node...');
        await this.stopNode();
        process.exit(0);
      });
      
      console.log('\nPress Ctrl+C to stop the node');
      
      // Keep the process running
      await new Promise(() => {}); // This will run indefinitely until interrupted
      
    } catch (error) {
      console.error(`Failed to start node: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.isNodeRunning = false;
    }
  }

  /**
   * Stop the node
   */
  private async stopNode(): Promise<void> {
    if (!this.isNodeRunning) {
      console.log('Node is not currently running');
      return;
    }

    console.log('Stopping node...');
    
    try {
      await this.p2pNetwork.stopNode();
      this.isNodeRunning = false;
      console.log('✅ Node stopped successfully');
    } catch (error) {
      console.error(`Error stopping node: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Connect to a peer
   */
  private async connectToPeer(host: string, port: number): Promise<void> {
    console.log(`Connecting to peer ${host}:${port}...`);
    
    try {
      await this.p2pNetwork.connectToPeer(host, port);
      console.log(`✅ Connected to peer ${host}:${port}`);
      
      const peerCount = this.p2pNetwork.getPeerCount();
      console.log(`Total connected peers: ${peerCount}`);
    } catch (error) {
      console.error(`Failed to connect to ${host}:${port}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List connected peers
   */
  private async listPeers(): Promise<void> {
    console.log('Connected Peers');
    console.log('===============');
    
    const peerCount = this.p2pNetwork.getPeerCount();
    
    if (peerCount === 0) {
      console.log('No peers connected');
      return;
    }
    
    console.log(`Total peers: ${peerCount}`);
    
    // Note: This is a simplified implementation
    // In a real P2P network, we'd have methods to get detailed peer information
    console.log('Peer details not available in current implementation');
    console.log('Use "th3coin network status" for general network information');
  }

  /**
   * Disconnect from a peer
   */
  private async disconnectFromPeer(host: string, port: number): Promise<void> {
    console.log(`Disconnecting from peer ${host}:${port}...`);
    
    // Note: This is a simplified implementation
    // In a real P2P network, we'd have methods to disconnect from specific peers
    console.log('⚠️  Specific peer disconnection not yet implemented');
    console.log('Use "th3coin network stop" to disconnect from all peers');
  }

  /**
   * Synchronize blockchain with network
   */
  private async syncBlockchain(): Promise<void> {
    console.log('Synchronizing blockchain with network peers...');
    
    const peerCount = this.p2pNetwork.getPeerCount();
    if (peerCount === 0) {
      console.log('No peers connected. Connect to peers first using "th3coin network connect"');
      return;
    }
    
    try {
      await this.p2pNetwork.syncBlockchain();
      console.log('✅ Blockchain synchronization completed');
      console.log(`Current blockchain height: ${this.blockchain.getBlockHeight()}`);
    } catch (error) {
      console.error(`Synchronization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show node configuration
   */
  private async showNodeConfig(): Promise<void> {
    console.log('Node Configuration');
    console.log('==================');
    
    console.log('Network:');
    console.log(`  Port: ${this.nodeConfig.network.port}`);
    console.log(`  Max Connections: ${this.nodeConfig.network.maxConnections}`);
    console.log(`  Known Peers: ${this.nodeConfig.network.peers.length}`);
    
    console.log('\nMining:');
    console.log(`  Difficulty: ${this.nodeConfig.mining.difficulty}`);
    console.log(`  Block Reward: ${this.formatBalance(this.nodeConfig.mining.blockReward)} Th3Coin`);
    console.log(`  Target Block Time: ${this.nodeConfig.mining.targetBlockTime}s`);
    
    console.log('\nStorage:');
    console.log(`  Data Directory: ${this.nodeConfig.dataDir}`);
    
    if (this.nodeConfig.network.peers.length > 0) {
      console.log('\nKnown Peers:');
      this.nodeConfig.network.peers.forEach((peer, index) => {
        console.log(`  ${index + 1}. ${peer}`);
      });
    }
  }

  /**
   * Ping a peer to test connectivity
   */
  private async pingPeer(host: string, port: number): Promise<void> {
    console.log(`Pinging peer ${host}:${port}...`);
    
    // Note: This is a simplified implementation
    // In a real P2P network, we'd implement a proper ping/pong mechanism
    try {
      // Attempt to connect temporarily to test connectivity
      const startTime = Date.now();
      await this.p2pNetwork.connectToPeer(host, port);
      const endTime = Date.now();
      
      console.log(`✅ Peer ${host}:${port} is reachable`);
      console.log(`Response time: ${endTime - startTime}ms`);
    } catch (error) {
      console.log(`❌ Peer ${host}:${port} is not reachable`);
      console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(configFile: string): Promise<void> {
    // Note: This is a simplified implementation
    // In a real application, we'd load and parse a JSON/YAML configuration file
    console.log(`Loading configuration from ${configFile}...`);
    console.log('⚠️  Configuration file loading not yet implemented');
    console.log('Using default configuration');
  }

  /**
   * Format balance for display (convert from satoshis to Th3Coin)
   */
  private formatBalance(satoshis: number): string {
    const th3coins = satoshis / 100000000; // 1 Th3Coin = 100,000,000 satoshis
    return th3coins.toFixed(8);
  }
}