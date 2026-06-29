import { describe, it, expect, beforeEach } from 'vitest';
import { Wallet } from '../wallet';
import { CryptoUtils } from '../../core/crypto';
import { AddressUtils } from '../../core/address';

describe('Wallet Key Management', () => {
  let wallet: Wallet;

  beforeEach(() => {
    wallet = new Wallet();
  });

  describe('Key Pair Generation', () => {
    it('should generate a valid key pair', () => {
      const keyPair = wallet.generateKeyPair();

      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(typeof keyPair.privateKey).toBe('string');
      expect(typeof keyPair.publicKey).toBe('string');
      expect(keyPair.privateKey.length).toBe(64); // 32 bytes in hex
      expect(CryptoUtils.isValidPrivateKey(keyPair.privateKey)).toBe(true);
      expect(CryptoUtils.isValidPublicKey(keyPair.publicKey)).toBe(true);
    });

    it('should generate different key pairs on each call', () => {
      const keyPair1 = wallet.generateKeyPair();
      const keyPair2 = wallet.generateKeyPair();

      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
    });

    it('should derive correct public key from private key', () => {
      const keyPair = wallet.generateKeyPair();
      const derivedPublicKey = CryptoUtils.getPublicKeyFromPrivate(keyPair.privateKey);

      expect(derivedPublicKey).toBe(keyPair.publicKey);
    });
  });

  describe('Wallet Creation', () => {
    it('should create wallet with generated key pair', () => {
      const newWallet = new Wallet();

      expect(newWallet.getPrivateKey()).toBeDefined();
      expect(newWallet.getPublicKey()).toBeDefined();
      expect(newWallet.getAddress()).toBeDefined();
      expect(CryptoUtils.isValidPrivateKey(newWallet.getRawPrivateKey())).toBe(true);
      expect(CryptoUtils.isValidPublicKey(newWallet.getPublicKey())).toBe(true);
      expect(AddressUtils.validateAddress(newWallet.getAddress())).toBe(true);
    });

    it('should create wallet from existing private key', () => {
      const existingPrivateKey = CryptoUtils.generateKeyPair().privateKey;
      const expectedPublicKey = CryptoUtils.getPublicKeyFromPrivate(existingPrivateKey);
      const expectedAddress = AddressUtils.generateAddress(expectedPublicKey);

      const walletFromKey = new Wallet(existingPrivateKey);

      expect(walletFromKey.getRawPrivateKey()).toBe(existingPrivateKey);
      expect(walletFromKey.getPublicKey()).toBe(expectedPublicKey);
      expect(walletFromKey.getAddress()).toBe(expectedAddress);
    });

    it('should throw error for invalid private key', () => {
      expect(() => new Wallet('invalid_key')).toThrow('Invalid private key provided');
      expect(() => new Wallet('')).toThrow('Invalid private key provided');
      expect(() => new Wallet('123')).toThrow('Invalid private key provided');
    });
  });

  describe('Address Generation', () => {
    it('should generate valid address from public key', () => {
      const address = wallet.getAddress();

      expect(address).toBeDefined();
      expect(typeof address).toBe('string');
      expect(AddressUtils.validateAddress(address)).toBe(true);
    });

    it('should generate consistent address for same public key', () => {
      const privateKey = CryptoUtils.generateKeyPair().privateKey;
      const wallet1 = new Wallet(privateKey);
      const wallet2 = new Wallet(privateKey);

      expect(wallet1.getAddress()).toBe(wallet2.getAddress());
    });

    it('should verify address ownership', () => {
      const address = wallet.getAddress();
      const otherWallet = new Wallet();

      expect(wallet.ownsAddress(address)).toBe(true);
      expect(wallet.ownsAddress(otherWallet.getAddress())).toBe(false);
    });

    it('should verify address corresponds to public key', () => {
      const address = wallet.getAddress();
      const publicKey = wallet.getPublicKey();

      expect(AddressUtils.isAddressForPublicKey(address, publicKey)).toBe(true);
    });
  });

  describe('Private Key Security and Encryption', () => {
    it('should return raw private key when no encryption is set', () => {
      const rawPrivateKey = wallet.getRawPrivateKey();
      const returnedPrivateKey = wallet.getPrivateKey();

      expect(returnedPrivateKey).toBe(rawPrivateKey);
      expect(CryptoUtils.isValidPrivateKey(returnedPrivateKey)).toBe(true);
    });

    it('should encrypt private key when encryption key is set', () => {
      const encryptionKey = 'my-secret-password';
      const rawPrivateKey = wallet.getRawPrivateKey();

      wallet.setEncryptionKey(encryptionKey);
      const encryptedPrivateKey = wallet.getPrivateKey();

      expect(encryptedPrivateKey).not.toBe(rawPrivateKey);
      expect(encryptedPrivateKey).toContain(':'); // Should contain IV:encrypted format
      expect(encryptedPrivateKey.split(':').length).toBe(2);
    });

    it('should decrypt private key correctly', () => {
      const encryptionKey = 'my-secret-password';
      const rawPrivateKey = wallet.getRawPrivateKey();

      wallet.setEncryptionKey(encryptionKey);
      const encryptedPrivateKey = wallet.getPrivateKey();

      const decryptedPrivateKey = Wallet.decryptPrivateKey(encryptedPrivateKey, encryptionKey);

      expect(decryptedPrivateKey).toBe(rawPrivateKey);
      expect(CryptoUtils.isValidPrivateKey(decryptedPrivateKey)).toBe(true);
    });

    it('should remove encryption when requested', () => {
      const encryptionKey = 'my-secret-password';
      const rawPrivateKey = wallet.getRawPrivateKey();

      wallet.setEncryptionKey(encryptionKey);
      expect(wallet.getPrivateKey()).not.toBe(rawPrivateKey);

      wallet.removeEncryption();
      expect(wallet.getPrivateKey()).toBe(rawPrivateKey);
    });

    it('should throw error when decrypting with wrong key', () => {
      const encryptionKey = 'correct-password';
      const wrongKey = 'wrong-password';

      wallet.setEncryptionKey(encryptionKey);
      const encryptedPrivateKey = wallet.getPrivateKey();

      expect(() => Wallet.decryptPrivateKey(encryptedPrivateKey, wrongKey))
        .toThrow();
    });

    it('should throw error when decrypting invalid format', () => {
      const encryptionKey = 'password';
      
      expect(() => Wallet.decryptPrivateKey('invalid:format', encryptionKey))
        .toThrow('Invalid encrypted private key format');
      expect(() => Wallet.decryptPrivateKey('invalid', encryptionKey))
        .toThrow('Invalid encrypted private key format');
    });
  });

  describe('Digital Signatures', () => {
    it('should sign data with private key', () => {
      const data = 'test data to sign';
      const signature = wallet.signData(data);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should verify signature with public key', () => {
      const data = 'test data to sign';
      const signature = wallet.signData(data);

      const isValid = wallet.verifySignature(data, signature);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const data = 'test data to sign';
      const signature = wallet.signData(data);
      const tamperedData = 'tampered data';

      const isValid = wallet.verifySignature(tamperedData, signature);

      expect(isValid).toBe(false);
    });

    it('should reject signatures from different keys', () => {
      const data = 'test data to sign';
      const signature = wallet.signData(data);
      const otherWallet = new Wallet();

      const isValid = otherWallet.verifySignature(data, signature);

      expect(isValid).toBe(false);
    });
  });

  describe('Wallet Data Export and Import', () => {
    it('should export wallet data without encryption', () => {
      const walletData = wallet.exportWalletData();

      expect(walletData.privateKey).toBe(wallet.getRawPrivateKey());
      expect(walletData.publicKey).toBe(wallet.getPublicKey());
      expect(walletData.address).toBe(wallet.getAddress());
      expect(walletData.encrypted).toBe(false);
    });

    it('should export wallet data with encryption', () => {
      const encryptionKey = 'my-password';
      wallet.setEncryptionKey(encryptionKey);

      const walletData = wallet.exportWalletData();

      expect(walletData.privateKey).not.toBe(wallet.getRawPrivateKey());
      expect(walletData.publicKey).toBe(wallet.getPublicKey());
      expect(walletData.address).toBe(wallet.getAddress());
      expect(walletData.encrypted).toBe(true);
    });

    it('should create wallet from exported data without encryption', () => {
      const originalWallet = new Wallet();
      const walletData = originalWallet.exportWalletData();

      const restoredWallet = Wallet.fromWalletData(walletData);

      expect(restoredWallet.getRawPrivateKey()).toBe(originalWallet.getRawPrivateKey());
      expect(restoredWallet.getPublicKey()).toBe(originalWallet.getPublicKey());
      expect(restoredWallet.getAddress()).toBe(originalWallet.getAddress());
    });

    it('should create wallet from exported data with encryption', () => {
      const encryptionKey = 'my-password';
      const originalWallet = new Wallet();
      originalWallet.setEncryptionKey(encryptionKey);
      const walletData = originalWallet.exportWalletData();

      const restoredWallet = Wallet.fromWalletData(walletData, encryptionKey);

      expect(restoredWallet.getRawPrivateKey()).toBe(originalWallet.getRawPrivateKey());
      expect(restoredWallet.getPublicKey()).toBe(originalWallet.getPublicKey());
      expect(restoredWallet.getAddress()).toBe(originalWallet.getAddress());
    });

    it('should throw error when importing encrypted data without key', () => {
      const encryptionKey = 'my-password';
      const originalWallet = new Wallet();
      originalWallet.setEncryptionKey(encryptionKey);
      const walletData = originalWallet.exportWalletData();

      expect(() => Wallet.fromWalletData(walletData))
        .toThrow('Encryption key required for encrypted wallet data');
    });
  });

  describe('Wallet Creation with Encryption', () => {
    it('should create wallet with encryption key from start', () => {
      const encryptionKey = 'initial-password';
      const walletWithEncryption = new Wallet(undefined, encryptionKey);

      const privateKey = walletWithEncryption.getPrivateKey();
      const rawPrivateKey = walletWithEncryption.getRawPrivateKey();

      expect(privateKey).not.toBe(rawPrivateKey);
      expect(privateKey).toContain(':');
    });

    it('should create wallet from private key with encryption', () => {
      const existingPrivateKey = CryptoUtils.generateKeyPair().privateKey;
      const encryptionKey = 'password123';

      const walletWithEncryption = new Wallet(existingPrivateKey, encryptionKey);

      expect(walletWithEncryption.getRawPrivateKey()).toBe(existingPrivateKey);
      expect(walletWithEncryption.getPrivateKey()).not.toBe(existingPrivateKey);
      expect(walletWithEncryption.getPrivateKey()).toContain(':');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid private key gracefully', () => {
      expect(() => new Wallet('not-a-valid-key')).toThrow();
      expect(() => new Wallet('')).toThrow();
      expect(() => new Wallet('123abc')).toThrow();
    });

    it('should handle encryption errors gracefully', () => {
      const wallet = new Wallet();
      wallet.setEncryptionKey('password');
      const encrypted = wallet.getPrivateKey();

      expect(() => Wallet.decryptPrivateKey(encrypted, 'wrong-password')).toThrow();
      expect(() => Wallet.decryptPrivateKey('invalid-format', 'password')).toThrow();
    });
  });
});