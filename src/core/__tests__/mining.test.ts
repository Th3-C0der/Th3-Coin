import { describe, it, expect, beforeEach } from 'vitest';
import { ProofOfWork, DifficultyAdjustment, MinerImpl, DEFAULT_MINING_CONFIG } from '../mining';
import { BlockImpl, BlockHeaderImpl } from '../block';
import { TransactionImpl } from '../transaction';
import { Block, Transaction, MiningConfig } from '../../interfaces';

describe('ProofOfWork', () => {
  let proofOfWork: ProofOfWork;
  let testBlock: BlockImpl;

  beforeEach(() => {
    proofOfWork = new ProofOfWork(2); // Difficulty 2 for faster testing
    
    // Create test block
    const header = new BlockHeaderImpl(
      1,
      '0'.repeat(64),
      'test-merkle-root'.padEnd(64, '0'),
      Date.now(),
      2,
      0
    );
    
    const coinbaseTx = TransactionImpl.createCoinbase('test-address', 2500000000, 0);
    testBlock = new BlockImpl(header, [coinbaseTx]);
    testBlock.updateMerkleRoot();
  });

  describe('calculateTarget', () => {
    it('should create correct target string for difficulty', () => {
      const pow1 = new ProofOfWork(1);
      const pow3 = new ProofOfWork(3);
      
      expect(pow1.getTarget()).toBe('0');
      expect(pow3.getTarget()).toBe('000');
    });
  });

  describe('isValidHash', () => {
    it('should validate hash against difficulty target', () => {
      expect(proofOfWork.isValidHash('00abc123')).toBe(true);
      expect(proofOfWork.isValidHash('0abc123')).toBe(false);
      expect(proofOfWork.isValidHash('abc123')).toBe(false);
      expect(proofOfWork.isValidHash('')).toBe(false);
    });
  });

  describe('mineBlock', () => {
    it('should find valid nonce for block', () => {
      const minedBlock = proofOfWork.mineBlock(testBlock);
      
      expect(minedBlock.header.nonce).toBeGreaterThan(0);
      expect(proofOfWork.validateProofOfWork(minedBlock)).toBe(true);
      
      const hash = minedBlock.calculateHash();
      expect(hash.startsWith('00')).toBe(true);
    });

    it('should update nonce until valid hash is found', () => {
      const originalNonce = testBlock.header.nonce;
      const minedBlock = proofOfWork.mineBlock(testBlock);
      
      expect(minedBlock.header.nonce).not.toBe(originalNonce);
      expect(minedBlock.header.nonce).toBeGreaterThan(0);
    });
  });

  describe('validateProofOfWork', () => {
    it('should validate correctly mined block', () => {
      const minedBlock = proofOfWork.mineBlock(testBlock);
      expect(proofOfWork.validateProofOfWork(minedBlock)).toBe(true);
    });

    it('should reject block with invalid nonce', () => {
      testBlock.header.nonce = 12345;
      expect(proofOfWork.validateProofOfWork(testBlock)).toBe(false);
    });
  });

  describe('getDifficulty', () => {
    it('should return correct difficulty level', () => {
      expect(proofOfWork.getDifficulty()).toBe(2);
    });
  });
});

