import { describe, it, expect, beforeEach } from 'vitest';
import { MerkleTree, MerkleNode, MerkleProof } from '../merkle-tree';
import { Transaction } from '../../interfaces';
import { CryptoUtils } from '../crypto';

describe('MerkleNode', () => {
  it('should create a node with hash', () => {
    const hash = 'test-hash';
    const node = new MerkleNode(hash);
    
    expect(node.hash).toBe(hash);
    expect(node.left).toBeNull();
    expect(node.right).toBeNull();
    expect(node.data).toBeNull();
  });

  it('should create a node with children', () => {
    const left = new MerkleNode('left-hash');
    const right = new MerkleNode('right-hash');
    const parent = new MerkleNode('parent-hash', left, right);
    
    expect(parent.left).toBe(left);
    expect(parent.right).toBe(right);
  });

  it('should identify leaf nodes correctly', () => {
    const leaf = new MerkleNode('leaf-hash');
    const left = new MerkleNode('left-hash');
    const right = new MerkleNode('right-hash');
    const parent = new MerkleNode('parent-hash', left, right);
    
    expect(leaf.isLeaf()).toBe(true);
    expect(parent.isLeaf()).toBe(false);
  });
});

describe('MerkleTree', () => {
  let transactions: Transaction[];
  let tree: MerkleTree;

  beforeEach(() => {
    // Create test transactions
    transactions = [
      { id: 'tx1', inputs: [], outputs: [], timestamp: 1000 },
      { id: 'tx2', inputs: [], outputs: [], timestamp: 2000 },
      { id: 'tx3', inputs: [], outputs: [], timestamp: 3000 },
      { id: 'tx4', inputs: [], outputs: [], timestamp: 4000 }
    ];
    
    tree = new MerkleTree(transactions);
  });

  describe('constructor', () => {
    it('should create tree with transactions', () => {
      expect(tree.getTransactionCount()).toBe(4);
      expect(tree.getTransactions()).toEqual(transactions);
    });

    it('should create empty tree', () => {
      const emptyTree = new MerkleTree();
      expect(emptyTree.getTransactionCount()).toBe(0);
      expect(emptyTree.getMerkleRoot()).toBe(CryptoUtils.sha256(''));
    });
  });

  describe('getMerkleRoot', () => {
    it('should calculate correct Merkle root for even number of transactions', () => {
      const expectedRoot = CryptoUtils.sha256(
        CryptoUtils.sha256('tx1' + 'tx2') + 
        CryptoUtils.sha256('tx3' + 'tx4')
      );
      
      expect(tree.getMerkleRoot()).toBe(expectedRoot);
    });

    it('should calculate correct Merkle root for odd number of transactions', () => {
      const oddTransactions = transactions.slice(0, 3); // tx1, tx2, tx3
      const oddTree = new MerkleTree(oddTransactions);
      
      const expectedRoot = CryptoUtils.sha256(
        CryptoUtils.sha256('tx1' + 'tx2') + 
        CryptoUtils.sha256('tx3' + 'tx3') // tx3 is duplicated
      );
      
      expect(oddTree.getMerkleRoot()).toBe(expectedRoot);
    });

    it('should return hash of empty string for empty tree', () => {
      const emptyTree = new MerkleTree();
      expect(emptyTree.getMerkleRoot()).toBe(CryptoUtils.sha256(''));
    });

    it('should handle single transaction', () => {
      const singleTx = [transactions[0]];
      const singleTree = new MerkleTree(singleTx);
      
      expect(singleTree.getMerkleRoot()).toBe('tx1');
    });
  });

  describe('getRoot', () => {
    it('should return root node', () => {
      const root = tree.getRoot();
      expect(root).not.toBeNull();
      expect(root?.hash).toBe(tree.getMerkleRoot());
    });

    it('should return null for empty tree', () => {
      const emptyTree = new MerkleTree();
      expect(emptyTree.getRoot()).toBeNull();
    });
  });

  describe('getLeaves', () => {
    it('should return all leaf nodes', () => {
      const leaves = tree.getLeaves();
      expect(leaves.length).toBe(4);
      
      expect(leaves[0].hash).toBe('tx1');
      expect(leaves[1].hash).toBe('tx2');
      expect(leaves[2].hash).toBe('tx3');
      expect(leaves[3].hash).toBe('tx4');
      
      leaves.forEach(leaf => {
        expect(leaf.isLeaf()).toBe(true);
      });
    });
  });

  describe('generateProof', () => {
    it('should generate valid proof for existing transaction', () => {
      const proof = tree.generateProof('tx1');
      
      expect(proof).not.toBeNull();
      expect(proof?.transactionId).toBe('tx1');
      expect(proof?.merkleRoot).toBe(tree.getMerkleRoot());
      expect(proof?.index).toBe(0);
      expect(proof?.proof.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent transaction', () => {
      const proof = tree.generateProof('non-existent');
      expect(proof).toBeNull();
    });

    it('should generate different proofs for different transactions', () => {
      const proof1 = tree.generateProof('tx1');
      const proof2 = tree.generateProof('tx2');
      
      expect(proof1).not.toBeNull();
      expect(proof2).not.toBeNull();
      expect(proof1?.proof).not.toEqual(proof2?.proof);
    });

    it('should generate proof for single transaction tree', () => {
      const singleTree = new MerkleTree([transactions[0]]);
      const proof = singleTree.generateProof('tx1');
      
      expect(proof).not.toBeNull();
      expect(proof?.proof.length).toBe(0); // No siblings in single node tree
    });
  });

  describe('verifyProof', () => {
    it('should verify valid proof', () => {
      const proof = tree.generateProof('tx1');
      expect(proof).not.toBeNull();
      
      const isValid = MerkleTree.verifyProof(proof!);
      expect(isValid).toBe(true);
    });

    it('should verify all transaction proofs', () => {
      for (const tx of transactions) {
        const proof = tree.generateProof(tx.id);
        expect(proof).not.toBeNull();
        
        const isValid = MerkleTree.verifyProof(proof!);
        expect(isValid).toBe(true);
      }
    });

    it('should reject invalid proof with wrong merkle root', () => {
      const proof = tree.generateProof('tx1');
      expect(proof).not.toBeNull();
      
      // Tamper with merkle root
      proof!.merkleRoot = 'invalid-root';
      
      const isValid = MerkleTree.verifyProof(proof!);
      expect(isValid).toBe(false);
    });

    it('should reject invalid proof with tampered proof steps', () => {
      const proof = tree.generateProof('tx1');
      expect(proof).not.toBeNull();
      
      // Tamper with proof step
      if (proof!.proof.length > 0) {
        proof!.proof[0].hash = 'tampered-hash';
        
        const isValid = MerkleTree.verifyProof(proof!);
        expect(isValid).toBe(false);
      }
    });

    it('should handle proof verification errors gracefully', () => {
      const invalidProof: MerkleProof = {
        transactionId: 'tx1',
        merkleRoot: 'root',
        proof: [{ hash: 'invalid', position: 'left' as const }],
        index: 0
      };
      
      // Should not throw, just return false
      const isValid = MerkleTree.verifyProof(invalidProof);
      expect(isValid).toBe(false);
    });
  });

  describe('verifyInclusion', () => {
    it('should verify included transactions', () => {
      expect(tree.verifyInclusion('tx1')).toBe(true);
      expect(tree.verifyInclusion('tx2')).toBe(true);
      expect(tree.verifyInclusion('tx3')).toBe(true);
      expect(tree.verifyInclusion('tx4')).toBe(true);
    });

    it('should reject non-included transactions', () => {
      expect(tree.verifyInclusion('non-existent')).toBe(false);
    });
  });

  describe('getDepth', () => {
    it('should calculate correct depth for balanced tree', () => {
      expect(tree.getDepth()).toBe(3); // 4 transactions -> 3 levels
    });

    it('should return 0 for empty tree', () => {
      const emptyTree = new MerkleTree();
      expect(emptyTree.getDepth()).toBe(0);
    });

    it('should return 1 for single transaction', () => {
      const singleTree = new MerkleTree([transactions[0]]);
      expect(singleTree.getDepth()).toBe(1);
    });

    it('should calculate depth for odd number of transactions', () => {
      const oddTree = new MerkleTree(transactions.slice(0, 3));
      expect(oddTree.getDepth()).toBe(3);
    });
  });

  describe('validateTree', () => {
    it('should validate correct tree', () => {
      expect(tree.validateTree()).toBe(true);
    });

    it('should validate empty tree', () => {
      const emptyTree = new MerkleTree();
      expect(emptyTree.validateTree()).toBe(true);
    });

    it('should validate single transaction tree', () => {
      const singleTree = new MerkleTree([transactions[0]]);
      expect(singleTree.validateTree()).toBe(true);
    });
  });

  describe('getAllHashes', () => {
    it('should return all hashes in tree', () => {
      const hashes = tree.getAllHashes();
      expect(hashes.length).toBeGreaterThan(0);
      expect(hashes).toContain('tx1');
      expect(hashes).toContain('tx2');
      expect(hashes).toContain('tx3');
      expect(hashes).toContain('tx4');
      expect(hashes).toContain(tree.getMerkleRoot());
    });

    it('should return empty array for empty tree', () => {
      const emptyTree = new MerkleTree();
      const hashes = emptyTree.getAllHashes();
      expect(hashes).toEqual([]);
    });
  });

  describe('static methods', () => {
    describe('fromTransactionIds', () => {
      it('should create tree from transaction IDs', () => {
        const ids = ['id1', 'id2', 'id3'];
        const treeFromIds = MerkleTree.fromTransactionIds(ids);
        
        expect(treeFromIds.getTransactionCount()).toBe(3);
        expect(treeFromIds.verifyInclusion('id1')).toBe(true);
        expect(treeFromIds.verifyInclusion('id2')).toBe(true);
        expect(treeFromIds.verifyInclusion('id3')).toBe(true);
      });
    });

    describe('calculateMerkleRoot', () => {
      it('should calculate merkle root from transactions', () => {
        const root = MerkleTree.calculateMerkleRoot(transactions);
        expect(root).toBe(tree.getMerkleRoot());
      });

      it('should handle empty transaction array', () => {
        const root = MerkleTree.calculateMerkleRoot([]);
        expect(root).toBe(CryptoUtils.sha256(''));
      });
    });
  });

  describe('clone', () => {
    it('should create identical copy', () => {
      const cloned = tree.clone();
      
      expect(cloned.getMerkleRoot()).toBe(tree.getMerkleRoot());
      expect(cloned.getTransactionCount()).toBe(tree.getTransactionCount());
      expect(cloned.getDepth()).toBe(tree.getDepth());
    });

    it('should create independent copy', () => {
      const cloned = tree.clone();
      
      // Cloned tree should be independent
      expect(cloned).not.toBe(tree);
      expect(cloned.getRoot()).not.toBe(tree.getRoot());
    });
  });

  describe('toJSON', () => {
    it('should export tree structure', () => {
      const json = tree.toJSON();
      
      expect(json).toHaveProperty('root');
      expect(json).toHaveProperty('transactionCount', 4);
      expect(json).toHaveProperty('merkleRoot', tree.getMerkleRoot());
      expect(json).toHaveProperty('depth', tree.getDepth());
    });

    it('should handle empty tree', () => {
      const emptyTree = new MerkleTree();
      const json = emptyTree.toJSON();
      
      expect(json).toHaveProperty('root', null);
      expect(json).toHaveProperty('transactionCount', 0);
    });
  });

  describe('edge cases', () => {
    it('should handle large number of transactions', () => {
      const largeTxs = Array.from({ length: 1000 }, (_, i) => ({
        id: `tx${i}`,
        inputs: [],
        outputs: [],
        timestamp: i
      }));
      
      const largeTree = new MerkleTree(largeTxs);
      expect(largeTree.validateTree()).toBe(true);
      expect(largeTree.getTransactionCount()).toBe(1000);
      
      // Test proof generation and verification for random transaction
      const randomTx = largeTxs[Math.floor(Math.random() * largeTxs.length)];
      const proof = largeTree.generateProof(randomTx.id);
      expect(proof).not.toBeNull();
      expect(MerkleTree.verifyProof(proof!)).toBe(true);
    });

    it('should handle power of 2 transaction counts', () => {
      const powerOf2Txs = Array.from({ length: 8 }, (_, i) => ({
        id: `tx${i}`,
        inputs: [],
        outputs: [],
        timestamp: i
      }));
      
      const powerOf2Tree = new MerkleTree(powerOf2Txs);
      expect(powerOf2Tree.validateTree()).toBe(true);
      expect(powerOf2Tree.getDepth()).toBe(4); // 8 transactions -> 4 levels
    });
  });
});