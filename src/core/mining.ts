import { Block, BlockHeader, Transaction, IMiner, MiningConfig, IMempool } from '../interfaces';
import { BlockImpl, BlockHeaderImpl } from './block';
import { TransactionImpl } from './transaction';
import { CryptoUtils } from './crypto';

/**
 * Mining configuration with default values
 */
export const DEFAULT_MINING_CONFIG: MiningConfig = {
  difficulty: 1,
  blockReward: 2500000000, // 25 Th3Coins
  targetBlockTime: 600 // 10 minutes in seconds
};

/**
 * ProofOfWork class implements the proof-of-work mining algorithm
 * Handles nonce iteration and target hash calculation
 */
export class ProofOfWork {
  private difficulty: number;
  private target: string;

  constructor(difficulty: number) {
    this.difficulty = difficulty;
    this.target = this.calculateTarget(difficulty);
  }

  /**
   * Calculate target hash string based on difficulty
   * @param difficulty - Mining difficulty level
   * @returns Target hash string (leading zeros)
   */
  private calculateTarget(difficulty: number): string {
    return '0'.repeat(difficulty);
  }

  /**
   * Mine a block by finding a valid nonce
   * @param block - Block to mine
   * @returns Mined block with valid nonce
   */
  mineBlock(block: BlockImpl): BlockImpl {
    const startTime = Date.now();
    let nonce = 0;
    let hash = '';

    console.log(`Starting mining with difficulty ${this.difficulty}...`);

    while (!this.isValidHash(hash)) {
      // Update nonce in block header
      block.header.nonce = nonce;
      block.invalidateHash(); // Clear cached hash
      
      // Calculate new hash
      hash = block.calculateHash();
      
      nonce++;
      
      // Log progress every 100,000 attempts
      if (nonce % 100000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`Mining attempt ${nonce}, elapsed: ${elapsed.toFixed(2)}s, hash: ${hash.substring(0, 20)}...`);
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`Block mined! Nonce: ${nonce - 1}, Time: ${elapsed.toFixed(2)}s, Hash: ${hash}`);

    return block;
  }

  /**
   * Check if a hash meets the difficulty target
   * @param hash - Hash to validate
   * @returns True if hash meets target, false otherwise
   */
  isValidHash(hash: string): boolean {
    if (!hash) return false;
    return hash.startsWith(this.target);
  }

  /**
   * Validate proof-of-work for a block
   * @param block - Block to validate
   * @returns True if proof-of-work is valid, false otherwise
   */
  validateProofOfWork(block: BlockImpl): boolean {
    const hash = block.calculateHash();
    return this.isValidHash(hash);
  }

  /**
   * Get current difficulty
   * @returns Current difficulty level
   */
  getDifficulty(): number {
    return this.difficulty;
  }

  /**
   * Get target hash string
   * @returns Target hash string
   */
  getTarget(): string {
    return this.target;
  }
}

/**
 * DifficultyAdjustment class handles dynamic difficulty adjustment
 * Adjusts mining difficulty based on block time targets
 */
export class DifficultyAdjustment {
  private targetBlockTime: number;
  private adjustmentInterval: number;

  constructor(targetBlockTime: number = 600, adjustmentInterval: number = 10) {
    this.targetBlockTime = targetBlockTime;
    this.adjustmentInterval = adjustmentInterval;
  }

  /**
   * Calculate new difficulty based on recent block times
   * @param blocks - Array of recent blocks
   * @param currentDifficulty - Current difficulty level
   * @returns New difficulty level
   */
  calculateNewDifficulty(blocks: Block[], currentDifficulty: number): number {
    // Need at least adjustment interval blocks to calculate
    if (blocks.length < this.adjustmentInterval) {
      return currentDifficulty;
    }

    // Only adjust at intervals
    if (blocks.length % this.adjustmentInterval !== 0) {
      return currentDifficulty;
    }

    // Get the last adjustment interval blocks
    const recentBlocks = blocks.slice(-this.adjustmentInterval);
    const oldestBlock = recentBlocks[0];
    const newestBlock = recentBlocks[recentBlocks.length - 1];

    // Calculate actual time taken
    const actualTime = (newestBlock.header.timestamp - oldestBlock.header.timestamp) / 1000;
    const expectedTime = this.targetBlockTime * (this.adjustmentInterval - 1); // -1 because we measure intervals

    console.log(`Difficulty adjustment: actual time ${actualTime}s, expected ${expectedTime}s`);

    // Calculate adjustment ratio
    const ratio = expectedTime / actualTime;

    // Apply adjustment with limits
    let newDifficulty = currentDifficulty;

    if (ratio > 1.5) {
      // Blocks too fast (actual time < expected), increase difficulty
      newDifficulty = Math.min(currentDifficulty + 1, 20); // Cap at 20
    } else if (ratio < 0.75) {
      // Blocks too slow (actual time > expected), decrease difficulty
      newDifficulty = Math.max(currentDifficulty - 1, 1);
    }

    console.log(`Difficulty adjusted from ${currentDifficulty} to ${newDifficulty}`);
    return newDifficulty;
  }