describe('DifficultyAdjustment', () => {
  let difficultyAdjustment: DifficultyAdjustment;
  let testBlocks: Block[];

  beforeEach(() => {
    difficultyAdjustment = new DifficultyAdjustment(600, 5); // 5 block interval for testing
    
    // Create test blocks with timestamps
    testBlocks = [];
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
      
      const coinbaseTx = TransactionImpl.createCoinbase('test-address', 2500000000, 0);
      const block = new BlockImpl(header, [coinbaseTx]);
      testBlocks.push(block);
    }
  });

  describe('shouldAdjustDifficulty', () => {
    it('should return true at adjustment intervals', () => {
      expect(difficultyAdjustment.shouldAdjustDifficulty(5)).toBe(true);
      expect(difficultyAdjustment.shouldAdjustDifficulty(10)).toBe(true);
      expect(difficultyAdjustment.shouldAdjustDifficulty(15)).toBe(true);
    });

    it('should return false between adjustment intervals', () => {
      expect(difficultyAdjustment.shouldAdjustDifficulty(0)).toBe(false);
      expect(difficultyAdjustment.shouldAdjustDifficulty(1)).toBe(false);
      expect(difficultyAdjustment.shouldAdjustDifficulty(3)).toBe(false);
      expect(difficultyAdjustment.shouldAdjustDifficulty(7)).toBe(false);
    });
  });

  describe('calculateNewDifficulty', () => {
    it('should maintain difficulty when blocks are on time', () => {
      const newDifficulty = difficultyAdjustment.calculateNewDifficulty(
        testBlocks.slice(0, 5),
        2
      );
      expect(newDifficulty).toBe(2);
    });

    it('should increase difficulty when blocks are too fast', () => {
      // Create blocks that are too fast (quarter the target time)
      const fastBlocks = testBlocks.slice(0, 5).map((block, index) => {
        const newHeader = new BlockHeaderImpl(
          block.header.version,
          block.header.previousHash,
          block.header.merkleRoot,
          testBlocks[0].header.timestamp + (index * 150 * 1000), // 150 seconds apart (much faster)
          block.header.difficulty,
          block.header.nonce
        );
        return new BlockImpl(newHeader, block.transactions);
      });

      const newDifficulty = difficultyAdjustment.calculateNewDifficulty(fastBlocks, 2);
      expect(newDifficulty).toBe(3);
    });

    it('should decrease difficulty when blocks are too slow', () => {
      // Create blocks that are too slow (triple the target time)
      const slowBlocks = testBlocks.slice(0, 5).map((block, index) => {
        const newHeader = new BlockHeaderImpl(
          block.header.version,
          block.header.previousHash,
          block.header.merkleRoot,
          testBlocks[0].header.timestamp + (index * 1800 * 1000), // 1800 seconds apart (much slower)
          block.header.difficulty,
          block.header.nonce
        );
        return new BlockImpl(newHeader, block.transactions);
      });

      const newDifficulty = difficultyAdjustment.calculateNewDifficulty(slowBlocks, 2);
      expect(newDifficulty).toBe(1);
    });

    it('should not decrease difficulty below 1', () => {
      const slowBlocks = testBlocks.slice(0, 5).map((block, index) => {
        const newHeader = new BlockHeaderImpl(
          block.header.version,
          block.header.previousHash,
          block.header.merkleRoot,
          testBlocks[0].header.timestamp + (index * 1800 * 1000),
          block.header.difficulty,
          block.header.nonce
        );
        return new BlockImpl(newHeader, block.transactions);
      });

      const newDifficulty = difficultyAdjustment.calculateNewDifficulty(slowBlocks, 1);
      expect(newDifficulty).toBe(1);
    });

    it('should not increase difficulty above 20', () => {
      const fastBlocks = testBlocks.slice(0, 5).map((block, index) => {
        const newHeader = new BlockHeaderImpl(
          block.header.version,
          block.header.previousHash,
          block.header.merkleRoot,
          testBlocks[0].header.timestamp + (index * 150 * 1000),
          block.header.difficulty,
          block.header.nonce
        );
        return new BlockImpl(newHeader, block.transactions);
      });

      const newDifficulty = difficultyAdjustment.calculateNewDifficulty(fastBlocks, 20);
      expect(newDifficulty).toBe(20);
    });

    it('should return current difficulty for insufficient blocks', () => {
      const newDifficulty = difficultyAdjustment.calculateNewDifficulty(
        testBlocks.slice(0, 3),
        2
      );
      expect(newDifficulty).toBe(2);
    });

    it('should return current difficulty when not at adjustment interval', () => {
      const newDifficulty = difficultyAdjustment.calculateNewDifficulty(
        testBlocks.slice(0, 7), // 7 blocks, not at interval of 5
        2
      );
      expect(newDifficulty).toBe(2);
    });
  });

  describe('getters', () => {
    it('should return correct target block time', () => {
      expect(difficultyAdjustment.getTargetBlockTime()).toBe(600);
    });

    it('should return correct adjustment interval', () => {
      expect(difficultyAdjustment.getAdjustmentInterval()).toBe(5);
    });
  });
});

