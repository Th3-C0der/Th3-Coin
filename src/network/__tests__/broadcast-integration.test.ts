import { P2PNetwork } from '../p2p';
import { BlockchainImpl } from '../../core/blockchain';
import { Mempool } from '../../core/mempool';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../../core/transaction';
import { BlockImpl, BlockHeaderImpl } from '../../core/block';
import { CryptoUtils } from '../../core/crypto';
import { Transaction, Block, UTXO } from '../../interfaces';
import { vi } from 'vitest';

describe('P2P Network Broadcasting Integration Tests', () => {
  let network1: P2PNetwork;
  let network2: P2PNetwork;
  let blockchain1: BlockchainImpl;
  let blockchain2: BlockchainImpl;
  let mempool1: Mempool;
  let mempool2: Mempool;

  const port1 = 18001;
  const port2 = 18002;

  beforeEach(async () => {
    // Create blockchains
    blockchain1 = new BlockchainImpl();
    blockchain2 = new BlockchainImpl();

    // Create mempools with mock UTXO providers
    const mockUTXOProvider = (): UTXO[] => [];
    mempool1 = new Mempool(mockUTXOProvider);
    mempool2 = new Mempool(mockUTXOProvider);

    // Create networks
    network1 = new P2PNetwork(blockchain1, mempool1);
    network2 = new P2PNetwork(blockchain2, mempool2);

    // Start nodes
    await network1.startNode(port1);
    await network2.startNode(port2);

    // Connect networks
    await network1.connectToPeer('localhost', port2);
    
    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await network1.stopNode();
    await network2.stopNode();
  });

  describe('Transaction Broadcasting', () => {
    it('should broadcast transaction to connected peers', async () => {
      // Create a test transaction
      const keyPair = CryptoUtils.generateKeyPair();
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      // Set up event listener for network2
      const transactionReceived = new Promise<Transaction>((resolve) => {
        network2.once('transactionReceived', ({ transaction }) => {
          resolve(transaction);
        });
      });

      // Broadcast transaction from network1
      network1.broadcastTransaction(transaction);

      // Wait for transaction to be received
      const receivedTransaction = await transactionReceived;
      expect(receivedTransaction.id).toBe(transaction.id);
      expect(receivedTransaction.outputs[0].amount).toBe(1000);
    }, 10000);

    it('should not relay duplicate transactions', async () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      let receivedCount = 0;
      network2.on('transactionReceived', () => {
        receivedCount++;
      });

      // Set up promise to wait for first transaction
      const firstTransactionReceived = new Promise<void>((resolve) => {
        network2.once('transactionReceived', () => {
          resolve();
        });
      });

      // Broadcast same transaction twice
      network1.broadcastTransaction(transaction);
      
      // Wait for first transaction to be processed
      await firstTransactionReceived;
      
      // Now broadcast duplicate
      network1.broadcastTransaction(transaction);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should only receive once
      expect(receivedCount).toBe(1);
    });

    it('should validate transaction format before broadcasting', () => {
      const invalidTransaction = {
        id: 'invalid',
        inputs: 'not-an-array', // Invalid
        outputs: [],
        timestamp: Date.now()
      } as any;

      expect(() => {
        network1.broadcastTransaction(invalidTransaction);
      }).toThrow('Invalid transaction format');
    });

    it('should relay valid transactions to other peers', async () => {
      // Create a third network to test relaying
      const network3 = new P2PNetwork();
      await network3.startNode(18003);
      await network2.connectToPeer('localhost', 18003);
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 200));

      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      // Set up event listener for network3
      const transactionReceived = new Promise<Transaction>((resolve) => {
        network3.once('transactionReceived', ({ transaction }) => {
          resolve(transaction);
        });
      });

      // Broadcast from network1, should reach network3 via network2
      network1.broadcastTransaction(transaction);

      // Wait for transaction to be relayed
      const receivedTransaction = await transactionReceived;
      expect(receivedTransaction.id).toBe(transaction.id);

      await network3.stopNode();
    }, 10000);
  });

  describe('Block Broadcasting', () => {
    it('should broadcast block to connected peers', async () => {
      // Create a test block
      const outputs = [new TransactionOutputImpl('miner-address', 2500000000)];
      const transactions = [new TransactionImpl([], outputs, Date.now())];

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );

      const block = new BlockImpl(header, transactions);

      // Set up event listener for network2
      const blockReceived = new Promise<Block>((resolve) => {
        network2.once('blockReceived', ({ block }) => {
          resolve(block);
        });
      });

      // Broadcast block from network1
      network1.broadcastBlock(block);

      // Wait for block to be received
      const receivedBlock = await blockReceived;
      expect(receivedBlock.header.version).toBe(1);
      expect(receivedBlock.transactions.length).toBe(1);
    });

    it('should not relay duplicate blocks', async () => {
      const outputs = [new TransactionOutputImpl('miner-address', 2500000000)];
      const transactions = [new TransactionImpl([], outputs, Date.now())];

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );

      const block = new BlockImpl(header, transactions);

      let receivedCount = 0;
      network2.on('blockReceived', () => {
        receivedCount++;
      });

      // Set up promise to wait for first block
      const firstBlockReceived = new Promise<void>((resolve) => {
        network2.once('blockReceived', () => {
          resolve();
        });
      });

      // Broadcast same block twice
      network1.broadcastBlock(block);
      
      // Wait for first block to be processed
      await firstBlockReceived;
      
      // Now broadcast duplicate
      network1.broadcastBlock(block);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should only receive once
      expect(receivedCount).toBe(1);
    });

    it('should validate block format before broadcasting', () => {
      const invalidBlock = {
        header: 'not-an-object', // Invalid
        transactions: []
      } as any;

      expect(() => {
        network1.broadcastBlock(invalidBlock);
      }).toThrow('Invalid block format');
    });

    it('should relay valid blocks to other peers', async () => {
      // Create a third network to test relaying
      const network3 = new P2PNetwork();
      await network3.startNode(18004);
      await network2.connectToPeer('localhost', 18004);
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 200));

      const outputs = [new TransactionOutputImpl('miner-address', 2500000000)];
      const transactions = [new TransactionImpl([], outputs, Date.now())];

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );

      const block = new BlockImpl(header, transactions);

      // Set up event listener for network3
      const blockReceived = new Promise<Block>((resolve) => {
        network3.once('blockReceived', ({ block }) => {
          resolve(block);
        });
      });

      // Broadcast from network1, should reach network3 via network2
      network1.broadcastBlock(block);

      // Wait for block to be relayed
      const receivedBlock = await blockReceived;
      expect(receivedBlock.header.version).toBe(1);

      await network3.stopNode();
    });
  });

  describe('Message Validation and Relay Logic', () => {
    it('should reject transactions with invalid inputs', async () => {
      const invalidInputs = [new TransactionInputImpl('', -2, '', '')]; // Invalid input (outputIndex < -1)
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const invalidTransaction = new TransactionImpl(invalidInputs, outputs, Date.now());

      let receivedCount = 0;
      network2.on('transactionReceived', () => {
        receivedCount++;
      });

      // This should not throw but should not be relayed
      network1.broadcastTransaction(invalidTransaction);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not receive invalid transaction
      expect(receivedCount).toBe(0);
    });

    it('should reject blocks with invalid headers', async () => {
      const invalidBlock = {
        header: {
          version: 'not-a-number', // Invalid
          previousHash: 'hash',
          merkleRoot: 'root',
          timestamp: Date.now(),
          difficulty: 1,
          nonce: 0
        },
        transactions: []
      } as any;

      expect(() => {
        network1.broadcastBlock(invalidBlock);
      }).toThrow('Invalid block format');
    });

    it('should track seen transactions and blocks', () => {
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );
      const block = new BlockImpl(header, []);

      // Initially should not have seen items
      expect(network1.hasSeenTransaction(transaction.id)).toBe(false);
      expect(network1.getSeenBlockCount()).toBe(0);

      // After broadcasting, should track as seen
      network1.broadcastTransaction(transaction);
      network1.broadcastBlock(block);

      expect(network1.hasSeenTransaction(transaction.id)).toBe(true);
      expect(network1.getSeenTransactionCount()).toBe(1);
      expect(network1.getSeenBlockCount()).toBe(1);
    });

    it('should clear seen items when requested', () => {
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      network1.broadcastTransaction(transaction);
      expect(network1.getSeenTransactionCount()).toBe(1);

      network1.clearSeenItems();
      expect(network1.getSeenTransactionCount()).toBe(0);
      expect(network1.getSeenBlockCount()).toBe(0);
    });
  });

  describe('Integration with Blockchain and Mempool', () => {
    it('should add received transactions to mempool', async () => {
      const outputs = [new TransactionOutputImpl('test-address', 1000)];
      const transaction = new TransactionImpl([], outputs, Date.now());

      // Mock mempool validation to return true
      vi.spyOn(mempool2, 'addTransaction').mockReturnValue(true);

      const transactionReceived = new Promise<void>((resolve) => {
        network2.once('transactionReceived', () => {
          resolve();
        });
      });

      network1.broadcastTransaction(transaction);
      await transactionReceived;

      expect(mempool2.addTransaction).toHaveBeenCalledWith(transaction);
    });

    it('should add received blocks to blockchain', async () => {
      const outputs = [new TransactionOutputImpl('miner-address', 2500000000)];
      const transactions = [new TransactionImpl([], outputs, Date.now())];

      const header = new BlockHeaderImpl(
        1,
        '0000000000000000000000000000000000000000000000000000000000000000',
        'merkle-root-hash',
        Date.now(),
        1,
        0
      );

      const block = new BlockImpl(header, transactions);

      // Mock blockchain validation to return true
      vi.spyOn(blockchain2, 'addBlock').mockResolvedValue(true);

      const blockReceived = new Promise<void>((resolve) => {
        network2.once('blockReceived', () => {
          resolve();
        });
      });

      network1.broadcastBlock(block);
      await blockReceived;

      // Wait for async blockchain operation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(blockchain2.addBlock).toHaveBeenCalledWith(block);
    });
  });
});