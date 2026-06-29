import { UTXO, Transaction } from '../interfaces';
import { UTXOImpl } from './utxo';
import { TransactionImpl } from './transaction';

/**
 * UTXO Management System for Th3Coin
 * Handles tracking of unspent transaction outputs, balance calculations, and UTXO updates
 */
export class UTXOManager {
  private utxos: Map<string, UTXO>;

  constructor(initialUTXOs: UTXO[] = []) {
    this.utxos = new Map();
    
    // Initialize with provided UTXOs
    for (const utxo of initialUTXOs) {
      this.addUTXO(utxo);
    }
  }

  /**
   * Add a UTXO to the database
   * @param utxo - UTXO to add
   */
  addUTXO(utxo: UTXO): void {
    if (!new UTXOImpl(utxo.txId, utxo.outputIndex, utxo.address, utxo.amount, utxo.isSpent).isValid()) {
      throw new Error('Invalid UTXO provided');
    }

    const key = this.getUTXOKey(utxo.txId, utxo.outputIndex);
    this.utxos.set(key, { ...utxo });
  }

  /**
   * Remove a UTXO from the database
   * @param txId - Transaction ID
   * @param outputIndex - Output index
   * @returns True if UTXO was removed, false if not found
   */
  removeUTXO(txId: string, outputIndex: number): boolean {
    const key = this.getUTXOKey(txId, outputIndex);
    return this.utxos.delete(key);
  }

  /**
   * Get a specific UTXO
   * @param txId - Transaction ID
   * @param outputIndex - Output index
   * @returns UTXO if found, null otherwise
   */
  getUTXO(txId: string, outputIndex: number): UTXO | null {
    const key = this.getUTXOKey(txId, outputIndex);
    const utxo = this.utxos.get(key);
    return utxo ? { ...utxo } : null;
  }

  /**
   * Mark a UTXO as spent
   * @param txId - Transaction ID
   * @param outputIndex - Output index
   * @returns True if UTXO was marked as spent, false if not found
   */
  markUTXOAsSpent(txId: string, outputIndex: number): boolean {
    const key = this.getUTXOKey(txId, outputIndex);
    const utxo = this.utxos.get(key);
    
    if (utxo) {
      utxo.isSpent = true;
      return true;
    }
    
    return false;
  }

  /**
   * Mark a UTXO as unspent
   * @param txId - Transaction ID
   * @param outputIndex - Output index
   * @returns True if UTXO was marked as unspent, false if not found
   */
  markUTXOAsUnspent(txId: string, outputIndex: number): boolean {
    const key = this.getUTXOKey(txId, outputIndex);
    const utxo = this.utxos.get(key);
    
    if (utxo) {
      utxo.isSpent = false;
      return true;
    }
    
    return false;
  }

  /**
   * Get all UTXOs for a specific address
   * @param address - Address to get UTXOs for
   * @param includeSpent - Whether to include spent UTXOs
   * @returns Array of UTXOs for the address
   */
  getUTXOsForAddress(address: string, includeSpent: boolean = false): UTXO[] {
    const result: UTXO[] = [];
    
    for (const utxo of this.utxos.values()) {
      if (utxo.address === address && (includeSpent || !utxo.isSpent)) {
        result.push({ ...utxo });
      }
    }
    
    return result;
  }

  /**
   * Get all unspent UTXOs
   * @returns Array of all unspent UTXOs
   */
  getUnspentUTXOs(): UTXO[] {
    const result: UTXO[] = [];
    
    for (const utxo of this.utxos.values()) {
      if (!utxo.isSpent) {
        result.push({ ...utxo });
      }
    }
    
    return result;
  }

  /**
   * Get all UTXOs (spent and unspent)
   * @returns Array of all UTXOs
   */
  getAllUTXOs(): UTXO[] {
    return Array.from(this.utxos.values()).map(utxo => ({ ...utxo }));
  }

  /**
   * Calculate balance for a specific address
   * @param address - Address to calculate balance for
   * @returns Total balance (sum of unspent UTXOs)
   */
  getBalance(address: string): number {
    let balance = 0;
    
    for (const utxo of this.utxos.values()) {
      if (utxo.address === address && !utxo.isSpent) {
        balance += utxo.amount;
      }
    }
    
    return balance;
  }

