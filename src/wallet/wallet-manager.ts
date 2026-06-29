import { IStorage } from '../interfaces';
import { Storage } from '../storage/storage';
import { Wallet } from './wallet';

/**
 * WalletManager handles wallet persistence and management
 * Provides secure storage and retrieval of wallet data with encryption support
 */
export class WalletManager {
  private storage: IStorage;
  private wallets: Map<string, Wallet>;
  private defaultWalletAddress?: string;

  constructor(dataDir?: string) {
    this.storage = new Storage(dataDir);
    this.wallets = new Map();
  }

  /**
   * Create a new wallet and save it to storage
   * @param encryptionKey - Optional encryption key for private key security
   * @returns Created wallet
   */
  async createWallet(encryptionKey?: string): Promise<Wallet> {
    const wallet = new Wallet(undefined, encryptionKey);
    const address = wallet.getAddress();
    
    // Add to memory cache
    this.wallets.set(address, wallet);
    
    // Save to storage
    await this.saveWallet(wallet);
    
    // Set as default if it's the first wallet
    if (!this.defaultWalletAddress) {
      this.defaultWalletAddress = address;
    }
    
    return wallet;
  }

  /**
   * Import a wallet from private key
   * @param privateKey - Private key to import
   * @param encryptionKey - Optional encryption key for storage
   * @returns Imported wallet
   */
  async importWallet(privateKey: string, encryptionKey?: string): Promise<Wallet> {
    const wallet = new Wallet(privateKey, encryptionKey);
    const address = wallet.getAddress();
    
    // Add to memory cache
    this.wallets.set(address, wallet);
    
    // Save to storage
    await this.saveWallet(wallet);
    
    // Set as default if it's the first wallet
    if (!this.defaultWalletAddress) {
      this.defaultWalletAddress = address;
    }
    
    return wallet;
  }

  /**
   * Load a wallet from storage
   * @param address - Wallet address to load
   * @param encryptionKey - Encryption key if wallet is encrypted
   * @returns Loaded wallet or null if not found
   */
  async loadWallet(address: string, encryptionKey?: string): Promise<Wallet | null> {
    try {
      // Check memory cache first
      if (this.wallets.has(address)) {
        return this.wallets.get(address)!;
      }
      
      // Load from storage
      const walletData = await this.storage.loadWallet(address);
      if (!walletData) {
        return null;
      }
      
      // Create wallet from stored data
      const wallet = Wallet.fromWalletData(walletData, encryptionKey);
      
      // Add to memory cache
      this.wallets.set(address, wallet);
      
      return wallet;
    } catch (error) {
      console.error(`Error loading wallet ${address}:`, error);
      return null;
    }
  }

  /**
   * Load the default wallet (first wallet found if no default set)
   * @param encryptionKey - Encryption key if wallet is encrypted
   * @returns Default wallet or null if no wallets exist
   */
  async loadDefaultWallet(encryptionKey?: string): Promise<Wallet | null> {
    try {
      if (this.defaultWalletAddress) {
        return await this.loadWallet(this.defaultWalletAddress, encryptionKey);
      }
      
      // Find first available wallet
      const walletAddresses = await this.listWallets();
      if (walletAddresses.length === 0) {
        return null;
      }
      
      this.defaultWalletAddress = walletAddresses[0];
      return await this.loadWallet(this.defaultWalletAddress, encryptionKey);
    } catch (error) {
      console.error('Error loading default wallet:', error);
      return null;
    }
  }

  /**
   * Save a wallet to storage
   * @param wallet - Wallet to save
   */
  async saveWallet(wallet: Wallet): Promise<void> {
    try {
      const walletData = {
        ...wallet.exportWalletData(),
        createdAt: Date.now(),
        lastUpdated: Date.now()
      };
      
      await this.storage.saveWallet(walletData);
    } catch (error) {
      throw new Error(`Failed to save wallet: ${error}`);
    }
  }

  /**
   * Delete a wallet from storage and memory
   * @param address - Wallet address to delete
   * @returns True if wallet was deleted, false if not found
   */
  async deleteWallet(address: string): Promise<boolean> {
    try {
      // Remove from memory cache
      this.wallets.delete(address);
      
      // Remove from storage
      const deleted = await this.storage.deleteWallet(address);
      
      // Update default wallet if necessary
      if (this.defaultWalletAddress === address) {
        const remainingWallets = await this.listWallets();
        this.defaultWalletAddress = remainingWallets.length > 0 ? remainingWallets[0] : undefined;
      }
      
      return deleted;
    } catch (error) {
      console.error(`Error deleting wallet ${address}:`, error);
      return false;
    }
  }

