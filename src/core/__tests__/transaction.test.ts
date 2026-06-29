import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../transaction';
import { UTXOImpl } from '../utxo';
import { CryptoUtils } from '../crypto';
import { AddressUtils } from '../address';

describe('TransactionInputImpl', () => {
  let validInput: TransactionInputImpl;

  beforeEach(() => {
    validInput = new TransactionInputImpl(
      'a'.repeat(64), // valid transaction ID
      0,
      'signature123',
      '04' + 'a'.repeat(128) // valid uncompressed public key
    );
  });

  it('should create a valid transaction input', () => {
    expect(validInput.txId).toBe('a'.repeat(64));
    expect(validInput.outputIndex).toBe(0);
    expect(validInput.signature).toBe('signature123');
    expect(validInput.publicKey).toBe('04' + 'a'.repeat(128));
  });

  it('should validate a correct input', () => {
    expect(validInput.isValid()).toBe(true);
  });

  it('should reject invalid transaction ID', () => {
    const invalidInput = new TransactionInputImpl('', 0, 'sig', '04' + 'a'.repeat(128));
    expect(invalidInput.isValid()).toBe(false);
  });

  it('should reject invalid negative output index', () => {
    const invalidInput = new TransactionInputImpl('a'.repeat(64), -2, 'sig', '04' + 'a'.repeat(128));
    expect(invalidInput.isValid()).toBe(false);
  });

  it('should allow -1 output index for coinbase transactions', () => {
    const coinbaseInput = new TransactionInputImpl('0'.repeat(64), -1, '', '');
    expect(coinbaseInput.isValid()).toBe(true);
  });

  it('should reject invalid public key when signature is present', () => {
    const invalidInput = new TransactionInputImpl('a'.repeat(64), 0, 'sig', 'invalid_key');
    expect(invalidInput.isValid()).toBe(false);
  });

  it('should clone correctly', () => {
    const cloned = validInput.clone();
    expect(cloned).not.toBe(validInput);
    expect(cloned.txId).toBe(validInput.txId);
    expect(cloned.outputIndex).toBe(validInput.outputIndex);
    expect(cloned.signature).toBe(validInput.signature);
    expect(cloned.publicKey).toBe(validInput.publicKey);
  });
});

describe('TransactionOutputImpl', () => {
  let validAddress: string;
  let validOutput: TransactionOutputImpl;

  beforeEach(() => {
    const keyPair = CryptoUtils.generateKeyPair();
    validAddress = AddressUtils.generateAddress(keyPair.publicKey);
    validOutput = new TransactionOutputImpl(validAddress, 1000000);
  });

  it('should create a valid transaction output', () => {
    expect(validOutput.address).toBe(validAddress);
    expect(validOutput.amount).toBe(1000000);
  });

  it('should validate a correct output', () => {
    expect(validOutput.isValid()).toBe(true);
  });

  it('should reject invalid address', () => {
    const invalidOutput = new TransactionOutputImpl('invalid_address', 1000000);
    expect(invalidOutput.isValid()).toBe(false);
  });

  it('should reject zero or negative amount', () => {
    const zeroOutput = new TransactionOutputImpl(validAddress, 0);
    const negativeOutput = new TransactionOutputImpl(validAddress, -1000);
    
    expect(zeroOutput.isValid()).toBe(false);
    expect(negativeOutput.isValid()).toBe(false);
  });

  it('should reject amount exceeding maximum supply', () => {
    const maxSupply = 21000000 * 100000000;
    const invalidOutput = new TransactionOutputImpl(validAddress, maxSupply + 1);
    expect(invalidOutput.isValid()).toBe(false);
  });

  it('should clone correctly', () => {
    const cloned = validOutput.clone();
    expect(cloned).not.toBe(validOutput);
    expect(cloned.address).toBe(validOutput.address);
    expect(cloned.amount).toBe(validOutput.amount);
  });
});

