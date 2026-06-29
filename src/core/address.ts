import { CryptoUtils } from './crypto';

/**
 * Address utility functions for Th3Coin
 * Handles address generation from public keys and address validation
 */
export class AddressUtils {
  // Address version byte for Th3Coin (similar to Bitcoin's 0x00 for mainnet)
  private static readonly ADDRESS_VERSION = 0x00;

  // Base58 alphabet (Bitcoin-style)
  private static readonly BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  /**
   * Generate Th3Coin address from public key
   * Uses Bitcoin-style address generation: RIPEMD160(SHA256(publicKey))
   * @param publicKey - Public key in hex format
   * @returns Base58Check encoded address
   */
  static generateAddress(publicKey: string): string {
    // Validate public key first
    if (!CryptoUtils.isValidPublicKey(publicKey)) {
      throw new Error('Invalid public key provided');
    }

    // Step 1: SHA-256 hash of public key
    const sha256Hash = CryptoUtils.sha256(publicKey);

    // Step 2: RIPEMD-160 hash of the SHA-256 hash
    const ripemd160Hash = this.ripemd160(Buffer.from(sha256Hash, 'hex'));

    // Step 3: Add version byte
    const versionedPayload = Buffer.concat([
      Buffer.from([this.ADDRESS_VERSION]),
      ripemd160Hash
    ]);

    // Step 4: Double SHA-256 for checksum
    const checksum = this.doubleShA256(versionedPayload).slice(0, 4);

    // Step 5: Concatenate versioned payload and checksum
    const addressBytes = Buffer.concat([versionedPayload, checksum]);

    // Step 6: Base58 encode
    return this.base58Encode(addressBytes);
  }

  /**
   * Validate Th3Coin address format and checksum
   * @param address - Address to validate
   * @returns True if address is valid, false otherwise
   */
  static validateAddress(address: string): boolean {
    try {
      // Check if address is a string and not empty
      if (!address || typeof address !== 'string') {
        return false;
      }

      // Decode Base58
      const decoded = this.base58Decode(address);

      // Address should be 25 bytes (1 version + 20 hash + 4 checksum)
      if (decoded.length !== 25) {
        return false;
      }

      // Extract components
      const version = decoded[0];
      const payload = decoded.slice(0, 21); // version + hash
      const checksum = decoded.slice(21, 25);

      // Verify version
      if (version !== this.ADDRESS_VERSION) {
        return false;
      }

      // Verify checksum
      const calculatedChecksum = this.doubleShA256(payload).slice(0, 4);

      return checksum.equals(calculatedChecksum);
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract public key hash from address
   * @param address - Valid Th3Coin address
   * @returns Public key hash as hex string
   */
  static getPublicKeyHashFromAddress(address: string): string {
    if (!this.validateAddress(address)) {
      throw new Error('Invalid address provided');
    }

    const decoded = this.base58Decode(address);
    const publicKeyHash = decoded.slice(1, 21); // Skip version byte, take 20 bytes

    return publicKeyHash.toString('hex');
  }

  /**
   * Check if an address belongs to a specific public key
   * @param address - Address to check
   * @param publicKey - Public key in hex format
   * @returns True if address corresponds to the public key
   */
  static isAddressForPublicKey(address: string, publicKey: string): boolean {
    try {
      const generatedAddress = this.generateAddress(publicKey);
      return generatedAddress === address;
    } catch (error) {
      return false;
    }
  }

  /**
   * RIPEMD-160 hash function
   * @param data - Data to hash
   * @returns RIPEMD-160 hash
   */
  private static ripemd160(data: Buffer): Buffer {
    const crypto = require('crypto');
    return crypto.createHash('ripemd160').update(data).digest();
  }

  /**
   * Double SHA-256 hash (SHA-256 of SHA-256)
   * @param data - Data to hash
   * @returns Double SHA-256 hash
   */
  private static doubleShA256(data: Buffer): Buffer {
    const firstHash = Buffer.from(CryptoUtils.sha256(data), 'hex');
    return Buffer.from(CryptoUtils.sha256(firstHash), 'hex');
  }

  /**
   * Base58 encode
   * @param data - Data to encode
   * @returns Base58 encoded string
   */
  private static base58Encode(data: Buffer): string {
    if (data.length === 0) return '';

    // Convert to big integer
    let num = BigInt('0x' + data.toString('hex'));
    let encoded = '';

    // Convert to base58
    while (num > 0) {
      const remainder = num % 58n;
      num = num / 58n;
      encoded = this.BASE58_ALPHABET[Number(remainder)] + encoded;
    }

    // Add leading zeros as '1's
    for (let i = 0; i < data.length && data[i] === 0; i++) {
      encoded = '1' + encoded;
    }

    return encoded;
  }

  /**
   * Base58 decode
   * @param encoded - Base58 encoded string
   * @returns Decoded buffer
   */
  private static base58Decode(encoded: string): Buffer {
    if (encoded.length === 0) return Buffer.alloc(0);

    // Count leading '1's
    let leadingZeros = 0;
    for (let i = 0; i < encoded.length && encoded[i] === '1'; i++) {
      leadingZeros++;
    }

    // Convert from base58
    let num = BigInt(0);
    for (let i = leadingZeros; i < encoded.length; i++) {
      const char = encoded[i];
      const charIndex = this.BASE58_ALPHABET.indexOf(char);
      if (charIndex === -1) {
        throw new Error('Invalid Base58 character');
      }
      num = num * 58n + BigInt(charIndex);
    }

    // Convert to buffer
    const hex = num.toString(16);
    const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
    const decoded = Buffer.from(paddedHex, 'hex');

    // Add leading zeros
    const leadingZeroBuffer = Buffer.alloc(leadingZeros, 0);

    return Buffer.concat([leadingZeroBuffer, decoded]);
  }
}