  /**
   * Check if difficulty should be adjusted
   * @param blockHeight - Current block height
   * @returns True if adjustment is due, false otherwise
   */
  shouldAdjustDifficulty(blockHeight: number): boolean {
    return blockHeight > 0 && blockHeight % this.adjustmentInterval === 0;
  }

  /**
   * Get target block time
   * @returns Target block time in seconds
   */
  getTargetBlockTime(): number {
    return this.targetBlockTime;
  }

  /**
   * Get adjustment interval
   * @returns Number of blocks between adjustments
   */
  getAdjustmentInterval(): number {
    return this.adjustmentInterval;
  }
}

/**
 * Mining engine that handles continuous mining operations
 */
export class MiningEngine {
  private miner: MinerImpl;
  private isRunning: boolean = false;
  private miningInterval?: NodeJS.Timeout;
  private onBlockMined?: (block: Block) => void;
  private onError?: (error: Error) => void;

  constructor(miner: MinerImpl) {
    this.miner = miner;
  }

  /**
   * Start continuous mining
   * @param getTransactions - Function to get pending transactions
   * @param onBlockMined - Callback when block is mined
   * @param onError - Error callback
   */
  start(
    getTransactions: () => Transaction[],
    onBlockMined: (block: Block) => void,
    onError: (error: Error) => void
  ): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.onBlockMined = onBlockMined;
    this.onError = onError;

    console.log('Mining engine started');

