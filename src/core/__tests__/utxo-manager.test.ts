import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOManager } from '../utxo-manager';
import { UTXOImpl } from '../utxo';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../transaction';
import { CryptoUtils } from '../crypto';
import { AddressUtils } from '../address';

describe('UTXOManager', () => {
  let utxoManager: UTXOManager;
  let keyPair1: any;
  let keyPair2: any;
  let address1: string;
  let address2: string;
  let utxo1: UTXOImpl;
  let utxo2: UTXOImpl;
  let utxo3: UTXOImpl;

  beforeEach(() => {
    keyPair1 = CryptoUtils.generateKeyPair();
    keyPair2 = CryptoUtils.generateKeyPair();
    address1 = AddressUtils.generateAddress(keyPair1.publicKey);
    address2 = AddressUtils.generateAddress(keyPair2.publicKey);

    utxo1 = new UTXOImpl('a'.repeat(64), 0, address1, 1000000, false);
    utxo2 = new UTXOImpl('b'.repeat(64), 0, address1, 2000000, false);
    utxo3 = new UTXOImpl('c'.repeat(64), 0, address2, 500000, false);

    utxoManager = new UTXOManager([utxo1, utxo2, utxo3]);
  });

  describe('Constructor and Basic Operations', () => {
    it('should create empty UTXO manager', () => {
      const emptyManager = new UTXOManager();
      expect(emptyManager.size()).toBe(0);
    });

    it('should initialize with provided UTXOs', () => {
      expect(utxoManager.size()).toBe(3);
      expect(utxoManager.hasUTXO('a'.repeat(64), 0)).toBe(true);
      expect(utxoManager.hasUTXO('b'.repeat(64), 0)).toBe(true);
      expect(utxoManager.hasUTXO('c'.repeat(64), 0)).toBe(true);
    });

    it('should reject invalid UTXOs during initialization', () => {
      const invalidUTXO = new UTXOImpl('invalid', 0, 'invalid_address', 1000000, false);
      expect(() => new UTXOManager([invalidUTXO])).toThrow('Invalid UTXO provided');
    });
  });

  describe('UTXO Management', () => {
    it('should add new UTXO', () => {
      const newUTXO = new UTXOImpl('d'.repeat(64), 0, address1, 750000, false);
      utxoManager.addUTXO(newUTXO);
      
      expect(utxoManager.size()).toBe(4);
      expect(utxoManager.hasUTXO('d'.repeat(64), 0)).toBe(true);
    });

    it('should reject invalid UTXO when adding', () => {
      const invalidUTXO = new UTXOImpl('invalid', 0, 'invalid_address', 1000000, false);
      expect(() => utxoManager.addUTXO(invalidUTXO)).toThrow('Invalid UTXO provided');
    });

    it('should get specific UTXO', () => {
      const retrievedUTXO = utxoManager.getUTXO('a'.repeat(64), 0);
      expect(retrievedUTXO).not.toBeNull();
      expect(retrievedUTXO!.amount).toBe(1000000);
      expect(retrievedUTXO!.address).toBe(address1);
    });

    it('should return null for non-existent UTXO', () => {
      const retrievedUTXO = utxoManager.getUTXO('nonexistent', 0);
      expect(retrievedUTXO).toBeNull();
    });

    it('should remove UTXO', () => {
      const removed = utxoManager.removeUTXO('a'.repeat(64), 0);
      expect(removed).toBe(true);
      expect(utxoManager.size()).toBe(2);
      expect(utxoManager.hasUTXO('a'.repeat(64), 0)).toBe(false);
    });

    it('should return false when removing non-existent UTXO', () => {
      const removed = utxoManager.removeUTXO('nonexistent', 0);
      expect(removed).toBe(false);
    });
  });

  describe('UTXO Status Management', () => {
    it('should mark UTXO as spent', () => {
      const marked = utxoManager.markUTXOAsSpent('a'.repeat(64), 0);
      expect(marked).toBe(true);
      
      const utxo = utxoManager.getUTXO('a'.repeat(64), 0);
      expect(utxo!.isSpent).toBe(true);
    });

    it('should mark UTXO as unspent', () => {
      utxoManager.markUTXOAsSpent('a'.repeat(64), 0);
      const marked = utxoManager.markUTXOAsUnspent('a'.repeat(64), 0);
      expect(marked).toBe(true);
      
      const utxo = utxoManager.getUTXO('a'.repeat(64), 0);
      expect(utxo!.isSpent).toBe(false);
    });

    it('should return false when marking non-existent UTXO', () => {
      const marked = utxoManager.markUTXOAsSpent('nonexistent', 0);
      expect(marked).toBe(false);
    });
  });

  describe('UTXO Queries', () => {
    it('should get UTXOs for specific address', () => {
      const utxos = utxoManager.getUTXOsForAddress(address1);
      expect(utxos).toHaveLength(2);
      expect(utxos.every(utxo => utxo.address === address1)).toBe(true);
    });

    it('should get UTXOs for address including spent', () => {
      utxoManager.markUTXOAsSpent('a'.repeat(64), 0);
      
      const unspentOnly = utxoManager.getUTXOsForAddress(address1, false);
      const includeSpent = utxoManager.getUTXOsForAddress(address1, true);
      
      expect(unspentOnly).toHaveLength(1);
      expect(includeSpent).toHaveLength(2);
    });

    it('should get all unspent UTXOs', () => {
      utxoManager.markUTXOAsSpent('a'.repeat(64), 0);
      
      const unspentUTXOs = utxoManager.getUnspentUTXOs();
      expect(unspentUTXOs).toHaveLength(2);
      expect(unspentUTXOs.every(utxo => !utxo.isSpent)).toBe(true);
    });

    it('should get all UTXOs', () => {
      const allUTXOs = utxoManager.getAllUTXOs();
      expect(allUTXOs).toHaveLength(3);
    });
  });

  describe('Balance Calculations', () => {
    it('should calculate balance for address', () => {
      const balance1 = utxoManager.getBalance(address1);
      const balance2 = utxoManager.getBalance(address2);
      
      expect(balance1).toBe(3000000); // 1M + 2M
      expect(balance2).toBe(500000);
    });

    it('should exclude spent UTXOs from balance', () => {
      utxoManager.markUTXOAsSpent('a'.repeat(64), 0);
      
      const balance = utxoManager.getBalance(address1);
      expect(balance).toBe(2000000); // Only 2M UTXO
    });

    it('should calculate total supply', () => {
      const totalSupply = utxoManager.getTotalSupply();
      expect(totalSupply).toBe(3500000); // 1M + 2M + 0.5M
    });

    it('should exclude spent UTXOs from total supply', () => {
      utxoManager.markUTXOAsSpent('a'.repeat(64), 0);
      
      const totalSupply = utxoManager.getTotalSupply();
      expect(totalSupply).toBe(2500000); // 2M + 0.5M
    });
  });

  describe('Transaction Processing', () => {
    it('should process regular transaction', () => {
      const input = new TransactionInputImpl('a'.repeat(64), 0, '', keyPair1.publicKey);
      const output1 = new TransactionOutputImpl(address2, 600000);
      const output2 = new TransactionOutputImpl(address1, 350000); // change
      const transaction = new TransactionImpl([input], [output1, output2]);
      
      const processed = utxoManager.processTransaction(transaction);
      expect(processed).toBe(true);
      
      // Original UTXO should be spent
      const originalUTXO = utxoManager.getUTXO('a'.repeat(64), 0);
      expect(originalUTXO!.isSpent).toBe(true);
      
      // New UTXOs should be created
      expect(utxoManager.hasUTXO(transaction.id, 0)).toBe(true);
      expect(utxoManager.hasUTXO(transaction.id, 1)).toBe(true);
    });

    it('should process coinbase transaction', () => {
      const coinbase = TransactionImpl.createCoinbase(address1, 5000000000, 1);
      
      const processed = utxoManager.processTransaction(coinbase);
      expect(processed).toBe(true);
      
      // New UTXO should be created
      expect(utxoManager.hasUTXO(coinbase.id, 0)).toBe(true);
      
      // Balance should increase
      const newBalance = utxoManager.getBalance(address1);
      expect(newBalance).toBe(3000000 + 5000000000);
    });

    it('should fail to process transaction with non-existent input', () => {
      const input = new TransactionInputImpl('nonexistent', 0, '', keyPair1.publicKey);
      const output = new TransactionOutputImpl(address2, 500000);
      const transaction = new TransactionImpl([input], [output]);
      
      const processed = utxoManager.processTransaction(transaction);
      expect(processed).toBe(false);
    });

    it('should rollback transaction', () => {
      const input = new TransactionInputImpl('a'.repeat(64), 0, '', keyPair1.publicKey);
      const output = new TransactionOutputImpl(address2, 900000);
      const transaction = new TransactionImpl([input], [output]);
      
      // Process transaction
      utxoManager.processTransaction(transaction);
      
      // Rollback transaction
      const rolledBack = utxoManager.rollbackTransaction(transaction);
      expect(rolledBack).toBe(true);
      
      // Original UTXO should be unspent
      const originalUTXO = utxoManager.getUTXO('a'.repeat(64), 0);
      expect(originalUTXO!.isSpent).toBe(false);
      
      // New UTXOs should be removed
      expect(utxoManager.hasUTXO(transaction.id, 0)).toBe(false);
    });
  });

  describe('UTXO Selection', () => {
    it('should select UTXOs using greedy strategy', () => {
      const { selectedUTXOs, changeAmount } = utxoManager.selectUTXOsForTransaction(address1, 2500000, 'greedy');
      
      expect(UTXOImpl.getTotalAmount(selectedUTXOs)).toBeGreaterThanOrEqual(2500000);
      expect(changeAmount).toBe(UTXOImpl.getTotalAmount(selectedUTXOs) - 2500000);
    });

    it('should select UTXOs using smallest strategy', () => {
      const { selectedUTXOs, changeAmount } = utxoManager.selectUTXOsForTransaction(address1, 1500000, 'smallest');
      
      expect(UTXOImpl.getTotalAmount(selectedUTXOs)).toBeGreaterThanOrEqual(1500000);
      expect(changeAmount).toBe(UTXOImpl.getTotalAmount(selectedUTXOs) - 1500000);
    });

    it('should select UTXOs using largest strategy', () => {
      const { selectedUTXOs, changeAmount } = utxoManager.selectUTXOsForTransaction(address1, 1500000, 'largest');
      
      expect(UTXOImpl.getTotalAmount(selectedUTXOs)).toBeGreaterThanOrEqual(1500000);
      expect(changeAmount).toBe(UTXOImpl.getTotalAmount(selectedUTXOs) - 1500000);
    });

    it('should throw error for insufficient funds', () => {
      expect(() => {
        utxoManager.selectUTXOsForTransaction(address1, 5000000, 'greedy');
      }).toThrow('Insufficient funds');
    });

    it('should throw error for invalid target amount', () => {
      expect(() => {
        utxoManager.selectUTXOsForTransaction(address1, 0, 'greedy');
      }).toThrow('Target amount must be positive');
    });

    it('should throw error for address with no UTXOs', () => {
      const emptyAddress = AddressUtils.generateAddress(CryptoUtils.generateKeyPair().publicKey);
      expect(() => {
        utxoManager.selectUTXOsForTransaction(emptyAddress, 1000000, 'greedy');
      }).toThrow('No UTXOs available for address');
    });
  });

  describe('Validation', () => {
    it('should validate consistent UTXO set', () => {
      const validation = utxoManager.validateUTXOSet();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid UTXOs', () => {
      // Manually add invalid UTXO to bypass validation
      const invalidUTXO = { txId: 'invalid', outputIndex: 0, address: 'invalid', amount: 1000000, isSpent: false };
      (utxoManager as any).utxos.set('invalid:0', invalidUTXO);
      
      const validation = utxoManager.validateUTXOSet();
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should calculate UTXO statistics', () => {
      const stats = utxoManager.getStatistics();
      
      expect(stats.totalUTXOs).toBe(3);
      expect(stats.unspentUTXOs).toBe(3);
      expect(stats.spentUTXOs).toBe(0);
      expect(stats.totalSupply).toBe(3500000);
      expect(stats.averageUTXOAmount).toBe(3500000 / 3);
      expect(stats.largestUTXO).toBe(2000000);
      expect(stats.smallestUTXO).toBe(500000);
    });

    it('should handle empty UTXO set in statistics', () => {
      const emptyManager = new UTXOManager();
      const stats = emptyManager.getStatistics();
      
      expect(stats.totalUTXOs).toBe(0);
      expect(stats.unspentUTXOs).toBe(0);
      expect(stats.totalSupply).toBe(0);
      expect(stats.averageUTXOAmount).toBe(0);
      expect(stats.largestUTXO).toBe(0);
      expect(stats.smallestUTXO).toBe(0);
    });
  });

  describe('Utility Methods', () => {
    it('should clear all UTXOs', () => {
      utxoManager.clear();
      expect(utxoManager.size()).toBe(0);
    });

    it('should clone UTXO manager', () => {
      const cloned = utxoManager.clone();
      
      expect(cloned.size()).toBe(utxoManager.size());
      expect(cloned.getTotalSupply()).toBe(utxoManager.getTotalSupply());
      
      // Verify independence
      cloned.clear();
      expect(utxoManager.size()).toBe(3);
    });

    it('should export to JSON', () => {
      const json = utxoManager.toJSON();
      
      expect(json).toHaveProperty('utxos');
      expect(json).toHaveProperty('statistics');
      expect((json as any).utxos).toHaveLength(3);
    });

    it('should import from JSON', () => {
      const json = utxoManager.toJSON();
      const imported = UTXOManager.fromJSON(json);
      
      expect(imported.size()).toBe(utxoManager.size());
      expect(imported.getTotalSupply()).toBe(utxoManager.getTotalSupply());
    });

    it('should handle invalid JSON import', () => {
      expect(() => UTXOManager.fromJSON(null)).toThrow('Invalid JSON format');
      expect(() => UTXOManager.fromJSON({})).toThrow('Invalid JSON format');
    });
  });
});