import { IMempool, Transaction, UTXO } from '../interfaces';
import { TransactionValidator } from './transaction-validator';

/**
 * Mempool (Memory Pool) manages pending transactions before they are included in blocks
 * Provides transaction validation, storage, and retrieval functionality with fee-based prioritization
 */
export class Mempool implements IMempool {
  private transactions: Map<string, Transaction>;
  private utxoProvider: () => UTXO[];
  private blockHeight: number;
  private maxSize: number;
  private minFeeRate: number; // Minimum fee rate in satoshis per byte

  constructor(
    utxoProvider: () => UTXO[], 
    blockHeight: number = 0, 
    maxSize: number = 1000,
    minFeeRate: number = 1
  ) {
    this.transactions = new Map();
    this.utxoProvider = utxoProvider;
    this.blockHeight = blockHeight;
    this.maxSize = maxSize;
    this.minFeeRate = minFeeRate;
  }

  /**
   * Add a transaction to the mempool after validation
   * @param transaction - Transaction to add
   * @returns True if transaction was added successfully, false otherwise
   */
  addTransaction(transaction: Transaction): boolean {
    try {
      // Check if transaction already exists in mempool
      if (this.transactions.has(transaction.id)) {
        return false; // Transaction already in mempool
      }

      // Validate the transaction
      if (!this.validateTransaction(transaction)) {
        return false;
      }

      // Validate transaction fee
      if (!this.validateTransactionFee(transaction)) {
        return false;
      }

      // Check for conflicts with existing transactions in mempool
      if (this.hasConflictingTransaction(transaction)) {
        return false;
      }

      // Add transaction to mempool
      this.transactions.set(transaction.id, transaction);

      // Enforce size limits (may evict lower fee transactions)
      this.enforceSizeLimit();

      return true;
    } catch (error) {
      console.error('Error adding transaction to mempool:', error);
      return false;
    }
  }

  /**
   * Remove a transaction from the mempool
   * @param txId - Transaction ID to remove
   */
  removeTransaction(txId: string): void {
    this.transactions.delete(txId);
  }

  /**
   * Get all pending transactions in the mempool
   * @returns Array of pending transactions
   */
  getPendingTransactions(): Transaction[] {
    return Array.from(this.transactions.values());
  }

  /**
   * Validate a transaction before adding to mempool
   * @param transaction - Transaction to validate
   * @returns True if transaction is valid, false otherwise
   */
  validateTransaction(transaction: Transaction): boolean {
    try {
      // Get current UTXO set
      const utxos = this.utxoProvider();

      // Use TransactionValidator for comprehensive validation
      const validationResult = TransactionValidator.validateTransaction(
        transaction,
        utxos,
        this.blockHeight
      );

      return validationResult.isValid;
    } catch (error) {
      console.error('Error validating transaction:', error);
      return false;
    }
  }

  /**
   * Get the number of transactions in the mempool
   * @returns Number of pending transactions
   */
  getTransactionCount(): number {
    return this.transactions.size;
  }

  /**
   * Clear all transactions from the mempool
   */
  clearMempool(): void {
    this.transactions.clear();
  }

  /**
   * Check if a transaction conflicts with existing transactions in mempool
   * @param transaction - Transaction to check for conflicts
   * @returns True if there are conflicts, false otherwise
   */
  private hasConflictingTransaction(transaction: Transaction): boolean {
    // Skip conflict check for coinbase transactions
    if (TransactionValidator.isCoinbaseTransaction(transaction)) {
      return false;
    }

    // Check if any input is already being spent by another transaction in mempool
    for (const input of transaction.inputs) {
      const inputKey = `${input.txId}:${input.outputIndex}`;
      
      for (const existingTx of this.transactions.values()) {
        // Skip coinbase transactions
        if (TransactionValidator.isCoinbaseTransaction(existingTx)) {
          continue;
        }

        for (const existingInput of existingTx.inputs) {
          const existingInputKey = `${existingInput.txId}:${existingInput.outputIndex}`;
          if (inputKey === existingInputKey) {
            return true; // Conflict found - same UTXO being spent
          }
        }
      }
    }

    return false;
  }

  /**
   * Remove transactions that have been included in a block
   * @param blockTransactions - Array of transactions that were included in a block
   */
  removeBlockTransactions(blockTransactions: Transaction[]): void {
    for (const transaction of blockTransactions) {
      this.removeTransaction(transaction.id);
    }
  }

