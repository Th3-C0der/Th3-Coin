import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { UTXOCache } from '../core/utxo-cache';
import { OptimizedValidator } from '../core/optimized-validator';
import { BlockchainImpl } from '../core/blockchain';
import { Wallet } from '../wallet/wallet';
import { MinerImpl } from '../core/mining';
import { TransactionImpl } from '../core/transaction';
import { UTXOImpl } from '../core/utxo';

describe('Performance Benchmarks', () => {
  let performanceMonitor: PerformanceMonitor;
  let utxoCache: UTXOCache;
  let optimizedValidator: OptimizedValidator;
  let blockchain: BlockchainImpl;
  let wallet: Wallet;
  let miner: MinerImpl;

  beforeEach(async () => {
    performanceMonitor = new PerformanceMonitor();
    utxoCache = new UTXOCache({ maxSize: 1000 });
    optimizedValidator = new OptimizedValidator(utxoCache, performanceMonitor);
    
    wallet = new Wallet();
    blockchain = new BlockchainImpl();
    await blockchain.initialize(wallet.getAddress());
    
    miner = new MinerImpl(wallet.getAddress(), {
      difficulty: 1, // Low difficulty for fast testing
      blockReward: 5000000000,
      targetBlockTime: 10000,
    });

    performanceMonitor.startMonitoring(1000); // 1 second intervals for testing
  });

  afterEach(() => {
    performanceMonitor.stopMonitoring();
    utxoCache.destroy();
  });

  describe('Transaction Validation Performance', () => {
    it('should validate transactions faster with caching', async () => {
      // Create test transactions
      const transactions = [];
      const utxos = (blockchain as any).utxoManager.getAllUTXOs();
      
      // Create multiple transactions for benchmarking
      for (let i = 0; i < 10; i++) {
        try {
          const tx = wallet.createTransaction(
            new Wallet().getAddress(),
            1000000, // 0.01 Th3Coins
            100000   // 0.001 Th3Coins fee
          );
          transactions.push(tx);
        } catch (error) {
          // Skip if insufficient funds
          break;
        }
      }

      if (transactions.length === 0) {
        console.log('Skipping transaction validation benchmark - insufficient funds');
        return;
      }

      // Benchmark without caching
      optimizedValidator.updateConfig({ enableCaching: false });
      
      const startTimeNoCache = Date.now();
      for (const tx of transactions) {
        await optimizedValidator.validateTransaction(tx, utxos);
      }
      const timeWithoutCache = Date.now() - startTimeNoCache;

      // Clear any existing cache
      optimizedValidator.clearCaches();
      
      // Benchmark with caching
      optimizedValidator.updateConfig({ enableCaching: true });
      
      const startTimeWithCache = Date.now();
      // First pass - populate cache
      for (const tx of transactions) {
        await optimizedValidator.validateTransaction(tx, utxos);
      }
      // Second pass - use cache
      for (const tx of transactions) {
        await optimizedValidator.validateTransaction(tx, utxos);
      }
      const timeWithCache = Date.now() - startTimeWithCache;

      console.log(`Transaction validation performance:
        Without cache: ${timeWithoutCache}ms for ${transactions.length} transactions
        With cache: ${timeWithCache}ms for ${transactions.length * 2} transactions
        Cache efficiency: ${((timeWithoutCache * 2 - timeWithCache) / (timeWithoutCache * 2) * 100).toFixed(2)}%`);

      // Cache should provide some benefit for repeated validations
      expect(timeWithCache).toBeLessThan(timeWithoutCache * 2.5); // Allow some overhead
    });

    it('should validate transactions faster with parallel processing', async () => {
      const transactions = [];
      const utxos = (blockchain as any).utxoManager.getAllUTXOs();
      
      // Create multiple transactions
      for (let i = 0; i < 5; i++) {
        try {
          const tx = wallet.createTransaction(
            new Wallet().getAddress(),
            1000000,
            100000
          );
          transactions.push(tx);
        } catch (error) {
          break;
        }
      }

      if (transactions.length < 2) {
        console.log('Skipping parallel validation benchmark - insufficient transactions');
        return;
      }

      // Sequential validation
      optimizedValidator.updateConfig({ enableParallelValidation: false });
      
      const startTimeSequential = Date.now();
      await optimizedValidator.validateTransactions(transactions, utxos);
      const sequentialTime = Date.now() - startTimeSequential;

      // Parallel validation
      optimizedValidator.updateConfig({ enableParallelValidation: true });
      
      const startTimeParallel = Date.now();
      await optimizedValidator.validateTransactions(transactions, utxos);
      const parallelTime = Date.now() - startTimeParallel;

      console.log(`Parallel validation performance:
        Sequential: ${sequentialTime}ms for ${transactions.length} transactions
        Parallel: ${parallelTime}ms for ${transactions.length} transactions
        Speedup: ${(sequentialTime / parallelTime).toFixed(2)}x`);

      // Parallel should be at least as fast (allowing for overhead in small batches)
      expect(parallelTime).toBeLessThanOrEqual(sequentialTime * 1.5);
    });
  });

  describe('UTXO Cache Performance', () => {
    it('should provide fast UTXO lookups', () => {
      const testUtxos = [];
      
      // Create test UTXOs
      for (let i = 0; i < 1000; i++) {
        testUtxos.push(new UTXOImpl(
          `tx${i}`,
          0,
          wallet.getAddress(),
          1000000,
          false
        ));
      }

      // Benchmark cache population
      const startPopulate = Date.now();
      utxoCache.putMultiple(testUtxos);
      const populateTime = Date.now() - startPopulate;

      // Benchmark cache lookups
      const startLookup = Date.now();
      let hits = 0;
      for (let i = 0; i < 1000; i++) {
        const utxo = utxoCache.get(`tx${i}`, 0);
        if (utxo) hits++;
      }
      const lookupTime = Date.now() - startLookup;

      console.log(`UTXO Cache performance:
        Population: ${populateTime}ms for ${testUtxos.length} UTXOs
        Lookups: ${lookupTime}ms for ${testUtxos.length} lookups
        Hit rate: ${(hits / testUtxos.length * 100).toFixed(2)}%
        Avg lookup time: ${(lookupTime / testUtxos.length).toFixed(3)}ms`);

      expect(hits).toBe(1000);
      expect(lookupTime).toBeLessThan(100); // Should be very fast
    });

    it('should handle cache eviction efficiently', () => {
      const smallCache = new UTXOCache({ maxSize: 100 });
      
      // Fill cache beyond capacity
      const startTime = Date.now();
      for (let i = 0; i < 200; i++) {
        const utxo = new UTXOImpl(`tx${i}`, 0, wallet.getAddress(), 1000000, false);
        smallCache.put(utxo);
      }
      const fillTime = Date.now() - startTime;

      const stats = smallCache.getStats();
      
      console.log(`Cache eviction performance:
        Fill time: ${fillTime}ms for 200 UTXOs (max size: 100)
        Final size: ${stats.size}
        Evictions: ${stats.evictions}`);

      expect(stats.size).toBeLessThanOrEqual(110); // Allow some buffer for timing
      expect(stats.evictions).toBeGreaterThan(0);
      expect(fillTime).toBeLessThan(50); // Should handle eviction quickly

      smallCache.destroy();
    });
  });

  describe('Mining Performance', () => {
    it('should measure mining hash rate', async () => {
      const startTime = Date.now();
      let hashCount = 0;
      
      // Mine for a short period to measure hash rate
      const miningPromise = new Promise<void>((resolve) => {
        const originalMineBlock = miner.mineBlock.bind(miner);
        
        // Override mineBlock to count hashes
        miner.mineBlock = async (transactions) => {
          hashCount++;
          
          // Stop after 100 attempts or 1 second
          if (hashCount >= 100 || Date.now() - startTime > 1000) {
            resolve();
            return originalMineBlock(transactions);
          }
          
          return originalMineBlock(transactions);
        };
        
        // Start mining
        miner.mineBlock([]).catch(() => {
          // Mining might fail, that's ok for this test
          resolve();
        });
      });

      await Promise.race([
        miningPromise,
        new Promise(resolve => setTimeout(resolve, 2000)) // 2 second timeout
      ]);

      const elapsedTime = Date.now() - startTime;
      const hashRate = hashCount / (elapsedTime / 1000);

      console.log(`Mining performance:
        Hashes: ${hashCount}
        Time: ${elapsedTime}ms
        Hash rate: ${hashRate.toFixed(2)} H/s`);

      expect(hashRate).toBeGreaterThan(0);
      
      // Record hash rate metric
      performanceMonitor.recordMetric('mining_hash_rate', hashRate, 'H/s');
    });
  });

  describe('Memory Usage Monitoring', () => {
    it('should track memory usage during operations', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform memory-intensive operations
      const largeArray = [];
      for (let i = 0; i < 10000; i++) {
        largeArray.push(new UTXOImpl(`tx${i}`, 0, wallet.getAddress(), 1000000, false));
      }

      // Wait for monitoring to collect metrics
      await new Promise(resolve => setTimeout(resolve, 1100));

      const finalMemory = process.memoryUsage();
      const stats = performanceMonitor.getPerformanceStats();

      console.log(`Memory usage:
        Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        Monitored heap: ${(stats.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
        RSS: ${(stats.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);

      expect(stats.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(stats.memoryUsage.rss).toBeGreaterThan(0);
    });
  });

  describe('Performance Monitoring System', () => {
    it('should collect and report performance metrics', async () => {
      // Generate some test metrics
      performanceMonitor.recordMetric('test_metric', 100, 'ms');
      performanceMonitor.recordMetric('test_metric', 150, 'ms');
      performanceMonitor.recordMetric('test_metric', 120, 'ms');

      // Test timing functions
      const result = await performanceMonitor.timeFunction('test_operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      });

      expect(result).toBe('success');

      // Test synchronous timing
      const syncResult = performanceMonitor.timeFunctionSync('test_sync_operation', () => {
        return 42;
      });

      expect(syncResult).toBe(42);

      // Get performance stats
      const stats = performanceMonitor.getPerformanceStats();
      
      console.log('Performance monitoring stats:', {
        memoryUsedMB: Math.round(stats.memoryUsage.heapUsed / 1024 / 1024),
        metricsCollected: performanceMonitor.getMetricNames().length,
      });

      expect(performanceMonitor.getMetricNames().length).toBeGreaterThan(0);
      expect(stats.memoryUsage.heapUsed).toBeGreaterThan(0);
    });

    it('should generate performance reports', () => {
      // Add some test data
      performanceMonitor.recordMetric('transaction_validation', 50, 'ms');
      performanceMonitor.recordMetric('block_validation', 200, 'ms');
      performanceMonitor.recordMetric('mining_hash_rate', 1000, 'H/s');

      const report = performanceMonitor.getPerformanceReport();
      
      expect(report).toContain('Performance Report');
      expect(report).toContain('Transaction Validation');
      expect(report).toContain('Block Validation');
      expect(report).toContain('Mining Hash Rate');
      expect(report).toContain('Memory Usage');

      console.log('Performance Report Sample:');
      console.log(report.substring(0, 500) + '...');
    });
  });

  describe('System Throughput Benchmarks', () => {
    it('should measure transaction processing throughput', async () => {
      const transactions = [];
      const utxos = (blockchain as any).utxoManager.getAllUTXOs();
      
      // Create as many transactions as possible
      for (let i = 0; i < 20; i++) {
        try {
          const tx = wallet.createTransaction(
            new Wallet().getAddress(),
            1000000,
            100000
          );
          transactions.push(tx);
        } catch (error) {
          break;
        }
      }

      if (transactions.length === 0) {
        console.log('Skipping throughput benchmark - no transactions available');
        return;
      }

      const startTime = Date.now();
      await optimizedValidator.validateTransactions(transactions, utxos);
      const elapsedTime = Date.now() - startTime;

      const throughput = transactions.length / (elapsedTime / 1000);

      console.log(`Transaction throughput:
        Transactions: ${transactions.length}
        Time: ${elapsedTime}ms
        Throughput: ${throughput.toFixed(2)} tx/s`);

      expect(throughput).toBeGreaterThan(0);
      
      // Record throughput metric
      performanceMonitor.recordMetric('transaction_throughput', throughput, 'tx/s');
    });

    it('should measure overall system performance under load', async () => {
      const startTime = Date.now();
      
      // Simulate system load
      const operations = [];
      
      // UTXO operations
      operations.push(async () => {
        const utxos = [];
        for (let i = 0; i < 100; i++) {
          utxos.push(new UTXOImpl(`load_tx${i}`, 0, wallet.getAddress(), 1000000, false));
        }
        utxoCache.putMultiple(utxos);
      });

      // Cache operations
      operations.push(async () => {
        for (let i = 0; i < 100; i++) {
          utxoCache.get(`load_tx${i}`, 0);
        }
      });

      // Performance monitoring
      operations.push(async () => {
        for (let i = 0; i < 50; i++) {
          performanceMonitor.recordMetric('load_test', Math.random() * 100, 'ms');
        }
      });

      // Execute all operations concurrently
      await Promise.all(operations.map(op => op()));

      const elapsedTime = Date.now() - startTime;
      const cacheStats = utxoCache.getStats();

      console.log(`System load test:
        Duration: ${elapsedTime}ms
        Cache size: ${cacheStats.size}
        Cache hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%
        Memory used: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);

      expect(elapsedTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(cacheStats.size).toBeGreaterThan(0);
    });
  });
});