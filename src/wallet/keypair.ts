import { KeyPair } from '../interfaces';

export class KeyPairImpl implements KeyPair {
  privateKey: string;
  publicKey: string;

  constructor(privateKey: string, publicKey: string) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }
}