import * as crypto from 'crypto';
import * as EC from 'elliptic';
import { KeyPair } from '../interfaces';

const ec = new EC.ec('secp256k1');

/**
 * Cryptographic utility functions for Th3Coin
 * Provides SHA-256 hashing, ECDSA key generation, and digital signatures
 */
export class CryptoUtils {
  /**
   * Generate SHA-256 hash of input data
   * @param data - Data to hash (string or Buffer)
   * @returns Hexadecimal hash string
   */
  static sha256(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate SHA-256 hash of multiple data pieces
   * @param data - Array of data to hash
   * @returns Hexadecimal hash string
   */
  static sha256Multiple(data: (string | Buffer)[]): string {
    const hash = crypto.createHash('sha256');
    data.forEach(item => hash.update(item));
    return hash.digest('hex');
  }

  /**
   * Generate a new ECDSA key pair using secp256k1 curve
   * @returns KeyPair object with private and public keys
   */
  static generateKeyPair(): KeyPair {
    const keyPair = ec.genKeyPair();
    return {
      privateKey: keyPair.getPrivate('hex'),
      publicKey: keyPair.getPublic('hex')
    };
  }

  /**
   * Create digital signature for data using private key
   * @param data - Data to sign
   * @param privateKey - Private key in hex format
   * @returns Signature in hex format
   */
  static sign(data: string, privateKey: string): string {
    const keyPair = ec.keyFromPrivate(privateKey, 'hex');
    const hash = this.sha256(data);
    const signature = keyPair.sign(hash);
    return signature.toDER('hex');
  }

  /**
   * Verify digital signature
   * @param data - Original data that was signed
   * @param signature - Signature in hex format
   * @param publicKey - Public key in hex format
   * @returns True if signature is valid, false otherwise
   */
  static verify(data: string, signature: string, publicKey: string): boolean {
    try {
      const keyPair = ec.keyFromPublic(publicKey, 'hex');
      const hash = this.sha256(data);
      return keyPair.verify(hash, signature);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get public key from private key
   * @param privateKey - Private key in hex format
   * @returns Public key in hex format
   */
  static getPublicKeyFromPrivate(privateKey: string): string {
    const keyPair = ec.keyFromPrivate(privateKey, 'hex');
    return keyPair.getPublic('hex');
  }

  /**
   * Validate private key format
   * @param privateKey - Private key to validate
   * @returns True if valid, false otherwise
   */
  static isValidPrivateKey(privateKey: string): boolean {
    try {
      // Check if it's a valid hex string and proper length
      if (!privateKey || typeof privateKey !== 'string') {
        return false;
      }
      
      // Private key should be 64 characters (32 bytes in hex)
      if (privateKey.length !== 64) {
        return false;
      }
      
      // Check if it's valid hex
      if (!/^[a-f0-9]{64}$/i.test(privateKey)) {
        return false;
      }
      
      // Try to create key pair from private key
      const keyPair = ec.keyFromPrivate(privateKey, 'hex');
      
      // Verify the key is valid by checking if we can get public key
      keyPair.getPublic();
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate public key format
   * @param publicKey - Public key to validate
   * @returns True if valid, false otherwise
   */
  static isValidPublicKey(publicKey: string): boolean {
    try {
      // Check if it's a valid hex string
      if (!publicKey || typeof publicKey !== 'string') {
        return false;
      }
      
      // Public key should be 130 characters (65 bytes in hex, uncompressed)
      // or 66 characters (33 bytes in hex, compressed)
      if (publicKey.length !== 130 && publicKey.length !== 66) {
        return false;
      }
      
      // Check if it's valid hex
      if (!/^[a-f0-9]+$/i.test(publicKey)) {
        return false;
      }
      
      // Try to create key pair from public key
      const keyPair = ec.keyFromPublic(publicKey, 'hex');
      
      // Verify the key is valid by checking if we can validate it
      keyPair.validate();
      
      return true;
    } catch (error) {
      return false;
    }
  }
}