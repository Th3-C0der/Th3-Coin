import { EventEmitter } from 'events';
import { logger } from './logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PerformanceStats {
  transactionValidationTime: {
    avg: number;
    min: number;
    max: number;
    count: number;
  };
  blockValidationTime: {
    avg: number;
    min: number;
    max: number;
    count: number;
  };
  miningHashRate: number;
  networkLatency: {
    avg: number;
    min: number;
    max: number;
    count: number;
  };
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cacheStats: {
    utxoCache: {
      hitRate: number;
      size: number;
    };
  };
}

interface TimingData {
  values: number[];
  sum: number;
  min: number;
  max: number;
  count: number;
}

/**
 * Performance monitoring and metrics collection system
 */
export class PerformanceMonitor extends EventEmitter {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private timings: Map<string, TimingData> = new Map();
  private activeTimers: Map<string, number> = new Map();
  private maxMetricsPerType: number = 1000;
  private perfLogger = logger.child('PERF');
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring: boolean = false;

  constructor() {
    super();
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.perfLogger.info('Performance monitoring started');

    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.emitPerformanceReport();
    }, intervalMs);

    // Initial collection
    this.collectSystemMetrics();
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.perfLogger.info('Performance monitoring stopped');
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name)!;
    metrics.push(metric);

    // Keep only recent metrics
    if (metrics.length > this.maxMetricsPerType) {
      metrics.shift();
    }

    this.emit('metric', metric);
  }

  /**
   * Start timing an operation
   */
  startTimer(name: string): void {
    this.activeTimers.set(name, Date.now());
  }

  /**
   * End timing an operation and record the duration
   */
  endTimer(name: string, tags?: Record<string, string>): number {
    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      this.perfLogger.warn(`Timer '${name}' was not started`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.activeTimers.delete(name);

    // Record timing metric
    this.recordMetric(name, duration, 'ms', tags);

    // Update timing statistics
    this.updateTimingStats(name, duration);

    return duration;
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
    this.startTimer(name);
    try {
      const result = await fn();
      this.endTimer(name, tags);
      return result;
    } catch (error) {
      this.endTimer(name, { ...tags, error: 'true' });
      throw error;
    }
  }

  /**
   * Time a synchronous function execution
   */
  timeFunctionSync<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
    this.startTimer(name);
    try {
      const result = fn();
      this.endTimer(name, tags);
      return result;
    } catch (error) {
      this.endTimer(name, { ...tags, error: 'true' });
      throw error;
    }
  }

  /**
   * Get timing statistics for an operation
   */
  getTimingStats(name: string): TimingData | null {
    return this.timings.get(name) || null;
  }

  /**
   * Get all performance statistics
   */
  getPerformanceStats(): PerformanceStats {
    const txValidation = this.getTimingStats('transaction_validation') || this.createEmptyTimingData();
    const blockValidation = this.getTimingStats('block_validation') || this.createEmptyTimingData();
    const networkLatency = this.getTimingStats('network_latency') || this.createEmptyTimingData();

    return {
      transactionValidationTime: {
        avg: txValidation.count > 0 ? txValidation.sum / txValidation.count : 0,
        min: txValidation.min,
        max: txValidation.max,
        count: txValidation.count,
      },
      blockValidationTime: {
        avg: blockValidation.count > 0 ? blockValidation.sum / blockValidation.count : 0,
        min: blockValidation.min,
        max: blockValidation.max,
        count: blockValidation.count,
      },
      miningHashRate: this.getLatestMetricValue('mining_hash_rate') || 0,
      networkLatency: {
        avg: networkLatency.count > 0 ? networkLatency.sum / networkLatency.count : 0,
        min: networkLatency.min,
        max: networkLatency.max,
        count: networkLatency.count,
      },
      memoryUsage: this.getMemoryUsage(),
      cacheStats: {
        utxoCache: {
          hitRate: this.getLatestMetricValue('utxo_cache_hit_rate') || 0,
          size: this.getLatestMetricValue('utxo_cache_size') || 0,
        },
      },
    };
  }

  /**
   * Get metrics for a specific name
   */
  getMetrics(name: string): PerformanceMetric[] {
    return this.metrics.get(name) || [];
  }

  /**
   * Get all metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Clear all metrics and statistics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.timings.clear();
    this.activeTimers.clear();
    this.perfLogger.info('Performance metrics cleared');
  }

  /**
   * Get performance report as string
   */
  getPerformanceReport(): string {
    const stats = this.getPerformanceStats();
    
    return `
Performance Report (${new Date().toISOString()}):
=================================================

Transaction Validation:
  Average: ${stats.transactionValidationTime.avg.toFixed(2)}ms
  Min: ${stats.transactionValidationTime.min}ms
  Max: ${stats.transactionValidationTime.max}ms
  Count: ${stats.transactionValidationTime.count}

Block Validation:
  Average: ${stats.blockValidationTime.avg.toFixed(2)}ms
  Min: ${stats.blockValidationTime.min}ms
  Max: ${stats.blockValidationTime.max}ms
  Count: ${stats.blockValidationTime.count}

Mining Hash Rate: ${stats.miningHashRate.toFixed(2)} H/s

Network Latency:
  Average: ${stats.networkLatency.avg.toFixed(2)}ms
  Min: ${stats.networkLatency.min}ms
  Max: ${stats.networkLatency.max}ms
  Count: ${stats.networkLatency.count}

Memory Usage:
  Heap Used: ${(stats.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
  Heap Total: ${(stats.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
  RSS: ${(stats.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB

Cache Performance:
  UTXO Cache Hit Rate: ${(stats.cacheStats.utxoCache.hitRate * 100).toFixed(2)}%
  UTXO Cache Size: ${stats.cacheStats.utxoCache.size}
`;
  }

  /**
   * Update timing statistics
   */
  private updateTimingStats(name: string, duration: number): void {
    if (!this.timings.has(name)) {
      this.timings.set(name, {
        values: [],
        sum: 0,
        min: duration,
        max: duration,
        count: 0,
      });
    }

    const stats = this.timings.get(name)!;
    stats.values.push(duration);
    stats.sum += duration;
    stats.min = Math.min(stats.min, duration);
    stats.max = Math.max(stats.max, duration);
    stats.count++;

    // Keep only recent values
    if (stats.values.length > this.maxMetricsPerType) {
      const removed = stats.values.shift()!;
      stats.sum -= removed;
    }
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    
    this.recordMetric('memory_heap_used', memUsage.heapUsed, 'bytes');
    this.recordMetric('memory_heap_total', memUsage.heapTotal, 'bytes');
    this.recordMetric('memory_external', memUsage.external, 'bytes');
    this.recordMetric('memory_rss', memUsage.rss, 'bytes');

    // CPU usage (if available)
    if (process.cpuUsage) {
      const cpuUsage = process.cpuUsage();
      this.recordMetric('cpu_user', cpuUsage.user, 'microseconds');
      this.recordMetric('cpu_system', cpuUsage.system, 'microseconds');
    }
  }

  /**
   * Get latest metric value
   */
  private getLatestMetricValue(name: string): number | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) {
      return null;
    }
    return metrics[metrics.length - 1].value;
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };
  }

  /**
   * Create empty timing data
   */
  private createEmptyTimingData(): TimingData {
    return {
      values: [],
      sum: 0,
      min: 0,
      max: 0,
      count: 0,
    };
  }

  /**
   * Emit performance report
   */
  private emitPerformanceReport(): void {
    const stats = this.getPerformanceStats();
    this.emit('performanceReport', stats);
    
    // Log summary
    this.perfLogger.info('Performance summary', {
      txValidationAvg: stats.transactionValidationTime.avg,
      blockValidationAvg: stats.blockValidationTime.avg,
      miningHashRate: stats.miningHashRate,
      memoryUsedMB: Math.round(stats.memoryUsage.heapUsed / 1024 / 1024),
      utxoCacheHitRate: stats.cacheStats.utxoCache.hitRate,
    });
  }
}