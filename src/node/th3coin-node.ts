import { EventEmitter } from 'events';
import { ConfigManager, Th3CoinConfig } from '../config';
import { Logger, logger } from '../utils/logger';
import { BlockchainImpl } from '../core/blockchain';
import { P2PNetwork } from '../network/p2p';
import { MinerImpl } from '../core/mining';
import { WalletManager } from '../wallet/wallet-manager';
import { Mempool } from '../core/mempool';
import { Wallet } from '../wallet/wallet';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { UTXOCache } from '../core/utxo-cache';
import { OptimizedValidator } from '../core/optimized-validator';

export interface NodeStats {
  uptime: number;
  blockHeight: number;
  peerCount: number;
  mempoolSize: number;
  isMining: boolean;
  hashRate?: number;
  performance: {
    transactionValidationAvg: number;
    blockValidationAvg: number;
    memoryUsageMB: number;
    utxoCacheHitRate: number;
    utxoCacheSize: number;
  };
}

export class Th3CoinNode extends EventEmitter {
  private config: Th3CoinConfig;
  private configManager: ConfigManager;
  private nodeLogger: Logger;
  private blockchain?: BlockchainImpl;
  private network?: P2PNetwork;
  private miner?: MinerImpl;
  private walletManager?: WalletManager;
  private mempool?: Mempool;
  private performanceMonitor?: PerformanceMonitor;
  private utxoCache?: UTXOCache;
  private optimizedValidator?: OptimizedValidator;
  private isRunning: boolean = false;
  private startTime?: Date;
  private shutdownHandlers: (() => Promise<void>)[] = [];

