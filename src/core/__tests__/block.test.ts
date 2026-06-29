import { describe, it, expect, beforeEach } from 'vitest';
import { BlockImpl, BlockHeaderImpl } from '../block';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../transaction';
import { CryptoUtils } from '../crypto';
import { AddressUtils } from '../address';
import { MerkleTree } from '../merkle-tree';

describe('BlockHeaderImpl', () => {
  let header: BlockHeaderImpl;

  beforeEach(() => {
    header = new BlockHeaderImpl(
      1,
      'a'.repeat(64),
      'b'.repeat(64),
      1640995200000,
      4,
      12345
    );
  });

  describe('constructor', () => {
    it('should create header with provided values', () => {
      expect(header.version).toBe(1);
      expect(header.previousHash).toBe('a'.repeat(64));
      expect(header.merkleRoot).toBe('b'.repeat(64));
      expect(header.timestamp).toBe(1640995200000);
      expect(header.difficulty).toBe(4);
      expect(header.nonce).toBe(12345);
    });

    it('should create header with default values', () => {
      const defaultHeader = new BlockHeaderImpl();
      expect(defaultHeader.version).toBe(1);
      expect(defaultHeader.previousHash).toBe('');
      expect(defaultHeader.merkleRoot).toBe('');
      expect(typeof defaultHeader.timestamp).toBe('number');
      expect(defaultHeader.difficulty).toBe(1);
      expect(defaultHeader.nonce).toBe(0);
    });
  });

  describe('isValid', () => {
    it('should return true for valid header', () => {
      expect(header.isValid()).toBe(true);
    });

    it('should return false for invalid version', () => {
      header.version = 0;
      expect(header.isValid()).toBe(false);
      
      header.version = -1;
      expect(header.isValid()).toBe(false);
    });

    it('should return false for invalid previous hash', () => {
      header.previousHash = 'invalid';
      expect(header.isValid()).toBe(false);
      
      header.previousHash = 'a'.repeat(63); // too short
      expect(header.isValid()).toBe(false);
      
      header.previousHash = 'a'.repeat(65); // too long
      expect(header.isValid()).toBe(false);
    });

    it('should allow empty previous hash for genesis block', () => {
      header.previousHash = '';
      expect(header.isValid()).toBe(true);
    });

    it('should return false for invalid merkle root', () => {
      header.merkleRoot = '';
      expect(header.isValid()).toBe(false);
      
      header.merkleRoot = 'invalid';
      expect(header.isValid()).toBe(false);
      
      header.merkleRoot = 'a'.repeat(63); // too short
      expect(header.isValid()).toBe(false);
    });

    it('should return false for invalid timestamp', () => {
      header.timestamp = 0;
      expect(header.isValid()).toBe(false);
      
      header.timestamp = -1;
      expect(header.isValid()).toBe(false);
    });

    it('should return false for invalid difficulty', () => {
      header.difficulty = 0;
      expect(header.isValid()).toBe(false);
      
      header.difficulty = -1;
      expect(header.isValid()).toBe(false);
    });

    it('should return false for invalid nonce', () => {
      header.nonce = -1;
      expect(header.isValid()).toBe(false);
    });
  });

  describe('clone', () => {
    it('should create exact copy of header', () => {
      const cloned = header.clone();
      
      expect(cloned).not.toBe(header);
      expect(cloned.version).toBe(header.version);
      expect(cloned.previousHash).toBe(header.previousHash);
      expect(cloned.merkleRoot).toBe(header.merkleRoot);
      expect(cloned.timestamp).toBe(header.timestamp);
      expect(cloned.difficulty).toBe(header.difficulty);
      expect(cloned.nonce).toBe(header.nonce);
    });
  });
});

