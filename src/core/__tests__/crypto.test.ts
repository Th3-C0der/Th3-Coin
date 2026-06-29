import { describe, it, expect } from 'vitest';
import { CryptoUtils } from '../crypto';

describe('CryptoUtils', () => {
  describe('SHA-256 Hashing', () => {
    it('should generate consistent SHA-256 hash for string input', () => {
      const data = 'Hello, Th3Coin!';
      const hash1 = CryptoUtils.sha256(data);
      const hash2 = CryptoUtils.sha256(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // Should be valid hex
    });

    it('should generate consistent SHA-256 hash for Buffer input', () => {
      const data = Buffer.from('Hello, Th3Coin!', 'utf8');
      const hash1 = CryptoUtils.sha256(data);
      const hash2 = CryptoUtils.sha256(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = CryptoUtils.sha256('input1');
      const hash2 = CryptoUtils.sha256('input2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should generate hash for multiple data pieces', () => {
      const data = ['Hello', 'World', '123'];
      const hash = CryptoUtils.sha256Multiple(data);
      
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate same hash for same multiple data pieces', () => {
      const data = ['Hello', 'World', '123'];
      const hash1 = CryptoUtils.sha256Multiple(data);
      const hash2 = CryptoUtils.sha256Multiple(data);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('ECDSA Key Generation', () => {
    it('should generate valid key pair', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair).toHaveProperty('publicKey');
      expect(typeof keyPair.privateKey).toBe('string');
      expect(typeof keyPair.publicKey).toBe('string');
      expect(keyPair.privateKey).toMatch(/^[a-f0-9]+$/i);
      expect(keyPair.publicKey).toMatch(/^[a-f0-9]+$/i);
    });

    it('should generate different key pairs each time', () => {
      const keyPair1 = CryptoUtils.generateKeyPair();
      const keyPair2 = CryptoUtils.generateKeyPair();
      
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
    });

    it('should generate public key from private key', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const derivedPublicKey = CryptoUtils.getPublicKeyFromPrivate(keyPair.privateKey);
      
      expect(derivedPublicKey).toBe(keyPair.publicKey);
    });
  });

  describe('Digital Signatures', () => {
    it('should create and verify valid signature', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const data = 'Transaction data to sign';
      
      const signature = CryptoUtils.sign(data, keyPair.privateKey);
      const isValid = CryptoUtils.verify(data, signature, keyPair.publicKey);
      
      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', () => {
      const keyPair1 = CryptoUtils.generateKeyPair();
      const keyPair2 = CryptoUtils.generateKeyPair();
      const data = 'Transaction data to sign';
      
      const signature = CryptoUtils.sign(data, keyPair1.privateKey);
      const isValid = CryptoUtils.verify(data, signature, keyPair2.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with modified data', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const originalData = 'Original transaction data';
      const modifiedData = 'Modified transaction data';
      
      const signature = CryptoUtils.sign(originalData, keyPair.privateKey);
      const isValid = CryptoUtils.verify(modifiedData, signature, keyPair.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with invalid signature', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const data = 'Transaction data to sign';
      const invalidSignature = 'invalid_signature';
      
      const isValid = CryptoUtils.verify(data, invalidSignature, keyPair.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should create different signatures for different data', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const data1 = 'First transaction';
      const data2 = 'Second transaction';
      
      const signature1 = CryptoUtils.sign(data1, keyPair.privateKey);
      const signature2 = CryptoUtils.sign(data2, keyPair.privateKey);
      
      expect(signature1).not.toBe(signature2);
    });
  });

  describe('Key Validation', () => {
    it('should validate correct private key', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const isValid = CryptoUtils.isValidPrivateKey(keyPair.privateKey);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid private key', () => {
      const invalidKeys = [
        'invalid_key',
        '123',
        '',
        'gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg'
      ];
      
      invalidKeys.forEach(key => {
        const isValid = CryptoUtils.isValidPrivateKey(key);
        expect(isValid).toBe(false);
      });
    });

    it('should validate correct public key', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const isValid = CryptoUtils.isValidPublicKey(keyPair.publicKey);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid public key', () => {
      const invalidKeys = [
        'invalid_key',
        '123',
        '',
        'gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg'
      ];
      
      invalidKeys.forEach(key => {
        const isValid = CryptoUtils.isValidPublicKey(key);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string hashing', () => {
      const hash = CryptoUtils.sha256('');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle large data hashing', () => {
      const largeData = 'x'.repeat(10000);
      const hash = CryptoUtils.sha256(largeData);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle verification with malformed signature gracefully', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const data = 'test data';
      const malformedSignature = 'not_a_signature';
      
      const isValid = CryptoUtils.verify(data, malformedSignature, keyPair.publicKey);
      expect(isValid).toBe(false);
    });

    it('should handle verification with malformed public key gracefully', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const data = 'test data';
      const signature = CryptoUtils.sign(data, keyPair.privateKey);
      const malformedPublicKey = 'not_a_public_key';
      
      const isValid = CryptoUtils.verify(data, signature, malformedPublicKey);
      expect(isValid).toBe(false);
    });
  });
});