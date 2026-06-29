import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { WalletManager } from '../wallet-manager';
import { BlockchainImpl } from '../../core/blockchain';
import { Wallet } from '../wallet';

describe('Wallet Persistence Integration', () => {
  let walletManager: WalletManager;
  let blockchain: BlockchainImpl;
  const testDataDir = './test-wallet-integration-data';

  beforeEach(async () => {
    walletManager = new WalletManager(testDataDir);
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

  describe('Wallet and Blockchain Integration', () => {
    it('should persist wallet and use it with blockchain', async () => {
      // Create a wallet
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      // Initialize blockchain with this wallet as miner
      await blockchain.initialize(address);
      
      // Verify wallet has balance from genesis block
      const balance = blockchain.getBalance(address);
      expect(balance).toBeGreaterThan(0);
      
      // Clear wallet cache and reload
      walletManager.clearCache();
      const reloadedWallet = await walletManager.loadWallet(address);
      
      expect(reloadedWallet).not.toBeNull();
      expect(reloadedWallet!.getAddress()).toBe(address);
      
      // Verify blockchain still recognizes the address
      const balanceAfterReload = blockchain.getBalance(address);
      expect(balanceAfterReload).toBe(balance);
    });

    it('should handle encrypted wallet with blockchain', async () => {
      const encryptionKey = 'test-encryption-key';
      
      // Create encrypted wallet
      const wallet = await walletManager.createWallet(encryptionKey);
      const address = wallet.getAddress();
      
      // Initialize blockchain
      await blockchain.initialize(address);
      
      // Verify balance
      const balance = blockchain.getBalance(address);
      expect(balance).toBeGreaterThan(0);
      
      // Restart wallet manager (simulate app restart)
      const newWalletManager = new WalletManager(testDataDir);
      
      // Load encrypted wallet
      const reloadedWallet = await newWalletManager.loadWallet(address, encryptionKey);
      
      expect(reloadedWallet).not.toBeNull();
      expect(reloadedWallet!.getAddress()).toBe(address);
      expect(reloadedWallet!.getRawPrivateKey()).toBe(wallet.getRawPrivateKey());
    });

    it('should maintain wallet data across blockchain restarts', async () => {
      // Create wallet and initialize blockchain
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      await blockchain.initialize(address);
      const originalBalance = blockchain.getBalance(address);
      
      // Create new blockchain instance (simulate restart)
      const newBlockchain = new BlockchainImpl(undefined, testDataDir);
      await newBlockchain.initialize(address);
      
      // Verify balance is maintained
      const newBalance = newBlockchain.getBalance(address);
      expect(newBalance).toBe(originalBalance);
      
      // Verify wallet can still be loaded
      const reloadedWallet = await walletManager.loadWallet(address);
      expect(reloadedWallet).not.toBeNull();
      expect(reloadedWallet!.getAddress()).toBe(address);
    });

    it('should handle multiple wallets with blockchain', async () => {
      // Create multiple wallets
      const wallet1 = await walletManager.createWallet();
      const wallet2 = await walletManager.createWallet();
      
      const address1 = wallet1.getAddress();
      const address2 = wallet2.getAddress();
      
      // Initialize blockchain with first wallet
      await blockchain.initialize(address1);
      
      // Verify first wallet has balance, second doesn't
      expect(blockchain.getBalance(address1)).toBeGreaterThan(0);
      expect(blockchain.getBalance(address2)).toBe(0);
      
      // Restart and verify both wallets are still accessible
      const newWalletManager = new WalletManager(testDataDir);
      
      const reloadedWallet1 = await newWalletManager.loadWallet(address1);
      const reloadedWallet2 = await newWalletManager.loadWallet(address2);
      
      expect(reloadedWallet1).not.toBeNull();
      expect(reloadedWallet2).not.toBeNull();
      expect(reloadedWallet1!.getAddress()).toBe(address1);
      expect(reloadedWallet2!.getAddress()).toBe(address2);
    });
  });

  describe('Wallet Backup with Blockchain Data', () => {
    it('should create complete backup including wallet and blockchain state', async () => {
      // Create wallet and initialize blockchain
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      await blockchain.initialize(address);
      
      // Create wallet backup
      const walletBackup = await walletManager.createBackup();
      
      // Verify backup contains wallet data
      expect(walletBackup.wallets).toHaveLength(1);
      expect(walletBackup.wallets[0].address).toBe(address);
      
      // Verify blockchain data is also persisted
      const blockchainIntegrity = await blockchain.verifyStorageIntegrity();
      expect(blockchainIntegrity).toBe(true);
    });

    it('should restore wallet and maintain blockchain compatibility', async () => {
      // Create original setup
      const originalWallet = await walletManager.createWallet();
      const address = originalWallet.getAddress();
      
      await blockchain.initialize(address);
      const originalBalance = blockchain.getBalance(address);
      
      // Create backup
      const backup = await walletManager.createBackup();
      
      // Delete wallet
      await walletManager.deleteWallet(address);
      
      // Restore wallet
      const restoredCount = await walletManager.restoreFromBackup(backup);
      expect(restoredCount).toBe(1);
      
      // Verify wallet works with existing blockchain
      const restoredWallet = await walletManager.loadWallet(address);
      expect(restoredWallet).not.toBeNull();
      
      // Verify blockchain still recognizes the wallet
      const balanceAfterRestore = blockchain.getBalance(address);
      expect(balanceAfterRestore).toBe(originalBalance);
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted wallet data gracefully', async () => {
      // Create wallet
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      // Corrupt wallet file
      const walletFile = `${testDataDir}/wallets/${address}.json`;
      await fs.writeFile(walletFile, 'corrupted data', 'utf8');
      
      // Clear cache to force loading from storage
      walletManager.clearCache();
      
      // Should return null for corrupted wallet
      const loadedWallet = await walletManager.loadWallet(address);
      expect(loadedWallet).toBeNull();
    });

    it('should handle missing wallet files', async () => {
      // Try to load non-existent wallet
      const wallet = await walletManager.loadWallet('non-existent-address');
      expect(wallet).toBeNull();
    });

    it('should verify wallet integrity detects corruption', async () => {
      // Create wallet
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      // Corrupt wallet file
      const walletFile = `${testDataDir}/wallets/${address}.json`;
      await fs.writeFile(walletFile, '{"invalid": "data"}', 'utf8');
      
      // Integrity check should fail
      const isValid = await walletManager.verifyWalletIntegrity();
      expect(isValid).toBe(false);
    });
  });

  describe('Performance and Caching', () => {
    it('should cache wallets for better performance', async () => {
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      // First load should cache the wallet
      const loadedWallet1 = await walletManager.loadWallet(address);
      const loadedWallet2 = await walletManager.loadWallet(address);
      
      // Should return same instance from cache
      expect(loadedWallet1).toBe(loadedWallet2);
    });

    it('should handle multiple concurrent wallet operations', async () => {
      // Create multiple wallets concurrently
      const walletPromises = Array.from({ length: 5 }, () => 
        walletManager.createWallet()
      );
      
      const wallets = await Promise.all(walletPromises);
      
      // Verify all wallets were created successfully
      expect(wallets).toHaveLength(5);
      
      const addresses = wallets.map(w => w.getAddress());
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(5); // All addresses should be unique
      
      // Verify all wallets are in storage
      const storedWallets = await walletManager.listWallets();
      expect(storedWallets).toHaveLength(5);
      
      for (const address of addresses) {
        expect(storedWallets).toContain(address);
      }
    });
  });
});