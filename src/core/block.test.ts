import { describe, it, expect } from 'vitest';
import { BlockImpl, BlockHeaderImpl } from './block';
import { TransactionImpl } from './transaction';

describe('Block Implementation', () => {
  it('should create a block with header and transactions', () => {
    const header = new BlockHeaderImpl(
      1, // version
      '0000000000000000000000000000000000000000000000000000000000000000', // previousHash
      'merkleroot', // merkleRoot
      Date.now(), // timestamp
      4, // difficulty
      0 // nonce
    );

    const transactions: TransactionImpl[] = [];
    const block = new BlockImpl(header, transactions);

    expect(block.header).toBe(header);
    expect(block.transactions).toBe(transactions);
    expect(block.header.version).toBe(1);
    expect(block.header.difficulty).toBe(4);
  });

  it('should create a block header with all required fields', () => {
    const timestamp = Date.now();
    const header = new BlockHeaderImpl(
      1,
      'previoushash',
      'merkleroot',
      timestamp,
      4,
      12345
    );

    expect(header.version).toBe(1);
    expect(header.previousHash).toBe('previoushash');
    expect(header.merkleRoot).toBe('merkleroot');
    expect(header.timestamp).toBe(timestamp);
    expect(header.difficulty).toBe(4);
    expect(header.nonce).toBe(12345);
  });
});