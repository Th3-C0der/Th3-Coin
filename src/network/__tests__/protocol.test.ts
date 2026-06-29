import { ProtocolHandler } from '../protocol';
import { NetworkMessage, Transaction, Block } from '../../interfaces';
import { vi } from 'vitest';

describe('ProtocolHandler', () => {
  let protocolHandler: ProtocolHandler;

  beforeEach(() => {
    protocolHandler = new ProtocolHandler();
  });

  describe('Message Creation', () => {
    it('should create valid network message', () => {
      const data = { test: 'data' };
      const message = protocolHandler.createMessage('ping', data);
      
      expect(message).toMatchObject({
        type: 'ping',
        data,
        timestamp: expect.any(Number)
      });
      expect(message.timestamp).toBeGreaterThan(0);
    });

    it('should create messages with current timestamp', () => {
      const beforeTime = Date.now();
      const message = protocolHandler.createMessage('ping', {});
      const afterTime = Date.now();
      
      expect(message.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(message.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Message Handling', () => {
    it('should handle ping message', async () => {
      const promise = new Promise((resolve) => {
        protocolHandler.on('ping', (data) => {
          expect(data).toEqual({ test: 'ping' });
          resolve(data);
        });
      });

      const message: NetworkMessage = {
        type: 'ping',
        data: { test: 'ping' },
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });

    it('should handle pong message', async () => {
      const promise = new Promise((resolve) => {
        protocolHandler.on('pong', (data) => {
          expect(data).toEqual({ test: 'pong' });
          resolve(data);
        });
      });

      const message: NetworkMessage = {
        type: 'pong',
        data: { test: 'pong' },
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });

    it('should emit unknownMessage for unsupported message types', async () => {
      const promise = new Promise((resolve) => {
        protocolHandler.on('unknownMessage', (message) => {
          expect(message.type).toBe('unknown');
          resolve(message);
        });
      });

      const message: NetworkMessage = {
        type: 'unknown' as any,
        data: {},
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });

    it('should emit invalidMessage for invalid message format', async () => {
      const promise = new Promise((resolve) => {
        protocolHandler.on('invalidMessage', (message) => {
          expect(message).toBeDefined();
          resolve(message);
        });
      });

      const invalidMessage = {
        type: 'ping',
        data: {},
        // missing timestamp
      } as NetworkMessage;

      protocolHandler.handleMessage(invalidMessage);
      await promise;
    });

    it('should emit error for handler exceptions', async () => {
      protocolHandler.registerHandler('test', () => {
        throw new Error('Test error');
      });

      const promise = new Promise((resolve) => {
        protocolHandler.on('error', (error) => {
          expect(error.message).toContain('Test error');
          resolve(error);
        });
      });

      const message: NetworkMessage = {
        type: 'test',
        data: {},
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });
  });

  describe('Transaction Message Validation', () => {
    it('should handle valid transaction message', async () => {
      const validTransaction: Transaction = {
        id: 'tx123',
        inputs: [{
          txId: 'prev123',
          outputIndex: 0,
          signature: 'sig123',
          publicKey: 'pub123'
        }],
        outputs: [{
          address: 'addr123',
          amount: 100
        }],
        timestamp: Date.now()
      };

      const promise = new Promise((resolve) => {
        protocolHandler.on('transaction', (data) => {
          expect(data).toEqual(validTransaction);
          resolve(data);
        });
      });

      const message: NetworkMessage = {
        type: 'transaction',
        data: validTransaction,
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });

    it('should reject invalid transaction message', async () => {
      const invalidTransaction = {
        id: 'tx123',
        inputs: [{
          txId: 'prev123',
          outputIndex: 0,
          signature: 'sig123'
          // missing publicKey
        }],
        outputs: [{
          address: 'addr123',
          amount: 100
        }],
        timestamp: Date.now()
      };

      const promise = new Promise((resolve) => {
        protocolHandler.on('invalidMessage', (data) => {
          expect(data.type).toBe('transaction');
          resolve(data);
        });
      });

      const message: NetworkMessage = {
        type: 'transaction',
        data: invalidTransaction,
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });

    it('should reject transaction with invalid output amount', async () => {
      const invalidTransaction = {
        id: 'tx123',
        inputs: [{
          txId: 'prev123',
          outputIndex: 0,
          signature: 'sig123',
          publicKey: 'pub123'
        }],
        outputs: [{
          address: 'addr123',
          amount: -100 // negative amount
        }],
        timestamp: Date.now()
      };

      const promise = new Promise((resolve) => {
        protocolHandler.on('invalidMessage', (data) => {
          expect(data.type).toBe('transaction');
          resolve(data);
        });
      });

      const message: NetworkMessage = {
        type: 'transaction',
        data: invalidTransaction,
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });
  });

  describe('Block Message Validation', () => {
    it('should handle valid block message', async () => {
      const validBlock: Block = {
        header: {
          version: 1,
          previousHash: 'prev123',
          merkleRoot: 'merkle123',
          timestamp: Date.now(),
          difficulty: 4,
          nonce: 12345
        },
        transactions: [{
          id: 'tx123',
          inputs: [{
            txId: 'prev123',
            outputIndex: 0,
            signature: 'sig123',
            publicKey: 'pub123'
          }],
          outputs: [{
            address: 'addr123',
            amount: 100
          }],
          timestamp: Date.now()
        }]
      };

      const promise = new Promise((resolve) => {
        protocolHandler.on('block', (data) => {
          expect(data).toEqual(validBlock);
          resolve(data);
        });
      });

      const message: NetworkMessage = {
        type: 'block',
        data: validBlock,
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });

    it('should reject block with invalid header', async () => {
      const invalidBlock = {
        header: {
          version: 1,
          previousHash: 'prev123',
          merkleRoot: 'merkle123',
          timestamp: Date.now(),
          difficulty: 4
          // missing nonce
        },
        transactions: []
      };

      const promise = new Promise((resolve) => {
        protocolHandler.on('invalidMessage', (data) => {
          expect(data.type).toBe('block');
          resolve(data);
        });
      });

      const message: NetworkMessage = {
        type: 'block',
        data: invalidBlock,
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });

    it('should reject block with invalid transactions', (done) => {
      const invalidBlock = {
        header: {
          version: 1,
          previousHash: 'prev123',
          merkleRoot: 'merkle123',
          timestamp: Date.now(),
          difficulty: 4,
          nonce: 12345
        },
        transactions: [{
          id: 'tx123',
          inputs: [], // empty inputs array
          outputs: [{
            address: 'addr123',
            amount: 100
          }],
          timestamp: Date.now()
        }]
      };

      protocolHandler.on('invalidMessage', (data) => {
        expect(data.type).toBe('block');
        done();
      });

      const message: NetworkMessage = {
        type: 'block',
        data: invalidBlock,
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
    });
  });

  describe('Custom Handler Registration', () => {
    it('should register custom message handler', async () => {
      const promise = new Promise((resolve) => {
        protocolHandler.registerHandler('custom', (data) => {
          expect(data).toEqual({ custom: 'data' });
          resolve(data);
        });
      });

      const message: NetworkMessage = {
        type: 'custom',
        data: { custom: 'data' },
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      await promise;
    });

    it('should unregister message handler', () => {
      const handler = vi.fn();
      protocolHandler.registerHandler('test', handler);
      protocolHandler.unregisterHandler('test');

      const message: NetworkMessage = {
        type: 'test',
        data: {},
        timestamp: Date.now()
      };

      protocolHandler.handleMessage(message);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return supported message types', () => {
      const types = protocolHandler.getSupportedMessageTypes();
      expect(types).toContain('ping');
      expect(types).toContain('pong');
      expect(types).toContain('transaction');
      expect(types).toContain('block');
      expect(types).toContain('getBlocks');
      expect(types).toContain('getBlock');
    });
  });

  describe('Message Validation', () => {
    it('should validate message structure', () => {
      const validMessage: NetworkMessage = {
        type: 'ping',
        data: {},
        timestamp: Date.now()
      };

      expect((protocolHandler as any).isValidMessage(validMessage)).toBe(true);
    });

    it('should reject message without type', () => {
      const invalidMessage = {
        data: {},
        timestamp: Date.now()
      };

      expect((protocolHandler as any).isValidMessage(invalidMessage)).toBe(false);
    });

    it('should reject message without data', () => {
      const invalidMessage = {
        type: 'ping',
        timestamp: Date.now()
      };

      expect((protocolHandler as any).isValidMessage(invalidMessage)).toBe(false);
    });

    it('should reject message without timestamp', () => {
      const invalidMessage = {
        type: 'ping',
        data: {}
      };

      expect((protocolHandler as any).isValidMessage(invalidMessage)).toBe(false);
    });

    it('should reject message with invalid timestamp', () => {
      const invalidMessage = {
        type: 'ping',
        data: {},
        timestamp: 0
      };

      expect((protocolHandler as any).isValidMessage(invalidMessage)).toBe(false);
    });
  });
});