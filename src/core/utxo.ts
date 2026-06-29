import { UTXO } from '../interfaces';
import { AddressUtils } from './address';

/**
 * UTXO (Unspent Transaction Output) class
 * Represents an unspent output that can be used as input for new transactions
 */
export class UTXOImpl implements UTXO {
  public txId: string;
  public outputIndex: number;
  public address: string;
  public amount: number;
  public isSpent: boolean;

  constructor(txId: string, outputIndex: number, address: string, amount: number, isSpent: boolean = false) {
    this.txId = txId;
    this.outputIndex = outputIndex;
    this.address = address;
    this.amount = amount;
    this.isSpent = isSpent;
  }

  /**
   * Validate UTXO format and data
   * @returns True if UTXO is valid, false otherwise
   */
  isValid(): boolean {
    // Validate transaction ID
    if (!this.txId || typeof this.txId !== 'string' || this.txId.length !== 64) {
      return false;
    }

    // Validate output index
    if (typeof this.outputIndex !== 'number' || this.outputIndex < 0) {
      return false;
    }

    // Validate address
    if (!AddressUtils.validateAddress(this.address)) {
      return false;
    }

    // Validate amount
    if (typeof this.amount !== 'number' || this.amount <= 0) {
      return false;
    }

    // Check for reasonable maximum (prevent overflow)
    const MAX_COIN_SUPPLY = 21000000 * 100000000; // 21M coins with 8 decimal places
    if (this.amount > MAX_COIN_SUPPLY) {
      return false;
    }

    // Validate spent flag
    if (typeof this.isSpent !== 'boolean') {
      return false;
    }

    return true;
  }

  /**
   * Mark this UTXO as spent
   */
  markAsSpent(): void {
    this.isSpent = true;
  }

  /**
   * Mark this UTXO as unspent
   */
  markAsUnspent(): void {
    this.isSpent = false;
  }

  /**
   * Get unique identifier for this UTXO
   * @returns Unique identifier string
   */
  getId(): string {
    return `${this.txId}:${this.outputIndex}`;
  }

  /**
   * Check if this UTXO can be spent (is unspent)
   * @returns True if UTXO can be spent, false otherwise
   */
  canBeSpent(): boolean {
    return !this.isSpent && this.isValid();
  }

  /**
   * Create a copy of this UTXO
   * @returns New UTXOImpl instance
   */
  clone(): UTXOImpl {
    return new UTXOImpl(this.txId, this.outputIndex, this.address, this.amount, this.isSpent);
  }

  /**
   * Convert UTXO to JSON object
   * @returns JSON representation of UTXO
   */
  toJSON(): object {
    return {
      txId: this.txId,
      outputIndex: this.outputIndex,
      address: this.address,
      amount: this.amount,
      isSpent: this.isSpent
    };
  }

  /**
   * Create UTXO from JSON object
   * @param json - JSON object containing UTXO data
   * @returns New UTXOImpl instance
   */
  static fromJSON(json: any): UTXOImpl {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid JSON data for UTXO');
    }

    const { txId, outputIndex, address, amount, isSpent } = json;
    
    if (!txId || !address || typeof outputIndex !== 'number' || typeof amount !== 'number') {
      throw new Error('Missing required UTXO fields in JSON');
    }

    return new UTXOImpl(txId, outputIndex, address, amount, Boolean(isSpent));
  }

  /**
   * Compare two UTXOs for equality
   * @param other - Other UTXO to compare with
   * @returns True if UTXOs are equal, false otherwise
   */
  equals(other: UTXO): boolean {
    return this.txId === other.txId && 
           this.outputIndex === other.outputIndex &&
           this.address === other.address &&
           this.amount === other.amount &&
           this.isSpent === other.isSpent;
  }

  /**
   * Create UTXO from transaction output
   * @param txId - Transaction ID
   * @param outputIndex - Output index in transaction
   * @param address - Recipient address
   * @param amount - Amount in the output
   * @returns New UTXOImpl instance
   */
  static fromTransactionOutput(txId: string, outputIndex: number, address: string, amount: number): UTXOImpl {
    return new UTXOImpl(txId, outputIndex, address, amount, false);
  }

  /**
   * Sort UTXOs by amount (descending order for optimal coin selection)
   * @param utxos - Array of UTXOs to sort
   * @returns Sorted array of UTXOs
   */
  static sortByAmount(utxos: UTXO[]): UTXO[] {
    return [...utxos].sort((a, b) => b.amount - a.amount);
  }

  /**
   * Filter UTXOs by address
   * @param utxos - Array of UTXOs to filter
   * @param address - Address to filter by
   * @returns Filtered array of UTXOs
   */
  static filterByAddress(utxos: UTXO[], address: string): UTXO[] {
    return utxos.filter(utxo => utxo.address === address);
  }

  /**
   * Filter unspent UTXOs
   * @param utxos - Array of UTXOs to filter
   * @returns Array of unspent UTXOs
   */
  static filterUnspent(utxos: UTXO[]): UTXO[] {
    return utxos.filter(utxo => !utxo.isSpent);
  }

  /**
   * Calculate total amount from array of UTXOs
   * @param utxos - Array of UTXOs
   * @returns Total amount
   */
  static getTotalAmount(utxos: UTXO[]): number {
    return utxos.reduce((total, utxo) => total + utxo.amount, 0);
  }

  /**
   * Select UTXOs for a transaction using greedy algorithm
   * @param utxos - Available UTXOs
   * @param targetAmount - Target amount to select
   * @returns Selected UTXOs and change amount
   */
  static selectUTXOs(utxos: UTXO[], targetAmount: number): { selectedUTXOs: UTXO[], changeAmount: number } {
    if (targetAmount <= 0) {
      throw new Error('Target amount must be positive');
    }

    // Filter unspent UTXOs and sort by amount (descending)
    const availableUTXOs = this.sortByAmount(this.filterUnspent(utxos));
    
    let selectedAmount = 0;
    const selectedUTXOs: UTXO[] = [];

    // Greedy selection: pick UTXOs until we have enough
    for (const utxo of availableUTXOs) {
      selectedUTXOs.push(utxo);
      selectedAmount += utxo.amount;

      if (selectedAmount >= targetAmount) {
        break;
      }
    }

    // Check if we have enough funds
    if (selectedAmount < targetAmount) {
      throw new Error('Insufficient funds');
    }

    const changeAmount = selectedAmount - targetAmount;
    
    return { selectedUTXOs, changeAmount };
  }
}