  /**
   * Calculate total supply (sum of all unspent UTXOs)
   * @returns Total supply
   */
  getTotalSupply(): number {
    let totalSupply = 0;
    
    for (const utxo of this.utxos.values()) {
      if (!utxo.isSpent) {
        totalSupply += utxo.amount;
      }
    }
    
    return totalSupply;
  }

  /**
   * Process a transaction and update UTXOs accordingly
   * @param transaction - Transaction to process
   * @returns True if transaction was processed successfully
   */
  processTransaction(transaction: Transaction): boolean {
    const txImpl = new TransactionImpl(transaction.inputs, transaction.outputs, transaction.timestamp);
    txImpl.id = transaction.id;
    txImpl.signature = transaction.signature;

    try {
      // Skip input processing for coinbase transactions
      if (!txImpl.isCoinbase()) {
        // Mark input UTXOs as spent
        for (const input of transaction.inputs) {
          if (!this.markUTXOAsSpent(input.txId, input.outputIndex)) {
            // Rollback any changes made so far
            this.rollbackTransaction(transaction);
            return false;
          }
        }
      }

      // Add new UTXOs from outputs
      for (let i = 0; i < transaction.outputs.length; i++) {
        const output = transaction.outputs[i];
        const newUTXO = new UTXOImpl(transaction.id, i, output.address, output.amount, false);
        this.addUTXO(newUTXO);
      }

      return true;
    } catch (error) {
      // Rollback any changes made so far
      this.rollbackTransaction(transaction);
      return false;
    }
  }

