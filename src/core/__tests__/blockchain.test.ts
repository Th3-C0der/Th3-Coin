import { describe, it, expect, beforeEach } from 'vitest';
import { BlockchainImpl } from '../blockchain';
import { BlockImpl, BlockHeaderImpl } from '../block';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../transaction';
import { CryptoUtils } from '../crypto';
import { AddressUtils } from '../address';

describe('BlockchainImpl', () => {
  let blockchain: BlockchainImpl;
  let minerKeyPair: any;
  let minerAddress: string;
  let userKeyPair: any;
  let userAddress: string;

  beforeEach(() => {
    // Generate test addresses
    minerKeyPair = CryptoUtils.generateKeyPair();
    minerAddress = AddressUtils.generateAddress(minerKeyPair.publicKey);
    userKeyPair = CryptoUtils.generateKeyPair();
    userAddress = AddressUtils.generateAddress(userKeyPair.publicKey);

    // Create blockchain with genesis block
    blockchain = new BlockchainImpl(minerAddress);
  });

  describe('constructor', () => {
    it('should create blockchain with genesis block', () => {
      expect(blockchain.getBlockHeight()).toBe(1);
      
      const genesisBlock = blockchain.getLatestBlock();
      expect(genesisBlock.header.previousHash).toBe('0'.repeat(64));
      expect(genesisBlock.transactions.length).toBe(1);
      
      const coinbaseTx = new TransactionImpl(
        genesisBlock.transactions[0].inputs,
        genesisBlock.transactions[0].outputs,
        genesisBlock.transactions[0].timestamp
      );
      expect(coinbaseTx.isCoinbase()).toBe(true);
    });

    it('should create empty blockchain without genesis address', () => {
      const emptyBlockchain = new BlockchainImpl();
      expect(emptyBlockchain.getBlockHeight()).toBe(0);
    });

    it('should initialize miner balance with genesis reward', () => {
      const balance = blockchain.getBalance(minerAddress);
      expect(balance).toBe(5000000000); // 50 Th3Coins
    });
  });

  describe('addBlock', () => {
    it('should add valid block to blockchain', async () => {
      const newBlock = await createValidBlock(blockchain, minerAddress);
      const result = await blockchain.addBlock(newBlock);
      
      expect(result).toBe(true);
      expect(blockchain.getBlockHeight()).toBe(2);
    });

    it('should reject invalid block', async () => {
      // Create block with invalid previous hash
      const invalidBlock = await createValidBlock(blockchain, minerAddress);
      invalidBlock.header.previousHash = 'invalid';
      
      const result = await blockchain.addBlock(invalidBlock);
      expect(result).toBe(false);
      expect(blockchain.getBlockHeight()).toBe(1);
    });

    it('should update UTXO set when block is added', async () => {
      const initialBalance = blockchain.getBalance(minerAddress);
      
      const newBlock = await createValidBlock(blockchain, minerAddress);
      await blockchain.addBlock(newBlock);
      
      const newBalance = blockchain.getBalance(minerAddress);
      expect(newBalance).toBeGreaterThan(initialBalance);
    });
  });

  describe('getBlock', () => {
    it('should return block by hash', async () => {
      const genesisBlock = blockchain.getLatestBlock();
      const genesisImpl = new BlockImpl(genesisBlock.header, genesisBlock.transactions);
      const hash = genesisImpl.getHash();
      
      const retrievedBlock = await blockchain.getBlock(hash);
      expect(retrievedBlock).not.toBeNull();
      expect(retrievedBlock?.header.previousHash).toBe('0'.repeat(64));
    });

    it('should return null for non-existent hash', async () => {
      const nonExistentHash = 'a'.repeat(64);
      const result = await blockchain.getBlock(nonExistentHash);
      expect(result).toBeNull();
    });
  });

  describe('getLatestBlock', () => {
    it('should return latest block', () => {
      const latestBlock = blockchain.getLatestBlock();
      expect(latestBlock.header.previousHash).toBe('0'.repeat(64));
    });

    it('should throw error for empty blockchain', () => {
      const emptyBlockchain = new BlockchainImpl();
      expect(() => emptyBlockchain.getLatestBlock()).toThrow('No blocks in blockchain');
    });
  });

  describe('validateBlock', () => {
    it('should validate genesis block', () => {
      const genesisBlock = BlockImpl.createGenesis(minerAddress);
      const emptyBlockchain = new BlockchainImpl();
      
      expect(emptyBlockchain.validateBlock(genesisBlock)).toBe(true);
    });

    it('should validate regular block', async () => {
      const validBlock = await createValidBlock(blockchain, minerAddress);
      expect(blockchain.validateBlock(validBlock)).toBe(true);
    });

    it('should reject block with invalid previous hash', async () => {
      const invalidBlock = await createValidBlock(blockchain, minerAddress);
      invalidBlock.header.previousHash = 'invalid';
      
      expect(blockchain.validateBlock(invalidBlock)).toBe(false);
    });

    it('should reject block with invalid timestamp', async () => {
      const invalidBlock = await createValidBlock(blockchain, minerAddress);
      invalidBlock.header.timestamp = blockchain.getLatestBlock().header.timestamp - 1000;
      
      expect(blockchain.validateBlock(invalidBlock)).toBe(false);
    });

    it('should reject block without coinbase as first transaction', async () => {
      const latestBlock = blockchain.getLatestBlock();
      const latestImpl = new BlockImpl(latestBlock.header, latestBlock.transactions);
      
      // Create regular transaction
      const regularTx = new TransactionImpl(
        [new TransactionInputImpl('a'.repeat(64), 0, 'sig', minerKeyPair.publicKey)],
        [new TransactionOutputImpl(userAddress, 1000000000)]
      );
      
      const header = new BlockHeaderImpl(
        1,
        latestImpl.getHash(),
        '',
        Date.now(),
        1,
        0
      );
      
      const invalidBlock = new BlockImpl(header, [regularTx]);
      invalidBlock.updateMerkleRoot();
      
      expect(blockchain.validateBlock(invalidBlock)).toBe(false);
    });
  });

  describe('calculateDifficulty', () => {
    it('should return 1 for empty blockchain', () => {
      const emptyBlockchain = new BlockchainImpl();
      expect(emptyBlockchain.calculateDifficulty()).toBe(1);
    });

    it('should return current difficulty for insufficient blocks', () => {
      const difficulty = blockchain.calculateDifficulty();
      expect(difficulty).toBe(1);
    });

    it('should adjust difficulty based on block time', async () => {
      // Add blocks quickly to trigger difficulty increase
      for (let i = 0; i < 10; i++) {
        const block = await createValidBlock(blockchain, minerAddress);
        // Set timestamp to be very close together (1 second apart)
        block.header.timestamp = blockchain.getLatestBlock().header.timestamp + 1000;
        block.invalidateHash(); // Recalculate hash after timestamp change
        
        // Re-mine the block with new timestamp
        block.header.nonce = 0;
        while (!block.hasValidProofOfWork() && block.header.nonce < 100000) {
          block.header.nonce++;
          block.invalidateHash();
        }
        
        const added = await blockchain.addBlock(block);
        expect(added).toBe(true); // Ensure block was actually added
      }
      
      const newDifficulty = blockchain.calculateDifficulty();
      expect(newDifficulty).toBeGreaterThan(1);
    });
  });

  describe('getBalance', () => {
    it('should return correct balance for address', () => {
      const balance = blockchain.getBalance(minerAddress);
      expect(balance).toBe(5000000000);
    });

    it('should return 0 for address with no UTXOs', () => {
      const balance = blockchain.getBalance(userAddress);
      expect(balance).toBe(0);
    });
  });

  describe('getBlockHeight', () => {
    it('should return correct block height', () => {
      expect(blockchain.getBlockHeight()).toBe(1);
    });

    it('should update height when blocks are added', async () => {
      const block = await createValidBlock(blockchain, minerAddress);
      await blockchain.addBlock(block);
      
      expect(blockchain.getBlockHeight()).toBe(2);
    });
  });

  describe('getUTXOs', () => {
    it('should return UTXOs for address', () => {
      const utxos = blockchain.getUTXOs(minerAddress);
      expect(utxos.length).toBe(1);
      expect(utxos[0].amount).toBe(5000000000);
    });

    it('should return empty array for address with no UTXOs', () => {
      const utxos = blockchain.getUTXOs(userAddress);
      expect(utxos).toEqual([]);
    });
  });

  describe('getAllBlocks', () => {
    it('should return all blocks in chain', () => {
      const blocks = blockchain.getAllBlocks();
      expect(blocks.length).toBe(1);
      expect(blocks[0]).toBe(blockchain.getLatestBlock());
    });

    it('should return copy of blocks array', () => {
      const blocks = blockchain.getAllBlocks();
      blocks.push({} as any); // Modify returned array
      
      expect(blockchain.getBlockHeight()).toBe(1); // Original should be unchanged
    });
  });

  describe('replaceChain', () => {
    it('should replace chain with longer valid chain', async () => {
      // Create longer chain
      const newChain = [blockchain.getLatestBlock()];
      
      for (let i = 0; i < 3; i++) {
        const tempBlockchain = new BlockchainImpl();
        tempBlockchain['blocks'] = [...newChain];
        
        const block = await createValidBlock(tempBlockchain, minerAddress);
        newChain.push(block);
      }
      
      const result = await blockchain.replaceChain(newChain);
      expect(result).toBe(true);
      expect(blockchain.getBlockHeight()).toBe(4);
    });

    it('should reject shorter chain', async () => {
      const shorterChain = [blockchain.getLatestBlock()];
      const result = await blockchain.replaceChain(shorterChain);
      
      expect(result).toBe(false);
      expect(blockchain.getBlockHeight()).toBe(1);
    });

    it('should reject invalid chain', async () => {
      // Create invalid chain with wrong previous hash
      const invalidChain = [blockchain.getLatestBlock()];
      const invalidBlock = await createValidBlock(blockchain, minerAddress);
      invalidBlock.header.previousHash = 'invalid';
      invalidChain.push(invalidBlock);
      
      const result = await blockchain.replaceChain(invalidChain);
      expect(result).toBe(false);
    });
  });

  describe('isValidChain', () => {
    it('should validate correct chain', () => {
      const chain = blockchain.getAllBlocks();
      expect(blockchain.isValidChain(chain)).toBe(true);
    });

    it('should reject empty chain', () => {
      expect(blockchain.isValidChain([])).toBe(false);
    });

    it('should reject chain with invalid genesis', () => {
      const invalidGenesis = BlockImpl.createGenesis(minerAddress);
      invalidGenesis.header.previousHash = 'invalid';
      
      expect(blockchain.isValidChain([invalidGenesis])).toBe(false);
    });

    it('should reject chain with broken links', async () => {
      const chain = [blockchain.getLatestBlock()];
      const block = await createValidBlock(blockchain, minerAddress);
      block.header.previousHash = 'invalid';
      chain.push(block);
      
      expect(blockchain.isValidChain(chain)).toBe(false);
    });
  });
});

// Helper function to create a valid block
async function createValidBlock(blockchain: BlockchainImpl, minerAddress: string): Promise<BlockImpl> {
  const latestBlock = blockchain.getLatestBlock();
  const latestImpl = new BlockImpl(latestBlock.header, latestBlock.transactions);
  
  // Create coinbase transaction
  const coinbaseTx = TransactionImpl.createCoinbase(minerAddress, 2500000000, blockchain.getBlockHeight());
  
  // Create block header with timestamp after latest block
  const header = new BlockHeaderImpl(
    1,
    latestImpl.getHash(),
    '',
    latestBlock.header.timestamp + 60000, // 1 minute after latest block
    blockchain.calculateDifficulty(),
    0
  );
  
  // Create block
  const block = new BlockImpl(header, [coinbaseTx]);
  block.updateMerkleRoot();
  
  // Mine the block (find valid nonce for proof of work)
  while (!block.hasValidProofOfWork() && block.header.nonce < 100000) {
    block.header.nonce++;
    block.invalidateHash();
  }
  
  return block;
}