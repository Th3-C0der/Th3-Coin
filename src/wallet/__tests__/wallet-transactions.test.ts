import { describe, it, expect, beforeEach } from 'vitest';
import { Wallet } from '../wallet';
import { UTXOManager } from '../../core/utxo-manager';
import { UTXOImpl } from '../../core/utxo';
import { CryptoUtils } from '../../core/crypto';
import { AddressUtils } from '../../core/address';
import { Transaction } from '../../interfaces';

describe('Wallet Transaction Creation and Signing', () => {
  let wallet: Wallet;
  let recipientWallet: Wallet;
  let utxoManager: UTXOManager;

  beforeEach(() => {
    wallet = new Wallet();
    recipientWallet = new Wallet();
    utxoManager = new UTXOManager();

    // Add some UTXOs for testing (using valid 64-character hex transaction IDs)
    const txId1 = '1'.repeat(64);
    const txId2 = '2'.repeat(64);
    const txId3 = '3'.repeat(64);
    
    const utxo1 = new UTXOImpl(txId1, 0, wallet.getAddress(), 1000, false);
    const utxo2 = new UTXOImpl(txId2, 0, wallet.getAddress(), 500, false);
    const utxo3 = new UTXOImpl(txId3, 0, wallet.getAddress(), 200, false);
    
    utxoManager.addUTXO(utxo1);
    utxoManager.addUTXO(utxo2);
    utxoManager.addUTXO(utxo3);
  });

  describe('Transaction Creation', () => {
    it('should create a valid transaction with correct inputs and outputs', () => {
      const amount = 300;
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();

      const transaction = wallet.createTransaction(recipientAddress, amount, fee, utxoManager);

      expect(transaction).toBeDefined();
      expect(transaction.inputs).toBeDefined();
      expect(transaction.outputs).toBeDefined();
      expect(transaction.timestamp).toBeDefined();
      expect(Array.isArray(transaction.inputs)).toBe(true);
      expect(Array.isArray(transaction.outputs)).toBe(true);
      expect(transaction.inputs.length).toBeGreaterThan(0);
      expect(transaction.outputs.length).toBeGreaterThan(0);
    });

    it('should create transaction with correct recipient output', () => {
      const amount = 300;
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();

      const transaction = wallet.createTransaction(recipientAddress, amount, fee, utxoManager);

      const recipientOutput = transaction.outputs.find(output => output.address === recipientAddress);
      expect(recipientOutput).toBeDefined();
      expect(recipientOutput!.amount).toBe(amount);
    });

    it('should create change output when necessary', () => {
      const amount = 300;
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();

      const transaction = wallet.createTransaction(recipientAddress, amount, fee, utxoManager);

      // Should have recipient output and change output
      expect(transaction.outputs.length).toBe(2);
      
      const changeOutput = transaction.outputs.find(output => output.address === wallet.getAddress());
      expect(changeOutput).toBeDefined();
      expect(changeOutput!.amount).toBeGreaterThan(0);
    });

    it('should not create change output when exact amount is used', () => {
      // Create a scenario where exact amount is used
      const amount = 1000;
      const fee = 0;
      const recipientAddress = recipientWallet.getAddress();

      const transaction = wallet.createTransaction(recipientAddress, amount, fee, utxoManager);

      // Should only have recipient output, no change
      expect(transaction.outputs.length).toBe(1);
      expect(transaction.outputs[0].address).toBe(recipientAddress);
      expect(transaction.outputs[0].amount).toBe(amount);
    });

    it('should select appropriate UTXOs for transaction', () => {
      const amount = 300;
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();

      const transaction = wallet.createTransaction(recipientAddress, amount, fee, utxoManager);

      // Check that inputs reference valid UTXOs
      for (const input of transaction.inputs) {
        expect(input.txId).toBeDefined();
        expect(typeof input.outputIndex).toBe('number');
        expect(input.publicKey).toBe(wallet.getPublicKey());
      }
    });

    it('should throw error for invalid recipient address', () => {
      const amount = 300;
      const fee = 10;
      const invalidAddress = 'invalid-address';

      expect(() => wallet.createTransaction(invalidAddress, amount, fee, utxoManager))
        .toThrow('Invalid recipient address');
    });

    it('should throw error for non-positive amount', () => {
      const recipientAddress = recipientWallet.getAddress();

      expect(() => wallet.createTransaction(recipientAddress, 0, 10, utxoManager))
        .toThrow('Amount must be positive');
      expect(() => wallet.createTransaction(recipientAddress, -100, 10, utxoManager))
        .toThrow('Amount must be positive');
    });

    it('should throw error for negative fee', () => {
      const recipientAddress = recipientWallet.getAddress();

      expect(() => wallet.createTransaction(recipientAddress, 300, -10, utxoManager))
        .toThrow('Fee cannot be negative');
    });

    it('should throw error when insufficient funds', () => {
      const amount = 2000; // More than available balance (1700)
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();

      expect(() => wallet.createTransaction(recipientAddress, amount, fee, utxoManager))
        .toThrow('Failed to create transaction');
    });

    it('should throw error when no UTXO manager provided', () => {
      const amount = 300;
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();

      expect(() => wallet.createTransaction(recipientAddress, amount, fee))
        .toThrow('UTXO manager required for transaction creation');
    });
  });

  describe('Transaction Signing', () => {
    let transaction: Transaction;

    beforeEach(() => {
      const amount = 300;
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();
      transaction = wallet.createTransaction(recipientAddress, amount, fee, utxoManager);
    });

    it('should sign transaction successfully', () => {
      expect(transaction.signature).toBeUndefined();
      
      wallet.signTransaction(transaction);

      expect(transaction.signature).toBeDefined();
      expect(typeof transaction.signature).toBe('string');
      expect(transaction.signature.length).toBeGreaterThan(0);
    });

    it('should sign all inputs belonging to wallet', () => {
      wallet.signTransaction(transaction);

      for (const input of transaction.inputs) {
        if (input.publicKey === wallet.getPublicKey()) {
          expect(input.signature).toBeDefined();
          expect(typeof input.signature).toBe('string');
          expect(input.signature.length).toBeGreaterThan(0);
        }
      }
    });

    it('should update transaction ID after signing', () => {
      const originalId = transaction.id;
      
      wallet.signTransaction(transaction);

      expect(transaction.id).toBeDefined();
      expect(transaction.id).not.toBe(originalId);
      expect(typeof transaction.id).toBe('string');
    });

    it('should create verifiable signatures', () => {
      wallet.signTransaction(transaction);

      const isValid = wallet.verifyTransactionSignature(transaction);
      expect(isValid).toBe(true);
    });

    it('should throw error for null transaction', () => {
      expect(() => wallet.signTransaction(null as any))
        .toThrow('Transaction is required');
    });

    it('should throw error for transaction without inputs', () => {
      const invalidTransaction = {
        id: 'test',
        inputs: undefined as any,
        outputs: transaction.outputs,
        timestamp: Date.now()
      };

      expect(() => wallet.signTransaction(invalidTransaction))
        .toThrow('Transaction must have inputs');
    });

    it('should throw error for transaction without outputs', () => {
      const invalidTransaction = {
        id: 'test',
        inputs: transaction.inputs,
        outputs: undefined as any,
        timestamp: Date.now()
      };

      expect(() => wallet.signTransaction(invalidTransaction))
        .toThrow('Transaction must have outputs');
    });
  });

  describe('Transaction Signature Verification', () => {
    let transaction: Transaction;

    beforeEach(() => {
      const amount = 300;
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();
      transaction = wallet.createTransaction(recipientAddress, amount, fee, utxoManager);
      wallet.signTransaction(transaction);
    });

    it('should verify valid transaction signature', () => {
      const isValid = wallet.verifyTransactionSignature(transaction);
      expect(isValid).toBe(true);
    });

    it('should reject transaction without signature', () => {
      const unsignedTransaction = { ...transaction, signature: undefined };
      const isValid = wallet.verifyTransactionSignature(unsignedTransaction);
      expect(isValid).toBe(false);
    });

    it('should reject transaction with tampered data', () => {
      const tamperedTransaction = { 
        ...transaction, 
        outputs: [{ address: recipientWallet.getAddress(), amount: 999999 }]
      };
      const isValid = wallet.verifyTransactionSignature(tamperedTransaction);
      expect(isValid).toBe(false);
    });

    it('should reject null transaction', () => {
      const isValid = wallet.verifyTransactionSignature(null as any);
      expect(isValid).toBe(false);
    });

    it('should handle verification errors gracefully', () => {
      const invalidTransaction = {
        ...transaction,
        signature: 'invalid-signature'
      };
      const isValid = wallet.verifyTransactionSignature(invalidTransaction);
      expect(isValid).toBe(false);
    });
  });

  describe('Transaction Utility Methods', () => {
    it('should calculate total required amount correctly', () => {
      const amount = 300;
      const fee = 10;
      const total = wallet.calculateTotalRequired(amount, fee);
      expect(total).toBe(310);
    });

    it('should throw error for non-positive amount in total calculation', () => {
      expect(() => wallet.calculateTotalRequired(0, 10))
        .toThrow('Amount must be positive');
      expect(() => wallet.calculateTotalRequired(-100, 10))
        .toThrow('Amount must be positive');
    });

    it('should throw error for negative fee in total calculation', () => {
      expect(() => wallet.calculateTotalRequired(300, -10))
        .toThrow('Fee cannot be negative');
    });

    it('should estimate transaction fee based on inputs and outputs', () => {
      const fee = wallet.estimateTransactionFee(2, 2, 1);
      expect(fee).toBeGreaterThan(0);
      expect(typeof fee).toBe('number');
    });

    it('should estimate higher fee for more inputs and outputs', () => {
      const smallFee = wallet.estimateTransactionFee(1, 1, 1);
      const largeFee = wallet.estimateTransactionFee(5, 3, 1);
      expect(largeFee).toBeGreaterThan(smallFee);
    });

    it('should throw error for negative input/output counts in fee estimation', () => {
      expect(() => wallet.estimateTransactionFee(-1, 1, 1))
        .toThrow('Input and output counts must be non-negative');
      expect(() => wallet.estimateTransactionFee(1, -1, 1))
        .toThrow('Input and output counts must be non-negative');
    });

    it('should throw error for negative fee per byte', () => {
      expect(() => wallet.estimateTransactionFee(1, 1, -1))
        .toThrow('Fee per byte must be non-negative');
    });

    it('should check if wallet can afford transaction', () => {
      const canAfford = wallet.canAffordTransaction(300, 10, utxoManager);
      expect(canAfford).toBe(true);

      const cannotAfford = wallet.canAffordTransaction(2000, 10, utxoManager);
      expect(cannotAfford).toBe(false);
    });

    it('should return false when no UTXO manager provided for affordability check', () => {
      const canAfford = wallet.canAffordTransaction(300, 10);
      expect(canAfford).toBe(false);
    });

    it('should handle errors gracefully in affordability check', () => {
      const canAfford = wallet.canAffordTransaction(-100, 10, utxoManager);
      expect(canAfford).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should create and sign a complete transaction flow', () => {
      const amount = 300;
      const fee = 10;
      const recipientAddress = recipientWallet.getAddress();

      // Create transaction
      const transaction = wallet.createTransaction(recipientAddress, amount, fee, utxoManager);
      expect(transaction).toBeDefined();

      // Sign transaction
      wallet.signTransaction(transaction);
      expect(transaction.signature).toBeDefined();

      // Verify signature
      const isValid = wallet.verifyTransactionSignature(transaction);
      expect(isValid).toBe(true);

      // Check transaction structure
      expect(transaction.inputs.length).toBeGreaterThan(0);
      expect(transaction.outputs.length).toBeGreaterThan(0);
      expect(transaction.id).toBeDefined();
      expect(transaction.timestamp).toBeDefined();
    });

    it('should handle multiple transactions from same wallet', () => {
      const amount1 = 200;
      const amount2 = 100;
      const fee = 5;
      const recipient1 = recipientWallet.getAddress();
      const recipient2 = new Wallet().getAddress();

      // Create first transaction
      const tx1 = wallet.createTransaction(recipient1, amount1, fee, utxoManager);
      wallet.signTransaction(tx1);

      // Create second transaction (should still work with remaining UTXOs)
      const tx2 = wallet.createTransaction(recipient2, amount2, fee, utxoManager);
      wallet.signTransaction(tx2);

      expect(wallet.verifyTransactionSignature(tx1)).toBe(true);
      expect(wallet.verifyTransactionSignature(tx2)).toBe(true);
      expect(tx1.id).not.toBe(tx2.id);
    });

    it('should work with different wallet instances', () => {
      const otherWallet = new Wallet();
      const amount = 300;
      const fee = 10;

      // Create transaction from first wallet
      const transaction = wallet.createTransaction(otherWallet.getAddress(), amount, fee, utxoManager);
      wallet.signTransaction(transaction);

      // First wallet should verify its own signature
      expect(wallet.verifyTransactionSignature(transaction)).toBe(true);

      // Other wallet should not verify the signature (different keys)
      expect(otherWallet.verifyTransactionSignature(transaction)).toBe(false);
    });
  });
});