import { describe, it, expect } from 'vitest';
import { KeyPairImpl } from './keypair';

describe('KeyPair Implementation', () => {
  it('should create a keypair with private and public keys', () => {
    const privateKey = 'private123';
    const publicKey = 'public123';
    
    const keyPair = new KeyPairImpl(privateKey, publicKey);

    expect(keyPair.privateKey).toBe(privateKey);
    expect(keyPair.publicKey).toBe(publicKey);
  });
});