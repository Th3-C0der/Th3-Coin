import { Transaction, TransactionInput, TransactionOutput, UTXO } from '../interfaces';
import { CryptoUtils } from './crypto';
import { AddressUtils } from './address';

/**
 * TransactionInput class represents an input to a transaction
 * References a previous transaction output that is being spent
 */
export class TransactionInputImpl implements TransactionInput {
  public txId: string;
  public outputIndex: number;
  public signature: string;
  public publicKey: string;

  constructor(txId: string, outputIndex: number, signature: string = '', publicKey: string = '') {
    this.txId = txId;
    this.outputIndex = outputIndex;
    this.signature = signature;
    this.publicKey = publicKey;
  }

  /**
   * Validate the transaction input format
   * @returns True if input is valid, false otherwise
   */
  isValid(): boolean {
    // Check required fields
    if (!this.txId || typeof this.txId !== 'string') {
      return false;
    }

    if (typeof this.outputIndex !== 'number') {
      return false;
    }

    // Allow -1 for coinbase transactions, otherwise must be >= 0
    if (this.outputIndex < -1) {
      return false;
    }

    // For signed inputs, validate signature and public key
    if (this.signature && this.publicKey) {
      if (!CryptoUtils.isValidPublicKey(this.publicKey)) {
        return false;
      }
      // Note: Signature validation requires the transaction data, done in transaction validation
    }

    return true;
  }

  /**
   * Create a copy of this input
   * @returns New TransactionInputImpl instance
   */
  clone(): TransactionInputImpl {
    return new TransactionInputImpl(this.txId, this.outputIndex, this.signature, this.publicKey);
  }
}

/**
 * TransactionOutput class represents an output of a transaction
 * Specifies the recipient address and amount
 */
export class TransactionOutputImpl implements TransactionOutput {
  public address: string;
  public amount: number;

  constructor(address: string, amount: number) {
    this.address = address;
    this.amount = amount;
  }

  /**
   * Validate the transaction output format
   * @returns True if output is valid, false otherwise
   */
  isValid(): boolean {
    // Validate address
    if (!AddressUtils.validateAddress(this.address)) {
      return false;
    }

    // Validate amount (must be positive and not exceed maximum)
    if (typeof this.amount !== 'number' || this.amount <= 0) {
      return false;
    }

    // Check for reasonable maximum (prevent overflow)
    const MAX_COIN_SUPPLY = 21000000 * 100000000; // 21M coins with 8 decimal places
    if (this.amount > MAX_COIN_SUPPLY) {
      return false;
    }

    return true;
  }

  /**
   * Create a copy of this output
   * @returns New TransactionOutputImpl instance
   */
  clone(): TransactionOutputImpl {
    return new TransactionOutputImpl(this.address, this.amount);
  }
}

/**
 * Transaction class represents a cryptocurrency transaction
 * Contains inputs (references to previous outputs) and outputs (new recipients)
 */
export class TransactionImpl implements Transaction {
  public id: string;
  public inputs: TransactionInput[];
  public outputs: TransactionOutput[];
  public timestamp: number;
  public signature?: string;

  constructor(inputs: TransactionInput[] = [], outputs: TransactionOutput[] = [], timestamp?: number) {
    this.inputs = inputs;
    this.outputs = outputs;
    this.timestamp = timestamp || Date.now();
    this.id = this.calculateId();
  }

  /**
   * Calculate transaction ID based on transaction data
   * @returns Transaction ID as hex string
   */
  calculateId(): string {
    const data = {
      inputs: this.inputs.map(input => ({
        txId: input.txId,
        outputIndex: input.outputIndex,
        publicKey: input.publicKey
      })),
      outputs: this.outputs.map(output => ({
        address: output.address,
        amount: output.amount
      })),
      timestamp: this.timestamp
    };

    return CryptoUtils.sha256(JSON.stringify(data));
  }

  /**
   * Get transaction data for signing (without signatures)
   * @returns String representation of transaction data
   */
  getDataForSigning(): string {
    const data = {
      inputs: this.inputs.map(input => ({
        txId: input.txId,
        outputIndex: input.outputIndex,
        publicKey: input.publicKey
      })),
      outputs: this.outputs.map(output => ({
        address: output.address,
        amount: output.amount
      })),
      timestamp: this.timestamp
    };

    return JSON.stringify(data);
  }