describe('MinerImpl', () => {
  let miner: MinerImpl;
  let testTransactions: Transaction[];

  beforeEach(() => {
    miner = new MinerImpl('test-miner-address');
    
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
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(miner.getMinerAddress()).toBe('test-miner-address');
      expect(miner.getConfig()).toEqual(DEFAULT_MINING_CONFIG);
    });

    it('should initialize with custom config', () => {
      const customConfig: MiningConfig = {
        difficulty: 3,
        blockReward: 5000000000,
        targetBlockTime: 300
      };
      
      const customMiner = new MinerImpl('custom-address', customConfig);
      expect(customMiner.getConfig()).toEqual(customConfig);
    });
  });

  describe('mineBlock', () => {
    it('should create block with coinbase transaction', async () => {
      const block = await miner.mineBlock(testTransactions);
      
      expect(block.transactions.length).toBe(testTransactions.length + 1);
      
      // First transaction should be coinbase
      const coinbaseTx = new TransactionImpl(
        block.transactions[0].inputs,
        block.transactions[0].outputs,
        block.transactions[0].timestamp
      );
      expect(coinbaseTx.isCoinbase()).toBe(true);
    });

    it('should mine block with valid proof of work', async () => {
      const block = await miner.mineBlock(testTransactions);
      
      expect(miner.isValidProof(block)).toBe(true);
      expect(block.header.nonce).toBeGreaterThan(0);
    });

    it('should set correct block reward in coinbase', async () => {
      const block = await miner.mineBlock(testTransactions);
      
      const coinbaseTx = new TransactionImpl(
        block.transactions[0].inputs,
        block.transactions[0].outputs,
        block.transactions[0].timestamp
      );
      
      expect(coinbaseTx.getOutputAmount()).toBe(DEFAULT_MINING_CONFIG.blockReward);
    });

    it('should include all provided transactions', async () => {
      const block = await miner.mineBlock(testTransactions);
      
      // Should have coinbase + provided transactions
      expect(block.transactions.length).toBe(testTransactions.length + 1);
      
      // Check that provided transactions are included (skip coinbase at index 0)
      for (let i = 0; i < testTransactions.length; i++) {
        expect(block.transactions[i + 1].id).toBe(testTransactions[i].id);
      }
    });
  });

  describe('calculateHash', () => {
    it('should calculate correct hash for block', async () => {
      const block = await miner.mineBlock([]);
      const hash1 = miner.calculateHash(block);
      const hash2 = miner.calculateHash(block);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/i.test(hash1)).toBe(true);
    });
  });

  describe('isValidProof', () => {
    it('should validate mined block proof', async () => {
      const block = await miner.mineBlock([]);
      expect(miner.isValidProof(block)).toBe(true);
    });

    it('should reject block with invalid nonce', async () => {
      const block = await miner.mineBlock([]);
      
      // Modify nonce to make proof invalid
      block.header.nonce = 0;
      expect(miner.isValidProof(block)).toBe(false);
    });
  });

  describe('mining control', () => {
    it('should start and stop mining', () => {
      expect(miner.isMiningActive()).toBe(false);
      
      miner.startMining();
      expect(miner.isMiningActive()).toBe(true);
      
      miner.stopMining();
      expect(miner.isMiningActive()).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should update mining configuration', () => {
      const updates = { difficulty: 3, blockReward: 5000000000 };
      miner.updateConfig(updates);
      
      const config = miner.getConfig();
      expect(config.difficulty).toBe(3);
      expect(config.blockReward).toBe(5000000000);
      expect(config.targetBlockTime).toBe(DEFAULT_MINING_CONFIG.targetBlockTime);
    });

    it('should return current configuration', () => {
      const config = miner.getConfig();
      expect(config).toEqual(DEFAULT_MINING_CONFIG);
    });
  });

  describe('adjustDifficulty', () => {
    it('should return current difficulty', async () => {
      const block = await miner.mineBlock([]);
      const difficulty = miner.adjustDifficulty(block);
      
      expect(difficulty).toBe(DEFAULT_MINING_CONFIG.difficulty);
    });
  });
});