  /**
   * Get a transaction by ID
   * @param txId - Transaction ID
   * @returns Transaction if found, undefined otherwise
   */
  getTransaction(txId: string): Transaction | undefined {
    return this.transactions.get(txId);
  }

  /**
   * Check if a transaction exists in the mempool
   * @param txId - Transaction ID
   * @returns True if transaction exists, false otherwise
   */
  hasTransaction(txId: string): boolean {
    return this.transactions.has(txId);
  }

  /**
   * Update the block height for validation context
   * @param blockHeight - New block height
   */
  updateBlockHeight(blockHeight: number): void {
    this.blockHeight = blockHeight;
  }

  /**
   * Get transactions that spend from a specific transaction output
   * @param txId - Transaction ID
   * @param outputIndex - Output index
   * @returns Array of transactions that spend this output
   */
  getTransactionsSpendingOutput(txId: string, outputIndex: number): Transaction[] {
    const spendingTxs: Transaction[] = [];
    const targetKey = `${txId}:${outputIndex}`;

    for (const transaction of this.transactions.values()) {
      // Skip coinbase transactions
      if (TransactionValidator.isCoinbaseTransaction(transaction)) {
        continue;
      }

      for (const input of transaction.inputs) {
        const inputKey = `${input.txId}:${input.outputIndex}`;
        if (inputKey === targetKey) {
          spendingTxs.push(transaction);
          break;
        }
      }
    }

    return spendingTxs;
  }

  /**
   * Remove transactions that are no longer valid due to UTXO changes
   * This should be called after new blocks are added to the blockchain
   */
  removeInvalidTransactions(): void {
    const invalidTxIds: string[] = [];

    for (const [txId, transaction] of this.transactions) {
      if (!this.validateTransaction(transaction)) {
        invalidTxIds.push(txId);
      }
    }

    // Remove invalid transactions
    for (const txId of invalidTxIds) {
      this.removeTransaction(txId);
    }
  }

  /**
   * Calculate transaction fee for a given transaction
   * @param transaction - Transaction to calculate fee for
   * @returns Transaction fee in satoshis
   */
  calculateTransactionFee(transaction: Transaction): number {
    if (TransactionValidator.isCoinbaseTransaction(transaction)) {
      return 0;
    }

    const utxos = this.utxoProvider();
    let inputAmount = 0;

    // Calculate total input amount
    for (const input of transaction.inputs) {
      const utxo = utxos.find(u => u.txId === input.txId && u.outputIndex === input.outputIndex);
      if (utxo) {
        inputAmount += utxo.amount;
      }
    }

    // Calculate total output amount
    const outputAmount = transaction.outputs.reduce((total, output) => total + output.amount, 0);

    return inputAmount - outputAmount;
  }

  /**
   * Calculate transaction size in bytes (simplified estimation)
   * @param transaction - Transaction to calculate size for
   * @returns Estimated transaction size in bytes
   */
  calculateTransactionSize(transaction: Transaction): number {
    // Simplified calculation:
    // Base transaction: 10 bytes
    // Each input: ~150 bytes (txid: 32, index: 4, signature: ~70, pubkey: ~33, script: ~25)
    // Each output: ~34 bytes (amount: 8, script: ~25)
    const baseSize = 10;
    const inputSize = transaction.inputs.length * 150;
    const outputSize = transaction.outputs.length * 34;
    
    return baseSize + inputSize + outputSize;
  }

  /**
   * Calculate transaction fee rate (fee per byte)
   * @param transaction - Transaction to calculate fee rate for
   * @returns Fee rate in satoshis per byte
   */
  calculateFeeRate(transaction: Transaction): number {
    const fee = this.calculateTransactionFee(transaction);
    const size = this.calculateTransactionSize(transaction);
    
    return size > 0 ? fee / size : 0;
  }

  /**
   * Validate transaction fee meets minimum requirements
   * @param transaction - Transaction to validate
   * @returns True if fee is adequate, false otherwise
   */
  validateTransactionFee(transaction: Transaction): boolean {
    if (TransactionValidator.isCoinbaseTransaction(transaction)) {
      return true; // Coinbase transactions don't pay fees
    }

    const fee = this.calculateTransactionFee(transaction);
    const feeRate = this.calculateFeeRate(transaction);

    // Check minimum fee rate
    if (feeRate < this.minFeeRate) {
      return false;
    }

    // Check minimum absolute fee (prevent dust attacks)
    const minAbsoluteFee = 1000; // 0.00001 coins
    if (fee < minAbsoluteFee) {
      return false;
    }

    return true;
  }