    // Start mining loop
    this.miningLoop(getTransactions);
  }

  /**
   * Stop continuous mining
   */
  stop(): void {
    this.isRunning = false;
    if (this.miningInterval) {
      clearTimeout(this.miningInterval);
      this.miningInterval = undefined;
    }
    console.log('Mining engine stopped');
  }

  /**
   * Check if mining engine is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Mining loop that continuously mines blocks
   */
  private async miningLoop(getTransactions: () => Transaction[]): Promise<void> {
    while (this.isRunning) {
      try {
        // Get pending transactions
        const transactions = getTransactions();
        
        if (transactions.length === 0) {
          // No transactions to mine, wait and try again
          await this.sleep(1000);
          continue;
        }

        console.log(`Mining block with ${transactions.length} transactions...`);

        // Mine the block
        const block = await this.miner.mineBlock(transactions);

        if (this.isRunning && this.onBlockMined) {
          this.onBlockMined(block);
        }

        // Small delay before next mining attempt
        await this.sleep(100);

      } catch (error) {
        if (this.onError) {
          this.onError(error as Error);
        } else {
          console.error('Mining error:', error);
        }

        // Wait before retrying on error
        await this.sleep(5000);
      }
    }
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Miner class implements the main mining functionality
 * Creates blocks from transactions and performs proof-of-work mining
 */
export class MinerImpl implements IMiner {
  private minerAddress: string;
  private config: MiningConfig;
  private difficultyAdjustment: DifficultyAdjustment;
  private isMining: boolean = false;
  private miningEngine?: MiningEngine;

  constructor(minerAddress: string, config: MiningConfig = DEFAULT_MINING_CONFIG) {
    this.minerAddress = minerAddress;
    this.config = config;
    this.difficultyAdjustment = new DifficultyAdjustment(
      config.targetBlockTime,
      10 // adjustment interval
    );
    this.miningEngine = new MiningEngine(this);
  }

  /**
   * Mine a new block from pending transactions
   * @param transactions - Transactions to include in block
   * @param previousBlockHash - Hash of the previous block
   * @param difficulty - Mining difficulty (optional, uses config if not provided)
   * @returns Promise resolving to mined block
   */
  async mineBlock(
    transactions: Transaction[], 
    previousBlockHash: string = '', 
    difficulty?: number
  ): Promise<Block> {
    try {
      // Use provided difficulty or config difficulty
      const blockDifficulty = difficulty || this.config.difficulty;

      // Create coinbase transaction
      const coinbaseTransaction = this.createCoinbaseTransaction(transactions);
      
      // Combine coinbase with other transactions
      const allTransactions = [coinbaseTransaction, ...transactions];

      // Create block header
      const header = new BlockHeaderImpl(
        1, // version
        previousBlockHash, // previousHash
        '', // merkleRoot - will be calculated
        Date.now(), // timestamp
        blockDifficulty, // difficulty
        0 // nonce - will be found during mining
      );

      // Create block
      const block = new BlockImpl(header, allTransactions);
      
      // Update merkle root
      block.updateMerkleRoot();

      // Mine the block
      const proofOfWork = new ProofOfWork(blockDifficulty);
      const minedBlock = proofOfWork.mineBlock(block);

      console.log(`Block mined successfully! Hash: ${minedBlock.getHash()}`);
      return minedBlock;

    } catch (error) {
      console.error('Error mining block:', error);
      throw new Error(`Failed to mine block: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new block template (without mining)
   * @param transactions - Transactions to include
   * @param previousBlockHash - Hash of previous block
   * @param difficulty - Mining difficulty
   * @returns Block template ready for mining
   */
  createBlockTemplate(
    transactions: Transaction[],
    previousBlockHash: string,
    difficulty: number
  ): BlockImpl {
    // Create coinbase transaction
    const coinbaseTransaction = this.createCoinbaseTransaction(transactions);
    
    // Combine coinbase with other transactions
    const allTransactions = [coinbaseTransaction, ...transactions];

    // Create block header
    const header = new BlockHeaderImpl(
      1, // version
      previousBlockHash,
      '', // merkleRoot - will be calculated
      Date.now(),
      difficulty,
      0 // nonce
    );

    // Create block and update merkle root
    const block = new BlockImpl(header, allTransactions);
    block.updateMerkleRoot();

    return block;
  }

  /**
   * Calculate hash for a block
   * @param block - Block to hash
   * @returns Block hash as hex string
   */
  calculateHash(block: Block): string {
    const blockImpl = new BlockImpl(block.header, block.transactions);
    return blockImpl.calculateHash();
  }

  /**
   * Validate proof-of-work for a block
   * @param block - Block to validate
   * @returns True if proof is valid, false otherwise
   */
  isValidProof(block: Block): boolean {
    const blockImpl = new BlockImpl(block.header, block.transactions);
    const proofOfWork = new ProofOfWork(block.header.difficulty);
    return proofOfWork.validateProofOfWork(blockImpl);
  }

  /**
   * Adjust difficulty based on last block
   * @param lastBlock - Previous block for difficulty calculation
   * @returns New difficulty level
   */
  adjustDifficulty(lastBlock: Block): number {
    // This method would typically receive the blockchain to calculate properly
    // For now, return current difficulty
    return this.config.difficulty;
  }

  /**
   * Start mining with mempool
   * @param mempool - Mempool instance to get transactions from
   */
  startMining(mempool: IMempool): void;
  /**
   * Start continuous mining process
   * @param getTransactions - Function to get pending transactions
   * @param onBlockMined - Callback when block is mined
   * @param onError - Error callback
   */
  startMining(
    getTransactions?: () => Transaction[],
    onBlockMined?: (block: Block) => void,
    onError?: (error: Error) => void
  ): void;
  startMining(
    mempoolOrGetTransactions?: IMempool | (() => Transaction[]),
    onBlockMined?: (block: Block) => void,
    onError?: (error: Error) => void
  ): void {
    if (this.isMining) {
      console.log('Mining already in progress');
      return;
    }

    this.isMining = true;
    console.log(`Miner started for address: ${this.minerAddress}`);

    // Handle mempool parameter
    if (mempoolOrGetTransactions && typeof mempoolOrGetTransactions === 'object' && 'getPendingTransactions' in mempoolOrGetTransactions) {
      const mempool = mempoolOrGetTransactions as IMempool;
      const getTransactions = () => mempool.getPendingTransactions();
      
      if (this.miningEngine) {
        this.miningEngine.start(
          getTransactions,
          (block: Block) => {
            console.log(`Block mined: ${(block as any).getHash()}`);
            // Add block to blockchain if available
            // This would typically be handled by the node
          },
          (error: Error) => {
            console.error('Mining error:', error);
          }
        );
      }
    } else if (typeof mempoolOrGetTransactions === 'function' && onBlockMined && onError && this.miningEngine) {
      // Original method signature
      this.miningEngine.start(mempoolOrGetTransactions, onBlockMined, onError);
    }
  }

  /**
   * Stop mining process
   */
  stopMining(): void {
    this.isMining = false;
    
    if (this.miningEngine) {
      this.miningEngine.stop();
    }
    
    console.log('Mining stopped');
  }

  /**
   * Check if currently mining
   * @returns True if mining, false otherwise
   */
  isMiningActive(): boolean {
    return this.isMining;
  }

  /**
   * Check if mining is active (alias for compatibility)
   * @returns True if mining, false otherwise
   */
  isMiningStatus(): boolean {
    return this.isMiningActive();
  }

  /**
   * Create coinbase transaction for block reward
   * @param transactions - Other transactions in block (for fee calculation)
   * @param blockHeight - Height of the block being mined
   * @param utxos - UTXO set for fee calculation (optional)
   * @returns Coinbase transaction
   */
  private createCoinbaseTransaction(
    transactions: Transaction[], 
    blockHeight: number = 0,
    utxos?: any[]
  ): Transaction {
    try {
      // Calculate total fees from transactions
      let totalFees = 0;
      
      if (utxos) {
        for (const tx of transactions) {
          const txImpl = new TransactionImpl(tx.inputs, tx.outputs, tx.timestamp);
          totalFees += txImpl.getFee(utxos);
        }
      }

      // Total reward = block reward + fees
      const totalReward = this.config.blockReward + totalFees;

      // Validate reward amount
      if (totalReward <= 0) {
        throw new Error('Invalid reward amount');
      }

      // Create coinbase transaction
      const coinbaseTx = TransactionImpl.createCoinbase(this.minerAddress, totalReward, blockHeight);
      
      console.log(`Created coinbase transaction: reward=${totalReward}, fees=${totalFees}`);
      return coinbaseTx;

    } catch (error) {
      console.error('Error creating coinbase transaction:', error);
      throw new Error(`Failed to create coinbase transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate transactions before including in block
   * @param transactions - Transactions to validate
   * @returns Array of valid transactions
   */
  validateTransactions(transactions: Transaction[]): Transaction[] {
    const validTransactions: Transaction[] = [];

    for (const tx of transactions) {
      try {
        const txImpl = new TransactionImpl(tx.inputs, tx.outputs, tx.timestamp);
        
        // Basic validation
        if (txImpl.isValid() && !txImpl.isCoinbase()) {
          validTransactions.push(tx);
        } else {
          console.warn(`Invalid transaction excluded: ${tx.id}`);
        }
      } catch (error) {
        console.warn(`Transaction validation error: ${tx.id}`, error);
      }
    }

    return validTransactions;
  }

  /**
   * Update mining configuration
   * @param config - New mining configuration
   */
  updateConfig(config: Partial<MiningConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current mining configuration
   * @returns Current mining configuration
   */
  getConfig(): MiningConfig {
    return { ...this.config };
  }

  /**
   * Get miner address
   * @returns Miner's address
   */
  getMinerAddress(): string {
    return this.minerAddress;
  }

  /**
   * Get mining engine
   * @returns Mining engine instance
   */
  getMiningEngine(): MiningEngine | undefined {
    return this.miningEngine;
  }

  /**
   * Calculate difficulty for next block
   * @param blockchain - Blockchain to analyze
   * @returns Calculated difficulty
   */
  calculateNextDifficulty(blockchain: Block[]): number {
    return this.difficultyAdjustment.calculateNewDifficulty(blockchain, this.config.difficulty);
  }

  /**
   * Estimate mining time for current difficulty
   * @returns Estimated time in seconds
   */
  estimateMiningTime(): number {
    // This is a rough estimate based on difficulty
    // In reality, this would depend on hash rate
    const baseTime = 10; // seconds for difficulty 1
    return baseTime * Math.pow(2, this.config.difficulty - 1);
  }

  /**
   * Get mining statistics
   * @returns Mining statistics object
   */
  getMiningStats(): {
    minerAddress: string;
    difficulty: number;
    blockReward: number;
    targetBlockTime: number;
    isMining: boolean;
    estimatedMiningTime: number;
  } {
    return {
      minerAddress: this.minerAddress,
      difficulty: this.config.difficulty,
      blockReward: this.config.blockReward,
      targetBlockTime: this.config.targetBlockTime,
      isMining: this.isMining,
      estimatedMiningTime: this.estimateMiningTime()
    };
  }
}