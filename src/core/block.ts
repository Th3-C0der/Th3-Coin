import { Block, BlockHeader, Transaction } from '../interfaces';
import { CryptoUtils } from './crypto';
import { TransactionImpl } from './transaction';
import { MerkleTree, MerkleProof } from './merkle-tree';

/**
 * BlockHeader class represents the header of a blockchain block
 * Contains metadata including previous hash, merkle root, timestamp, difficulty, and nonce
 */
export class BlockHeaderImpl implements BlockHeader {
  public version: number;
  public previousHash: string;
  public merkleRoot: string;
  public timestamp: number;
  public difficulty: number;
  public nonce: number;

  constructor(
    version: number = 1,
    previousHash: string = '',
    merkleRoot: string = '',
    timestamp?: number,
    difficulty: number = 1,
    nonce: number = 0
  ) {
    this.version = version;
    this.previousHash = previousHash;
    this.merkleRoot = merkleRoot;
    this.timestamp = timestamp || Date.now();
    this.difficulty = difficulty;
    this.nonce = nonce;
  }

  /**
   * Validate the block header format
   * @returns True if header is valid, false otherwise
   */
  isValid(): boolean {
    // Validate version
    if (typeof this.version !== 'number' || this.version < 1) {
      return false;
    }

    // Validate previous hash (should be 64 character hex string or empty for genesis)
    if (this.previousHash && (typeof this.previousHash !== 'string' || 
        this.previousHash.length !== 64 || !/^[a-f0-9]{64}$/i.test(this.previousHash))) {
      return false;
    }

    // Validate merkle root (should be 64 character hex string)
    if (!this.merkleRoot || typeof this.merkleRoot !== 'string' || 
        this.merkleRoot.length !== 64 || !/^[a-f0-9]{64}$/i.test(this.merkleRoot)) {
      return false;
    }

    // Validate timestamp
    if (typeof this.timestamp !== 'number' || this.timestamp <= 0) {
      return false;
    }

    // Validate difficulty
    if (typeof this.difficulty !== 'number' || this.difficulty < 1) {
      return false;
    }

    // Validate nonce
    if (typeof this.nonce !== 'number' || this.nonce < 0) {
      return false;
    }

    return true;
  }

  /**
   * Create a copy of this header
   * @returns New BlockHeaderImpl instance
   */
  clone(): BlockHeaderImpl {
    return new BlockHeaderImpl(
      this.version,
      this.previousHash,
      this.merkleRoot,
      this.timestamp,
      this.difficulty,
      this.nonce
    );
  }
}

/**
 * Block class represents a blockchain block containing header and transactions
 */
export class BlockImpl implements Block {
  public header: BlockHeader;
  public transactions: Transaction[];
  private _hash?: string;
  private _merkleTree?: MerkleTree;

  constructor(header: BlockHeader, transactions: Transaction[] = []) {
    this.header = header;
    this.transactions = transactions;
    this._merkleTree = undefined;
  }

  /**
   * Calculate block hash using SHA-256
   * @returns Block hash as hex string
   */
  calculateHash(): string {
    const headerData = {
      version: this.header.version,
      previousHash: this.header.previousHash,
      merkleRoot: this.header.merkleRoot,
      timestamp: this.header.timestamp,
      difficulty: this.header.difficulty,
      nonce: this.header.nonce
    };

    return CryptoUtils.sha256(JSON.stringify(headerData));
  }

  /**
   * Get block hash (cached)
   * @returns Block hash as hex string
   */
  getHash(): string {
    if (!this._hash) {
      this._hash = this.calculateHash();
    }
    return this._hash;
  }

  /**
   * Invalidate cached hash (call when header changes)
   */
  invalidateHash(): void {
    this._hash = undefined;
  }

  /**
   * Get Merkle tree for this block's transactions
   * @returns Merkle tree instance
   */
  getMerkleTree(): MerkleTree {
    if (!this._merkleTree) {
      this._merkleTree = new MerkleTree(this.transactions);
    }
    return this._merkleTree;
  }

  /**
   * Invalidate cached Merkle tree (call when transactions change)
   */
  invalidateMerkleTree(): void {
    this._merkleTree = undefined;
  }

  /**
   * Calculate merkle root from transactions using Merkle tree
   * @returns Merkle root as hex string
   */
  calculateMerkleRoot(): string {
    return this.getMerkleTree().getMerkleRoot();
  }

  /**
   * Update merkle root in header based on current transactions
   */
  updateMerkleRoot(): void {
    this.invalidateMerkleTree(); // Invalidate cached tree first
    this.header.merkleRoot = this.calculateMerkleRoot();
    this.invalidateHash();
  }

  /**
   * Validate block structure and content
   * @returns True if block is valid, false otherwise
   */
  isValid(): boolean {
    // Validate header
    if (!new BlockHeaderImpl(
      this.header.version,
      this.header.previousHash,
      this.header.merkleRoot,
      this.header.timestamp,
      this.header.difficulty,
      this.header.nonce
    ).isValid()) {
      return false;
    }

    // Validate transactions array
    if (!Array.isArray(this.transactions)) {
      return false;
    }

    // Block must have at least one transaction (coinbase)
    if (this.transactions.length === 0) {
      return false;
    }

    // Validate all transactions
    for (const tx of this.transactions) {
      if (!new TransactionImpl(tx.inputs, tx.outputs, tx.timestamp).isValid()) {
        return false;
      }
    }

    // First transaction must be coinbase
    const firstTx = new TransactionImpl(
      this.transactions[0].inputs,
      this.transactions[0].outputs,
      this.transactions[0].timestamp
    );
    if (!firstTx.isCoinbase()) {
      return false;
    }

    // Only first transaction can be coinbase
    for (let i = 1; i < this.transactions.length; i++) {
      const tx = new TransactionImpl(
        this.transactions[i].inputs,
        this.transactions[i].outputs,
        this.transactions[i].timestamp
      );
      if (tx.isCoinbase()) {
        return false;
      }
    }

    // Verify merkle root matches transactions
    const calculatedMerkleRoot = this.calculateMerkleRoot();
    if (this.header.merkleRoot !== calculatedMerkleRoot) {
      return false;
    }

    // Check for duplicate transactions
    const txIds = this.transactions.map(tx => tx.id);
    if (new Set(txIds).size !== txIds.length) {
      return false;
    }

    return true;
  }