  /**
   * Get transactions sorted by fee rate (highest first) for mining prioritization
   * @param maxCount - Maximum number of transactions to return
   * @returns Array of transactions sorted by fee rate
   */
  getTransactionsByFeeRate(maxCount?: number): Transaction[] {
    const transactions = Array.from(this.transactions.values());
    
    // Sort by fee rate (descending)
    const sortedTransactions = transactions.sort((a, b) => {
      const feeRateA = this.calculateFeeRate(a);
      const feeRateB = this.calculateFeeRate(b);
      
      if (feeRateA !== feeRateB) {
        return feeRateB - feeRateA; // Higher fee rate first
      }
      
      // If fee rates are equal, prioritize by timestamp (older first)
      return a.timestamp - b.timestamp;
    });

    return maxCount ? sortedTransactions.slice(0, maxCount) : sortedTransactions;
  }

  /**
   * Enforce mempool size limits by evicting lowest fee transactions
   */
  private enforceSizeLimit(): void {
    if (this.transactions.size <= this.maxSize) {
      return; // No need to evict
    }

    // Get transactions sorted by fee rate (lowest first for eviction)
    const transactions = Array.from(this.transactions.values());
    const sortedTransactions = transactions.sort((a, b) => {
      const feeRateA = this.calculateFeeRate(a);
      const feeRateB = this.calculateFeeRate(b);
      
      if (feeRateA !== feeRateB) {
        return feeRateA - feeRateB; // Lower fee rate first
      }
      
      // If fee rates are equal, evict newer transactions first
      return b.timestamp - a.timestamp;
    });

    // Evict transactions until we're under the size limit
    const transactionsToEvict = sortedTransactions.slice(0, this.transactions.size - this.maxSize);
    
    for (const transaction of transactionsToEvict) {
      this.removeTransaction(transaction.id);
    }
  }

  /**
   * Set maximum mempool size
   * @param maxSize - Maximum number of transactions
   */
  setMaxSize(maxSize: number): void {
    if (maxSize <= 0) {
      throw new Error('Max size must be positive');
    }
    
    this.maxSize = maxSize;
    this.enforceSizeLimit();
  }

  /**
   * Get maximum mempool size
   * @returns Maximum number of transactions
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Set minimum fee rate
   * @param minFeeRate - Minimum fee rate in satoshis per byte
   */
  setMinFeeRate(minFeeRate: number): void {
    if (minFeeRate < 0) {
      throw new Error('Min fee rate cannot be negative');
    }
    
    this.minFeeRate = minFeeRate;
    
    // Remove transactions that no longer meet the minimum fee rate
    const transactionsToRemove: string[] = [];
    
    for (const [txId, transaction] of this.transactions) {
      if (!this.validateTransactionFee(transaction)) {
        transactionsToRemove.push(txId);
      }
    }
    
    for (const txId of transactionsToRemove) {
      this.removeTransaction(txId);
    }
  }

  /**
   * Get minimum fee rate
   * @returns Minimum fee rate in satoshis per byte
   */
  getMinFeeRate(): number {
    return this.minFeeRate;
  }

  /**
   * Get mempool statistics
   * @returns Object containing mempool statistics
   */
  getStatistics(): {
    transactionCount: number;
    maxSize: number;
    minFeeRate: number;
    averageFeeRate: number;
    totalFees: number;
    totalSize: number;
  } {
    const transactions = Array.from(this.transactions.values());
    
    let totalFees = 0;
    let totalSize = 0;
    let totalFeeRate = 0;

    for (const transaction of transactions) {
      const fee = this.calculateTransactionFee(transaction);
      const size = this.calculateTransactionSize(transaction);
      const feeRate = this.calculateFeeRate(transaction);
      
      totalFees += fee;
      totalSize += size;
      totalFeeRate += feeRate;
    }

    const averageFeeRate = transactions.length > 0 ? totalFeeRate / transactions.length : 0;

    return {
      transactionCount: transactions.length,
      maxSize: this.maxSize,
      minFeeRate: this.minFeeRate,
      averageFeeRate,
      totalFees,
      totalSize
    };
  }
}