describe('TransactionImpl', () => {
  let keyPair1: any;
  let keyPair2: any;
  let address1: string;
  let address2: string;
  let validInput: TransactionInputImpl;
  let validOutput: TransactionOutputImpl;
  let validTransaction: TransactionImpl;

  beforeEach(() => {
    keyPair1 = CryptoUtils.generateKeyPair();
    keyPair2 = CryptoUtils.generateKeyPair();
    address1 = AddressUtils.generateAddress(keyPair1.publicKey);
    address2 = AddressUtils.generateAddress(keyPair2.publicKey);

    validInput = new TransactionInputImpl('a'.repeat(64), 0, '', keyPair1.publicKey);
    validOutput = new TransactionOutputImpl(address2, 1000000);
    validTransaction = new TransactionImpl([validInput], [validOutput]);
  });

  it('should create a valid transaction', () => {
    expect(validTransaction.inputs).toHaveLength(1);
    expect(validTransaction.outputs).toHaveLength(1);
    expect(validTransaction.timestamp).toBeGreaterThan(0);
    expect(validTransaction.id).toBeDefined();
  });

  it('should calculate transaction ID', () => {
    const id = validTransaction.calculateId();
    expect(id).toBe(validTransaction.id);
    expect(id).toHaveLength(64); // SHA-256 hash length
  });

  it('should validate a correct transaction', () => {
    expect(validTransaction.isValid()).toBe(true);
  });

  it('should reject transaction without inputs (non-coinbase)', () => {
    const invalidTransaction = new TransactionImpl([], [validOutput]);
    expect(invalidTransaction.isValid()).toBe(false);
  });

  it('should reject transaction without outputs', () => {
    const invalidTransaction = new TransactionImpl([validInput], []);
    expect(invalidTransaction.isValid()).toBe(false);
  });

  it('should sign and verify transaction', () => {
    validTransaction.sign(keyPair1.privateKey);
    expect(validTransaction.signature).toBeDefined();
    expect(validTransaction.verifySignature(keyPair1.publicKey)).toBe(true);
    expect(validTransaction.verifySignature(keyPair2.publicKey)).toBe(false);
  });

  it('should detect coinbase transaction', () => {
    const coinbaseInput = new TransactionInputImpl('0'.repeat(64), -1, '', '');
    const coinbaseOutput = new TransactionOutputImpl(address1, 5000000000);
    const coinbaseTransaction = new TransactionImpl([coinbaseInput], [coinbaseOutput]);
    
    expect(coinbaseTransaction.isCoinbase()).toBe(true);
    expect(validTransaction.isCoinbase()).toBe(false);
  });

  it('should calculate input and output amounts', () => {
    const utxos = [
      new UTXOImpl('a'.repeat(64), 0, address1, 2000000, false)
    ];

    expect(validTransaction.getInputAmount(utxos)).toBe(2000000);
    expect(validTransaction.getOutputAmount()).toBe(1000000);
    expect(validTransaction.getFee(utxos)).toBe(1000000);
  });

  it('should handle coinbase transaction amounts correctly', () => {
    const coinbaseTransaction = TransactionImpl.createCoinbase(address1, 5000000000, 1);
    const utxos: UTXOImpl[] = [];

    expect(coinbaseTransaction.getInputAmount(utxos)).toBe(0);
    expect(coinbaseTransaction.getOutputAmount()).toBe(5000000000);
    expect(coinbaseTransaction.getFee(utxos)).toBe(0);
  });

  it('should reject duplicate inputs', () => {
    const duplicateInput = new TransactionInputImpl('a'.repeat(64), 0, '', keyPair1.publicKey);
    const invalidTransaction = new TransactionImpl([validInput, duplicateInput], [validOutput]);
    
    expect(invalidTransaction.isValid()).toBe(false);
  });

  it('should clone correctly', () => {
    validTransaction.sign(keyPair1.privateKey);
    const cloned = validTransaction.clone();
    
    expect(cloned).not.toBe(validTransaction);
    expect(cloned.id).toBe(validTransaction.id);
    expect(cloned.signature).toBe(validTransaction.signature);
    expect(cloned.inputs).toHaveLength(validTransaction.inputs.length);
    expect(cloned.outputs).toHaveLength(validTransaction.outputs.length);
  });

  it('should create coinbase transaction correctly', () => {
    const coinbase = TransactionImpl.createCoinbase(address1, 5000000000, 1);
    
    expect(coinbase.isCoinbase()).toBe(true);
    expect(coinbase.inputs).toHaveLength(1);
    expect(coinbase.outputs).toHaveLength(1);
    expect(coinbase.outputs[0].address).toBe(address1);
    expect(coinbase.outputs[0].amount).toBe(5000000000);
  });

  it('should get data for signing without signatures', () => {
    const dataForSigning = validTransaction.getDataForSigning();
    expect(dataForSigning).toContain(validInput.txId);
    expect(dataForSigning).toContain(validOutput.address);
    expect(dataForSigning).not.toContain('signature');
  });
});