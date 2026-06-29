import { IBlockchain, Block, Transaction, UTXO, IStorage } from '../interfaces';
import { BlockImpl } from './block';
import { TransactionImpl } from './transaction';
import { UTXOManager } from './utxo-manager';
import { TransactionValidator } from './transaction-validator';
import { CryptoUtils } from './crypto';
import { Storage } from '../storage/storage';

/**
 * Blockchain class manages the chain of blocks and provides validation logic
 * Implements the core blockchain functionality including block validation and consensus
 */
export class BlockchainImpl implements IBlockchain {
  private blocks: Block[];
  private utxoManager: UTXOManager;
  private storage: IStorage;
  private readonly genesisReward: number = 5000000000; // 50 Th3Coins
  private readonly blockReward: number = 2500000000; // 25 Th3Coins
  private readonly targetBlockTime: number = 600; // 10 minutes in seconds
  private readonly difficultyAdjustmentInterval: number = 10; // Adjust every 10 blocks

  constructor(genesisAddress?: string, dataDir?: string) {
    this.blocks = [];
    this.utxoManager = new UTXOManager();
    this.storage = new Storage(dataDir);
    
    // Note: Initialization must be called separately as it's async
  }

  /**
   * Initialize the blockchain (must be called after construction)
   * @param genesisAddress - Address for genesis block if creating new blockchain
   */
  async initialize(genesisAddress?: string): Promise<void> {
    if (genesisAddress) {
      await this.initializeBlockchain(genesisAddress);
    }
  }

  /**
   * Initialize blockchain by loading from storage or creating genesis block
   * @param genesisAddress - Address for genesis block if creating new blockchain
   */
  private async initializeBlockchain(genesisAddress: string): Promise<void> {
    try {
      // Try to load existing blockchain
      const existingBlocks = await this.storage.loadBlockchain();
      
      if (existingBlocks.length > 0) {
        console.log(`Loading existing blockchain with ${existingBlocks.length} blocks`);
        this.blocks = existingBlocks;
        
        // Load and rebuild UTXO set
        const existingUTXOs = await this.storage.loadUTXOs();
        if (existingUTXOs.length > 0) {
          this.utxoManager.loadUTXOs(existingUTXOs);
        } else {
          // Rebuild UTXO set from blockchain if not found in storage
          await this.rebuildUTXOSet();
        }
      } else {
        console.log('No existing blockchain found, creating genesis block');
        await this.createGenesisBlock(genesisAddress);
      }
    } catch (error) {
      console.error('Error initializing blockchain:', error);
      // Fall back to creating new blockchain
      await this.createGenesisBlock(genesisAddress);
    }
  }

  /**
   * Add a new block to the blockchain
   * @param block - Block to add
   * @returns True if block was added successfully, false otherwise
   */
  async addBlock(block: Block): Promise<boolean> {
    try {
      // Validate the block
      if (!this.validateBlock(block)) {
        return false;
      }

      // Add block to chain
      this.blocks.push(block);

      // Update UTXO set with block transactions
      for (const transaction of block.transactions) {
        await this.utxoManager.processTransaction(transaction);
      }

      // Persist the updated blockchain and UTXO set
      await this.persistBlockchain();

      return true;
    } catch (error) {
      console.error('Error adding block:', error);
      return false;
    }
  }

  /**
   * Get block by hash
   * @param hash - Block hash
   * @returns Block if found, null otherwise
   */
  async getBlock(hash: string): Promise<Block | null> {
    const blockImpl = this.blocks.find(block => {
      if (block instanceof BlockImpl) {
        return block.getHash() === hash;
      }
      // For interface blocks, calculate hash
      const impl = new BlockImpl(block.header, block.transactions);
      return impl.getHash() === hash;
    });

    return blockImpl || null;
  }

  /**
   * Get the latest block in the chain
   * @returns Latest block
   */
  getLatestBlock(): Block {
    if (this.blocks.length === 0) {
      throw new Error('No blocks in blockchain');
    }
    return this.blocks[this.blocks.length - 1];
  }

