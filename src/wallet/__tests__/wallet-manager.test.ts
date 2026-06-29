import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { WalletManager } from '../wallet-manager';
import { Wallet } from '../wallet';
import { CryptoUtils } from '../../core/crypto';

describe('WalletManager', () => {
  let walletManager: WalletManager;
  const testDataDir = './test-wallet-data';

  beforeEach(async () => {
    walletManager = new WalletManager(testDataDir);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Wallet Creation', () => {
    it('should create a new wallet and save it to storage', async () => {
      const wallet = await walletManager.createWallet();
      
      expect(wallet).toBeInstanceOf(Wallet);
      expect(wallet.getAddress()).toBeTruthy();
      expect(wallet.getPublicKey()).toBeTruthy();
      
      // Verify it was saved to storage
      const wallets = await walletManager.listWallets();
      expect(wallets).toContain(wallet.getAddress());
    });

    it('should create an encrypted wallet', async () => {
      const encryptionKey = 'test-encryption-key';
      const wallet = await walletManager.createWallet(encryptionKey);
      
      expect(wallet).toBeInstanceOf(Wallet);
      
      // Verify wallet data is encrypted
      const walletData = wallet.exportWalletData();
      expect(walletData.encrypted).toBe(true);
      expect(walletData.privateKey).toContain(':'); // Encrypted format includes IV
    });

    it('should set first wallet as default', async () => {
      const wallet = await walletManager.createWallet();
      
      expect(walletManager.getDefaultWalletAddress()).toBe(wallet.getAddress());
    });
  });

  describe('Wallet Import', () => {
    it('should import wallet from private key', async () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const wallet = await walletManager.importWallet(keyPair.privateKey);
      
      expect(wallet.getPrivateKey()).toBe(keyPair.privateKey);
      expect(wallet.getPublicKey()).toBe(keyPair.publicKey);
      
      // Verify it was saved to storage
      const wallets = await walletManager.listWallets();
      expect(wallets).toContain(wallet.getAddress());
    });

    it('should import encrypted wallet', async () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const encryptionKey = 'test-encryption-key';
      const wallet = await walletManager.importWallet(keyPair.privateKey, encryptionKey);
      
      expect(wallet.getRawPrivateKey()).toBe(keyPair.privateKey);
      
      // Verify wallet data is encrypted
      const walletData = wallet.exportWalletData();
      expect(walletData.encrypted).toBe(true);
    });

    it('should throw error for invalid private key', async () => {
      await expect(walletManager.importWallet('invalid-key')).rejects.toThrow();
    });
  });

  describe('Wallet Loading', () => {
    it('should load wallet from storage', async () => {
      const originalWallet = await walletManager.createWallet();
      const address = originalWallet.getAddress();
      
      // Clear cache to force loading from storage
      walletManager.clearCache();
      
      const loadedWallet = await walletManager.loadWallet(address);
      
      expect(loadedWallet).not.toBeNull();
      expect(loadedWallet!.getAddress()).toBe(address);
      expect(loadedWallet!.getPublicKey()).toBe(originalWallet.getPublicKey());
    });

    it('should load encrypted wallet with correct key', async () => {
      const encryptionKey = 'test-encryption-key';
      const originalWallet = await walletManager.createWallet(encryptionKey);
      const address = originalWallet.getAddress();
      
      // Clear cache
      walletManager.clearCache();
      
      const loadedWallet = await walletManager.loadWallet(address, encryptionKey);
      
      expect(loadedWallet).not.toBeNull();
      expect(loadedWallet!.getRawPrivateKey()).toBe(originalWallet.getRawPrivateKey());
    });

    it('should fail to load encrypted wallet without key', async () => {
      const encryptionKey = 'test-encryption-key';
      const originalWallet = await walletManager.createWallet(encryptionKey);
      const address = originalWallet.getAddress();
      
      // Clear cache
      walletManager.clearCache();
      
      const loadedWallet = await walletManager.loadWallet(address);
      expect(loadedWallet).toBeNull();
    });

    it('should return null for non-existent wallet', async () => {
      const wallet = await walletManager.loadWallet('non-existent-address');
      expect(wallet).toBeNull();
    });

    it('should load default wallet', async () => {
      const wallet1 = await walletManager.createWallet();
      const wallet2 = await walletManager.createWallet();
      
      const defaultWallet = await walletManager.loadDefaultWallet();
      
      expect(defaultWallet).not.toBeNull();
      expect(defaultWallet!.getAddress()).toBe(wallet1.getAddress()); // First wallet should be default
    });

    it('should return null when no default wallet exists', async () => {
      const defaultWallet = await walletManager.loadDefaultWallet();
      expect(defaultWallet).toBeNull();
    });
  });

  describe('Wallet Management', () => {
    it('should list all wallets', async () => {
      const wallet1 = await walletManager.createWallet();
      const wallet2 = await walletManager.createWallet();
      
      const wallets = await walletManager.listWallets();
      
      expect(wallets).toHaveLength(2);
      expect(wallets).toContain(wallet1.getAddress());
      expect(wallets).toContain(wallet2.getAddress());
    });

    it('should get wallet count', async () => {
      expect(await walletManager.getWalletCount()).toBe(0);
      
      await walletManager.createWallet();
      expect(await walletManager.getWalletCount()).toBe(1);
      
      await walletManager.createWallet();
      expect(await walletManager.getWalletCount()).toBe(2);
    });

    it('should check if wallet exists', async () => {
      const wallet = await walletManager.createWallet();
      
      expect(await walletManager.walletExists(wallet.getAddress())).toBe(true);
      expect(await walletManager.walletExists('non-existent-address')).toBe(false);
    });

    it('should delete wallet', async () => {
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      expect(await walletManager.walletExists(address)).toBe(true);
      
      const deleted = await walletManager.deleteWallet(address);
      
      expect(deleted).toBe(true);
      expect(await walletManager.walletExists(address)).toBe(false);
    });

    it('should update default wallet when default is deleted', async () => {
      const wallet1 = await walletManager.createWallet();
      const wallet2 = await walletManager.createWallet();
      
      expect(walletManager.getDefaultWalletAddress()).toBe(wallet1.getAddress());
      
      await walletManager.deleteWallet(wallet1.getAddress());
      
      expect(walletManager.getDefaultWalletAddress()).toBe(wallet2.getAddress());
    });

    it('should set default wallet', async () => {
      const wallet1 = await walletManager.createWallet();
      const wallet2 = await walletManager.createWallet();
      
      expect(walletManager.getDefaultWalletAddress()).toBe(wallet1.getAddress());
      
      const success = await walletManager.setDefaultWallet(wallet2.getAddress());
      
      expect(success).toBe(true);
      expect(walletManager.getDefaultWalletAddress()).toBe(wallet2.getAddress());
    });

    it('should fail to set non-existent wallet as default', async () => {
      const success = await walletManager.setDefaultWallet('non-existent-address');
      expect(success).toBe(false);
    });
  });

  describe('Backup and Recovery', () => {
    it('should create backup of all wallets', async () => {
      const wallet1 = await walletManager.createWallet();
      const wallet2 = await walletManager.createWallet();
      
      const backup = await walletManager.createBackup();
      
      expect(backup.wallets).toHaveLength(2);
      expect(backup.version).toBe('1.0.0');
      expect(backup.createdAt).toBeTypeOf('number');
      
      const addresses = backup.wallets.map(w => w.address);
      expect(addresses).toContain(wallet1.getAddress());
      expect(addresses).toContain(wallet2.getAddress());
    });

    it('should restore wallets from backup', async () => {
      // Create original wallets
      const wallet1 = await walletManager.createWallet();
      const wallet2 = await walletManager.createWallet();
      
      // Create backup
      const backup = await walletManager.createBackup();
      
      // Clear all wallets
      await walletManager.deleteWallet(wallet1.getAddress());
      await walletManager.deleteWallet(wallet2.getAddress());
      
      expect(await walletManager.getWalletCount()).toBe(0);
      
      // Restore from backup
      const restoredCount = await walletManager.restoreFromBackup(backup);
      
      expect(restoredCount).toBe(2);
      expect(await walletManager.getWalletCount()).toBe(2);
      
      // Verify wallets were restored correctly
      const restoredWallet1 = await walletManager.loadWallet(wallet1.getAddress());
      const restoredWallet2 = await walletManager.loadWallet(wallet2.getAddress());
      
      expect(restoredWallet1).not.toBeNull();
      expect(restoredWallet2).not.toBeNull();
      expect(restoredWallet1!.getPublicKey()).toBe(wallet1.getPublicKey());
      expect(restoredWallet2!.getPublicKey()).toBe(wallet2.getPublicKey());
    });

    it('should skip existing wallets during restore', async () => {
      const wallet = await walletManager.createWallet();
      const backup = await walletManager.createBackup();
      
      // Try to restore same backup
      const restoredCount = await walletManager.restoreFromBackup(backup);
      
      expect(restoredCount).toBe(0); // No new wallets restored
      expect(await walletManager.getWalletCount()).toBe(1); // Still only one wallet
    });

    it('should handle encrypted wallets in backup/restore', async () => {
      const encryptionKey = 'test-encryption-key';
      const wallet = await walletManager.createWallet(encryptionKey);
      
      const backup = await walletManager.createBackup();
      
      // Delete original wallet
      await walletManager.deleteWallet(wallet.getAddress());
      
      // Restore with encryption key
      const restoredCount = await walletManager.restoreFromBackup(backup, encryptionKey);
      
      expect(restoredCount).toBe(1);
      
      const restoredWallet = await walletManager.loadWallet(wallet.getAddress(), encryptionKey);
      expect(restoredWallet).not.toBeNull();
      expect(restoredWallet!.getRawPrivateKey()).toBe(wallet.getRawPrivateKey());
    });
  });

  describe('Integrity Verification', () => {
    it('should verify wallet integrity', async () => {
      await walletManager.createWallet();
      await walletManager.createWallet();
      
      const isValid = await walletManager.verifyWalletIntegrity();
      expect(isValid).toBe(true);
    });

    it('should verify storage integrity', async () => {
      await walletManager.createWallet();
      
      const isValid = await walletManager.verifyStorageIntegrity();
      expect(isValid).toBe(true);
    });
  });

  describe('Memory Cache', () => {
    it('should cache loaded wallets', async () => {
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      // Wallet should be in cache
      const cachedWallet = walletManager.getCachedWallet(address);
      expect(cachedWallet).toBe(wallet);
    });

    it('should clear cache', async () => {
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      expect(walletManager.getCachedWallet(address)).toBe(wallet);
      
      walletManager.clearCache();
      
      expect(walletManager.getCachedWallet(address)).toBeUndefined();
    });

    it('should use cache when loading existing wallet', async () => {
      const wallet = await walletManager.createWallet();
      const address = wallet.getAddress();
      
      // Load wallet again - should return cached instance
      const loadedWallet = await walletManager.loadWallet(address);
      
      expect(loadedWallet).toBe(wallet); // Same instance
    });
  });
});