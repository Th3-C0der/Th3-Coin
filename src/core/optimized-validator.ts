import { Transaction, Block, UTXO } from '../interfaces';
import { TransactionValidator } from './transaction-validator';
import { UTXOCache } from './utxo-cache';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { logger } from '../utils/logger';

export interface ValidationCache {
  transactions: Map<string, { isValid: boolean; error?: string; timestamp: number }>;
  blocks: Map<string, { isValid: boolean; error?: string; timestamp: number }>;
}

export interface OptimizedValidatorConfig {
  enableCaching: boolean;
  cacheSize: number;
  cacheTtlMs: number;
  enableParallelValidation: boolean;
  maxParallelTransactions: number;
}

/**
 * Optimized validator with caching, parallel processing, and performance monitoring
 */
export class OptimizedValidator {
  private utxoCache: UTXOCache;
  private performanceMonitor: PerformanceMonitor;
  private validationCache: ValidationCache;
  private config: OptimizedValidatorConfig;
  private validatorLogger = logger.child('OPTIMIZED-VALIDATOR');

  constructor(
    utxoCache: UTXOCache,
    performanceMonitor: PerformanceMonitor,
    config: Partial<OptimizedValidatorConfig> = {}
  ) {
    this.utxoCache = utxoCache;
    this.performanceMonitor = performanceMonitor;
    this.config = {
      enableCaching: config.enableCaching ?? true,
      cacheSize: config.cacheSize ?? 1000,
      cacheTtlMs: config.cacheTtlMs ?? 300000, // 5 minutes
      enableParallelValidation: config.enableParallelValidation ?? true,
      maxParallelTransactions: config.maxParallelTransactions ?? 10,
    };

    this.validationCache = {
      transactions: new Map(),
      blocks: new Map(),
    };
  }

  /**
   * Validate transaction with optimizations
   */
  async validateTransaction(
    transaction: Transaction,
    utxos: UTXO[],
    blockHeight: number = 0
  ): Promise<{ isValid: boolean; error?: string }> {
    return this.performanceMonitor.timeFunction(
      'transaction_validation',
      async () => {
        // Check cache first
        if (this.config.enableCaching) {
          const cached = this.getCachedTransactionResult(transaction.id);
          if (cached) {
            this.performanceMonitor.recordMetric('transaction_validation_cache_hit', 1, 'count');
            return cached;
          }
        }

        // Get UTXOs from cache first, then fallback to provided UTXOs
        const optimizedUtxos = await this.getOptimizedUtxos(transaction, utxos);

        // Perform validation
        const result = TransactionValidator.validateTransaction(
          transaction,
          optimizedUtxos,
          blockHeight
        );

        // Cache result
        if (this.config.enableCaching) {
          this.cacheTransactionResult(transaction.id, result);
        }

        this.performanceMonitor.recordMetric('transaction_validation_cache_miss', 1, 'count');
        return result;
      },
      { transactionId: transaction.id }
    );
  }

