import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Th3CoinNode } from '../node/th3coin-node';
import { ConfigManager } from '../config';

describe('System Integration Tests', () => {
  let testDataDir: string;
  let configPath: string;
  let node: Th3CoinNode;

  beforeEach(async () => {
    // Create temporary test directory
    testDataDir = path.join(__dirname, '../../test-data', `system-test-${Date.now()}`);
    configPath = path.join(testDataDir, 'th3coin.config.json');
    
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Create test configuration
    const testConfig = {
      network: {
        port: 18333 + Math.floor(Math.random() * 1000), // Random port to avoid conflicts
        maxPeers: 5,
        seedNodes: [],
        connectionTimeout: 5000,
      },
      mining: {
        enabled: false, // Disabled by default for tests
        difficulty: 1, // Low difficulty for fast testing
        blockReward: 5000000000,
        targetBlockTime: 10000, // 10 seconds for testing
      },
      storage: {
        dataDirectory: path.join(testDataDir, 'data'),
        walletDirectory: path.join(testDataDir, 'wallets'),
        blockchainFile: path.join(testDataDir, 'blockchain.json'),
      },
      logging: {
        level: 'error' as const, // Reduce noise in tests
      },
    };

    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
  });

  afterEach(async () => {
    // Stop node if running
    if (node && node.isNodeRunning()) {
      await node.stop();
    }

    // Clean up test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Node Lifecycle', () => {
    it('should initialize node with configuration', async () => {
      node = new Th3CoinNode(configPath);
      
      await node.initialize();
      
      const config = node.getConfig();
      expect(config.network.port).toBeGreaterThan(18333);
      expect(config.mining.difficulty).toBe(1);
      expect(config.storage.dataDirectory).toContain('data');
    });

    it('should start and stop node gracefully', async () => {
      node = new Th3CoinNode(configPath);
      
      await node.initialize();
      expect(node.isNodeRunning()).toBe(false);
      
      await node.start();
      expect(node.isNodeRunning()).toBe(true);
      
      const stats = node.getStats();
      expect(stats.uptime).toBeGreaterThan(0);
      expect(stats.blockHeight).toBeGreaterThanOrEqual(0);
      expect(stats.peerCount).toBe(0); // No peers in test
      expect(stats.mempoolSize).toBe(0);
      expect(stats.isMining).toBe(false);
      
      await node.stop();
      expect(node.isNodeRunning()).toBe(false);
    });

    it('should handle multiple start/stop cycles', async () => {
      node = new Th3CoinNode(configPath);
      await node.initialize();
      
      // First cycle
      await node.start();
      expect(node.isNodeRunning()).toBe(true);
      await node.stop();
      expect(node.isNodeRunning()).toBe(false);
      
      // Second cycle
      await node.start();
      expect(node.isNodeRunning()).toBe(true);
      await node.stop();
      expect(node.isNodeRunning()).toBe(false);
    });

    it('should prevent double initialization', async () => {
      node = new Th3CoinNode(configPath);
      
      await node.initialize();
      
      // Second initialization should not throw
      await node.initialize();
      
      expect(node.isNodeRunning()).toBe(false);
    });

    it('should prevent starting already running node', async () => {
      node = new Th3CoinNode(configPath);
      
      await node.initialize();
      await node.start();
      
      // Second start should throw
      await expect(node.start()).rejects.toThrow('Node is already running');
      
      await node.stop();
    });
  });

  describe('Configuration Management', () => {
    it('should load configuration from file', () => {
      const configManager = new ConfigManager(configPath);
      const config = configManager.getConfig();
      
      expect(config.network.port).toBeGreaterThan(18333);
      expect(config.mining.difficulty).toBe(1);
    });

    it('should validate configuration', () => {
      const configManager = new ConfigManager(configPath);
      const errors = configManager.validateConfig();
      
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid configuration', () => {
      const invalidConfig = {
        network: {
          port: -1, // Invalid port
          maxPeers: 0, // Invalid max peers
        },
        mining: {
          difficulty: 0, // Invalid difficulty
          blockReward: -100, // Invalid reward
        },
      };
      
      const invalidConfigPath = path.join(testDataDir, 'invalid.config.json');
      fs.writeFileSync(invalidConfigPath, JSON.stringify(invalidConfig, null, 2));
      
      const configManager = new ConfigManager(invalidConfigPath);
      const errors = configManager.validateConfig();
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('port'))).toBe(true);
      expect(errors.some(e => e.includes('peers'))).toBe(true);
      expect(errors.some(e => e.includes('difficulty'))).toBe(true);
      expect(errors.some(e => e.includes('reward'))).toBe(true);
    });

    it('should update configuration at runtime', async () => {
      node = new Th3CoinNode(configPath);
      await node.initialize();
      
      const originalConfig = node.getConfig();
      const originalDifficulty = originalConfig.mining.difficulty;
      
      node.updateConfig({
        mining: {
          difficulty: originalDifficulty + 1,
        },
      });
      
      const updatedConfig = node.getConfig();
      expect(updatedConfig.mining.difficulty).toBe(originalDifficulty + 1);
    });
  });

  describe('Component Integration', () => {
    it('should initialize all components correctly', async () => {
      node = new Th3CoinNode(configPath);
      await node.initialize();
      
      const components = node.getComponents();
      
      expect(components.blockchain).toBeDefined();
      expect(components.network).toBeDefined();
      expect(components.walletManager).toBeDefined();
      expect(components.mempool).toBeDefined();
      // Miner is undefined when mining is disabled
      expect(components.miner).toBeUndefined();
    });

    it('should initialize miner when mining is enabled', async () => {
      // Update config to enable mining
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.mining.enabled = true;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      node = new Th3CoinNode(configPath);
      await node.initialize();
      
      const components = node.getComponents();
      expect(components.miner).toBeDefined();
    });

    it('should create default wallet on first run', async () => {
      node = new Th3CoinNode(configPath);
      await node.initialize();
      
      const components = node.getComponents();
      const walletAddresses = await components.walletManager!.listWallets();
      
      expect(walletAddresses.length).toBeGreaterThan(0);
      expect(walletAddresses[0]).toBeDefined();
      expect(typeof walletAddresses[0]).toBe('string');
    });

    it('should persist blockchain state', async () => {
      node = new Th3CoinNode(configPath);
      await node.initialize();
      
      const components = node.getComponents();
      const initialHeight = components.blockchain!.getBlockHeight();
      
      await node.stop();
      
      // Create new node instance
      const node2 = new Th3CoinNode(configPath);
      await node2.initialize();
      
      const components2 = node2.getComponents();
      const reloadedHeight = components2.blockchain!.getBlockHeight();
      
      expect(reloadedHeight).toBe(initialHeight);
      
      await node2.stop();
    });
  });

  describe('Mining Integration', () => {
    it('should start and stop mining', async () => {
      // Enable mining in config
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.mining.enabled = true;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      node = new Th3CoinNode(configPath);
      await node.initialize();
      await node.start();
      
      // Mining should auto-start when enabled in config
      expect(node.getStats().isMining).toBe(true);
      
      node.stopMining();
      expect(node.getStats().isMining).toBe(false);
      
      node.startMining();
      expect(node.getStats().isMining).toBe(true);
    });
  });

  describe('Network Integration', () => {
    it('should start network on configured port', async () => {
      node = new Th3CoinNode(configPath);
      await node.initialize();
      await node.start();
      
      const config = node.getConfig();
      const stats = node.getStats();
      
      expect(stats.peerCount).toBe(0); // No peers connected
      
      // Network should be listening on configured port
      const components = node.getComponents();
      expect(components.network).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Create config with invalid port (negative number)
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.network.port = -1;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      node = new Th3CoinNode(configPath);
      
      // Should throw due to configuration validation error
      await expect(node.initialize()).rejects.toThrow('Configuration errors');
    });

    it('should handle configuration file errors', () => {
      const nonExistentPath = path.join(testDataDir, 'nonexistent.config.json');
      
      // Should not throw, should use defaults
      expect(() => new Th3CoinNode(nonExistentPath)).not.toThrow();
    });

    it('should handle invalid JSON configuration', () => {
      const invalidJsonPath = path.join(testDataDir, 'invalid.json');
      fs.writeFileSync(invalidJsonPath, '{ invalid json }');
      
      // Should not throw, should use defaults
      expect(() => new Th3CoinNode(invalidJsonPath)).not.toThrow();
    });
  });

  describe('Shutdown Procedures', () => {
    it('should handle graceful shutdown', async () => {
      node = new Th3CoinNode(configPath);
      await node.initialize();
      await node.start();
      
      let shutdownHandlerCalled = false;
      node.addShutdownHandler(async () => {
        shutdownHandlerCalled = true;
      });
      
      await node.stop();
      
      expect(shutdownHandlerCalled).toBe(true);
      expect(node.isNodeRunning()).toBe(false);
    });

    it('should handle shutdown handler errors', async () => {
      node = new Th3CoinNode(configPath);
      await node.initialize();
      await node.start();
      
      // Add failing shutdown handler
      node.addShutdownHandler(async () => {
        throw new Error('Shutdown handler error');
      });
      
      // Should not throw, should handle error gracefully
      await expect(node.stop()).resolves.not.toThrow();
      expect(node.isNodeRunning()).toBe(false);
    });
  });
});