  /**
   * Validate a block before adding it to the chain
   * @param block - Block to validate
   * @returns True if block is valid, false otherwise
   */
  validateBlock(block: Block): boolean {
    try {
      const blockImpl = new BlockImpl(block.header, block.transactions);

      // Basic block structure validation
      if (!blockImpl.isValid()) {
        console.error('Block structure validation failed');
        return false;
      }

      // Genesis block validation
      if (this.blocks.length === 0) {
        return this.validateGenesisBlock(blockImpl);
      }

      // Regular block validation
      return this.validateRegularBlock(blockImpl);
    } catch (error) {
      console.error('Block validation error:', error);
      return false;
    }
  }

  /**
   * Calculate the current difficulty for mining
   * @returns Current difficulty level
   */
  calculateDifficulty(): number {
    if (this.blocks.length === 0) {
      return 1; // Genesis difficulty
    }

    // Don't adjust difficulty until we have enough blocks
    if (this.blocks.length < this.difficultyAdjustmentInterval) {
      return this.getLatestBlock().header.difficulty;
    }

    // Only adjust at intervals
    if (this.blocks.length % this.difficultyAdjustmentInterval !== 0) {
      return this.getLatestBlock().header.difficulty;
    }

    // Calculate time taken for last interval
    const latestBlock = this.getLatestBlock();
    const intervalStartBlock = this.blocks[this.blocks.length - this.difficultyAdjustmentInterval];
    
    const timeTaken = (latestBlock.header.timestamp - intervalStartBlock.header.timestamp) / 1000; // Convert to seconds
    const expectedTime = this.targetBlockTime * this.difficultyAdjustmentInterval;

    // Calculate new difficulty
    const currentDifficulty = latestBlock.header.difficulty;
    
    if (timeTaken < expectedTime / 2) {
      // Blocks are being mined too fast, increase difficulty
      return Math.min(currentDifficulty + 1, 20); // Cap at difficulty 20
    } else if (timeTaken > expectedTime * 2) {
      // Blocks are being mined too slow, decrease difficulty
      return Math.max(currentDifficulty - 1, 1); // Minimum difficulty 1
    }

    return currentDifficulty;
  }

  /**
   * Get balance for an address
   * @param address - Address to check balance for
   * @returns Balance amount
   */
  getBalance(address: string): number {
    return this.utxoManager.getBalance(address);
  }

  /**
   * Get current block height
   * @returns Number of blocks in the chain
   */
  getBlockHeight(): number {
    return this.blocks.length;
  }

  /**
   * Get UTXOs for an address
   * @param address - Address to get UTXOs for
   * @returns Array of UTXOs
   */
  getUTXOs(address: string): UTXO[] {
    return this.utxoManager.getUTXOsForAddress(address);
  }

  /**
   * Get all blocks in the chain
   * @returns Array of all blocks
   */
  getAllBlocks(): Block[] {
    return [...this.blocks];
  }

  /**
   * Replace the current chain with a longer valid chain
   * @param newChain - New blockchain to replace current chain
   * @returns True if chain was replaced, false otherwise
   */
  async replaceChain(newChain: Block[]): Promise<boolean> {
    // New chain must be longer
    if (newChain.length <= this.blocks.length) {
      return false;
    }

    // Validate the entire new chain
    if (!this.isValidChain(newChain)) {
      return false;
    }

    // Replace chain and rebuild UTXO set
    this.blocks = [...newChain];
    await this.rebuildUTXOSet();

    // Persist the new blockchain
    await this.persistBlockchain();

    return true;
  }

