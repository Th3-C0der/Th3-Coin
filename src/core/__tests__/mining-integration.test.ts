import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MinerImpl, MiningEngine, DEFAULT_MINING_CONFIG } from '../mining';
import { BlockImpl, BlockHeaderImpl } from '../block';
import { TransactionImpl } from '../transaction';
import { CryptoUtils } from '../crypto';
import { AddressUtils } from '../address';
import { Block, Transaction, MiningConfig } from '../../interfaces';

describe('Mining Integration Tests', () => {
  let miner: MinerImpl;
  let testTransactions: Transaction[];
  let mockGetTransactions: () => Transaction[];
  let mockOnBlockMined: (block: Block) => void;
  let mockOnError: (error: Error) => void;
  let minedBlocks: Block[];
  let errors: Error[];

  beforeEach(() => {
    // Create miner with low difficulty for faster testing
    const config: MiningConfig = {
      ...DEFAULT_MINING_CONFIG,
      difficulty: 1
    };
    miner = new MinerImpl('test-miner-address', config);
    
    // Create test transactions
    testTransactions = [
      new TransactionImpl(
        [{ txId: 'prev-tx-1', outputIndex: 0, signature: 'sig1', publicKey: 'pub1' }],
        [{ address: 'recipient1', amount: 1000000000 }]
      ),
      new TransactionImpl(
        [{ txId: 'prev-tx-2', outputIndex: 0, signature: 'sig2', publicKey: 'pub2' }],
        [{ address: 'recipient2', amount: 500000000 }]
      )
    ];

    // Setup mocks
    minedBlocks = [];
    errors = [];
    
    mockGetTransactions = vi.fn(() => testTransactions);
    mockOnBlockMined = vi.fn((block: Block) => {
      minedBlocks.push(block);
    });
    mockOnError = vi.fn((error: Error) => {
      errors.push(error);
    });
  });

  afterEach(() => {
    miner.stopMining();
  });

  describe('Complete Mining Process', () => {
    it('should mine a complete block with coinbase and transactions', async () => {
      const previousHash = '0'.repeat(64);
      const block = await miner.mineBlock(testTransactions, previousHash);

      // Verify block structure
      expect(block.transactions.length).toBe(testTransactions.length + 1);
      expect(block.header.previousHash).toBe(previousHash);
      expect(block.header.difficulty).toBe(1);
      expect(block.header.nonce).toBeGreaterThan(0);

      // Verify coinbase transaction
      const coinbaseTx = new TransactionImpl(
        block.transactions[0].inputs,
        block.transactions[0].outputs,
        block.transactions[0].timestamp
      );
      expect(coinbaseTx.isCoinbase()).toBe(true);
      expect(coinbaseTx.getOutputAmount()).toBe(DEFAULT_MINING_CONFIG.blockReward);

      // Verify proof of work
      expect(miner.isValidProof(block)).toBe(true);

      // Verify included transactions
      for (let i = 0; i < testTransactions.length; i++) {
        expect(block.transactions[i + 1].id).toBe(testTransactions[i].id);
      }
    });

    it('should create valid block template', () => {
      const previousHash = 'previous-block-hash'.padEnd(64, '0');
      const difficulty = 2;
      
      const template = miner.createBlockTemplate(testTransactions, previousHash, difficulty);

      expect(template.header.previousHash).toBe(previousHash);
      expect(template.header.difficulty).toBe(difficulty);
      expect(template.header.nonce).toBe(0);
      expect(template.transactions.length).toBe(testTransactions.length + 1);

      // Verify coinbase is first
      const coinbaseTx = new TransactionImpl(
        template.transactions[0].inputs,
        template.transactions[0].outputs,
        template.transactions[0].timestamp
      );
      expect(coinbaseTx.isCoinbase()).toBe(true);
    });

    it('should validate transactions before mining', () => {
      // Generate a valid address for testing
      const keyPair = CryptoUtils.generateKeyPair();
      const validAddress = AddressUtils.generateAddress(keyPair.publicKey);

      // Create a valid transaction with proper address
      const validTx = new TransactionImpl(
        [{ txId: 'valid-tx', outputIndex: 0, signature: 'sig', publicKey: keyPair.publicKey }],
        [{ address: validAddress, amount: 1000000000 }]
      );

      // Create mix of valid and invalid transactions
      const invalidTx = new TransactionImpl(
        [], // No inputs - invalid for non-coinbase
        [{ address: 'invalid', amount: -100 }] // Negative amount
      );

      const mixedTransactions = [validTx, invalidTx];
      const validTransactions = miner.validateTransactions(mixedTransactions);

      expect(validTransactions.length).toBe(1);
      expect(validTransactions).toContain(validTx);
      expect(validTransactions).not.toContain(invalidTx);
    });

    it('should handle mining errors gracefully', async () => {
      // Create invalid configuration that should cause error
      const invalidMiner = new MinerImpl('', { // Empty address
        difficulty: -1, // Invalid difficulty
        blockReward: -100, // Invalid reward
        targetBlockTime: 0 // Invalid time
      });

      await expect(invalidMiner.mineBlock([])).rejects.toThrow();
    });
  });

  describe('Mining Engine', () => {
    it('should start and stop mining engine', () => {
      const engine = miner.getMiningEngine();
      expect(engine).toBeDefined();

      expect(engine!.isActive()).toBe(false);
      
      miner.startMining(mockGetTransactions, mockOnBlockMined, mockOnError);
      expect(miner.isMiningActive()).toBe(true);
      
      miner.stopMining();
      expect(miner.isMiningActive()).toBe(false);
    });

    it('should mine blocks continuously when transactions are available', async () => {
      // Start mining
      miner.startMining(mockGetTransactions, mockOnBlockMined, mockOnError);
      
      // Wait for at least one block to be mined
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Stop mining
      miner.stopMining();
      
      // Should have mined at least one block
      expect(minedBlocks.length).toBeGreaterThan(0);
      expect(errors.length).toBe(0);
      
      // Verify mined block
      const block = minedBlocks[0];
      expect(block.transactions.length).toBe(testTransactions.length + 1);
      expect(miner.isValidProof(block)).toBe(true);
    });

    it('should handle empty transaction pool', async () => {
      // Mock empty transaction pool
      const emptyGetTransactions = vi.fn(() => []);
      
      miner.startMining(emptyGetTransactions, mockOnBlockMined, mockOnError);
      
      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 50));
      
      miner.stopMining();
      
      // Should not have mined any blocks
      expect(minedBlocks.length).toBe(0);
      expect(errors.length).toBe(0);
    });

    it('should handle mining errors in continuous mode', async () => {
      // Mock function that throws error
      const errorGetTransactions = vi.fn(() => {
        throw new Error('Transaction pool error');
      });
      
      miner.startMining(errorGetTransactions, mockOnBlockMined, mockOnError);
      
      // Wait for error to occur
      await new Promise(resolve => setTimeout(resolve, 100));
      
      miner.stopMining();
      
      // Should have captured errors
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Transaction pool error');
    });
  });

  describe('Difficulty Adjustment Integration', () => {
    it('should calculate next difficulty based on blockchain', () => {
      // Create mock blockchain with consistent timing
      const blocks: Block[] = [];
      const baseTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const header = new BlockHeaderImpl(
          1,
          i === 0 ? '0'.repeat(64) : 'prev-hash',
          'merkle-root'.padEnd(64, '0'),
          baseTime + (i * 600 * 1000), // 600 seconds apart
          2,
          0
        );
        
        const coinbaseTx = TransactionImpl.createCoinbase('test-address', 2500000000, i);
        const block = new BlockImpl(header, [coinbaseTx]);
        blocks.push(block);
      }

      const nextDifficulty = miner.calculateNextDifficulty(blocks);
      expect(typeof nextDifficulty).toBe('number');
      expect(nextDifficulty).toBeGreaterThan(0);
    });

    it('should provide mining statistics', () => {
      const stats = miner.getMiningStats();
      
      expect(stats.minerAddress).toBe('test-miner-address');
      expect(stats.difficulty).toBe(1);
      expect(stats.blockReward).toBe(DEFAULT_MINING_CONFIG.blockReward);
      expect(stats.targetBlockTime).toBe(DEFAULT_MINING_CONFIG.targetBlockTime);
      expect(typeof stats.isMining).toBe('boolean');
      expect(typeof stats.estimatedMiningTime).toBe('number');
    });

    it('should estimate mining time based on difficulty', () => {
      const easyMiner = new MinerImpl('test', { ...DEFAULT_MINING_CONFIG, difficulty: 1 });
      const hardMiner = new MinerImpl('test', { ...DEFAULT_MINING_CONFIG, difficulty: 3 });
      
      const easyTime = easyMiner.estimateMiningTime();
      const hardTime = hardMiner.estimateMiningTime();
      
      expect(hardTime).toBeGreaterThan(easyTime);
    });
  });

  describe('Block Chain Integration', () => {
    it('should mine sequential blocks with correct previous hashes', async () => {
      const blocks: Block[] = [];
      
      // Mine genesis block
      const genesisBlock = await miner.mineBlock([], '0'.repeat(64));
      blocks.push(genesisBlock);
      
      // Mine second block
      const genesisHash = miner.calculateHash(genesisBlock);
      const secondBlock = await miner.mineBlock(testTransactions, genesisHash);
      blocks.push(secondBlock);
      
      // Verify chain integrity
      expect(blocks.length).toBe(2);
      expect(blocks[0].header.previousHash).toBe('0'.repeat(64));
      expect(blocks[1].header.previousHash).toBe(genesisHash);
      
      // Verify all blocks are valid
      for (const block of blocks) {
        expect(miner.isValidProof(block)).toBe(true);
      }
    });

    it('should handle different difficulty levels', async () => {
      const difficulties = [1, 2, 3];
      
      for (const difficulty of difficulties) {
        const block = await miner.mineBlock([], '0'.repeat(64), difficulty);
        
        expect(block.header.difficulty).toBe(difficulty);
        expect(miner.isValidProof(block)).toBe(true);
        
        // Verify hash meets difficulty requirement
        const hash = miner.calculateHash(block);
        const target = '0'.repeat(difficulty);
        expect(hash.startsWith(target)).toBe(true);
      }
    });
  });

  describe('Configuration Management', () => {
    it('should update mining configuration', () => {
      const newConfig = {
        difficulty: 3,
        blockReward: 5000000000,
        targetBlockTime: 300
      };
      
      miner.updateConfig(newConfig);
      const updatedConfig = miner.getConfig();
      
      expect(updatedConfig.difficulty).toBe(3);
      expect(updatedConfig.blockReward).toBe(5000000000);
      expect(updatedConfig.targetBlockTime).toBe(300);
    });

    it('should use custom configuration in mining', async () => {
      const customConfig: MiningConfig = {
        difficulty: 2,
        blockReward: 1000000000,
        targetBlockTime: 120
      };
      
      const customMiner = new MinerImpl('custom-miner', customConfig);
      const block = await customMiner.mineBlock([]);
      
      expect(block.header.difficulty).toBe(2);
      
      // Check coinbase reward
      const coinbaseTx = new TransactionImpl(
        block.transactions[0].inputs,
        block.transactions[0].outputs,
        block.transactions[0].timestamp
      );
      expect(coinbaseTx.getOutputAmount()).toBe(1000000000);
    });
  });
});