  /**
   * Check if this block satisfies the proof-of-work requirement
   * @returns True if proof-of-work is valid, false otherwise
   */
  hasValidProofOfWork(): boolean {
    const hash = this.getHash();
    const target = '0'.repeat(this.header.difficulty);
    return hash.startsWith(target);
  }

  /**
   * Get block size in bytes (approximate)
   * @returns Block size in bytes
   */
  getSize(): number {
    return JSON.stringify({
      header: this.header,
      transactions: this.transactions
    }).length;
  }

  /**
   * Get total transaction fees in the block
   * @param utxos - UTXO set to calculate fees
   * @returns Total fees
   */
  getTotalFees(utxos: any[]): number {
    let totalFees = 0;
    
    // Skip coinbase transaction (index 0)
    for (let i = 1; i < this.transactions.length; i++) {
      const tx = new TransactionImpl(
        this.transactions[i].inputs,
        this.transactions[i].outputs,
        this.transactions[i].timestamp
      );
      totalFees += tx.getFee(utxos);
    }
    
    return totalFees;
  }

  /**
   * Generate Merkle proof for a transaction
   * @param transactionId - ID of the transaction to prove
   * @returns Merkle proof or null if transaction not found
   */
  generateMerkleProof(transactionId: string): MerkleProof | null {
    return this.getMerkleTree().generateProof(transactionId);
  }

  /**
   * Verify a Merkle proof against this block
   * @param proof - Merkle proof to verify
   * @returns True if proof is valid for this block, false otherwise
   */
  verifyMerkleProof(proof: MerkleProof): boolean {
    // Check if proof's merkle root matches this block's merkle root
    if (proof.merkleRoot !== this.header.merkleRoot) {
      return false;
    }

    // Verify the proof itself
    return MerkleTree.verifyProof(proof);
  }

  /**
   * Check if a transaction is included in this block
   * @param transactionId - Transaction ID to check
   * @returns True if transaction is included, false otherwise
   */
  hasTransaction(transactionId: string): boolean {
    return this.getMerkleTree().verifyInclusion(transactionId);
  }

  /**
   * Create a copy of this block
   * @returns New BlockImpl instance
   */
  clone(): BlockImpl {
    const clonedHeader = new BlockHeaderImpl(
      this.header.version,
      this.header.previousHash,
      this.header.merkleRoot,
      this.header.timestamp,
      this.header.difficulty,
      this.header.nonce
    );

    const clonedTransactions = this.transactions.map(tx => 
      new TransactionImpl(tx.inputs, tx.outputs, tx.timestamp)
    );

    return new BlockImpl(clonedHeader, clonedTransactions);
  }

  /**
   * Create a new block with transactions
   * @param previousBlock - Previous block in the chain
   * @param transactions - Transactions to include in the block
   * @param minerAddress - Address to receive mining reward
   * @param blockReward - Mining reward amount
   * @param difficulty - Mining difficulty
   * @returns New block
   */
  static createBlock(
    previousBlock: Block, 
    transactions: Transaction[], 
    minerAddress: string, 
    blockReward: number = 2500000000,
    difficulty?: number
  ): BlockImpl {
    // Create coinbase transaction
    const coinbaseTx = TransactionImpl.createCoinbase(minerAddress, blockReward, 0);
    
    // Combine coinbase with other transactions
    const allTransactions = [coinbaseTx, ...transactions];
    
    // Calculate previous block hash
    const previousBlockImpl = new BlockImpl(previousBlock.header, previousBlock.transactions);
    const previousHash = previousBlockImpl.getHash();
    
    // Create header
    const header = new BlockHeaderImpl(
      1, // version
      previousHash,
      '', // merkle root will be calculated
      Date.now(),
      difficulty || previousBlock.header.difficulty,
      0 // nonce
    );
    
    // Create block
    const block = new BlockImpl(header, allTransactions);
    
    // Update merkle root
    block.updateMerkleRoot();
    
    return block;
  }

  /**
   * Create genesis block (first block in blockchain)
   * @param minerAddress - Address to receive genesis reward
   * @param genesisReward - Initial reward amount
   * @returns Genesis block
   */
  static createGenesis(minerAddress: string, genesisReward: number = 5000000000): BlockImpl {
    // Create coinbase transaction for genesis block
    const coinbaseTx = TransactionImpl.createCoinbase(minerAddress, genesisReward, 0);
    
    // Create genesis header
    const header = new BlockHeaderImpl(
      1,                    // version
      '0'.repeat(64),      // previous hash (none for genesis)
      '',                  // merkle root (will be calculated)
      Date.now(),          // timestamp
      1,                   // difficulty
      0                    // nonce
    );

    // Create genesis block
    const genesisBlock = new BlockImpl(header, [coinbaseTx]);
    
    // Update merkle root
    genesisBlock.updateMerkleRoot();
    
    return genesisBlock;
  }
}