  /**
   * Validate multiple transactions in parallel
   */
  async validateTransactions(
    transactions: Transaction[],
    utxos: UTXO[],
    blockHeight: number = 0
  ): Promise<Array<{ isValid: boolean; error?: string }>> {
    if (!this.config.enableParallelValidation || transactions.length <= 1) {
      // Sequential validation
      const results = [];
      for (const tx of transactions) {
        results.push(await this.validateTransaction(tx, utxos, blockHeight));
      }
      return results;
    }

    // Parallel validation in batches
    const results: Array<{ isValid: boolean; error?: string }> = [];
    const batchSize = this.config.maxParallelTransactions;

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      const batchPromises = batch.map(tx => 
        this.validateTransaction(tx, utxos, blockHeight)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    this.performanceMonitor.recordMetric(
      'parallel_transaction_validation',
      transactions.length,
      'count'
    );

    return results;
  }

  /**
   * Validate block with optimizations
   */
  async validateBlock(
    block: Block,
    utxos: UTXO[],
    previousBlock?: Block
  ): Promise<{ isValid: boolean; error?: string }> {
    return this.performanceMonitor.timeFunction(
      'block_validation',
      async () => {
        const blockHash = (block as any).getHash();

        // Check cache first
        if (this.config.enableCaching) {
          const cached = this.getCachedBlockResult(blockHash);
          if (cached) {
            this.performanceMonitor.recordMetric('block_validation_cache_hit', 1, 'count');
            return cached;
          }
        }

        // Validate block structure first (fast checks)
        const structureResult = this.validateBlockStructure(block, previousBlock);
        if (!structureResult.isValid) {
          this.cacheBlockResult(blockHash, structureResult);
          return structureResult;
        }

        // Validate all transactions in the block
        const transactionResults = await this.validateTransactions(
          block.transactions,
          utxos,
          (block.header as any).height || 0
        );

        // Check if any transaction failed
        for (let i = 0; i < transactionResults.length; i++) {
          if (!transactionResults[i].isValid) {
            const result = {
              isValid: false,
              error: `Transaction ${i} validation failed: ${transactionResults[i].error}`,
            };
            this.cacheBlockResult(blockHash, result);
            return result;
          }
        }

        // Validate Merkle root
        const merkleResult = this.validateMerkleRoot(block);
        if (!merkleResult.isValid) {
          this.cacheBlockResult(blockHash, merkleResult);
          return merkleResult;
        }

        const result = { isValid: true };
        this.cacheBlockResult(blockHash, result);
        this.performanceMonitor.recordMetric('block_validation_cache_miss', 1, 'count');

        return result;
      },
      { blockHash: (block as any).getHash() }
    );
  }

  /**
   * Preload UTXOs into cache
   */
  async preloadUtxos(utxos: UTXO[]): Promise<void> {
    this.performanceMonitor.startTimer('utxo_preload');
    
    this.utxoCache.putMultiple(utxos);
    
    this.performanceMonitor.endTimer('utxo_preload');
    this.performanceMonitor.recordMetric('utxos_preloaded', utxos.length, 'count');
    
    this.validatorLogger.debug(`Preloaded ${utxos.length} UTXOs into cache`);
  }

  /**
   * Clear validation caches
   */
  clearCaches(): void {
    this.validationCache.transactions.clear();
    this.validationCache.blocks.clear();
    this.utxoCache.clear();
    
    this.validatorLogger.info('Validation caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      transactionCache: {
        size: this.validationCache.transactions.size,
        maxSize: this.config.cacheSize,
      },
      blockCache: {
        size: this.validationCache.blocks.size,
        maxSize: this.config.cacheSize,
      },
      utxoCache: this.utxoCache.getStats(),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OptimizedValidatorConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Clear caches if size decreased
    this.evictOldCacheEntries();
  }

  /**
   * Get optimized UTXOs using cache
   */
  private async getOptimizedUtxos(transaction: Transaction, fallbackUtxos: UTXO[]): Promise<UTXO[]> {
    const requiredUtxos: Array<{ txId: string; outputIndex: number }> = [];
    
    // Collect required UTXO references from transaction inputs
    for (const input of transaction.inputs) {
      requiredUtxos.push({
        txId: input.txId,
        outputIndex: input.outputIndex,
      });
    }

    // Try to get from cache first
    const cachedUtxos = this.utxoCache.getMultiple(requiredUtxos);
    const foundUtxos: UTXO[] = Array.from(cachedUtxos.values());

    // If we found all required UTXOs in cache, use them
    if (foundUtxos.length === requiredUtxos.length) {
      this.performanceMonitor.recordMetric('utxo_cache_full_hit', 1, 'count');
      return foundUtxos;
    }

    // Otherwise, use fallback UTXOs and cache them for future use
    const relevantUtxos = fallbackUtxos.filter(utxo => 
      requiredUtxos.some(req => 
        req.txId === utxo.txId && req.outputIndex === utxo.outputIndex
      )
    );

    // Cache the UTXOs we found
    this.utxoCache.putMultiple(relevantUtxos);
    
    this.performanceMonitor.recordMetric('utxo_cache_partial_hit', 1, 'count');
    return relevantUtxos;
  }

  /**
   * Validate block structure (fast checks)
   */
  private validateBlockStructure(block: Block, previousBlock?: Block): { isValid: boolean; error?: string } {
    // Check if block has transactions
    if (!block.transactions || block.transactions.length === 0) {
      return { isValid: false, error: 'Block must contain at least one transaction' };
    }

    // Check if first transaction is coinbase
    const firstTx = block.transactions[0];
    if (!this.isCoinbaseTransaction(firstTx)) {
      return { isValid: false, error: 'First transaction must be coinbase' };
    }

    // Check if only first transaction is coinbase
    for (let i = 1; i < block.transactions.length; i++) {
      if (this.isCoinbaseTransaction(block.transactions[i])) {
        return { isValid: false, error: 'Only first transaction can be coinbase' };
      }
    }

    // Check previous hash if previous block provided
    if (previousBlock && block.header.previousHash !== (previousBlock as any).getHash()) {
      return { isValid: false, error: 'Invalid previous block hash' };
    }

    return { isValid: true };
  }

  /**
   * Validate Merkle root
   */
  private validateMerkleRoot(block: Block): { isValid: boolean; error?: string } {
    const calculatedMerkleRoot = (block as any).getMerkleTree().getRoot();
    
    if (block.header.merkleRoot !== calculatedMerkleRoot) {
      return { isValid: false, error: 'Invalid Merkle root' };
    }

    return { isValid: true };
  }

  /**
   * Check if transaction is coinbase
   */
  private isCoinbaseTransaction(transaction: Transaction): boolean {
    return transaction.inputs.length === 1 && 
           transaction.inputs[0].txId === '0'.repeat(64) && 
           transaction.inputs[0].outputIndex === 0xffffffff;
  }

  /**
   * Get cached transaction validation result
   */
  private getCachedTransactionResult(txId: string): { isValid: boolean; error?: string } | null {
    const cached = this.validationCache.transactions.get(txId);
    
    if (!cached) {
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > this.config.cacheTtlMs) {
      this.validationCache.transactions.delete(txId);
      return null;
    }

    return { isValid: cached.isValid, error: cached.error };
  }

  /**
   * Cache transaction validation result
   */
  private cacheTransactionResult(txId: string, result: { isValid: boolean; error?: string }): void {
    // Evict old entries if cache is full
    if (this.validationCache.transactions.size >= this.config.cacheSize) {
      this.evictOldTransactionCacheEntries();
    }

    this.validationCache.transactions.set(txId, {
      ...result,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached block validation result
   */
  private getCachedBlockResult(blockHash: string): { isValid: boolean; error?: string } | null {
    const cached = this.validationCache.blocks.get(blockHash);
    
    if (!cached) {
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > this.config.cacheTtlMs) {
      this.validationCache.blocks.delete(blockHash);
      return null;
    }

    return { isValid: cached.isValid, error: cached.error };
  }

  /**
   * Cache block validation result
   */
  private cacheBlockResult(blockHash: string, result: { isValid: boolean; error?: string }): void {
    // Evict old entries if cache is full
    if (this.validationCache.blocks.size >= this.config.cacheSize) {
      this.evictOldBlockCacheEntries();
    }

    this.validationCache.blocks.set(blockHash, {
      ...result,
      timestamp: Date.now(),
    });
  }

  /**
   * Evict old cache entries
   */
  private evictOldCacheEntries(): void {
    this.evictOldTransactionCacheEntries();
    this.evictOldBlockCacheEntries();
  }

  /**
   * Evict old transaction cache entries
   */
  private evictOldTransactionCacheEntries(): void {
    const entries = Array.from(this.validationCache.transactions.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = Math.max(0, entries.length - this.config.cacheSize + 1);
    for (let i = 0; i < toRemove; i++) {
      this.validationCache.transactions.delete(entries[i][0]);
    }
  }

  /**
   * Evict old block cache entries
   */
  private evictOldBlockCacheEntries(): void {
    const entries = Array.from(this.validationCache.blocks.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = Math.max(0, entries.length - this.config.cacheSize + 1);
    for (let i = 0; i < toRemove; i++) {
      this.validationCache.blocks.delete(entries[i][0]);
    }
  }
}