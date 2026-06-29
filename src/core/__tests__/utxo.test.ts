import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOImpl } from '../utxo';
import { CryptoUtils } from '../crypto';
import { AddressUtils } from '../address';

describe('UTXOImpl', () => {
  let validAddress: string;
  let validUTXO: UTXOImpl;

  beforeEach(() => {
    const keyPair = CryptoUtils.generateKeyPair();
    validAddress = AddressUtils.generateAddress(keyPair.publicKey);
    validUTXO = new UTXOImpl('a'.repeat(64), 0, validAddress, 1000000, false);
  });

  it('should create a valid UTXO', () => {
    expect(validUTXO.txId).toBe('a'.repeat(64));
    expect(validUTXO.outputIndex).toBe(0);
    expect(validUTXO.address).toBe(validAddress);
    expect(validUTXO.amount).toBe(1000000);
    expect(validUTXO.isSpent).toBe(false);
  });

  it('should validate a correct UTXO', () => {
    expect(validUTXO.isValid()).toBe(true);
  });

  it('should reject invalid transaction ID', () => {
    const invalidUTXO = new UTXOImpl('invalid_tx_id', 0, validAddress, 1000000, false);
    expect(invalidUTXO.isValid()).toBe(false);
  });

  it('should reject negative output index', () => {
    const invalidUTXO = new UTXOImpl('a'.repeat(64), -1, validAddress, 1000000, false);
    expect(invalidUTXO.isValid()).toBe(false);
  });

  it('should reject invalid address', () => {
    const invalidUTXO = new UTXOImpl('a'.repeat(64), 0, 'invalid_address', 1000000, false);
    expect(invalidUTXO.isValid()).toBe(false);
  });

  it('should reject zero or negative amount', () => {
    const zeroUTXO = new UTXOImpl('a'.repeat(64), 0, validAddress, 0, false);
    const negativeUTXO = new UTXOImpl('a'.repeat(64), 0, validAddress, -1000, false);
    
    expect(zeroUTXO.isValid()).toBe(false);
    expect(negativeUTXO.isValid()).toBe(false);
  });

  it('should reject amount exceeding maximum supply', () => {
    const maxSupply = 21000000 * 100000000;
    const invalidUTXO = new UTXOImpl('a'.repeat(64), 0, validAddress, maxSupply + 1, false);
    expect(invalidUTXO.isValid()).toBe(false);
  });

  it('should mark as spent and unspent', () => {
    expect(validUTXO.isSpent).toBe(false);
    expect(validUTXO.canBeSpent()).toBe(true);

    validUTXO.markAsSpent();
    expect(validUTXO.isSpent).toBe(true);
    expect(validUTXO.canBeSpent()).toBe(false);

    validUTXO.markAsUnspent();
    expect(validUTXO.isSpent).toBe(false);
    expect(validUTXO.canBeSpent()).toBe(true);
  });

  it('should generate unique ID', () => {
    const id = validUTXO.getId();
    expect(id).toBe(`${validUTXO.txId}:${validUTXO.outputIndex}`);
  });

  it('should clone correctly', () => {
    const cloned = validUTXO.clone();
    expect(cloned).not.toBe(validUTXO);
    expect(cloned.txId).toBe(validUTXO.txId);
    expect(cloned.outputIndex).toBe(validUTXO.outputIndex);
    expect(cloned.address).toBe(validUTXO.address);
    expect(cloned.amount).toBe(validUTXO.amount);
    expect(cloned.isSpent).toBe(validUTXO.isSpent);
  });

  it('should convert to and from JSON', () => {
    const json = validUTXO.toJSON();
    const fromJson = UTXOImpl.fromJSON(json);
    
    expect(fromJson.equals(validUTXO)).toBe(true);
  });

  it('should handle invalid JSON', () => {
    expect(() => UTXOImpl.fromJSON(null)).toThrow('Invalid JSON data for UTXO');
    expect(() => UTXOImpl.fromJSON({})).toThrow('Missing required UTXO fields in JSON');
  });

  it('should compare UTXOs for equality', () => {
    const identical = new UTXOImpl('a'.repeat(64), 0, validAddress, 1000000, false);
    const different = new UTXOImpl('b'.repeat(64), 0, validAddress, 1000000, false);
    
    expect(validUTXO.equals(identical)).toBe(true);
    expect(validUTXO.equals(different)).toBe(false);
  });

  it('should create UTXO from transaction output', () => {
    const utxo = UTXOImpl.fromTransactionOutput('tx123', 1, validAddress, 500000);
    
    expect(utxo.txId).toBe('tx123');
    expect(utxo.outputIndex).toBe(1);
    expect(utxo.address).toBe(validAddress);
    expect(utxo.amount).toBe(500000);
    expect(utxo.isSpent).toBe(false);
  });

  describe('Static utility methods', () => {
    let utxos: UTXOImpl[];
    let address2: string;

    beforeEach(() => {
      const keyPair2 = CryptoUtils.generateKeyPair();
      address2 = AddressUtils.generateAddress(keyPair2.publicKey);

      utxos = [
        new UTXOImpl('tx1', 0, validAddress, 1000000, false),
        new UTXOImpl('tx2', 0, validAddress, 2000000, true),
        new UTXOImpl('tx3', 0, address2, 500000, false),
        new UTXOImpl('tx4', 0, validAddress, 3000000, false),
      ];
    });

    it('should sort UTXOs by amount', () => {
      const sorted = UTXOImpl.sortByAmount(utxos);
      expect(sorted[0].amount).toBe(3000000);
      expect(sorted[1].amount).toBe(2000000);
      expect(sorted[2].amount).toBe(1000000);
      expect(sorted[3].amount).toBe(500000);
    });

    it('should filter UTXOs by address', () => {
      const filtered = UTXOImpl.filterByAddress(utxos, validAddress);
      expect(filtered).toHaveLength(3);
      expect(filtered.every(utxo => utxo.address === validAddress)).toBe(true);
    });

    it('should filter unspent UTXOs', () => {
      const unspent = UTXOImpl.filterUnspent(utxos);
      expect(unspent).toHaveLength(3);
      expect(unspent.every(utxo => !utxo.isSpent)).toBe(true);
    });

    it('should calculate total amount', () => {
      const total = UTXOImpl.getTotalAmount(utxos);
      expect(total).toBe(6500000);
    });

    it('should select UTXOs for transaction', () => {
      const unspentUTXOs = UTXOImpl.filterUnspent(utxos);
      const { selectedUTXOs, changeAmount } = UTXOImpl.selectUTXOs(unspentUTXOs, 2500000);
      
      expect(UTXOImpl.getTotalAmount(selectedUTXOs)).toBeGreaterThanOrEqual(2500000);
      expect(changeAmount).toBe(UTXOImpl.getTotalAmount(selectedUTXOs) - 2500000);
    });

    it('should throw error when insufficient funds', () => {
      const unspentUTXOs = UTXOImpl.filterUnspent(utxos);
      expect(() => UTXOImpl.selectUTXOs(unspentUTXOs, 10000000)).toThrow('Insufficient funds');
    });

    it('should throw error for invalid target amount', () => {
      expect(() => UTXOImpl.selectUTXOs(utxos, 0)).toThrow('Target amount must be positive');
      expect(() => UTXOImpl.selectUTXOs(utxos, -1000)).toThrow('Target amount must be positive');
    });
  });
});