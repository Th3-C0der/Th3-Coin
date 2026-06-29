import { describe, it, expect } from 'vitest';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from './transaction';

describe('Transaction Implementation', () => {
  it('should create a transaction with inputs and outputs', () => {
    const input = new TransactionInputImpl('txid123', 0, 'signature', 'publickey');
    const output = new TransactionOutputImpl('address123', 100);
    const timestamp = Date.now();
    
    const transaction = new TransactionImpl(
      'tx123',
      [input],
      [output],
      timestamp,
      'txsignature'
    );

    expect(transaction.id).toBe('tx123');
    expect(transaction.inputs).toHaveLength(1);
    expect(transaction.outputs).toHaveLength(1);
    expect(transaction.timestamp).toBe(timestamp);
    expect(transaction.signature).toBe('txsignature');
  });

  it('should create transaction input with required fields', () => {
    const input = new TransactionInputImpl('txid123', 0, 'signature', 'publickey');

    expect(input.txId).toBe('txid123');
    expect(input.outputIndex).toBe(0);
    expect(input.signature).toBe('signature');
    expect(input.publicKey).toBe('publickey');
  });

  it('should create transaction output with address and amount', () => {
    const output = new TransactionOutputImpl('address123', 100);

    expect(output.address).toBe('address123');
    expect(output.amount).toBe(100);
  });
});