  /**
   * List all wallet addresses
   * @returns Array of wallet addresses
   */
  async listWallets(): Promise<string[]> {
    return await this.storage.listWallets();
  }

  /**
   * Get wallet count
   * @returns Number of wallets in storage
   */
  async getWalletCount(): Promise<number> {
    const wallets = await this.listWallets();
    return wallets.length;
  }

  /**
   * Check if a wallet exists
   * @param address - Wallet address to check
   * @returns True if wallet exists, false otherwise
   */
  async walletExists(address: string): Promise<boolean> {
    const wallets = await this.listWallets();
    return wallets.includes(address);
  }

  /**
   * Set default wallet
   * @param address - Address of wallet to set as default
   * @returns True if wallet exists and was set as default, false otherwise
   */
  async setDefaultWallet(address: string): Promise<boolean> {
    const exists = await this.walletExists(address);
    if (exists) {
      this.defaultWalletAddress = address;
      return true;
    }
    return false;
  }

  /**
   * Get default wallet address
   * @returns Default wallet address or undefined if none set
   */
  getDefaultWalletAddress(): string | undefined {
    return this.defaultWalletAddress;
  }

  /**
   * Create backup of all wallets
   * @returns Backup data containing all wallet information
   */
  async createBackup(): Promise<{
    wallets: any[];
    createdAt: number;
    version: string;
  }> {
    try {
      const walletAddresses = await this.listWallets();
      const wallets = [];
      
      for (const address of walletAddresses) {
        const walletData = await this.storage.loadWallet(address);
        if (walletData) {
          wallets.push(walletData);
        }
      }
      
      return {
        wallets,
        createdAt: Date.now(),
        version: '1.0.0'
      };
    } catch (error) {
      throw new Error(`Failed to create backup: ${error}`);
    }
  }

  /**
   * Restore wallets from backup
   * @param backupData - Backup data to restore from
   * @param encryptionKey - Encryption key for encrypted wallets
   * @returns Number of wallets restored
   */
  async restoreFromBackup(
    backupData: {
      wallets: any[];
      createdAt: number;
      version: string;
    },
    encryptionKey?: string
  ): Promise<number> {
    try {
      let restoredCount = 0;
      
      for (const walletData of backupData.wallets) {
        try {
          // Validate wallet data
          if (!walletData.address || !walletData.privateKey || !walletData.publicKey) {
            console.warn('Skipping invalid wallet data in backup');
            continue;
          }
          
          // Check if wallet already exists
          if (await this.walletExists(walletData.address)) {
            console.warn(`Wallet ${walletData.address} already exists, skipping`);
            continue;
          }
          
          // Create wallet from backup data
          const wallet = Wallet.fromWalletData(walletData, encryptionKey);
          
          // Add to memory cache
          this.wallets.set(walletData.address, wallet);
          
          // Save to storage
          await this.saveWallet(wallet);
          
          restoredCount++;
        } catch (error) {
          console.error(`Error restoring wallet ${walletData.address}:`, error);
        }
      }
      
      // Set default wallet if none exists
      if (!this.defaultWalletAddress && restoredCount > 0) {
        const walletAddresses = await this.listWallets();
        if (walletAddresses.length > 0) {
          this.defaultWalletAddress = walletAddresses[0];
        }
      }
      
      return restoredCount;
    } catch (error) {
      throw new Error(`Failed to restore from backup: ${error}`);
    }
  }

  /**
   * Verify integrity of all stored wallets
   * @returns True if all wallets are valid, false otherwise
   */
  async verifyWalletIntegrity(): Promise<boolean> {
    try {
      const walletAddresses = await this.listWallets();
      
      for (const address of walletAddresses) {
        const walletData = await this.storage.loadWallet(address);
        if (!walletData) {
          return false;
        }
        
        // Validate required fields
        if (!walletData.address || !walletData.privateKey || !walletData.publicKey) {
          return false;
        }
        
        // Validate address matches
        if (walletData.address !== address) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error verifying wallet integrity:', error);
      return false;
    }
  }

  /**
   * Clear all wallets from memory cache
   */
  clearCache(): void {
    this.wallets.clear();
  }

  /**
   * Get wallet from memory cache
   * @param address - Wallet address
   * @returns Wallet from cache or undefined if not cached
   */
  getCachedWallet(address: string): Wallet | undefined {
    return this.wallets.get(address);
  }

  /**
   * Check if storage integrity is valid
   * @returns True if storage is valid, false otherwise
   */
  async verifyStorageIntegrity(): Promise<boolean> {
    return await this.storage.verifyIntegrity();
  }
}