  constructor(configPath?: string) {
    super();
    
    this.configManager = new ConfigManager(configPath);
    this.config = this.configManager.getConfig();
    
    // Initialize logger
    logger.setLevel(this.config.logging.level);
    if (this.config.logging.file) {
      logger.setLogFile(this.config.logging.file);
    }
    
    this.nodeLogger = logger.child('NODE');
    
    // Setup graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Initialize all node components
   */
  async initialize(): Promise<void> {
    try {
      this.nodeLogger.info('Initializing Th3Coin node...');
      
      // Validate configuration
      const configErrors = this.configManager.validateConfig();
      if (configErrors.length > 0) {
        throw new Error(`Configuration errors: ${configErrors.join(', ')}`);
      }

      // Initialize wallet manager
      this.walletManager = new WalletManager(this.config.storage.walletDirectory);
      this.nodeLogger.info('Wallet manager initialized');

      // Initialize blockchain
      this.blockchain = new BlockchainImpl();
      
      // Create or load default wallet for mining
      let defaultWallet: Wallet;
      const wallets = await this.walletManager.listWallets();
      if (wallets.length === 0) {
        this.nodeLogger.info('No wallets found, creating default wallet');
        defaultWallet = await this.walletManager.createWallet();
        this.nodeLogger.info(`Default wallet created: ${defaultWallet.getAddress()}`);
      } else {
        defaultWallet = await this.walletManager.loadWallet(wallets[0]) || await this.walletManager.createWallet();
      }

      await this.blockchain.initialize(defaultWallet.getAddress());
      this.nodeLogger.info(`Blockchain initialized, height: ${this.blockchain.getBlockHeight()}`);

      // Initialize performance monitoring
      this.performanceMonitor = new PerformanceMonitor();
      this.nodeLogger.info('Performance monitor initialized');

      // Initialize UTXO cache
      this.utxoCache = new UTXOCache({
        maxSize: 10000,
        ttlMs: 300000, // 5 minutes
        cleanupIntervalMs: 60000, // 1 minute
      });
      this.nodeLogger.info('UTXO cache initialized');

      // Initialize optimized validator
      this.optimizedValidator = new OptimizedValidator(
        this.utxoCache,
        this.performanceMonitor,
        {
          enableCaching: true,
          enableParallelValidation: true,
          maxParallelTransactions: 10,
        }
      );
      this.nodeLogger.info('Optimized validator initialized');

      // Initialize mempool
      this.mempool = new Mempool(() => (this.blockchain as any).utxoManager.getAllUTXOs());
      this.nodeLogger.info('Mempool initialized');

      // Initialize network
      this.network = new P2PNetwork(this.blockchain, this.mempool);
      this.nodeLogger.info('Network layer initialized');

      // Initialize miner if enabled
      if (this.config.mining.enabled) {
        this.miner = new MinerImpl(defaultWallet.getAddress(), {
          difficulty: this.config.mining.difficulty,
          blockReward: this.config.mining.blockReward,
          targetBlockTime: this.config.mining.targetBlockTime,
        });
        this.nodeLogger.info(`Miner initialized for address: ${defaultWallet.getAddress()}`);
      }

      this.nodeLogger.info('Node initialization complete');
      this.emit('initialized');
      
    } catch (error) {
      this.nodeLogger.error('Failed to initialize node:', error);
      throw error;
    }
  }

  /**
   * Start the node
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Node is already running');
    }

    try {
      this.nodeLogger.info('Starting Th3Coin node...');
      this.startTime = new Date();

      // Start performance monitoring
      if (this.performanceMonitor) {
        this.performanceMonitor.startMonitoring(30000); // 30 second intervals
        this.nodeLogger.info('Performance monitoring started');
      }

      // Preload UTXO cache
      if (this.utxoCache && this.optimizedValidator && this.blockchain) {
        const utxos = (this.blockchain as any).utxoManager.getAllUTXOs();
        await this.optimizedValidator.preloadUtxos(utxos);
        this.nodeLogger.info(`Preloaded ${utxos.length} UTXOs into cache`);
      }

      // Start network
      if (this.network) {
        await this.network.startNode(this.config.network.port);
        this.nodeLogger.info(`Network started on port ${this.config.network.port}`);

        // Connect to seed nodes
        for (const seedNode of this.config.network.seedNodes) {
          try {
            const [host, port] = seedNode.split(':');
            await this.network.connectToPeer(host, parseInt(port));
            this.nodeLogger.info(`Connected to seed node: ${seedNode}`);
          } catch (error) {
            this.nodeLogger.warn(`Failed to connect to seed node ${seedNode}:`, error);
          }
        }
      }

      // Start mining if enabled
      if (this.miner && this.config.mining.enabled) {
        this.startMining();
      }

      this.isRunning = true;
      this.nodeLogger.info('Th3Coin node started successfully');
      this.emit('started');

    } catch (error) {
      this.nodeLogger.error('Failed to start node:', error);
      throw error;
    }
  }

  /**
   * Stop the node gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.nodeLogger.info('Stopping Th3Coin node...');

      // Stop mining
      if (this.miner) {
        this.miner.stopMining();
        this.nodeLogger.info('Mining stopped');
      }

      // Stop performance monitoring
      if (this.performanceMonitor) {
        this.performanceMonitor.stopMonitoring();
        this.nodeLogger.info('Performance monitoring stopped');
      }

      // Cleanup caches
      if (this.optimizedValidator) {
        this.optimizedValidator.clearCaches();
        this.nodeLogger.info('Validation caches cleared');
      }

      if (this.utxoCache) {
        this.utxoCache.destroy();
        this.nodeLogger.info('UTXO cache destroyed');
      }

      // Stop network
      if (this.network) {
        await this.network.stopNode();
        this.nodeLogger.info('Network stopped');
      }

      // Run shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          this.nodeLogger.error('Shutdown handler failed:', error);
        }
      }

      this.isRunning = false;
      this.nodeLogger.info('Th3Coin node stopped');
      this.emit('stopped');

    } catch (error) {
      this.nodeLogger.error('Error during node shutdown:', error);
      throw error;
    }
  }

  /**
   * Start mining
   */
  startMining(): void {
    if (!this.miner || !this.mempool) {
      throw new Error('Miner or mempool not initialized');
    }

    this.miner.startMining(this.mempool);
    this.nodeLogger.info('Mining started');
    this.emit('miningStarted');
  }

  /**
   * Stop mining
   */
  stopMining(): void {
    if (this.miner) {
      this.miner.stopMining();
      this.nodeLogger.info('Mining stopped');
      this.emit('miningStopped');
    }
  }

  /**
   * Get node statistics
   */
  getStats(): NodeStats {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    
    // Get performance statistics
    const perfStats = this.performanceMonitor?.getPerformanceStats();
    const cacheStats = this.optimizedValidator?.getCacheStats();
    
    return {
      uptime,
      blockHeight: this.blockchain?.getBlockHeight() || 0,
      peerCount: this.network?.getPeerCount() || 0,
      mempoolSize: this.mempool?.getPendingTransactions().length || 0,
      isMining: this.miner?.isMiningActive() || false,
      hashRate: 0, // TODO: Add hash rate calculation
      performance: {
        transactionValidationAvg: perfStats?.transactionValidationTime.avg || 0,
        blockValidationAvg: perfStats?.blockValidationTime.avg || 0,
        memoryUsageMB: perfStats ? Math.round(perfStats.memoryUsage.heapUsed / 1024 / 1024) : 0,
        utxoCacheHitRate: cacheStats?.utxoCache.hitRate || 0,
        utxoCacheSize: cacheStats?.utxoCache.size || 0,
      },
    };
  }

  /**
   * Get configuration
   */
  getConfig(): Th3CoinConfig {
    return this.configManager.getConfig();
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<Th3CoinConfig>): void {
    this.configManager.updateConfig(updates);
    this.config = this.configManager.getConfig();
    
    // Update logger level if changed
    if (updates.logging?.level) {
      logger.setLevel(updates.logging.level);
    }
    
    this.nodeLogger.info('Configuration updated');
    this.emit('configUpdated', this.config);
  }

  /**
   * Add shutdown handler
   */
  addShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      this.nodeLogger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        this.nodeLogger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      this.nodeLogger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      this.nodeLogger.error('Unhandled rejection:', reason);
      shutdown('unhandledRejection');
    });
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): string {
    return this.performanceMonitor?.getPerformanceReport() || 'Performance monitoring not available';
  }

  /**
   * Get component instances (for testing and advanced usage)
   */
  getComponents() {
    return {
      blockchain: this.blockchain,
      network: this.network,
      miner: this.miner,
      walletManager: this.walletManager,
      mempool: this.mempool,
      performanceMonitor: this.performanceMonitor,
      utxoCache: this.utxoCache,
      optimizedValidator: this.optimizedValidator,
    };
  }

  /**
   * Check if node is running
   */
  isNodeRunning(): boolean {
    return this.isRunning;
  }
}