  /**
   * Rollback a transaction (undo its effects on UTXOs)
   * @param transaction - Transaction to rollback
   * @returns True if transaction was rolled back successfully
   */
  rollbackTransaction(transaction: Transaction): boolean {
    const txImpl = new TransactionImpl(transaction.inputs, transaction.outputs, transaction.timestamp);
    txImpl.id = transaction.id;

    try {
      // Remove UTXOs created by this transaction
      for (let i = 0; i < transaction.outputs.length; i++) {
        this.removeUTXO(transaction.id, i);
      }

      // Skip input processing for coinbase transactions
      if (!txImpl.isCoinbase()) {
        // Mark input UTXOs as unspent
        for (const input of transaction.inputs) {
          this.markUTXOAsUnspent(input.txId, input.outputIndex);
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Select UTXOs for a transaction using various strategies
   * @param address - Address to select UTXOs for
   * @param targetAmount - Target amount to select
   * @param strategy - Selection strategy ('greedy', 'smallest', 'largest')
   * @returns Selected UTXOs and change amount
   */
  selectUTXOsForTransaction(
    address: string, 
    targetAmount: number, 
    strategy: 'greedy' | 'smallest' | 'largest' = 'greedy'
  ): { selectedUTXOs: UTXO[], changeAmount: number } {
    if (targetAmount <= 0) {
      throw new Error('Target amount must be positive');
    }

    const availableUTXOs = this.getUTXOsForAddress(address, false);
    
    if (availableUTXOs.length === 0) {
      throw new Error('No UTXOs available for address');
    }

    // Sort UTXOs based on strategy
    let sortedUTXOs: UTXO[];
    switch (strategy) {
      case 'smallest':
        sortedUTXOs = availableUTXOs.sort((a, b) => a.amount - b.amount);
        break;
      case 'largest':
        sortedUTXOs = availableUTXOs.sort((a, b) => b.amount - a.amount);
        break;
      case 'greedy':
      default:
        // Greedy: try to find exact match first, then use largest first
        sortedUTXOs = availableUTXOs.sort((a, b) => b.amount - a.amount);
        break;
    }

    let selectedAmount = 0;
    const selectedUTXOs: UTXO[] = [];

    // Select UTXOs until we have enough
    for (const utxo of sortedUTXOs) {
      selectedUTXOs.push(utxo);
      selectedAmount += utxo.amount;

      if (selectedAmount >= targetAmount) {
        break;
      }
    }

    // Check if we have enough funds
    if (selectedAmount < targetAmount) {
      throw new Error(`Insufficient funds: need ${targetAmount}, have ${selectedAmount}`);
    }

    const changeAmount = selectedAmount - targetAmount;
    
    return { selectedUTXOs, changeAmount };
  }

  /**
   * Validate UTXO set consistency
   * @returns Validation result with details
   */
  validateUTXOSet(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for duplicate UTXOs
    const utxoKeys = new Set<string>();
    for (const utxo of this.utxos.values()) {
      const key = this.getUTXOKey(utxo.txId, utxo.outputIndex);
      if (utxoKeys.has(key)) {
        errors.push(`Duplicate UTXO found: ${key}`);
      }
      utxoKeys.add(key);
    }

    // Validate each UTXO
    for (const utxo of this.utxos.values()) {
      const utxoImpl = new UTXOImpl(utxo.txId, utxo.outputIndex, utxo.address, utxo.amount, utxo.isSpent);
      if (!utxoImpl.isValid()) {
        errors.push(`Invalid UTXO: ${this.getUTXOKey(utxo.txId, utxo.outputIndex)}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get statistics about the UTXO set
   * @returns UTXO set statistics
   */
  getStatistics(): {
    totalUTXOs: number;
    unspentUTXOs: number;
    spentUTXOs: number;
    totalSupply: number;
    averageUTXOAmount: number;
    largestUTXO: number;
    smallestUTXO: number;
  } {
    const allUTXOs = this.getAllUTXOs();
    const unspentUTXOs = this.getUnspentUTXOs();
    const totalSupply = this.getTotalSupply();

    let largestUTXO = 0;
    let smallestUTXO = Number.MAX_SAFE_INTEGER;

    for (const utxo of unspentUTXOs) {
      if (utxo.amount > largestUTXO) {
        largestUTXO = utxo.amount;
      }
      if (utxo.amount < smallestUTXO) {
        smallestUTXO = utxo.amount;
      }
    }

    if (unspentUTXOs.length === 0) {
      smallestUTXO = 0;
    }

    return {
      totalUTXOs: allUTXOs.length,
      unspentUTXOs: unspentUTXOs.length,
      spentUTXOs: allUTXOs.length - unspentUTXOs.length,
      totalSupply,
      averageUTXOAmount: unspentUTXOs.length > 0 ? totalSupply / unspentUTXOs.length : 0,
      largestUTXO,
      smallestUTXO
    };
  }

  /**
   * Load UTXOs from an array (used for storage loading)
   * @param utxos - Array of UTXOs to load
   */
  loadUTXOs(utxos: UTXO[]): void {
    this.utxos.clear();
    for (const utxo of utxos) {
      this.addUTXO(utxo);
    }
  }

  /**
   * Clear all UTXOs from the database
   */
  clear(): void {
    this.utxos.clear();
  }

  /**
   * Get the number of UTXOs in the database
   * @returns Number of UTXOs
   */
  size(): number {
    return this.utxos.size;
  }

  /**
   * Check if a UTXO exists
   * @param txId - Transaction ID
   * @param outputIndex - Output index
   * @returns True if UTXO exists
   */
  hasUTXO(txId: string, outputIndex: number): boolean {
    const key = this.getUTXOKey(txId, outputIndex);
    return this.utxos.has(key);
  }

  /**
   * Generate a unique key for a UTXO
   * @param txId - Transaction ID
   * @param outputIndex - Output index
   * @returns Unique key string
   */
  private getUTXOKey(txId: string, outputIndex: number): string {
    return `${txId}:${outputIndex}`;
  }

  /**
   * Create a deep copy of the UTXO manager
   * @returns New UTXOManager instance with copied data
   */
  clone(): UTXOManager {
    const allUTXOs = this.getAllUTXOs();
    return new UTXOManager(allUTXOs);
  }

  /**
   * Export UTXOs to JSON format
   * @returns JSON representation of all UTXOs
   */
  toJSON(): object {
    return {
      utxos: this.getAllUTXOs(),
      statistics: this.getStatistics()
    };
  }

  /**
   * Import UTXOs from JSON format
   * @param json - JSON data containing UTXOs
   * @returns New UTXOManager instance
   */
  static fromJSON(json: any): UTXOManager {
    if (!json || !Array.isArray(json.utxos)) {
      throw new Error('Invalid JSON format for UTXO manager');
    }

    const utxos = json.utxos.map((utxoData: any) => UTXOImpl.fromJSON(utxoData));
    return new UTXOManager(utxos);
  }
}