  /**
   * Sign the transaction with a private key
   * @param privateKey - Private key in hex format
   */
  sign(privateKey: string): void {
    if (!CryptoUtils.isValidPrivateKey(privateKey)) {
      throw new Error('Invalid private key provided');
    }

    const dataToSign = this.getDataForSigning();
    this.signature = CryptoUtils.sign(dataToSign, privateKey);
    
    // Update transaction ID after signing
    this.id = this.calculateId();
  }

  /**
   * Verify transaction signature
   * @param publicKey - Public key in hex format
   * @returns True if signature is valid, false otherwise
   */
  verifySignature(publicKey: string): boolean {
    if (!this.signature || !CryptoUtils.isValidPublicKey(publicKey)) {
      return false;
    }

    const dataToSign = this.getDataForSigning();
    return CryptoUtils.verify(dataToSign, this.signature, publicKey);
  }

  /**
   * Validate transaction format and structure
   * @returns True if transaction is valid, false otherwise
   */
  isValid(): boolean {
    // Check basic structure
    if (!Array.isArray(this.inputs) || !Array.isArray(this.outputs)) {
      return false;
    }

    // Transaction must have at least one input and one output (except coinbase)
    if (this.inputs.length === 0 && !this.isCoinbase()) {
      return false;
    }

    if (this.outputs.length === 0) {
      return false;
    }

    // Validate timestamp
    if (typeof this.timestamp !== 'number' || this.timestamp <= 0) {
      return false;
    }

    // Validate all inputs
    for (const input of this.inputs) {
      if (!new TransactionInputImpl(input.txId, input.outputIndex, input.signature, input.publicKey).isValid()) {
        return false;
      }
    }

    // Validate all outputs
    for (const output of this.outputs) {
      if (!new TransactionOutputImpl(output.address, output.amount).isValid()) {
        return false;
      }
    }

    // Check for duplicate inputs (double spending attempt)
    const inputKeys = this.inputs.map(input => `${input.txId}:${input.outputIndex}`);
    if (new Set(inputKeys).size !== inputKeys.length) {
      return false;
    }

    return true;
  }

  /**
   * Check if this is a coinbase transaction (mining reward)
   * @returns True if coinbase transaction, false otherwise
   */
  isCoinbase(): boolean {
    return this.inputs.length === 1 && 
           this.inputs[0].txId === '0'.repeat(64) && 
           this.inputs[0].outputIndex === -1;
  }

  /**
   * Get total input amount (requires UTXO data)
   * @param utxos - Array of UTXOs to calculate input amounts
   * @returns Total input amount
   */
  getInputAmount(utxos: UTXO[]): number {
    if (this.isCoinbase()) {
      return 0;
    }

    let totalInput = 0;
    for (const input of this.inputs) {
      const utxo = utxos.find(u => u.txId === input.txId && u.outputIndex === input.outputIndex);
      if (utxo) {
        totalInput += utxo.amount;
      }
    }
    return totalInput;
  }

  /**
   * Get total output amount
   * @returns Total output amount
   */
  getOutputAmount(): number {
    return this.outputs.reduce((total, output) => total + output.amount, 0);
  }

  /**
   * Calculate transaction fee (input amount - output amount)
   * @param utxos - Array of UTXOs to calculate input amounts
   * @returns Transaction fee
   */
  getFee(utxos: UTXO[]): number {
    if (this.isCoinbase()) {
      return 0;
    }

    const inputAmount = this.getInputAmount(utxos);
    const outputAmount = this.getOutputAmount();
    return inputAmount - outputAmount;
  }

  /**
   * Create a copy of this transaction
   * @returns New TransactionImpl instance
   */
  clone(): TransactionImpl {
    const clonedInputs = this.inputs.map(input => 
      new TransactionInputImpl(input.txId, input.outputIndex, input.signature, input.publicKey)
    );
    const clonedOutputs = this.outputs.map(output => 
      new TransactionOutputImpl(output.address, output.amount)
    );
    
    const cloned = new TransactionImpl(clonedInputs, clonedOutputs, this.timestamp);
    cloned.signature = this.signature;
    cloned.id = this.id;
    
    return cloned;
  }

  /**
   * Create a coinbase transaction (mining reward)
   * @param minerAddress - Address to receive mining reward
   * @param reward - Mining reward amount
   * @param blockHeight - Block height for coinbase input
   * @returns New coinbase transaction
   */
  static createCoinbase(minerAddress: string, reward: number, blockHeight: number): TransactionImpl {
    const coinbaseInput = new TransactionInputImpl('0'.repeat(64), -1, '', '');
    const rewardOutput = new TransactionOutputImpl(minerAddress, reward);
    
    return new TransactionImpl([coinbaseInput], [rewardOutput]);
  }
}