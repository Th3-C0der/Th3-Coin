import { UTXO } from '../interfaces';
import { logger } from '../utils/logger';

export interface UTXOCacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export interface UTXOCacheConfig {
  maxSize: number;
  ttlMs: number;
  cleanupIntervalMs: number;
}

interface CacheEntry {
  utxo: UTXO;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

/**
 * High-performance UTXO cache with LRU eviction and TTL
 */
export class UTXOCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: UTXOCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  private cleanupTimer?: NodeJS.Timeout;
  private cacheLogger = logger.child('UTXO-CACHE');

  constructor(config: Partial<UTXOCacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 10000,
      ttlMs: config.ttlMs || 300000, // 5 minutes
      cleanupIntervalMs: config.cleanupIntervalMs || 60000, // 1 minute
    };

    this.startCleanupTimer();
  }

  /**
   * Get UTXO from cache
   */
  get(txId: string, outputIndex: number): UTXO | null {
    const key = this.getKey(txId, outputIndex);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.stats.hits++;

    return entry.utxo;
  }

  /**
   * Put UTXO in cache
   */
  put(utxo: UTXO): void {
    const key = this.getKey(utxo.txId, utxo.outputIndex);
    const now = Date.now();

    // Check if we need to evict entries
    while (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      utxo,
      timestamp: now,
      accessCount: 1,
      lastAccess: now,
    };

    this.cache.set(key, entry);
  }

  /**
   * Remove UTXO from cache (when spent)
   */
  remove(txId: string, outputIndex: number): boolean {
    const key = this.getKey(txId, outputIndex);
    return this.cache.delete(key);
  }

  /**
   * Check if UTXO exists in cache
   */
  has(txId: string, outputIndex: number): boolean {
    const key = this.getKey(txId, outputIndex);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get multiple UTXOs from cache
   */
  getMultiple(utxoRefs: Array<{ txId: string; outputIndex: number }>): Map<string, UTXO> {
    const result = new Map<string, UTXO>();
    
    for (const ref of utxoRefs) {
      const utxo = this.get(ref.txId, ref.outputIndex);
      if (utxo) {
        const key = this.getKey(ref.txId, ref.outputIndex);
        result.set(key, utxo);
      }
    }

    return result;
  }

  /**
   * Batch put multiple UTXOs
   */
  putMultiple(utxos: UTXO[]): void {
    for (const utxo of utxos) {
      this.put(utxo);
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): UTXOCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      evictions: this.stats.evictions,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
  }

  /**
   * Get cache configuration
   */
  getConfig(): UTXOCacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<UTXOCacheConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart cleanup timer if interval changed
    if (config.cleanupIntervalMs) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }

    // Evict entries if max size decreased
    while (this.cache.size > this.config.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.cacheLogger.debug(`Cleaned up ${removed} expired UTXO cache entries`);
    }

    return removed;
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }

  /**
   * Generate cache key
   */
  private getKey(txId: string, outputIndex: number): string {
    return `${txId}:${outputIndex}`;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}