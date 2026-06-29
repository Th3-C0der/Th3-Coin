import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { BlockchainImpl } from '../blockchain';
import { BlockImpl } from '../block';
import { TransactionImpl } from '../transaction';
import { CryptoUtils } from '../crypto';
import { AddressUtils } from '../address';

describe('Blockchain Storage Integration', () => {
  let blockchain: BlockchainImpl;
  const testDataDir = './test-blockchain-data';
  
  // Generate valid addresses for testing
  const testKeyPair = CryptoUtils.generateKeyPair();
  const testAddress = AddressUtils.generateAddress(testKeyPair.publicKey);
  
  const userKeyPair = CryptoUtils.generateKeyPair();
  const userAddress = AddressUtils.generateAddress(userKeyPair.publicKey);

  beforeEach(async () => {
    blockchain = new BlockchainImpl(undefined, testDataDir);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Blockchain Initialization', () => {
    it('should create genesis block and persist to storage', async () => {
      await blockchain.initialize(testAddress);
      
      expect(blockchain.getBlockHeight()).toBe(1);
      expect(blockchain.getBalance(testAddress)).toBeGreaterThan(0);
      
      // Verify data was persisted
      const integrity = await blockchain.verifyStorageIntegrity();
      expect(integrity).toBe(true);
    });

    it('should load existing blockchain from storage', async () => {
      // First, create and persist a blockchain
      await blockchain.initialize(testAddress);
      const originalHeight = blockchain.getBlockHeight();
      const originalBalance = blockchain.getBalance(testAddress);
      
      // Create a new blockchain instance with same data directory
      const newBlockchain = new BlockchainImpl(undefined, testDataDir);
      await newBlockchain.initialize(testAddress);
      
      // Should load existing blockchain instead of creating new one
      expect(newBlockchain.getBlockHeight()).toBe(originalHeight);
      expect(newBlockchain.getBalance(testAddress)).toBe(originalBalance);
    });

    it('should rebuild UTXO set if missing from storage', async () => {
      // Create blockchain with genesis block
      await blockchain.initialize(testAddress);
      const originalBalance = blockchain.getBalance(testAddress);
      
      // Manually remove UTXO file to simulate missing UTXOs
      try {
        await fs.unlink(`${testDataDir}/utxos.json`);
      } catch {
        // File might not exist
      }
      
      // Create new blockchain instance
      const newBlockchain = new BlockchainImpl(undefined, testDataDir);
      await newBlockchain.initialize(testAddress);
      
      // Should rebuild UTXO set from blockchain
      expect(newBlockchain.getBalance(testAddress)).toBe(originalBalance);
    });
  });

  describe('Block Persistence', () => {
    it('should persist new blocks to storage', async () => {
      await blockchain.initialize(testAddress);
      
      // Create a new block
      const pendingTransactions = [
        new TransactionImpl([], [{
          address: userAddress,
          amount: 1000000000
        }], Date.now())
      ];
      
      const newBlock = BlockImpl.createBlock(
        blockchain.getLatestBlock(),
        pendingTransactions,
        testAddress,
        2500000000
      );
      
      // Mine the block (simplified - just set a valid nonce)
      newBlock.header.nonce = 0;
      while (!newBlock.hasValidProofOfWork()) {
        newBlock.header.nonce++;
        if (newBlock.header.nonce > 100000) break; // Prevent infinite loop
      }
      
      const success = await blockchain.addBlock(newBlock);
      expect(success).toBe(true);
      expect(blockchain.getBlockHeight()).toBe(2);
      
      // Verify persistence
      const integrity = await blockchain.verifyStorageIntegrity();
      expect(integrity).toBe(true);
    });

    it('should maintain data integrity across restarts', async () => {
      await blockchain.initialize(testAddress);
      
      // Add some transactions and blocks
      const tx1 = new TransactionImpl([], [{
        address: userAddress,
        amount: 1000000000
      }], Date.now());
      
      const block1 = BlockImpl.createBlock(
        blockchain.getLatestBlock(),
        [tx1],
        testAddress,
        2500000000
      );
      
      // Simple mining
      block1.header.nonce = 0;
      while (!block1.hasValidProofOfWork() && block1.header.nonce < 100000) {
        block1.header.nonce++;
      }
      
      await blockchain.addBlock(block1);
      
      const heightAfterBlock1 = blockchain.getBlockHeight();
      const balanceAfterBlock1 = blockchain.getBalance(testAddress);
      
      // Create new blockchain instance and verify data persistence
      const newBlockchain = new BlockchainImpl(undefined, testDataDir);
      await newBlockchain.initialize(testAddress);
      
      expect(newBlockchain.getBlockHeight()).toBe(heightAfterBlock1);
      expect(newBlockchain.getBalance(testAddress)).toBe(balanceAfterBlock1);
      expect(newBlockchain.getBalance(userAddress)).toBe(1000000000);
    });
  });

  describe('Chain Replacement', () => {
    it('should persist chain replacement', async () => {
      await blockchain.initialize(testAddress);
      
      // Create a longer chain
      const longerChain = [
        blockchain.getAllBlocks()[0], // Genesis block
        BlockImpl.createBlock(
          blockchain.getAllBlocks()[0],
          [],
          testAddress,
          2500000000
        ),
        BlockImpl.createBlock(
          blockchain.getAllBlocks()[0], // This would be updated in real scenario
          [],
          testAddress,
          2500000000
        )
      ];
      
      // Mine the blocks
      for (let i = 1; i < longerChain.length; i++) {
        const block = longerChain[i] as BlockImpl;
        block.header.nonce = 0;
        while (!block.hasValidProofOfWork() && block.header.nonce < 100000) {
          block.header.nonce++;
        }
        
        // Update previous hash for next block
        if (i < longerChain.length - 1) {
          (longerChain[i + 1] as BlockImpl).header.previousHash = block.getHash();
        }
      }
      
      // Update previous hashes correctly
      (longerChain[1] as BlockImpl).header.previousHash = (longerChain[0] as BlockImpl).getHash();
      (longerChain[2] as BlockImpl).header.previousHash = (longerChain[1] as BlockImpl).getHash();
      
      const replaced = await blockchain.replaceChain(longerChain);
      expect(replaced).toBe(true);
      expect(blockchain.getBlockHeight()).toBe(3);
      
      // Verify persistence
      const integrity = await blockchain.verifyStorageIntegrity();
      expect(integrity).toBe(true);
      
      // Verify persistence across restart
      const newBlockchain = new BlockchainImpl(undefined, testDataDir);
      await newBlockchain.initialize(testAddress);
      expect(newBlockchain.getBlockHeight()).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage corruption gracefully', async () => {
      await blockchain.initialize(testAddress);
      
      // Corrupt the blockchain file
      const blockchainFile = `${testDataDir}/blockchain.json`;
      await fs.writeFile(blockchainFile, 'corrupted data', 'utf8');
      
      // Should detect corruption
      const integrity = await blockchain.verifyStorageIntegrity();
      expect(integrity).toBe(false);
    });

    it('should fallback to creating new blockchain on load failure', async () => {
      // Create corrupted data directory structure
      await fs.mkdir(testDataDir, { recursive: true });
      await fs.writeFile(`${testDataDir}/blockchain.json`, 'invalid json', 'utf8');
      
      // Should fallback to creating new blockchain
      const newBlockchain = new BlockchainImpl(undefined, testDataDir);
      await newBlockchain.initialize(testAddress);
      
      expect(newBlockchain.getBlockHeight()).toBe(1);
      expect(newBlockchain.getBalance(testAddress)).toBeGreaterThan(0);
    });
  });
});