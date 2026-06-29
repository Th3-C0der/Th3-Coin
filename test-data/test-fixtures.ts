/**
 * Test Fixtures and Utilities for Th3-Coin
 * Provides reusable test data and helper functions
 */

import { CryptoUtils } from '../src/core/crypto';
import { AddressUtils } from '../src/core/address';
import { BlockImpl, BlockHeaderImpl } from '../src/core/block';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../src/core/transaction';
import { BlockchainImpl } from '../src/core/blockchain';

/**
 * Generate test key pairs and addresses
 */
export function generateTestWallets(count: number = 2) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const keyPair = CryptoUtils.generateKeyPair();
    const address = AddressUtils.generateAddress(keyPair.publicKey);
    wallets.push({
      keyPair,
      address,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey
    });
  }
  return wallets;
}

/**
 * Create a test blockchain with genesis block
 */
export function createTestBlockchain(minerAddress?: string): BlockchainImpl {
  const wallets = generateTestWallets(1);
  const address = minerAddress || wallets[0].address;
  return new BlockchainImpl(address);
}

/**
 * Create a valid test block
 */
export async function createTestBlock(
  blockchain: BlockchainImpl,
  minerAddress: string,
  transactions: any[] = []
): Promise<BlockImpl> {
  const latestBlock = blockchain.getLatestBlock();
  const latestImpl = new BlockImpl(latestBlock.header, latestBlock.transactions);
  
  // Create coinbase transaction
  const coinbaseTx = TransactionImpl.createCoinbase(minerAddress, 2500000000, blockchain.getBlockHeight());
  
  // Create block header
  const header = new BlockHeaderImpl(
    blockchain.getBlockHeight(),
    latestImpl.getHash(),
    '',
    Date.now(),
    blockchain.calculateDifficulty(),
    0
  );
  
  // Create block with coinbase and additional transactions
  const allTransactions = [coinbaseTx, ...transactions];
  const block = new BlockImpl(header, allTransactions);
  block.updateMerkleRoot();
  
  // Mine the block
  while (!block.hasValidProofOfWork() && block.header.nonce < 100000) {
    block.header.nonce++;
    block.invalidateHash();
  }
  
  return block;
}

/**
 * Create a test transaction
 */
export function createTestTransaction(
  fromAddress: string,
  toAddress: string,
  amount: number,
  privateKey: string,
  utxoInput?: { txId: string; outputIndex: number }
): TransactionImpl {
  const input = utxoInput || {
    txId: '0'.repeat(64),
    outputIndex: 0
  };
  
  const txInput = new TransactionInputImpl(
    input.txId,
    input.outputIndex,
    'test_signature',
    fromAddress
  );
  
  const txOutput = new TransactionOutputImpl(toAddress, amount);
  
  return new TransactionImpl([txInput], [txOutput], Date.now());
}

/**
 * Create test configuration
 */
export function createTestConfig(overrides: any = {}) {
  const baseConfig = {
    network: {
      port: 18333 + Math.floor(Math.random() * 1000),
      maxPeers: 5,
      seedNodes: [],
      connectionTimeout: 5000,
    },
    mining: {
      enabled: false,
      difficulty: 1,
      blockReward: 5000000000,
      targetBlockTime: 10000,
    },
    storage: {
      dataDirectory: './test-data/temp',
      walletDirectory: './test-data/temp/wallets',
      blockchainFile: './test-data/temp/blockchain.json',
    },
    logging: {
      level: 'error' as const,
    },
  };
  
  return { ...baseConfig, ...overrides };
}

/**
 * Generate test UTXO set
 */
export function generateTestUTXOs(address: string, count: number = 5): any[] {
  const utxos = [];
  for (let i = 0; i < count; i++) {
    utxos.push({
      txId: '0'.repeat(64),
      outputIndex: i,
      address,
      amount: 1000000000 + (i * 100000000),
      script: `test_script_${i}`
    });
  }
  return utxos;
}

/**
 * Create test peer list
 */
export function createTestPeers(count: number = 3): any[] {
  const peers = [];
  for (let i = 0; i < count; i++) {
    peers.push({
      id: `peer_${i}`,
      address: '127.0.0.1',
      port: 8334 + i,
      lastSeen: Date.now() - (i * 1000),
      version: '1.0.0',
      chainHeight: 10 - i,
      status: i % 2 === 0 ? 'connected' : 'disconnected'
    });
  }
  return peers;
}

/**
 * Wait for async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random hash
 */
export function generateRandomHash(): string {
  return Array.from({ length: 64 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Create test block with specific properties
 */
export function createCustomBlock(options: {
  index?: number;
  previousHash?: string;
  timestamp?: number;
  difficulty?: number;
  nonce?: number;
  transactions?: any[];
}): BlockImpl {
  const {
    index = 1,
    previousHash = '0'.repeat(64),
    timestamp = Date.now(),
    difficulty = 1,
    nonce = 0,
    transactions = []
  } = options;
  
  const header = new BlockHeaderImpl(
    index,
    previousHash,
    '',
    timestamp,
    difficulty,
    nonce
  );
  
  const block = new BlockImpl(header, transactions);
  block.updateMerkleRoot();
  
  return block;
}
