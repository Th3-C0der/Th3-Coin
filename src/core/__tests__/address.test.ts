import { describe, it, expect } from 'vitest';
import { AddressUtils } from '../address';
import { CryptoUtils } from '../crypto';

describe('AddressUtils', () => {
    // Generate test key pairs for consistent testing
    const testKeyPair1 = CryptoUtils.generateKeyPair();
    const testKeyPair2 = CryptoUtils.generateKeyPair();

    describe('Address Generation', () => {
        it('should generate valid address from public key', () => {
            const address = AddressUtils.generateAddress(testKeyPair1.publicKey);

            expect(address).toBeTruthy();
            expect(typeof address).toBe('string');
            expect(address.length).toBeGreaterThan(25); // Base58 encoded addresses are typically 26-35 characters
            expect(address.length).toBeLessThan(36);
        });

        it('should generate different addresses for different public keys', () => {
            const address1 = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const address2 = AddressUtils.generateAddress(testKeyPair2.publicKey);

            expect(address1).not.toBe(address2);
        });

        it('should generate same address for same public key', () => {
            const address1 = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const address2 = AddressUtils.generateAddress(testKeyPair1.publicKey);

            expect(address1).toBe(address2);
        });

        it('should throw error for invalid public key', () => {
            const invalidPublicKeys = [
                'invalid_key',
                '123',
                '',
                'gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg'
            ];

            invalidPublicKeys.forEach(invalidKey => {
                expect(() => {
                    AddressUtils.generateAddress(invalidKey);
                }).toThrow('Invalid public key provided');
            });
        });

        it('should generate address that starts with valid Base58 characters', () => {
            const address = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

            expect(address).toMatch(base58Regex);
        });
    });

    describe('Address Validation', () => {
        it('should validate correctly generated address', () => {
            const address = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const isValid = AddressUtils.validateAddress(address);

            expect(isValid).toBe(true);
        });

        it('should validate multiple correctly generated addresses', () => {
            const address1 = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const address2 = AddressUtils.generateAddress(testKeyPair2.publicKey);

            expect(AddressUtils.validateAddress(address1)).toBe(true);
            expect(AddressUtils.validateAddress(address2)).toBe(true);
        });

        it('should reject invalid addresses', () => {
            const invalidAddresses = [
                'invalid_address',
                '123',
                '',
                'abcdefghijklmnopqrstuvwxyz',
                '1111111111111111111111111111111111', // Wrong length
                '0000000000000000000000000000000000', // Invalid Base58 characters
                'OIl0' // Contains invalid Base58 characters (O, I, l, 0)
            ];

            invalidAddresses.forEach(invalidAddress => {
                const isValid = AddressUtils.validateAddress(invalidAddress);
                expect(isValid).toBe(false);
            });
        });

        it('should reject address with corrupted checksum', () => {
            const validAddress = AddressUtils.generateAddress(testKeyPair1.publicKey);

            // Corrupt the last character (part of checksum)
            const corruptedAddress = validAddress.slice(0, -1) + 'X';
            const isValid = AddressUtils.validateAddress(corruptedAddress);

            expect(isValid).toBe(false);
        });

        it('should handle null and undefined inputs', () => {
            expect(AddressUtils.validateAddress(null as any)).toBe(false);
            expect(AddressUtils.validateAddress(undefined as any)).toBe(false);
        });

        it('should handle non-string inputs', () => {
            expect(AddressUtils.validateAddress(123 as any)).toBe(false);
            expect(AddressUtils.validateAddress({} as any)).toBe(false);
            expect(AddressUtils.validateAddress([] as any)).toBe(false);
        });
    });

    describe('Public Key Hash Extraction', () => {
        it('should extract public key hash from valid address', () => {
            const address = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const publicKeyHash = AddressUtils.getPublicKeyHashFromAddress(address);

            expect(publicKeyHash).toBeTruthy();
            expect(typeof publicKeyHash).toBe('string');
            expect(publicKeyHash).toHaveLength(40); // 20 bytes = 40 hex characters
            expect(publicKeyHash).toMatch(/^[a-f0-9]{40}$/);
        });

        it('should extract different hashes for different addresses', () => {
            const address1 = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const address2 = AddressUtils.generateAddress(testKeyPair2.publicKey);

            const hash1 = AddressUtils.getPublicKeyHashFromAddress(address1);
            const hash2 = AddressUtils.getPublicKeyHashFromAddress(address2);

            expect(hash1).not.toBe(hash2);
        });

        it('should throw error for invalid address', () => {
            expect(() => {
                AddressUtils.getPublicKeyHashFromAddress('invalid_address');
            }).toThrow('Invalid address provided');
        });
    });

    describe('Address-Public Key Correspondence', () => {
        it('should confirm address belongs to correct public key', () => {
            const address = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const belongs = AddressUtils.isAddressForPublicKey(address, testKeyPair1.publicKey);

            expect(belongs).toBe(true);
        });

        it('should reject address for wrong public key', () => {
            const address = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const belongs = AddressUtils.isAddressForPublicKey(address, testKeyPair2.publicKey);

            expect(belongs).toBe(false);
        });

        it('should handle invalid address gracefully', () => {
            const belongs = AddressUtils.isAddressForPublicKey('invalid_address', testKeyPair1.publicKey);

            expect(belongs).toBe(false);
        });

        it('should handle invalid public key gracefully', () => {
            const address = AddressUtils.generateAddress(testKeyPair1.publicKey);
            const belongs = AddressUtils.isAddressForPublicKey(address, 'invalid_public_key');

            expect(belongs).toBe(false);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle very long public keys', () => {
            // This should fail validation in generateAddress
            const longKey = 'a'.repeat(200);

            expect(() => {
                AddressUtils.generateAddress(longKey);
            }).toThrow('Invalid public key provided');
        });

        it('should handle empty string address validation', () => {
            const isValid = AddressUtils.validateAddress('');
            expect(isValid).toBe(false);
        });

        it('should handle address with only Base58 "1" characters', () => {
            const onesAddress = '1'.repeat(30);
            const isValid = AddressUtils.validateAddress(onesAddress);
            expect(isValid).toBe(false);
        });

        it('should generate consistent addresses across multiple calls', () => {
            const addresses = [];
            for (let i = 0; i < 10; i++) {
                addresses.push(AddressUtils.generateAddress(testKeyPair1.publicKey));
            }

            // All addresses should be identical
            const firstAddress = addresses[0];
            addresses.forEach(address => {
                expect(address).toBe(firstAddress);
            });
        });

        it('should validate all generated addresses', () => {
            // Generate multiple key pairs and addresses
            for (let i = 0; i < 5; i++) {
                const keyPair = CryptoUtils.generateKeyPair();
                const address = AddressUtils.generateAddress(keyPair.publicKey);

                expect(AddressUtils.validateAddress(address)).toBe(true);
                expect(AddressUtils.isAddressForPublicKey(address, keyPair.publicKey)).toBe(true);
            }
        });
    });

    describe('Base58 Encoding/Decoding', () => {
        it('should properly encode and decode through address generation', () => {
            // This is tested implicitly through address generation and validation
            const address = AddressUtils.generateAddress(testKeyPair1.publicKey);

            // If address validates, then Base58 encoding/decoding works
            expect(AddressUtils.validateAddress(address)).toBe(true);
        });

        it('should reject addresses with invalid Base58 characters', () => {
            // These characters are not in Base58 alphabet: 0, O, I, l
            const invalidBase58Addresses = [
                '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa0', // contains '0'
                '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNaO', // contains 'O'
                '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNaI', // contains 'I'
                '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNal'  // contains 'l'
            ];

            invalidBase58Addresses.forEach(address => {
                expect(AddressUtils.validateAddress(address)).toBe(false);
            });
        });
    });
});