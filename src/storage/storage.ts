import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { IStorage, Block, UTXO } from '../interfaces';

/**
 * File-based storage implementation for blockchain data
 * Provides persistent storage for blocks, blockchain state, wallets, and UTXOs
 */
export class Storage implements IStorage {
  private readonly dataDir: string;
  private readonly blocksDir: string;
  private readonly blockchainFile: string;
  private readonly utxosFile: string;
  private readonly walletDir: string;
  private readonly checksumFile: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    this.blocksDir = path.join(dataDir, 'blocks');
    this.blockchainFile = path.join(dataDir, 'blockchain.json');
    this.utxosFile = path.join(dataDir, 'utxos.json');
    this.walletDir = path.join(dataDir, 'wallets');
    this.checksumFile = path.join(dataDir, 'checksums.json');
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.blocksDir, { recursive: true });
      await fs.mkdir(this.walletDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to initialize storage directories: ${error}`);
    }
  }

  /**
   * Save a single block to storage
   * @param block - Block to save
   */
  async saveBlock(block: Block): Promise<void> {
    try {
      await this.initialize();
      
      const blockHash = this.calculateBlockHash(block);
      const blockFile = path.join(this.blocksDir, `${blockHash}.json`);
      
      const blockData = JSON.stringify(block, null, 2);
      await fs.writeFile(blockFile, blockData, 'utf8');
      
      // Update checksum for integrity verification
      await this.updateChecksum('block', blockHash, this.calculateDataChecksum(blockData));
    } catch (error) {
      throw new Error(`Failed to save block: ${error}`);
    }
  }

  /**
   * Load a single block by hash
   * @param hash - Block hash
   * @returns Block if found, null otherwise
   */
  async loadBlock(hash: string): Promise<Block | null> {
    try {
      const blockFile = path.join(this.blocksDir, `${hash}.json`);
      
      // Check if file exists
      try {
        await fs.access(blockFile);
      } catch {
        return null;
      }

      const blockData = await fs.readFile(blockFile, 'utf8');
      
      // Verify data integrity
      const expectedChecksum = await this.getChecksum('block', hash);
      const actualChecksum = this.calculateDataChecksum(blockData);
      
      if (expectedChecksum && expectedChecksum !== actualChecksum) {
        throw new Error(`Block data corruption detected for hash: ${hash}`);
      }

      return JSON.parse(blockData) as Block;
    } catch (error) {
      throw new Error(`Failed to load block ${hash}: ${error}`);
    }
  }

  /**
   * Save the entire blockchain state
   * @param blockchain - Array of blocks representing the blockchain
   */
  async saveBlockchain(blockchain: Block[]): Promise<void> {
    try {
      await this.initialize();
      
      // Create blockchain metadata
      const blockchainData = {
        version: 1,
        blockCount: blockchain.length,
        lastUpdated: Date.now(),
        blocks: blockchain.map(block => ({
          hash: this.calculateBlockHash(block),
          height: blockchain.indexOf(block),
          timestamp: block.header.timestamp
        }))
      };

      const data = JSON.stringify(blockchainData, null, 2);
      await fs.writeFile(this.blockchainFile, data, 'utf8');
      
      // Save individual blocks
      for (const block of blockchain) {
        await this.saveBlock(block);
      }
      
      // Update blockchain checksum
      await this.updateChecksum('blockchain', 'main', this.calculateDataChecksum(data));
    } catch (error) {
      throw new Error(`Failed to save blockchain: ${error}`);
    }
  }

  /**
   * Load the entire blockchain from storage
   * @returns Array of blocks representing the blockchain
   */
  async loadBlockchain(): Promise<Block[]> {
    try {
      // Check if blockchain file exists
      try {
        await fs.access(this.blockchainFile);
      } catch {
        return []; // Return empty array if no blockchain exists
      }

      const blockchainData = await fs.readFile(this.blockchainFile, 'utf8');
      
      // Verify blockchain metadata integrity
      const expectedChecksum = await this.getChecksum('blockchain', 'main');
      const actualChecksum = this.calculateDataChecksum(blockchainData);
      
      if (expectedChecksum && expectedChecksum !== actualChecksum) {
        throw new Error('Blockchain metadata corruption detected');
      }

      const metadata = JSON.parse(blockchainData);
      const blocks: Block[] = [];

      // Load each block
      for (const blockInfo of metadata.blocks) {
        const block = await this.loadBlock(blockInfo.hash);
        if (!block) {
          throw new Error(`Missing block with hash: ${blockInfo.hash}`);
        }
        blocks.push(block);
      }

      return blocks;
    } catch (error) {
      throw new Error(`Failed to load blockchain: ${error}`);
    }
  }

  /**
   * Save wallet data to storage
   * @param walletData - Wallet data to save
   */
  async saveWallet(walletData: any): Promise<void> {
    try {
      await this.initialize();
      
      if (!walletData.address) {
        throw new Error('Wallet data must include address');
      }

      const walletFile = path.join(this.walletDir, `${walletData.address}.json`);
      const data = JSON.stringify(walletData, null, 2);
      
      await fs.writeFile(walletFile, data, 'utf8');
      
      // Update checksum
      await this.updateChecksum('wallet', walletData.address, this.calculateDataChecksum(data));
    } catch (error) {
      throw new Error(`Failed to save wallet: ${error}`);
    }
  }

  /**
   * Load wallet data from storage
   * @returns Wallet data if found, null otherwise
   */
  async loadWallet(address?: string): Promise<any> {
    try {
      if (!address) {
        // Load the first wallet found if no address specified
        const walletFiles = await fs.readdir(this.walletDir);
        if (walletFiles.length === 0) {
          return null;
        }
        address = path.basename(walletFiles[0], '.json');
      }

      const walletFile = path.join(this.walletDir, `${address}.json`);
      
      // Check if file exists
      try {
        await fs.access(walletFile);
      } catch {
        return null;
      }

      const walletData = await fs.readFile(walletFile, 'utf8');
      
      // Verify data integrity
      const expectedChecksum = await this.getChecksum('wallet', address);
      const actualChecksum = this.calculateDataChecksum(walletData);
      
      if (expectedChecksum && expectedChecksum !== actualChecksum) {
        throw new Error(`Wallet data corruption detected for address: ${address}`);
      }

      return JSON.parse(walletData);
    } catch (error) {
      throw new Error(`Failed to load wallet: ${error}`);
    }
  }

  /**
   * Save UTXO set to storage
   * @param utxos - Array of UTXOs to save
   */
  async saveUTXOs(utxos: UTXO[]): Promise<void> {
    try {
      await this.initialize();
      
      const utxoData = {
        version: 1,
        count: utxos.length,
        lastUpdated: Date.now(),
        utxos: utxos
      };

      const data = JSON.stringify(utxoData, null, 2);
      await fs.writeFile(this.utxosFile, data, 'utf8');
      
      // Update checksum
      await this.updateChecksum('utxos', 'main', this.calculateDataChecksum(data));
    } catch (error) {
      throw new Error(`Failed to save UTXOs: ${error}`);
    }
  }

  /**
   * Load UTXO set from storage
   * @returns Array of UTXOs
   */
  async loadUTXOs(): Promise<UTXO[]> {
    try {
      // Check if UTXO file exists
      try {
        await fs.access(this.utxosFile);
      } catch {
        return []; // Return empty array if no UTXOs exist
      }

      const utxoData = await fs.readFile(this.utxosFile, 'utf8');
      
      // Verify data integrity
      const expectedChecksum = await this.getChecksum('utxos', 'main');
      const actualChecksum = this.calculateDataChecksum(utxoData);
      
      if (expectedChecksum && expectedChecksum !== actualChecksum) {
        throw new Error('UTXO data corruption detected');
      }

      const data = JSON.parse(utxoData);
      return data.utxos || [];
    } catch (error) {
      throw new Error(`Failed to load UTXOs: ${error}`);
    }
  }

  /**
   * List all wallet addresses that have stored data
   * @returns Array of wallet addresses
   */
  async listWallets(): Promise<string[]> {
    try {
      await this.initialize();
      const walletFiles = await fs.readdir(this.walletDir);
      return walletFiles
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
    } catch (error) {
      console.error('Error listing wallets:', error);
      return [];
    }
  }

  /**
   * Delete a wallet from storage
   * @param address - Wallet address to delete
   * @returns True if wallet was deleted, false if not found
   */
  async deleteWallet(address: string): Promise<boolean> {
    try {
      const walletFile = path.join(this.walletDir, `${address}.json`);
      await fs.unlink(walletFile);
      
      // Remove from checksums
      const checksums = await this.loadChecksums();
      if (checksums.wallet && checksums.wallet[address]) {
        delete checksums.wallet[address];
        await fs.writeFile(this.checksumFile, JSON.stringify(checksums, null, 2), 'utf8');
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify data integrity of all stored data
   * @returns True if all data is valid, false otherwise
   */
  async verifyIntegrity(): Promise<boolean> {
    try {
      const checksums = await this.loadChecksums();
      
      // Verify blockchain
      if (checksums.blockchain?.main) {
        try {
          await fs.access(this.blockchainFile);
          const data = await fs.readFile(this.blockchainFile, 'utf8');
          if (this.calculateDataChecksum(data) !== checksums.blockchain.main) {
            return false;
          }
        } catch {
          return false;
        }
      }

      // Verify UTXOs
      if (checksums.utxos?.main) {
        try {
          await fs.access(this.utxosFile);
          const data = await fs.readFile(this.utxosFile, 'utf8');
          if (this.calculateDataChecksum(data) !== checksums.utxos.main) {
            return false;
          }
        } catch {
          return false;
        }
      }

      // Verify blocks
      if (checksums.block) {
        for (const [hash, expectedChecksum] of Object.entries(checksums.block)) {
          const blockFile = path.join(this.blocksDir, `${hash}.json`);
          try {
            const data = await fs.readFile(blockFile, 'utf8');
            if (this.calculateDataChecksum(data) !== expectedChecksum) {
              return false;
            }
          } catch {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error verifying integrity:', error);
      return false;
    }
  }

  /**
   * Calculate hash for a block
   * @param block - Block to hash
   * @returns Block hash
   */
  private calculateBlockHash(block: Block): string {
    const blockString = JSON.stringify({
      header: block.header,
      transactionCount: block.transactions.length
    });
    return crypto.createHash('sha256').update(blockString).digest('hex');
  }

  /**
   * Calculate checksum for data integrity verification
   * @param data - Data to checksum
   * @returns Checksum string
   */
  private calculateDataChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Update checksum for a data type and key
   * @param type - Data type (block, blockchain, wallet, utxos)
   * @param key - Data key/identifier
   * @param checksum - Checksum value
   */
  private async updateChecksum(type: string, key: string, checksum: string): Promise<void> {
    try {
      const checksums = await this.loadChecksums();
      
      if (!checksums[type]) {
        checksums[type] = {};
      }
      
      checksums[type][key] = checksum;
      
      await fs.writeFile(this.checksumFile, JSON.stringify(checksums, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to update checksum:', error);
    }
  }

  /**
   * Get checksum for a data type and key
   * @param type - Data type
   * @param key - Data key/identifier
   * @returns Checksum if found, null otherwise
   */
  private async getChecksum(type: string, key: string): Promise<string | null> {
    try {
      const checksums = await this.loadChecksums();
      return checksums[type]?.[key] || null;
    } catch {
      return null;
    }
  }

  /**
   * Load checksums from storage
   * @returns Checksums object
   */
  private async loadChecksums(): Promise<any> {
    try {
      await fs.access(this.checksumFile);
      const data = await fs.readFile(this.checksumFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
}