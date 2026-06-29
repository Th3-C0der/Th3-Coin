import { Transaction } from '../interfaces';
import { CryptoUtils } from './crypto';

/**
 * Merkle Tree Node represents a node in the Merkle tree
 */
export class MerkleNode {
  public hash: string;
  public left: MerkleNode | null;
  public right: MerkleNode | null;
  public data: string | null; // Only leaf nodes have data

  constructor(hash: string, left: MerkleNode | null = null, right: MerkleNode | null = null, data: string | null = null) {
    this.hash = hash;
    this.left = left;
    this.right = right;
    this.data = data;
  }

  /**
   * Check if this is a leaf node
   * @returns True if leaf node, false otherwise
   */
  isLeaf(): boolean {
    return this.left === null && this.right === null;
  }
}

/**
 * Merkle Proof represents a proof that a transaction is included in a block
 */
export interface MerkleProof {
  transactionId: string;
  merkleRoot: string;
  proof: Array<{
    hash: string;
    position: 'left' | 'right';
  }>;
  index: number;
}

/**
 * Merkle Tree implementation for transaction verification in blockchain blocks
 * Provides efficient verification of transaction inclusion without downloading entire block
 */
export class MerkleTree {
  private root: MerkleNode | null;
  private leaves: MerkleNode[];
  private transactions: Transaction[];

  constructor(transactions: Transaction[] = []) {
    this.transactions = [...transactions];
    this.leaves = [];
    this.root = null;
    
    if (transactions.length > 0) {
      this.buildTree();
    }
  }

  /**
   * Build the Merkle tree from transactions
   */
  private buildTree(): void {
    if (this.transactions.length === 0) {
      this.root = null;
      return;
    }

    // Create leaf nodes from transaction IDs
    this.leaves = this.transactions.map(tx => 
      new MerkleNode(tx.id, null, null, tx.id)
    );

    // Build tree bottom-up
    let currentLevel = [...this.leaves];

    while (currentLevel.length > 1) {
      const nextLevel: MerkleNode[] = [];

      // Process pairs of nodes
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // Duplicate if odd

        // Create parent node
        const combinedHash = CryptoUtils.sha256(left.hash + right.hash);
        const parent = new MerkleNode(combinedHash, left, right);
        
        nextLevel.push(parent);
      }

      currentLevel = nextLevel;
    }

