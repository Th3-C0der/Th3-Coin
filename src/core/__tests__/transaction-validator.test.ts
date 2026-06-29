import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionValidator } from '../transaction-validator';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../transaction';
import { UTXOImpl } from '../utxo';
import { CryptoUtils } from '../crypto';
import { AddressUtils } from '../address';

describe('TransactionValidator', () => {
  let keyPair1: any;
  let keyPair2: any;
  let address1: string;
  let address2: string;
  let validUTXO: UTXOImpl;
  let validTransaction: TransactionImpl;
  let utxos: UTXOImpl[];

  beforeEach(() => {
    keyPair1 = CryptoUtils.generateKeyPair();
    keyPair2 = CryptoUtils.generateKeyPair();
    address1 = AddressUtils.generateAddress(keyPair1.publicKey);
    address2 = AddressUtils.generateAddress(keyPair2.publicKey);

    // Create a valid UTXO
    validUTXO = new UTXOImpl('a'.repeat(64), 0, address1, 2000000, false);
    utxos = [validUTXO];

    // Create a valid transaction
    const input = new TransactionInputImpl('a'.repeat(64), 0, '', keyPair1.publicKey);
    const output = new TransactionOutputImpl(address2, 1500000);
    validTransaction = new TransactionImpl([input], [output]);
    
    // Sign the transaction
    validTransaction.sign(keyPair1.privateKey);
    
    // Update input signature
    validTransaction.inputs[0].signature = CryptoUtils.sign(validTransaction.getDataForSigning(), keyPair1.privateKey);
  });

  describe('validateTransactionFormat', () => {
    it('should validate a correctly formatted transaction', () => {
      const result = TransactionValidator.validateTransactionFormat(validTransaction);
      expect(result.isValid).toBe(true);
    });

    it('should reject null or undefined transaction', () => {
      const result1 = TransactionValidator.validateTransactionFormat(null as any);
      const result2 = TransactionValidator.validateTransactionFormat(undefined as any);
      
      expect(result1.isValid).toBe(false);
      expect(result2.isValid).toBe(false);
    });

    it('should reject transaction without ID', () => {
      const invalidTx = { ...validTransaction, id: '' };
      const result = TransactionValidator.validateTransactionFormat(invalidTx);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid ID');
    });

    it('should reject transaction with invalid inputs array', () => {
      const invalidTx = { ...validTransaction, inputs: 'not_array' as any };
      const result = TransactionValidator.validateTransactionFormat(invalidTx);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('inputs must be an array');
    });

    it('should reject transaction with invalid timestamp', () => {
      const invalidTx = { ...validTransaction, timestamp: -1 };
      const result = TransactionValidator.validateTransactionFormat(invalidTx);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid timestamp');
    });

    it('should reject transaction with future timestamp', () => {
      const futureTime = Date.now() + (3 * 60 * 60 * 1000); // 3 hours in future
      const invalidTx = { ...validTransaction, timestamp: futureTime };
      const result = TransactionValidator.validateTransactionFormat(invalidTx);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too far in the future');
    });
  });

  describe('validateTransactionSignatures', () => {
    it('should validate correct transaction signatures', () => {
      const result = TransactionValidator.validateTransactionSignatures(validTransaction, utxos);
      expect(result.isValid).toBe(true);
    });

    it('should skip signature validation for coinbase transactions', () => {
      const coinbase = TransactionImpl.createCoinbase(address1, 5000000000, 1);
      const result = TransactionValidator.validateTransactionSignatures(coinbase, utxos);
      expect(result.isValid).toBe(true);
    });

    it('should reject transaction with missing UTXO', () => {
      const emptyUtxos: UTXOImpl[] = [];
      const result = TransactionValidator.validateTransactionSignatures(validTransaction, emptyUtxos);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('UTXO not found');
    });

    it('should reject transaction with invalid signature', () => {
      // Create transaction with wrong signature
      const invalidTx = validTransaction.clone();
      invalidTx.inputs[0].signature = 'invalid_signature';
      
      const result = TransactionValidator.validateTransactionSignatures(invalidTx, utxos);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('signature validation failed');
    });
  });

  describe('validateInputSignature', () => {
    it('should validate correct input signature', () => {
      const result = TransactionValidator.validateInputSignature(
        validTransaction, 
        validTransaction.inputs[0], 
        validUTXO
      );
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid public key', () => {
      const invalidInput = { ...validTransaction.inputs[0], publicKey: 'invalid_key' };
      const result = TransactionValidator.validateInputSignature(validTransaction, invalidInput, validUTXO);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid public key format');
    });

    it('should reject public key that does not match UTXO address', () => {
      const wrongKeyPair = CryptoUtils.generateKeyPair();
      const invalidInput = { ...validTransaction.inputs[0], publicKey: wrongKeyPair.publicKey };
      const result = TransactionValidator.validateInputSignature(validTransaction, invalidInput, validUTXO);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not match UTXO address');
    });

    it('should reject missing signature', () => {
      const invalidInput = { ...validTransaction.inputs[0], signature: '' };
      const result = TransactionValidator.validateInputSignature(validTransaction, invalidInput, validUTXO);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing or invalid signature');
    });
  });

  describe('validateTransactionBalance', () => {
    it('should validate correct transaction balance', () => {
      const result = TransactionValidator.validateTransactionBalance(validTransaction, utxos);
      expect(result.isValid).toBe(true);
    });

    it('should skip balance validation for coinbase transactions', () => {
      const coinbase = TransactionImpl.createCoinbase(address1, 5000000000, 1);
      const result = TransactionValidator.validateTransactionBalance(coinbase, utxos);
      expect(result.isValid).toBe(true);
    });

    it('should reject transaction with insufficient funds', () => {
      // Create transaction that spends more than available
      const input = new TransactionInputImpl('a'.repeat(64), 0, '', keyPair1.publicKey);
      const output = new TransactionOutputImpl(address2, 3000000); // More than UTXO amount
      const invalidTx = new TransactionImpl([input], [output]);
      
      const result = TransactionValidator.validateTransactionBalance(invalidTx, utxos);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Insufficient funds');
    });

    it('should reject transaction with excessive fee', () => {
      // Create transaction with very high fee (output much smaller than input)
      const input = new TransactionInputImpl('a'.repeat(64), 0, '', keyPair1.publicKey);
      const output = new TransactionOutputImpl(address2, 50000); // Very small output = high fee (1.95M fee)
      const invalidTx = new TransactionImpl([input], [output]);
      
      const result = TransactionValidator.validateTransactionBalance(invalidTx, utxos);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('fee too high');
    });
  });

  describe('validateTransactionInputs', () => {
    it('should validate available and unspent inputs', () => {
      const result = TransactionValidator.validateTransactionInputs(validTransaction, utxos);
      expect(result.isValid).toBe(true);
    });

    it('should skip input validation for coinbase transactions', () => {
      const coinbase = TransactionImpl.createCoinbase(address1, 5000000000, 1);
      const result = TransactionValidator.validateTransactionInputs(coinbase, utxos);
      expect(result.isValid).toBe(true);
    });

    it('should reject transaction with missing UTXO', () => {
      const emptyUtxos: UTXOImpl[] = [];
      const result = TransactionValidator.validateTransactionInputs(validTransaction, emptyUtxos);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('UTXO not found');
    });

    it('should reject transaction with already spent UTXO', () => {
      const spentUTXO = validUTXO.clone();
      spentUTXO.markAsSpent();
      const spentUtxos = [spentUTXO];
      
      const result = TransactionValidator.validateTransactionInputs(validTransaction, spentUtxos);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('already spent');
    });
  });

  describe('validateCoinbaseTransaction', () => {
    let coinbaseTransaction: TransactionImpl;

    beforeEach(() => {
      coinbaseTransaction = TransactionImpl.createCoinbase(address1, 5000000000, 1);
    });

    it('should validate correct coinbase transaction', () => {
      const result = TransactionValidator.validateCoinbaseTransaction(coinbaseTransaction, 1);
      expect(result.isValid).toBe(true);
    });

    it('should reject coinbase with multiple inputs', () => {
      const invalidCoinbase = coinbaseTransaction.clone();
      invalidCoinbase.inputs.push(new TransactionInputImpl('tx2', 0, '', keyPair1.publicKey));
      
      const result = TransactionValidator.validateCoinbaseTransaction(invalidCoinbase, 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exactly one input');
    });

    it('should reject coinbase with invalid input transaction ID', () => {
      const invalidCoinbase = coinbaseTransaction.clone();
      invalidCoinbase.inputs[0].txId = 'invalid_tx_id';
      
      const result = TransactionValidator.validateCoinbaseTransaction(invalidCoinbase, 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('null transaction');
    });

    it('should reject coinbase with no outputs', () => {
      const invalidCoinbase = coinbaseTransaction.clone();
      invalidCoinbase.outputs = [];
      
      const result = TransactionValidator.validateCoinbaseTransaction(invalidCoinbase, 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('at least one output');
    });

    it('should reject coinbase with excessive reward', () => {
      const excessiveReward = TransactionImpl.createCoinbase(address1, 50000000000, 1); // 10x normal reward
      
      const result = TransactionValidator.validateCoinbaseTransaction(excessiveReward, 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('reward too high');
    });
  });

  describe('validateTransaction (complete validation)', () => {
    it('should validate a complete valid transaction', () => {
      const result = TransactionValidator.validateTransaction(validTransaction, utxos, 1);
      expect(result.isValid).toBe(true);
    });

    it('should validate a coinbase transaction', () => {
      const coinbase = TransactionImpl.createCoinbase(address1, 5000000000, 1);
      const result = TransactionValidator.validateTransaction(coinbase, utxos, 1);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid transaction format', () => {
      const invalidTx = { ...validTransaction, id: '' };
      const result = TransactionValidator.validateTransaction(invalidTx, utxos, 1);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid ID');
    });

    it('should handle validation errors gracefully', () => {
      const result = TransactionValidator.validateTransaction(null as any, utxos, 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid object');
    });
  });

  describe('calculateBlockReward', () => {
    it('should calculate initial block reward', () => {
      const reward = TransactionValidator.calculateBlockReward(0);
      expect(reward).toBe(5000000000); // 50 coins
    });

    it('should calculate reward after first halving', () => {
      const reward = TransactionValidator.calculateBlockReward(210000);
      expect(reward).toBe(2500000000); // 25 coins
    });

    it('should calculate reward after multiple halvings', () => {
      const reward = TransactionValidator.calculateBlockReward(420000); // Second halving
      expect(reward).toBe(1250000000); // 12.5 coins
    });
  });

  describe('validateTransactionSet', () => {
    it('should validate set of non-conflicting transactions', () => {
      // Create second UTXO and transaction
      const utxo2 = new UTXOImpl('b'.repeat(64), 0, address2, 1000000, false);
      const input2 = new TransactionInputImpl('b'.repeat(64), 0, '', keyPair2.publicKey);
      const output2 = new TransactionOutputImpl(address1, 800000);
      const transaction2 = new TransactionImpl([input2], [output2]);
      
      const transactions = [validTransaction, transaction2];
      const allUtxos = [validUTXO, utxo2];
      
      const result = TransactionValidator.validateTransactionSet(transactions, allUtxos);
      expect(result.isValid).toBe(true);
    });

    it('should detect double spending in transaction set', () => {
      // Create second transaction using same UTXO
      const input2 = new TransactionInputImpl('a'.repeat(64), 0, '', keyPair1.publicKey);
      const output2 = new TransactionOutputImpl(address2, 1000000);
      const transaction2 = new TransactionImpl([input2], [output2]);
      
      const transactions = [validTransaction, transaction2];
      
      const result = TransactionValidator.validateTransactionSet(transactions, utxos);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Double spending detected');
      expect(result.conflictingTxs).toContain(transaction2.id);
    });

    it('should ignore coinbase transactions in double spend check', () => {
      const coinbase1 = TransactionImpl.createCoinbase(address1, 5000000000, 1);
      const coinbase2 = TransactionImpl.createCoinbase(address2, 5000000000, 1);
      
      const transactions = [coinbase1, coinbase2];
      
      const result = TransactionValidator.validateTransactionSet(transactions, utxos);
      expect(result.isValid).toBe(true);
    });
  });

  describe('isCoinbaseTransaction', () => {
    it('should identify coinbase transaction', () => {
      const coinbase = TransactionImpl.createCoinbase(address1, 5000000000, 1);
      expect(TransactionValidator.isCoinbaseTransaction(coinbase)).toBe(true);
    });

    it('should identify regular transaction', () => {
      expect(TransactionValidator.isCoinbaseTransaction(validTransaction)).toBe(false);
    });
  });
});