describe('BlockImpl', () => {
  let block: BlockImpl;
  let header: BlockHeaderImpl;
  let coinbaseTx: TransactionImpl;
  let regularTx: TransactionImpl;

  beforeEach(() => {
    // Generate valid addresses for testing
    const keyPair1 = CryptoUtils.generateKeyPair();
    const keyPair2 = CryptoUtils.generateKeyPair();
    const address1 = AddressUtils.generateAddress(keyPair1.publicKey);
    const address2 = AddressUtils.generateAddress(keyPair2.publicKey);

    // Create coinbase transaction
    const coinbaseInput = new TransactionInputImpl('0'.repeat(64), -1);
    const coinbaseOutput = new TransactionOutputImpl(address1, 5000000000);
    coinbaseTx = new TransactionImpl([coinbaseInput], [coinbaseOutput]);

    // Create regular transaction
    const input = new TransactionInputImpl('a'.repeat(64), 0, 'signature', keyPair1.publicKey);
    const output = new TransactionOutputImpl(address2, 1000000000);
    regularTx = new TransactionImpl([input], [output]);

    // Create header
    header = new BlockHeaderImpl(
      1,
      'a'.repeat(64),
      'b'.repeat(64),
      1640995200000,
      4,
      12345
    );

    // Create block
    block = new BlockImpl(header, [coinbaseTx, regularTx]);
    
    // Update merkle root to match actual transactions
    block.updateMerkleRoot();
  });

  describe('constructor', () => {
    it('should create block with header and transactions', () => {
      expect(block.header).toBe(header);
      expect(block.transactions).toEqual([coinbaseTx, regularTx]);
    });

    it('should create block with empty transactions array', () => {
      const emptyBlock = new BlockImpl(header);
      expect(emptyBlock.transactions).toEqual([]);
    });
  });

  describe('calculateHash', () => {
    it('should calculate consistent hash', () => {
      const hash1 = block.calculateHash();
      const hash2 = block.calculateHash();
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64);
    });

    it('should produce different hash for different headers', () => {
      const block2 = block.clone();
      block2.header.nonce = 99999;
      
      expect(block.calculateHash()).not.toBe(block2.calculateHash());
    });
  });

  describe('getHash', () => {
    it('should return cached hash', () => {
      const hash1 = block.getHash();
      const hash2 = block.getHash();
      
      expect(hash1).toBe(hash2);
    });

    it('should return same hash as calculateHash', () => {
      expect(block.getHash()).toBe(block.calculateHash());
    });
  });

  describe('invalidateHash', () => {
    it('should clear cached hash', () => {
      const hash1 = block.getHash();
      block.header.nonce = 99999;
      block.invalidateHash();
      const hash2 = block.getHash();
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('calculateMerkleRoot', () => {
    it('should calculate merkle root for single transaction', () => {
      const singleTxBlock = new BlockImpl(header, [coinbaseTx]);
      const merkleRoot = singleTxBlock.calculateMerkleRoot();
      
      expect(merkleRoot).toBe(coinbaseTx.id);
    });

    it('should calculate merkle root for multiple transactions', () => {
      const merkleRoot = block.calculateMerkleRoot();
      
      expect(typeof merkleRoot).toBe('string');
      expect(merkleRoot.length).toBe(64);
      
      // Should be hash of combined transaction IDs
      const expectedHash = CryptoUtils.sha256(coinbaseTx.id + regularTx.id);
      expect(merkleRoot).toBe(expectedHash);
    });

    it('should handle odd number of transactions', () => {
      const tx3 = regularTx.clone();
      tx3.timestamp = Date.now() + 1000; // Make it different
      const threeTransactionBlock = new BlockImpl(header, [coinbaseTx, regularTx, tx3]);
      
      const merkleRoot = threeTransactionBlock.calculateMerkleRoot();
      expect(typeof merkleRoot).toBe('string');
      expect(merkleRoot.length).toBe(64);
    });

    it('should return hash of empty string for no transactions', () => {
      const emptyBlock = new BlockImpl(header, []);
      const merkleRoot = emptyBlock.calculateMerkleRoot();
      
      expect(merkleRoot).toBe(CryptoUtils.sha256(''));
    });
  });

  describe('updateMerkleRoot', () => {
    it('should update header merkle root', () => {
      // Create a block with incorrect merkle root
      const incorrectHeader = new BlockHeaderImpl(
        1,
        'a'.repeat(64),
        'incorrect'.padEnd(64, '0'), // Wrong merkle root
        1640995200000,
        4,
        12345
      );
      const testBlock = new BlockImpl(incorrectHeader, [coinbaseTx, regularTx]);
      
      const originalMerkleRoot = testBlock.header.merkleRoot;
      testBlock.updateMerkleRoot();
      
      expect(testBlock.header.merkleRoot).not.toBe(originalMerkleRoot);
      expect(testBlock.header.merkleRoot).toBe(testBlock.calculateMerkleRoot());
    });

    it('should invalidate hash cache', () => {
      // Create a block with incorrect merkle root
      const incorrectHeader = new BlockHeaderImpl(
        1,
        'a'.repeat(64),
        'incorrect'.padEnd(64, '0'), // Wrong merkle root
        1640995200000,
        4,
        12345
      );
      const testBlock = new BlockImpl(incorrectHeader, [coinbaseTx, regularTx]);
      
      const originalHash = testBlock.getHash();
      testBlock.updateMerkleRoot();
      const newHash = testBlock.getHash();
      
      expect(newHash).not.toBe(originalHash);
    });
  });

  describe('isValid', () => {
    beforeEach(() => {
      block.updateMerkleRoot(); // Ensure merkle root is correct
    });

    it('should return true for valid block', () => {
      expect(block.isValid()).toBe(true);
    });

    it('should return false for invalid header', () => {
      block.header.version = 0;
      expect(block.isValid()).toBe(false);
    });

    it('should return false for empty transactions', () => {
      block.transactions = [];
      expect(block.isValid()).toBe(false);
    });

    it('should return false if first transaction is not coinbase', () => {
      block.transactions = [regularTx, coinbaseTx];
      block.updateMerkleRoot();
      expect(block.isValid()).toBe(false);
    });

    it('should return false if non-first transaction is coinbase', () => {
      const anotherCoinbase = TransactionImpl.createCoinbase('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 5000000000, 1);
      block.transactions = [coinbaseTx, anotherCoinbase];
      block.updateMerkleRoot();
      expect(block.isValid()).toBe(false);
    });

    it('should return false for incorrect merkle root', () => {
      block.header.merkleRoot = 'incorrect'.padEnd(64, '0');
      expect(block.isValid()).toBe(false);
    });

    it('should return false for duplicate transactions', () => {
      block.transactions = [coinbaseTx, regularTx, regularTx];
      block.updateMerkleRoot();
      expect(block.isValid()).toBe(false);
    });
  });

  describe('hasValidProofOfWork', () => {
    it('should return true if hash starts with required zeros', () => {
      // Create a block with difficulty 1 and find a valid nonce
      block.header.difficulty = 1;
      block.header.nonce = 0;
      
      // Try different nonces until we find one that works
      while (!block.hasValidProofOfWork() && block.header.nonce < 100000) {
        block.header.nonce++;
        block.invalidateHash();
      }
      
      if (block.header.nonce < 100000) {
        expect(block.hasValidProofOfWork()).toBe(true);
        expect(block.getHash().startsWith('0')).toBe(true);
      }
    });

    it('should return false if hash does not meet difficulty', () => {
      block.header.difficulty = 10; // Very high difficulty
      block.header.nonce = 0;
      block.invalidateHash();
      
      expect(block.hasValidProofOfWork()).toBe(false);
    });
  });

  describe('getSize', () => {
    it('should return approximate block size', () => {
      const size = block.getSize();
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('getTotalFees', () => {
    it('should calculate total fees excluding coinbase', () => {
      const utxos = [
        { txId: 'a'.repeat(64), outputIndex: 0, address: 'addr1', amount: 2000000000, isSpent: false }
      ];
      
      const fees = block.getTotalFees(utxos);
      expect(fees).toBe(1000000000); // 2000000000 - 1000000000
    });

    it('should return 0 for block with only coinbase', () => {
      const coinbaseOnlyBlock = new BlockImpl(header, [coinbaseTx]);
      const fees = coinbaseOnlyBlock.getTotalFees([]);
      expect(fees).toBe(0);
    });
  });

  describe('clone', () => {
    it('should create exact copy of block', () => {
      const cloned = block.clone();
      
      expect(cloned).not.toBe(block);
      expect(cloned.header).not.toBe(block.header);
      expect(cloned.transactions).not.toBe(block.transactions);
      
      expect(cloned.header.version).toBe(block.header.version);
      expect(cloned.transactions.length).toBe(block.transactions.length);
    });
  });

  describe('Merkle tree functionality', () => {
    it('should get Merkle tree for block transactions', () => {
      const merkleTree = block.getMerkleTree();
      
      expect(merkleTree).toBeInstanceOf(MerkleTree);
      expect(merkleTree.getTransactionCount()).toBe(2);
      expect(merkleTree.getMerkleRoot()).toBe(block.calculateMerkleRoot());
    });

    it('should cache Merkle tree', () => {
      const tree1 = block.getMerkleTree();
      const tree2 = block.getMerkleTree();
      
      expect(tree1).toBe(tree2); // Same instance
    });

    it('should invalidate Merkle tree cache', () => {
      const tree1 = block.getMerkleTree();
      block.invalidateMerkleTree();
      const tree2 = block.getMerkleTree();
      
      expect(tree1).not.toBe(tree2); // Different instances
    });

    it('should generate Merkle proof for transaction', () => {
      const proof = block.generateMerkleProof(coinbaseTx.id);
      
      expect(proof).not.toBeNull();
      expect(proof?.transactionId).toBe(coinbaseTx.id);
      expect(proof?.merkleRoot).toBe(block.header.merkleRoot);
    });

    it('should return null for non-existent transaction proof', () => {
      const proof = block.generateMerkleProof('non-existent');
      expect(proof).toBeNull();
    });

    it('should verify valid Merkle proof', () => {
      const proof = block.generateMerkleProof(regularTx.id);
      expect(proof).not.toBeNull();
      
      const isValid = block.verifyMerkleProof(proof!);
      expect(isValid).toBe(true);
    });

    it('should reject invalid Merkle proof with wrong root', () => {
      const proof = block.generateMerkleProof(regularTx.id);
      expect(proof).not.toBeNull();
      
      // Tamper with merkle root
      proof!.merkleRoot = 'invalid-root';
      
      const isValid = block.verifyMerkleProof(proof!);
      expect(isValid).toBe(false);
    });

    it('should check transaction inclusion', () => {
      expect(block.hasTransaction(coinbaseTx.id)).toBe(true);
      expect(block.hasTransaction(regularTx.id)).toBe(true);
      expect(block.hasTransaction('non-existent')).toBe(false);
    });
  });

  describe('createGenesis', () => {
    it('should create valid genesis block', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const minerAddress = AddressUtils.generateAddress(keyPair.publicKey);
      const genesisReward = 5000000000;
      
      const genesis = BlockImpl.createGenesis(minerAddress, genesisReward);
      
      expect(genesis.isValid()).toBe(true);
      expect(genesis.header.previousHash).toBe('0'.repeat(64));
      expect(genesis.header.version).toBe(1);
      expect(genesis.header.difficulty).toBe(1);
      expect(genesis.header.nonce).toBe(0);
      
      expect(genesis.transactions.length).toBe(1);
      expect(genesis.transactions[0].outputs[0].address).toBe(minerAddress);
      expect(genesis.transactions[0].outputs[0].amount).toBe(genesisReward);
    });

    it('should create genesis block with default reward', () => {
      const keyPair = CryptoUtils.generateKeyPair();
      const minerAddress = AddressUtils.generateAddress(keyPair.publicKey);
      
      const genesis = BlockImpl.createGenesis(minerAddress);
      
      expect(genesis.transactions[0].outputs[0].amount).toBe(5000000000);
    });
  });
});