  /**
   * Validate an entire blockchain
   * @param chain - Chain to validate
   * @returns True if chain is valid, false otherwise
   */
  isValidChain(chain: Block[]): boolean {
    if (chain.length === 0) {
      return false;
    }

    // Validate genesis block
    const genesisBlock = new BlockImpl(chain[0].header, chain[0].transactions);
    if (!this.validateGenesisBlock(genesisBlock)) {
      return false;
    }

    // Validate each subsequent block
    for (let i = 1; i < chain.length; i++) {
      const currentBlock = new BlockImpl(chain[i].header, chain[i].transactions);
      const previousBlock = new BlockImpl(chain[i - 1].header, chain[i - 1].transactions);

      // Check if current block references previous block correctly
      if (currentBlock.header.previousHash !== previousBlock.getHash()) {
        return false;
      }

      // Validate block structure
      if (!currentBlock.isValid()) {
        return false;
      }

      // Validate proof of work
      if (!currentBlock.hasValidProofOfWork()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Create and add genesis block to the blockchain
   * @param minerAddress - Address to receive genesis reward
   */
  private async createGenesisBlock(minerAddress: string): Promise<void> {
    const genesisBlock = BlockImpl.createGenesis(minerAddress, this.genesisReward);
    this.blocks.push(genesisBlock);
    
    // Initialize UTXO set with genesis transaction
    this.utxoManager.processTransaction(genesisBlock.transactions[0]);
    
    // Persist the genesis block
    await this.persistBlockchain();
  }

  /**
   * Validate genesis block
   * @param block - Genesis block to validate
   * @returns True if valid genesis block, false otherwise
   */
  private validateGenesisBlock(block: BlockImpl): boolean {
    // Genesis block should have previous hash of all zeros
    if (block.header.previousHash !== '0'.repeat(64)) {
      return false;
    }

    // Should have exactly one transaction (coinbase)
    if (block.transactions.length !== 1) {
      return false;
    }

    // First transaction should be coinbase
    const coinbaseTx = new TransactionImpl(
      block.transactions[0].inputs,
      block.transactions[0].outputs,
      block.transactions[0].timestamp
    );
    
    if (!coinbaseTx.isCoinbase()) {
      return false;
    }

    return true;
  }

  /**
   * Validate regular (non-genesis) block
   * @param block - Block to validate
   * @returns True if valid block, false otherwise
   */
  private validateRegularBlock(block: BlockImpl): boolean {
    const latestBlock = this.getLatestBlock();
    const latestBlockImpl = new BlockImpl(latestBlock.header, latestBlock.transactions);

    // Check if block references the latest block
    if (block.header.previousHash !== latestBlockImpl.getHash()) {
      console.error('Block does not reference latest block');
      return false;
    }

    // Check timestamp (should be after previous block)
    if (block.header.timestamp <= latestBlock.header.timestamp) {
      console.error('Block timestamp is not after previous block');
      return false;
    }

    // Check proof of work
    if (!block.hasValidProofOfWork()) {
      console.error('Block does not have valid proof of work');
      return false;
    }

    // Validate all transactions in the block
    for (let i = 0; i < block.transactions.length; i++) {
      const transaction = block.transactions[i];
      const txImpl = new TransactionImpl(transaction.inputs, transaction.outputs, transaction.timestamp);

      if (i === 0) {
        // First transaction should be coinbase
        if (!txImpl.isCoinbase()) {
          console.error('First transaction is not coinbase');
          return false;
        }

        // Validate coinbase reward
        const totalFees = block.getTotalFees(this.utxoManager.getAllUTXOs());
        const expectedReward = this.blockReward + totalFees;
        const actualReward = txImpl.getOutputAmount();

        if (actualReward > expectedReward) {
          console.error('Coinbase reward exceeds allowed amount');
          return false;
        }
      } else {
        // Regular transactions should not be coinbase
        if (txImpl.isCoinbase()) {
          console.error('Non-first transaction is coinbase');
          return false;
        }

        // Validate transaction
        const validationResult = TransactionValidator.validateTransaction(transaction, this.utxoManager.getAllUTXOs(), this.getBlockHeight());
        if (!validationResult.isValid) {
          console.error('Invalid transaction in block');
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Rebuild UTXO set from scratch by processing all blocks
   */
  private async rebuildUTXOSet(): Promise<void> {
    this.utxoManager = new UTXOManager();
    // TransactionValidator uses static methods, no instance needed

    for (const block of this.blocks) {
      for (const transaction of block.transactions) {
        await this.utxoManager.processTransaction(transaction);
      }
    }
  }

  /**
   * Persist blockchain and UTXO set to storage
   */
  private async persistBlockchain(): Promise<void> {
    try {
      await this.storage.saveBlockchain(this.blocks);
      await this.storage.saveUTXOs(this.utxoManager.getAllUTXOs());
    } catch (error) {
      console.error('Error persisting blockchain:', error);
      throw error;
    }
  }

  /**
   * Verify data integrity of stored blockchain
   * @returns True if data is valid, false otherwise
   */
  async verifyStorageIntegrity(): Promise<boolean> {
    return await this.storage.verifyIntegrity();
  }
}