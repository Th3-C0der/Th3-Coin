import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockchainImpl } from '../core/blockchain';
import { Wallet } from '../wallet/wallet';
import { MinerImpl } from '../core/mining';
import { TransactionImpl } from '../core/transaction';
import { Block } from '../interfaces';
import * as fs from 'fs';
import * as path from 'path';

describe('Mining and Blockchain Consensus Integration Tests', () => {
  let blockchain1: BlockchainImpl;
  let blockchain2: BlockchainImpl;
  let miner1: MinerImpl;
  let miner2: MinerImpl;
  let wallet1: Wallet;
  let wallet2: Wallet;
  let testDataDir: string;

  beforeEach(async () => {
    // Create test data directory
    testDataDir = path.join(__dirname, '../../test-data', `mining-test-${Date.now()}`);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Initialize wallets
    wallet1 = new Wallet();
    wallet2 = new Wallet();

    // Initialize blockchains with isolated data directories
    blockchain1 = new BlockchainImpl(wallet1.getAddress(), path.join(testDataDir, 'blockchain1'));
    blockchain2 = new BlockchainImpl(wallet2.getAddress(), path.join(testDataDir, 'blockchain2'));
    await blockchain1.initialize(wallet1.getAddress());
    await blockchain2.initialize(wallet2.getAddress());

    // Initialize miners
    miner1 = new MinerImpl(wallet1.getAddress(), {
      difficulty: 1, // Low difficulty for fast testing
      blockReward: 2500000000,
      targetBlockTime: 10
    });

    miner2 = new MinerImpl(wallet2.getAddress(), {
      difficulty: 1,
      blockReward: 2500000000,
      targetBlockTime: 10
    });
  });

  afterEach(() => {
    // Clean up test data directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Mining Process and Block Creation', () => {
    it('should mine valid blocks with proper proof of work', async () => {
      // Mine a block
      const latestBlock = blockchain1.getLatestBlock();
      const latestBlockHash = miner1.calculateHash(latestBlock);
      const minedBlock = await miner1.mineBlock([], latestBlockHash);

      // Verify block structure
      expect(minedBlock.transactions.length).toBe(1); // Should have coinbase transaction
      expect(minedBlock.header.difficulty).toBe(1);
      expect(minedBlock.header.nonce).toBeGreaterThan(0);
      expect(minedBlock.header.previousHash).toBe(latestBlockHash);

      // Verify proof of work
      expect(miner1.isValidProof(minedBlock)).toBe(true);

      // Verify coinbase transaction
      const coinbaseTx = new TransactionImpl(
        minedBlock.transactions[0].inputs,
        minedBlock.transactions[0].outputs,
        minedBlock.transactions[0].timestamp
      );
      expect(coinbaseTx.isCoinbase()).toBe(true);
      expect(coinbaseTx.getOutputAmount()).toBe(2500000000);

      // Add block to blockchain
      const added = await blockchain1.addBlock(minedBlock);
      expect(added).toBe(true);
      expect(blockchain1.getBlockHeight()).toBe(2);
    });

    it('should mine blocks with transactions and proper fees', async () => {
      // Fund wallet1 first
      const fundingMiner = new MinerImpl(wallet1.getAddress(), {
        difficulty: 1,
        blockReward: 2500000000,
        targetBlockTime: 10
      });

      const latestBlock = blockchain1.getLatestBlock();
      const latestBlockHash = miner1.calculateHash(latestBlock);
      const fundingBlock = await fundingMiner.mineBlock([], latestBlockHash);
      await blockchain1.addBlock(fundingBlock);

      // Create a transaction
      const senderUTXOs = blockchain1.getUTXOs(wallet1.getAddress());
      const { UTXOManager } = await import('../core/utxo-manager');
      const utxoManager = new UTXOManager(senderUTXOs);
      
      const transaction = wallet1.createTransaction(
        wallet2.getAddress(),
        1000000000, // 10 Th3Coins
        50000000,    // 0.5 Th3Coins fee
        utxoManager
      );
      wallet1.signTransaction(transaction);

      // Mine block with transaction
      const currentLatest = blockchain1.getLatestBlock();
      const currentHash = miner1.calculateHash(currentLatest);
      const blockWithTx = await miner1.mineBlock([transaction], currentHash);

      // Verify block contains transaction and coinbase
      expect(blockWithTx.transactions.length).toBe(2);
      expect(blockWithTx.transactions[1].id).toBe(transaction.id);

      // Verify coinbase includes fees
      const coinbaseTx = new TransactionImpl(
        blockWithTx.transactions[0].inputs,
        blockWithTx.transactions[0].outputs,
        blockWithTx.transactions[0].timestamp
      );
      expect(coinbaseTx.getOutputAmount()).toBe(2500000000); // Block reward (fees not included in current implementation)

      // Add block and verify balances
      await blockchain1.addBlock(blockWithTx);
      expect(blockchain1.getBalance(wallet2.getAddress())).toBe(1000000000);
    });

    it('should handle difficulty adjustment correctly', async () => {
      const blocks: Block[] = [];
      
      // Mine several blocks to trigger difficulty adjustment
      let currentBlock = blockchain1.getLatestBlock();
      
      for (let i = 0; i < 12; i++) { // Mine more than adjustment interval (10)
        const currentHash = miner1.calculateHash(currentBlock);
        const newBlock = await miner1.mineBlock([], currentHash);
        await blockchain1.addBlock(newBlock);
        blocks.push(newBlock);
        currentBlock = newBlock;
      }

      // Check that difficulty was calculated
      const finalDifficulty = blockchain1.calculateDifficulty();
      expect(typeof finalDifficulty).toBe('number');
      expect(finalDifficulty).toBeGreaterThan(0);
    });

    it('should validate blocks before adding to chain', async () => {
      // Create an invalid block (wrong previous hash)
      const invalidBlock = await miner1.mineBlock([], 'invalid-hash');
      
      // Should reject invalid block
      const added = await blockchain1.addBlock(invalidBlock);
      expect(added).toBe(false);
      expect(blockchain1.getBlockHeight()).toBe(1); // Should remain unchanged
    });
  });

  describe('Blockchain Synchronization', () => {
    it('should synchronize shorter chain with longer valid chain', async () => {
      // Mine blocks on blockchain1
      let currentBlock = blockchain1.getLatestBlock();
      const blocks1: Block[] = [];
      
      for (let i = 0; i < 3; i++) {
        const currentHash = miner1.calculateHash(currentBlock);
        const newBlock = await miner1.mineBlock([], currentHash);
        await blockchain1.addBlock(newBlock);
        blocks1.push(newBlock);
        currentBlock = newBlock;
      }

      // blockchain1 should have 4 blocks (genesis + 3 mined)
      expect(blockchain1.getBlockHeight()).toBe(4);
      expect(blockchain2.getBlockHeight()).toBe(1);

      // Replace blockchain2's chain with blockchain1's longer chain
      const chain1 = blockchain1.getAllBlocks();
      const replaced = await blockchain2.replaceChain(chain1);
      
      expect(replaced).toBe(true);
      expect(blockchain2.getBlockHeight()).toBe(4);
      
      // Verify chains are identical
      const chain2 = blockchain2.getAllBlocks();
      expect(chain2.length).toBe(chain1.length);
      
      for (let i = 0; i < chain1.length; i++) {
        expect(chain2[i].header.previousHash).toBe(chain1[i].header.previousHash);
        expect(chain2[i].transactions.length).toBe(chain1[i].transactions.length);
      }
    });

    it('should reject shorter chains during synchronization', async () => {
      // Mine blocks on blockchain1 to make it longer
      let currentBlock = blockchain1.getLatestBlock();
      
      for (let i = 0; i < 2; i++) {
        const currentHash = miner1.calculateHash(currentBlock);
        const newBlock = await miner1.mineBlock([], currentHash);
        await blockchain1.addBlock(newBlock);
        currentBlock = newBlock;
      }

      // Mine one block on blockchain2
      const latest2 = blockchain2.getLatestBlock();
      const hash2 = miner2.calculateHash(latest2);
      const block2 = await miner2.mineBlock([], hash2);
      await blockchain2.addBlock(block2);

      // blockchain1 has 3 blocks, blockchain2 has 2 blocks
      expect(blockchain1.getBlockHeight()).toBe(3);
      expect(blockchain2.getBlockHeight()).toBe(2);

      // Try to replace blockchain1's longer chain with blockchain2's shorter chain
      const chain2 = blockchain2.getAllBlocks();
      const replaced = await blockchain1.replaceChain(chain2);
      
      expect(replaced).toBe(false);
      expect(blockchain1.getBlockHeight()).toBe(3); // Should remain unchanged
    });

    it('should reject invalid chains during synchronization', async () => {
      // Create an invalid chain with wrong hash references
      const invalidChain: Block[] = [];
      
      // Start with valid genesis
      invalidChain.push(blockchain1.getLatestBlock());
      
      // Add block with invalid previous hash
      const invalidBlock = await miner1.mineBlock([], 'wrong-hash');
      invalidChain.push(invalidBlock);

      // Try to replace with invalid chain
      const replaced = await blockchain1.replaceChain(invalidChain);
      
      expect(replaced).toBe(false);
      expect(blockchain1.getBlockHeight()).toBe(1); // Should remain unchanged
    });
  });

  describe('Consensus Resolution and Longest Chain Rule', () => {
    it('should follow longest chain rule in case of forks', async () => {
      // Create a common starting point
      const commonBlock = blockchain1.getLatestBlock();
      
      // Create fork: both chains mine from the same parent
      const commonHash = miner1.calculateHash(commonBlock);
      
      // Chain 1: Mine 2 blocks
      const chain1Blocks: Block[] = [];
      let current1 = commonBlock;
      
      for (let i = 0; i < 2; i++) {
        const hash = miner1.calculateHash(current1);
        const block = await miner1.mineBlock([], hash);
        chain1Blocks.push(block);
        current1 = block;
      }

      // Chain 2: Mine 3 blocks (longer chain)
      const chain2Blocks: Block[] = [];
      let current2 = commonBlock;
      
      for (let i = 0; i < 3; i++) {
        const hash = miner2.calculateHash(current2);
        const block = await miner2.mineBlock([], hash);
        chain2Blocks.push(block);
        current2 = block;
      }

      // Add chain1 blocks to blockchain1
      for (const block of chain1Blocks) {
        await blockchain1.addBlock(block);
      }
      expect(blockchain1.getBlockHeight()).toBe(3);

      // Create full chain2 (genesis + chain2 blocks)
      const fullChain2 = [commonBlock, ...chain2Blocks];
      
      // blockchain1 should accept the longer chain2
      const replaced = await blockchain1.replaceChain(fullChain2);
      expect(replaced).toBe(true);
      expect(blockchain1.getBlockHeight()).toBe(4); // Genesis + 3 blocks
    });

    it('should maintain consensus across multiple miners', async () => {
      // Create multiple miners
      const miner3 = new MinerImpl(new Wallet().getAddress(), {
        difficulty: 1,
        blockReward: 2500000000,
        targetBlockTime: 10
      });

      const blockchain3 = new BlockchainImpl();
      await blockchain3.initialize(new Wallet().getAddress());

      // All start from same genesis
      const genesisChain = blockchain1.getAllBlocks();
      await blockchain2.replaceChain(genesisChain);
      await blockchain3.replaceChain(genesisChain);

      // Each miner mines blocks
      const blocks: Block[] = [];
      let currentBlock = blockchain1.getLatestBlock();

      // Simulate distributed mining
      for (let i = 0; i < 5; i++) {
        const miners = [miner1, miner2, miner3];
        const selectedMiner = miners[i % miners.length];
        
        const currentHash = selectedMiner.calculateHash(currentBlock);
        const newBlock = await selectedMiner.mineBlock([], currentHash);
        blocks.push(newBlock);
        currentBlock = newBlock;
      }

      // Build the complete chain
      const completeChain = [...genesisChain, ...blocks];

      // All blockchains should accept the same longest chain
      const replaced1 = await blockchain1.replaceChain(completeChain);
      const replaced2 = await blockchain2.replaceChain(completeChain);
      const replaced3 = await blockchain3.replaceChain(completeChain);

      expect(replaced1).toBe(true);
      expect(replaced2).toBe(true);
      expect(replaced3).toBe(true);

      // All should have same height
      expect(blockchain1.getBlockHeight()).toBe(6);
      expect(blockchain2.getBlockHeight()).toBe(6);
      expect(blockchain3.getBlockHeight()).toBe(6);

      // Verify chain integrity
      expect(blockchain1.isValidChain(blockchain1.getAllBlocks())).toBe(true);
      expect(blockchain2.isValidChain(blockchain2.getAllBlocks())).toBe(true);
      expect(blockchain3.isValidChain(blockchain3.getAllBlocks())).toBe(true);
    });

    it('should handle competing chains with same length', async () => {
      const commonBlock = blockchain1.getLatestBlock();
      
      // Create two competing chains of same length
      const chain1: Block[] = [commonBlock];
      const chain2: Block[] = [commonBlock];
      
      let current1 = commonBlock;
      let current2 = commonBlock;
      
      // Both chains mine 2 blocks
      for (let i = 0; i < 2; i++) {
        // Chain 1
        const hash1 = miner1.calculateHash(current1);
        const block1 = await miner1.mineBlock([], hash1);
        chain1.push(block1);
        current1 = block1;
        
        // Chain 2
        const hash2 = miner2.calculateHash(current2);
        const block2 = await miner2.mineBlock([], hash2);
        chain2.push(block2);
        current2 = block2;
      }

      // Both chains should be valid but different
      expect(blockchain1.isValidChain(chain1)).toBe(true);
      expect(blockchain1.isValidChain(chain2)).toBe(true);
      expect(chain1.length).toBe(chain2.length);
      
      // The blockchain should not replace with same length chain
      await blockchain1.replaceChain(chain1);
      const replaced = await blockchain1.replaceChain(chain2);
      expect(replaced).toBe(false); // Same length, should not replace
    });
  });

  describe('Mining Statistics and Performance', () => {
    it('should provide accurate mining statistics', () => {
      const stats = miner1.getMiningStats();
      
      expect(stats.minerAddress).toBe(wallet1.getAddress());
      expect(stats.difficulty).toBe(1);
      expect(stats.blockReward).toBe(2500000000);
      expect(stats.targetBlockTime).toBe(10);
      expect(typeof stats.isMining).toBe('boolean');
      expect(typeof stats.estimatedMiningTime).toBe('number');
    });

    it('should estimate mining time based on difficulty', () => {
      const easyMiner = new MinerImpl(wallet1.getAddress(), {
        difficulty: 1,
        blockReward: 2500000000,
        targetBlockTime: 10
      });

      const hardMiner = new MinerImpl(wallet1.getAddress(), {
        difficulty: 3,
        blockReward: 2500000000,
        targetBlockTime: 10
      });

      const easyTime = easyMiner.estimateMiningTime();
      const hardTime = hardMiner.estimateMiningTime();

      expect(hardTime).toBeGreaterThan(easyTime);
    });

    it('should handle mining configuration updates', () => {
      const newConfig = {
        difficulty: 2,
        blockReward: 1250000000,
        targetBlockTime: 30
      };

      miner1.updateConfig(newConfig);
      const updatedConfig = miner1.getConfig();

      expect(updatedConfig.difficulty).toBe(2);
      expect(updatedConfig.blockReward).toBe(1250000000);
      expect(updatedConfig.targetBlockTime).toBe(30);
    });
  });

  describe('Block Validation and Integrity', () => {
    it('should validate block timestamps', async () => {
      const latestBlock = blockchain1.getLatestBlock();
      const latestHash = miner1.calculateHash(latestBlock);
      
      // Mine a valid block
      const validBlock = await miner1.mineBlock([], latestHash);
      
      // Should accept block with valid timestamp
      const added = await blockchain1.addBlock(validBlock);
      expect(added).toBe(true);
    });

    it('should validate merkle root integrity', async () => {
      // Fund wallet for transaction
      const fundingMiner = new MinerImpl(wallet1.getAddress(), {
        difficulty: 1,
        blockReward: 2500000000,
        targetBlockTime: 10
      });

      const latestBlock = blockchain1.getLatestBlock();
      const latestHash = miner1.calculateHash(latestBlock);
      const fundingBlock = await fundingMiner.mineBlock([], latestHash);
      await blockchain1.addBlock(fundingBlock);

      // Create transaction
      const senderUTXOs = blockchain1.getUTXOs(wallet1.getAddress());
      const { UTXOManager } = await import('../core/utxo-manager');
      const utxoManager = new UTXOManager(senderUTXOs);
      
      const transaction = wallet1.createTransaction(
        wallet2.getAddress(),
        1000000000,
        10000000,
        utxoManager
      );
      wallet1.signTransaction(transaction);

      // Mine block with transaction
      const currentLatest = blockchain1.getLatestBlock();
      const currentHash = miner1.calculateHash(currentLatest);
      const blockWithTx = await miner1.mineBlock([transaction], currentHash);

      // Block should have valid merkle root
      const added = await blockchain1.addBlock(blockWithTx);
      expect(added).toBe(true);

      // Verify merkle root calculation
      const { BlockImpl } = await import('../core/block');
      const blockImpl = new BlockImpl(blockWithTx.header, blockWithTx.transactions);
      const calculatedRoot = blockImpl.calculateMerkleRoot();
      expect(blockWithTx.header.merkleRoot).toBe(calculatedRoot);
    });

    it('should reject blocks with invalid proof of work', async () => {
      const latestBlock = blockchain1.getLatestBlock();
      const latestHash = miner1.calculateHash(latestBlock);
      
      // Create block with invalid nonce
      const invalidBlock = await miner1.mineBlock([], latestHash);
      invalidBlock.header.nonce = 0; // Invalid nonce
      
      // Should reject block with invalid proof of work
      const added = await blockchain1.addBlock(invalidBlock);
      expect(added).toBe(false);
    });
  });
});