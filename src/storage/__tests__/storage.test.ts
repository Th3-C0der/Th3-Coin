import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Storage } from '../storage';
import { Block, UTXO, BlockHeader, Transaction } from '../../interfaces';

describe('Storage', () => {
  let storage: Storage;
  const testDataDir = './test-data';

  beforeEach(async () => {
    storage = new Storage(testDataDir);
    await storage.initialize();
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Block Storage', () => {
    const createTestBlock = (): Block => ({
      header: {
        version: 1,
        previousHash: '0'.repeat(64),
        merkleRoot: 'test-merkle-root',
        timestamp: Date.now(),
        difficulty: 1,
        nonce: 12345
      } as BlockHeader,
      transactions: [{
        id: 'test-tx-1',
        inputs: [],
        outputs: [{
          address: 'test-address',
          amount: 5000000000
        }],
        timestamp: Date.now()
      }] as Transaction[]
    });

    it('should save and load a block', async () => {
      const testBlock = createTestBlock();
      
      await storage.saveBlock(testBlock);
      
      // Calculate expected hash for retrieval
      const blockHash = require('crypto')
        .createHash('sha256')
        .update(JSON.stringify({
          header: testBlock.header,
          transactionCount: testBlock.transactions.length
        }))
        .digest('hex');
      
      const loadedBlock = await storage.loadBlock(blockHash);
      
      expect(loadedBlock).not.toBeNull();
      expect(loadedBlock?.header.timestamp).toBe(testBlock.header.timestamp);
      expect(loadedBlock?.transactions).toHaveLength(1);
    });

    it('should return null for non-existent block', async () => {
      const result = await storage.loadBlock('non-existent-hash');
      expect(result).toBeNull();
    });

    it('should detect block corruption', async () => {
      const testBlock = createTestBlock();
      await storage.saveBlock(testBlock);
      
      // Calculate block hash
      const blockHash = require('crypto')
        .createHash('sha256')
        .update(JSON.stringify({
          header: testBlock.header,
          transactionCount: testBlock.transactions.length
        }))
        .digest('hex');
      
      // Corrupt the block file
      const blockFile = path.join(testDataDir, 'blocks', `${blockHash}.json`);
      await fs.writeFile(blockFile, 'corrupted data', 'utf8');
      
      await expect(storage.loadBlock(blockHash)).rejects.toThrow('corruption detected');
    });
  });

  describe('Blockchain Storage', () => {
    const createTestBlockchain = (): Block[] => [
      {
        header: {
          version: 1,
          previousHash: '0'.repeat(64),
          merkleRoot: 'genesis-merkle-root',
          timestamp: Date.now() - 1000,
          difficulty: 1,
          nonce: 0
        } as BlockHeader,
        transactions: [{
          id: 'genesis-tx',
          inputs: [],
          outputs: [{
            address: 'genesis-address',
            amount: 5000000000
          }],
          timestamp: Date.now() - 1000
        }] as Transaction[]
      },
      {
        header: {
          version: 1,
          previousHash: 'previous-hash',
          merkleRoot: 'block-1-merkle-root',
          timestamp: Date.now(),
          difficulty: 1,
          nonce: 12345
        } as BlockHeader,
        transactions: [{
          id: 'tx-1',
          inputs: [],
          outputs: [{
            address: 'test-address',
            amount: 2500000000
          }],
          timestamp: Date.now()
        }] as Transaction[]
      }
    ];

    it('should save and load blockchain', async () => {
      const testBlockchain = createTestBlockchain();
      
      await storage.saveBlockchain(testBlockchain);
      const loadedBlockchain = await storage.loadBlockchain();
      
      expect(loadedBlockchain).toHaveLength(2);
      expect(loadedBlockchain[0].header.previousHash).toBe('0'.repeat(64));
      expect(loadedBlockchain[1].header.previousHash).toBe('previous-hash');
    });

    it('should return empty array for non-existent blockchain', async () => {
      const result = await storage.loadBlockchain();
      expect(result).toEqual([]);
    });

    it('should detect blockchain corruption', async () => {
      const testBlockchain = createTestBlockchain();
      await storage.saveBlockchain(testBlockchain);
      
      // Corrupt the blockchain metadata file
      const blockchainFile = path.join(testDataDir, 'blockchain.json');
      await fs.writeFile(blockchainFile, 'corrupted data', 'utf8');
      
      await expect(storage.loadBlockchain()).rejects.toThrow('corruption detected');
    });
  });

  describe('UTXO Storage', () => {
    const createTestUTXOs = (): UTXO[] => [
      {
        txId: 'tx-1',
        outputIndex: 0,
        address: 'address-1',
        amount: 1000000000,
        isSpent: false
      },
      {
        txId: 'tx-2',
        outputIndex: 1,
        address: 'address-2',
        amount: 2000000000,
        isSpent: false
      }
    ];

    it('should save and load UTXOs', async () => {
      const testUTXOs = createTestUTXOs();
      
      await storage.saveUTXOs(testUTXOs);
      const loadedUTXOs = await storage.loadUTXOs();
      
      expect(loadedUTXOs).toHaveLength(2);
      expect(loadedUTXOs[0].txId).toBe('tx-1');
      expect(loadedUTXOs[1].amount).toBe(2000000000);
    });

    it('should return empty array for non-existent UTXOs', async () => {
      const result = await storage.loadUTXOs();
      expect(result).toEqual([]);
    });

    it('should detect UTXO corruption', async () => {
      const testUTXOs = createTestUTXOs();
      await storage.saveUTXOs(testUTXOs);
      
      // Corrupt the UTXO file
      const utxoFile = path.join(testDataDir, 'utxos.json');
      await fs.writeFile(utxoFile, 'corrupted data', 'utf8');
      
      await expect(storage.loadUTXOs()).rejects.toThrow('corruption detected');
    });
  });

  describe('Wallet Storage', () => {
    const createTestWalletData = () => ({
      address: 'test-wallet-address',
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
      balance: 1000000000,
      transactionHistory: []
    });

    it('should save and load wallet data', async () => {
      const testWallet = createTestWalletData();
      
      await storage.saveWallet(testWallet);
      const loadedWallet = await storage.loadWallet(testWallet.address);
      
      expect(loadedWallet).not.toBeNull();
      expect(loadedWallet.address).toBe(testWallet.address);
      expect(loadedWallet.balance).toBe(testWallet.balance);
    });

    it('should return null for non-existent wallet', async () => {
      const result = await storage.loadWallet('non-existent-address');
      expect(result).toBeNull();
    });

    it('should load first wallet when no address specified', async () => {
      const testWallet = createTestWalletData();
      await storage.saveWallet(testWallet);
      
      const loadedWallet = await storage.loadWallet();
      expect(loadedWallet.address).toBe(testWallet.address);
    });

    it('should detect wallet corruption', async () => {
      const testWallet = createTestWalletData();
      await storage.saveWallet(testWallet);
      
      // Corrupt the wallet file
      const walletFile = path.join(testDataDir, 'wallets', `${testWallet.address}.json`);
      await fs.writeFile(walletFile, 'corrupted data', 'utf8');
      
      await expect(storage.loadWallet(testWallet.address)).rejects.toThrow('corruption detected');
    });

    it('should throw error when saving wallet without address', async () => {
      const invalidWallet = { publicKey: 'test-key' };
      
      await expect(storage.saveWallet(invalidWallet)).rejects.toThrow('must include address');
    });
  });

  describe('Data Integrity', () => {
    it('should verify integrity of all stored data', async () => {
      // Save some test data
      const testBlock: Block = {
        header: {
          version: 1,
          previousHash: '0'.repeat(64),
          merkleRoot: 'test-merkle',
          timestamp: Date.now(),
          difficulty: 1,
          nonce: 0
        } as BlockHeader,
        transactions: []
      };
      
      const testUTXOs: UTXO[] = [{
        txId: 'test-tx',
        outputIndex: 0,
        address: 'test-address',
        amount: 1000000000,
        isSpent: false
      }];
      
      await storage.saveBlock(testBlock);
      await storage.saveBlockchain([testBlock]);
      await storage.saveUTXOs(testUTXOs);
      
      const isValid = await storage.verifyIntegrity();
      expect(isValid).toBe(true);
    });

    it('should detect integrity failure', async () => {
      // Save test data
      const testUTXOs: UTXO[] = [{
        txId: 'test-tx',
        outputIndex: 0,
        address: 'test-address',
        amount: 1000000000,
        isSpent: false
      }];
      
      await storage.saveUTXOs(testUTXOs);
      
      // Corrupt the data
      const utxoFile = path.join(testDataDir, 'utxos.json');
      await fs.writeFile(utxoFile, 'corrupted', 'utf8');
      
      const isValid = await storage.verifyIntegrity();
      expect(isValid).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should create necessary directories', async () => {
      const newStorage = new Storage('./new-test-data');
      await newStorage.initialize();
      
      // Check if directories exist
      const stats = await fs.stat('./new-test-data');
      expect(stats.isDirectory()).toBe(true);
      
      const blocksStats = await fs.stat('./new-test-data/blocks');
      expect(blocksStats.isDirectory()).toBe(true);
      
      const walletsStats = await fs.stat('./new-test-data/wallets');
      expect(walletsStats.isDirectory()).toBe(true);
      
      // Cleanup
      await fs.rm('./new-test-data', { recursive: true, force: true });
    });
  });
});