    this.root = currentLevel[0];
  }

  /**
   * Get the Merkle root hash
   * @returns Merkle root hash or empty string if no transactions
   */
  getMerkleRoot(): string {
    if (!this.root) {
      return CryptoUtils.sha256(''); // Hash of empty string for empty tree
    }
    return this.root.hash;
  }

  /**
   * Get the root node
   * @returns Root node or null if tree is empty
   */
  getRoot(): MerkleNode | null {
    return this.root;
  }

  /**
   * Get all leaf nodes
   * @returns Array of leaf nodes
   */
  getLeaves(): MerkleNode[] {
    return [...this.leaves];
  }

  /**
   * Get all transactions used to build the tree
   * @returns Array of transactions
   */
  getTransactions(): Transaction[] {
    return [...this.transactions];
  }

  /**
   * Generate a Merkle proof for a specific transaction
   * @param transactionId - ID of the transaction to prove
   * @returns Merkle proof or null if transaction not found
   */
  generateProof(transactionId: string): MerkleProof | null {
    // Find the transaction index
    const index = this.transactions.findIndex(tx => tx.id === transactionId);
    if (index === -1) {
      return null;
    }

    if (!this.root) {
      return null;
    }

    const proof: Array<{ hash: string; position: 'left' | 'right' }> = [];
    
    // Traverse from leaf to root, collecting sibling hashes
    let currentIndex = index;
    let currentLevel = [...this.leaves];

    while (currentLevel.length > 1) {
      const nextLevel: MerkleNode[] = [];
      
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;

        // If current node is involved in this pair
        if (i === currentIndex || i + 1 === currentIndex) {
          // Add sibling to proof
          if (i === currentIndex) {
            // Current node is left, add right sibling
            proof.push({
              hash: right.hash,
              position: 'right'
            });
          } else {
            // Current node is right, add left sibling
            proof.push({
              hash: left.hash,
              position: 'left'
            });
          }
          
          // Update index for next level
          currentIndex = Math.floor(i / 2);
        }

        // Create parent for next level
        const combinedHash = CryptoUtils.sha256(left.hash + right.hash);
        const parent = new MerkleNode(combinedHash, left, right);
        nextLevel.push(parent);
      }

      currentLevel = nextLevel;
    }

    return {
      transactionId,
      merkleRoot: this.getMerkleRoot(),
      proof,
      index
    };
  }

  /**
   * Verify a Merkle proof
   * @param proof - Merkle proof to verify
   * @returns True if proof is valid, false otherwise
   */
  static verifyProof(proof: MerkleProof): boolean {
    try {
      let currentHash = proof.transactionId;

      // Apply each step in the proof
      for (const step of proof.proof) {
        if (step.position === 'left') {
          // Sibling is on the left
          currentHash = CryptoUtils.sha256(step.hash + currentHash);
        } else {
          // Sibling is on the right
          currentHash = CryptoUtils.sha256(currentHash + step.hash);
        }
      }

      // Final hash should match the Merkle root
      return currentHash === proof.merkleRoot;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify that a transaction is included in the tree
   * @param transactionId - Transaction ID to verify
   * @returns True if transaction is included, false otherwise
   */
  verifyInclusion(transactionId: string): boolean {
    return this.transactions.some(tx => tx.id === transactionId);
  }

  /**
   * Get the depth of the tree
   * @returns Tree depth (number of levels)
   */
  getDepth(): number {
    if (!this.root) {
      return 0;
    }

    const calculateDepth = (node: MerkleNode): number => {
      if (node.isLeaf()) {
        return 1;
      }
      
      const leftDepth = node.left ? calculateDepth(node.left) : 0;
      const rightDepth = node.right ? calculateDepth(node.right) : 0;
      
      return 1 + Math.max(leftDepth, rightDepth);
    };

    return calculateDepth(this.root);
  }

  /**
   * Get the number of transactions in the tree
   * @returns Number of transactions
   */
  getTransactionCount(): number {
    return this.transactions.length;
  }

  /**
   * Validate the tree structure and hashes
   * @returns True if tree is valid, false otherwise
   */
  validateTree(): boolean {
    if (!this.root) {
      return this.transactions.length === 0;
    }

    const validateNode = (node: MerkleNode): boolean => {
      if (node.isLeaf()) {
        // Leaf node should have data matching its hash
        return node.data === node.hash;
      }

      // Internal node should have left and right children
      if (!node.left || !node.right) {
        return false;
      }

      // Hash should be correct combination of children
      const expectedHash = CryptoUtils.sha256(node.left.hash + node.right.hash);
      if (node.hash !== expectedHash) {
        return false;
      }

      // Recursively validate children
      return validateNode(node.left) && validateNode(node.right);
    };

    return validateNode(this.root);
  }

  /**
   * Get all hashes in the tree (for debugging)
   * @returns Array of all hashes in the tree
   */
  getAllHashes(): string[] {
    const hashes: string[] = [];

    const collectHashes = (node: MerkleNode | null): void => {
      if (!node) return;
      
      hashes.push(node.hash);
      collectHashes(node.left);
      collectHashes(node.right);
    };

    collectHashes(this.root);
    return hashes;
  }

  /**
   * Create a Merkle tree from transaction IDs
   * @param transactionIds - Array of transaction IDs
   * @returns New MerkleTree instance
   */
  static fromTransactionIds(transactionIds: string[]): MerkleTree {
    // Create mock transactions with the given IDs
    const transactions = transactionIds.map(id => ({
      id,
      inputs: [],
      outputs: [],
      timestamp: Date.now(),
      signature: undefined
    }));

    return new MerkleTree(transactions);
  }

  /**
   * Calculate Merkle root from transaction array (static utility)
   * @param transactions - Array of transactions
   * @returns Merkle root hash
   */
  static calculateMerkleRoot(transactions: Transaction[]): string {
    if (transactions.length === 0) {
      return CryptoUtils.sha256('');
    }

    const tree = new MerkleTree(transactions);
    return tree.getMerkleRoot();
  }

  /**
   * Create a copy of the tree
   * @returns New MerkleTree instance with same transactions
   */
  clone(): MerkleTree {
    return new MerkleTree(this.transactions);
  }

  /**
   * Export tree structure to JSON
   * @returns JSON representation of the tree
   */
  toJSON(): object {
    const serializeNode = (node: MerkleNode | null): any => {
      if (!node) return null;
      
      return {
        hash: node.hash,
        data: node.data,
        left: serializeNode(node.left),
        right: serializeNode(node.right)
      };
    };

    return {
      root: serializeNode(this.root),
      transactionCount: this.transactions.length,
      merkleRoot: this.getMerkleRoot(),
      depth: this.getDepth()
    };
  }
}