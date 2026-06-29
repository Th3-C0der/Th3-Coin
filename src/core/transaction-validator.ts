import { Transaction, TransactionInput, UTXO } from '../interfaces';
import { TransactionImpl } from './transaction';
import { UTXOImpl } from './utxo';
import { CryptoUtils } from './crypto';
import { AddressUtils } from './address';

/**
 * Transaction validation logic for Th3Coin
 * Handles signature verification, balance validation, and format validation
 */
export class TransactionValidator {
  /**
   * Validate a complete transaction including signatures and balance
   * @param transaction - Transaction to validate
   * @param utxos - Available UTXOs for input validation
   * @param blockHeight - Current block height for validation context
   * @returns Validation result with success flag and error message
   */
  static validateTransaction(
    transaction: Transaction, 
    utxos: UTXO[], 
    blockHeight: number = 0
  ): { isValid: boolean; error?: string } {
    try {
      // Basic format validation
      const formatResult = this.validateTransactionFormat(transaction);
      if (!formatResult.isValid) {
        return formatResult;
      }

      // Skip signature validation for coinbase transactions
      if (this.isCoinbaseTransaction(transaction)) {
        return this.validateCoinbaseTransaction(transaction, blockHeight);
      }

      // Signature validation
      const signatureResult = this.validateTransactionSignatures(transaction, utxos);
      if (!signatureResult.isValid) {
        return signatureResult;
      }

      // Balance validation
      const balanceResult = this.validateTransactionBalance(transaction, utxos);
      if (!balanceResult.isValid) {
        return balanceResult;
      }

      // Input availability validation
      const inputResult = this.validateTransactionInputs(transaction, utxos);
      if (!inputResult.isValid) {
        return inputResult;
      }

      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        error: `Transaction validation error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Validate transaction format and structure
   * @param transaction - Transaction to validate
   * @returns Validation result
   */
  static validateTransactionFormat(transaction: Transaction): { isValid: boolean; error?: string } {
    // Check if transaction is a valid TransactionImpl instance or has required properties
    if (!transaction || typeof transaction !== 'object') {
      return { isValid: false, error: 'Transaction must be a valid object' };
    }

    // Validate required fields
    if (!transaction.id || typeof transaction.id !== 'string') {
      return { isValid: false, error: 'Transaction must have a valid ID' };
    }

    if (!Array.isArray(transaction.inputs)) {
      return { isValid: false, error: 'Transaction inputs must be an array' };
    }

    if (!Array.isArray(transaction.outputs)) {
      return { isValid: false, error: 'Transaction outputs must be an array' };
    }

    if (typeof transaction.timestamp !== 'number' || transaction.timestamp <= 0) {
      return { isValid: false, error: 'Transaction must have a valid timestamp' };
    }

    // Validate transaction using the TransactionImpl validation
    const txImpl = new TransactionImpl(transaction.inputs, transaction.outputs, transaction.timestamp);
    txImpl.id = transaction.id;
    txImpl.signature = transaction.signature;

    if (!txImpl.isValid()) {
      return { isValid: false, error: 'Transaction format validation failed' };
    }

    // Check for reasonable timestamp (not too far in the future)
    const now = Date.now();
    const maxFutureTime = 2 * 60 * 60 * 1000; // 2 hours
    if (transaction.timestamp > now + maxFutureTime) {
      return { isValid: false, error: 'Transaction timestamp is too far in the future' };
    }

    return { isValid: true };
  }

  /**
   * Validate all transaction signatures
   * @param transaction - Transaction to validate
   * @param utxos - Available UTXOs for signature validation
   * @returns Validation result
   */
  static validateTransactionSignatures(transaction: Transaction, utxos: UTXO[]): { isValid: boolean; error?: string } {
    // Skip signature validation for coinbase transactions
    if (this.isCoinbaseTransaction(transaction)) {
      return { isValid: true };
    }

    // Validate each input signature
    for (let i = 0; i < transaction.inputs.length; i++) {
      const input = transaction.inputs[i];
      
      // Find the UTXO being spent
      const utxo = utxos.find(u => u.txId === input.txId && u.outputIndex === input.outputIndex);
      if (!utxo) {
        return { isValid: false, error: `UTXO not found for input ${i}` };
      }

      // Validate input signature
      const signatureResult = this.validateInputSignature(transaction, input, utxo);
      if (!signatureResult.isValid) {
        return { isValid: false, error: `Input ${i} signature validation failed: ${signatureResult.error}` };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate a single input signature
   * @param transaction - Transaction containing the input
   * @param input - Input to validate
   * @param utxo - UTXO being spent by this input
   * @returns Validation result
   */
  static validateInputSignature(
    transaction: Transaction, 
    input: TransactionInput, 
    utxo: UTXO
  ): { isValid: boolean; error?: string } {
    // Validate public key format
    if (!CryptoUtils.isValidPublicKey(input.publicKey)) {
      return { isValid: false, error: 'Invalid public key format' };
    }

    // Verify that the public key corresponds to the UTXO address
    if (!AddressUtils.isAddressForPublicKey(utxo.address, input.publicKey)) {
      return { isValid: false, error: 'Public key does not match UTXO address' };
    }

    // Validate signature format
    if (!input.signature || typeof input.signature !== 'string') {
      return { isValid: false, error: 'Missing or invalid signature' };
    }

    // Create transaction data for signature verification (without signatures)
    const txForSigning = new TransactionImpl(
      transaction.inputs.map(inp => ({
        txId: inp.txId,
        outputIndex: inp.outputIndex,
        signature: '', // Remove signatures for verification
        publicKey: inp.publicKey
      })),
      transaction.outputs,
      transaction.timestamp
    );

    const dataToSign = txForSigning.getDataForSigning();

    // Verify the signature
    if (!CryptoUtils.verify(dataToSign, input.signature, input.publicKey)) {
      return { isValid: false, error: 'Invalid signature' };
    }

    return { isValid: true };
  }

  /**
   * Validate transaction balance (inputs >= outputs + fees)
   * @param transaction - Transaction to validate
   * @param utxos - Available UTXOs for balance calculation
   * @returns Validation result
   */
  static validateTransactionBalance(transaction: Transaction, utxos: UTXO[]): { isValid: boolean; error?: string } {
    // Skip balance validation for coinbase transactions
    if (this.isCoinbaseTransaction(transaction)) {
      return { isValid: true };
    }

    const txImpl = new TransactionImpl(transaction.inputs, transaction.outputs, transaction.timestamp);
    
    const inputAmount = txImpl.getInputAmount(utxos);
    const outputAmount = txImpl.getOutputAmount();

    // Check if inputs cover outputs
    if (inputAmount < outputAmount) {
      return { 
        isValid: false, 
        error: `Insufficient funds: inputs (${inputAmount}) < outputs (${outputAmount})` 
      };
    }

    // Calculate fee
    const fee = inputAmount - outputAmount;
    
    // Validate reasonable fee (not negative, not excessive)
    if (fee < 0) {
      return { isValid: false, error: 'Transaction fee cannot be negative' };
    }

    // Check for reasonable maximum fee (prevent accidental high fees)
    const maxFeePercent = inputAmount * 0.5; // 50% of input
    const maxFeeAbsolute = 100000000; // 1 coin max
    const maxFee = Math.min(maxFeePercent, maxFeeAbsolute); // Use the smaller of the two
    if (fee > maxFee) {
      return { 
        isValid: false, 
        error: `Transaction fee too high: ${fee} (max: ${maxFee})` 
      };
    }

    return { isValid: true };
  }

  /**
   * Validate transaction inputs are available and unspent
   * @param transaction - Transaction to validate
   * @param utxos - Available UTXOs
   * @returns Validation result
   */
  static validateTransactionInputs(transaction: Transaction, utxos: UTXO[]): { isValid: boolean; error?: string } {
    // Skip input validation for coinbase transactions
    if (this.isCoinbaseTransaction(transaction)) {
      return { isValid: true };
    }

    for (let i = 0; i < transaction.inputs.length; i++) {
      const input = transaction.inputs[i];
      
      // Find the UTXO being spent
      const utxo = utxos.find(u => u.txId === input.txId && u.outputIndex === input.outputIndex);
      
      if (!utxo) {
        return { isValid: false, error: `UTXO not found for input ${i}: ${input.txId}:${input.outputIndex}` };
      }

      // Check if UTXO is already spent
      if (utxo.isSpent) {
        return { isValid: false, error: `UTXO already spent for input ${i}: ${input.txId}:${input.outputIndex}` };
      }

      // Validate UTXO itself
      const utxoImpl = new UTXOImpl(utxo.txId, utxo.outputIndex, utxo.address, utxo.amount, utxo.isSpent);
      if (!utxoImpl.isValid()) {
        return { isValid: false, error: `Invalid UTXO for input ${i}` };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate coinbase transaction
   * @param transaction - Coinbase transaction to validate
   * @param blockHeight - Current block height
   * @returns Validation result
   */
  static validateCoinbaseTransaction(transaction: Transaction, blockHeight: number): { isValid: boolean; error?: string } {
    // Coinbase must have exactly one input
    if (transaction.inputs.length !== 1) {
      return { isValid: false, error: 'Coinbase transaction must have exactly one input' };
    }

    const input = transaction.inputs[0];
    
    // Coinbase input must reference null transaction
    if (input.txId !== '0'.repeat(64)) {
      return { isValid: false, error: 'Coinbase input must reference null transaction' };
    }

    if (input.outputIndex !== -1) {
      return { isValid: false, error: 'Coinbase input must have output index -1' };
    }

    // Coinbase must have at least one output
    if (transaction.outputs.length === 0) {
      return { isValid: false, error: 'Coinbase transaction must have at least one output' };
    }

    // Validate coinbase reward amount
    const totalOutput = transaction.outputs.reduce((sum, output) => sum + output.amount, 0);
    const expectedReward = this.calculateBlockReward(blockHeight);
    
    // Allow some flexibility for fees, but reward shouldn't exceed maximum
    const maxAllowedReward = expectedReward * 2; // Allow double for fees
    if (totalOutput > maxAllowedReward) {
      return { 
        isValid: false, 
        error: `Coinbase reward too high: ${totalOutput} (max: ${maxAllowedReward})` 
      };
    }

    return { isValid: true };
  }

  /**
   * Check if transaction is a coinbase transaction
   * @param transaction - Transaction to check
   * @returns True if coinbase transaction
   */
  static isCoinbaseTransaction(transaction: Transaction): boolean {
    return transaction.inputs.length === 1 && 
           transaction.inputs[0].txId === '0'.repeat(64) && 
           transaction.inputs[0].outputIndex === -1;
  }

  /**
   * Calculate expected block reward for given block height
   * @param blockHeight - Block height
   * @returns Expected block reward
   */
  static calculateBlockReward(blockHeight: number): number {
    // Initial reward: 50 coins (5 billion satoshis)
    let reward = 5000000000;
    
    // Halving every 210,000 blocks (similar to Bitcoin)
    const halvingInterval = 210000;
    const halvings = Math.floor(blockHeight / halvingInterval);
    
    // Apply halvings
    for (let i = 0; i < halvings; i++) {
      reward = Math.floor(reward / 2);
    }
    
    return reward;
  }

  /**
   * Validate multiple transactions for conflicts
   * @param transactions - Array of transactions to validate
   * @param utxos - Available UTXOs
   * @returns Validation result
   */
  static validateTransactionSet(
    transactions: Transaction[], 
    utxos: UTXO[]
  ): { isValid: boolean; error?: string; conflictingTxs?: string[] } {
    const spentOutputs = new Set<string>();
    const conflictingTxs: string[] = [];

    for (const transaction of transactions) {
      // Skip coinbase transactions for double-spend check
      if (this.isCoinbaseTransaction(transaction)) {
        continue;
      }

      // Check for double spending within the transaction set
      for (const input of transaction.inputs) {
        const outputKey = `${input.txId}:${input.outputIndex}`;
        
        if (spentOutputs.has(outputKey)) {
          conflictingTxs.push(transaction.id);
        } else {
          spentOutputs.add(outputKey);
        }
      }
    }

    if (conflictingTxs.length > 0) {
      return { 
        isValid: false, 
        error: 'Double spending detected in transaction set',
        conflictingTxs 
      };
    }

    return { isValid: true };
  }
}