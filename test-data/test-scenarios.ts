/**
 * Test Scenarios for Th3-Coin
 * Pre-defined test scenarios for integration and system tests
 */

import { BlockchainImpl } from '../src/core/blockchain';
import { TransactionImpl, TransactionInputImpl, TransactionOutputImpl } from '../src/core/transaction';
import { BlockImpl } from '../src/core/block';
import { generateTestWallets, createTestBlock, delay } from './test-fixtures';

/**
 * Scenario 1: Simple blockchain with multiple blocks
 */
export async function scenarioSimpleBlockchain() {
  const wallets = generateTestWallets(2);
  const blockchain = new BlockchainImpl(wallets[0].address);
  
  // Add 5 blocks
  for (let i = 0; i < 5; i++) {
    const block = await createTestBlock(blockchain, wallets[0].address);
    await blockchain.addBlock(block);
  }
  
  return {
    blockchain,
    wallets,
    blockCount: 5
  };
}

/**
 * Scenario 2: Blockchain with transactions
 */
export async function scenarioBlockchainWithTransactions() {
  const wallets = generateTestWallets(3);
  const blockchain = new BlockchainImpl(wallets[0].address);
  
  // Create initial blocks to establish UTXOs
  for (let i = 0; i < 2; i++) {
    const block = await createTestBlock(blockchain, wallets[0].address);
    await blockchain.addBlock(block);
  }
  
  // Create a transaction from wallet[0] to wallet[1]
  const utxos = blockchain.getUTXOs(wallets[0].address);
  if (utxos.length > 0) {
    const tx = new TransactionImpl(
      [new TransactionInputImpl(utxos[0].txId, utxos[0].outputIndex, 'sig', wallets[0].address)],
      [new TransactionOutputImpl(wallets[1].address, 1000000000)]
    );
    
    const block = await createTestBlock(blockchain, wallets[0].address, [tx]);
    await blockchain.addBlock(block);
  }
  
  return {
    blockchain,
    wallets,
    transactionCount: 1
  };
}

/**
 * Scenario 3: Chain reorganization
 */
export async function scenarioChainReorganization() {
  const wallets = generateTestWallets(2);
  
  // Create original chain
  const chain1 = new BlockchainImpl(wallets[0].address);
  for (let i = 0; i < 3; i++) {
    const block = await createTestBlock(chain1, wallets[0].address);
    await chain1.addBlock(block);
  }
  
  // Create competing chain
  const chain2 = new BlockchainImpl(wallets[0].address);
  for (let i = 0; i < 5; i++) {
    const block = await createTestBlock(chain2, wallets[0].address);
    await chain2.addBlock(block);
  }
  
  return {
    originalChain: chain1,
    competingChain: chain2,
    originalHeight: 3,
    competingHeight: 5
  };
}

/**
 * Scenario 4: Difficulty adjustment
 */
export async function scenarioDifficultyAdjustment() {
  const wallets = generateTestWallets(1);
  const blockchain = new BlockchainImpl(wallets[0].address);
  
  // Add blocks with varying timestamps to trigger difficulty adjustment
  for (let i = 0; i < 15; i++) {
    const block = await createTestBlock(blockchain, wallets[0].address);
    // Set timestamps to be very close (fast mining)
    block.header.timestamp = blockchain.getLatestBlock().header.timestamp + 1000;
    block.invalidateHash();
    
    // Re-mine
    block.header.nonce = 0;
    while (!block.hasValidProofOfWork() && block.header.nonce < 100000) {
      block.header.nonce++;
      block.invalidateHash();
    }
    
    await blockchain.addBlock(block);
  }
  
  const finalDifficulty = blockchain.calculateDifficulty();
  
  return {
    blockchain,
    initialDifficulty: 1,
    finalDifficulty,
    blockCount: 15
  };
}

/**
 * Scenario 5: Multiple transactions in single block
 */
export async function scenarioMultipleTransactions() {
  const wallets = generateTestWallets(5);
  const blockchain = new BlockchainImpl(wallets[0].address);
  
  // Create initial UTXOs
  for (let i = 0; i < 3; i++) {
    const block = await createTestBlock(blockchain, wallets[0].address);
    await blockchain.addBlock(block);
  }
  
  // Create multiple transactions
  const transactions = [];
  const utxos = blockchain.getUTXOs(wallets[0].address);
  
  for (let i = 0; i < Math.min(4, utxos.length); i++) {
    const tx = new TransactionImpl(
      [new TransactionInputImpl(utxos[i].txId, utxos[i].outputIndex, 'sig', wallets[0].address)],
      [new TransactionOutputImpl(wallets[i + 1].address, 500000000)]
    );
    transactions.push(tx);
  }
  
  // Add all transactions in one block
  const block = await createTestBlock(blockchain, wallets[0].address, transactions);
  await blockchain.addBlock(block);
  
  return {
    blockchain,
    wallets,
    transactionCount: transactions.length
  };
}

/**
 * Scenario 6: Empty blockchain
 */
export function scenarioEmptyBlockchain() {
  const blockchain = new BlockchainImpl();
  return {
    blockchain,
    blockCount: 0
  };
}

/**
 * Scenario 7: Invalid block detection
 */
export async function scenarioInvalidBlock() {
  const wallets = generateTestWallets(1);
  const blockchain = new BlockchainImpl(wallets[0].address);
  
  // Create valid block
  const validBlock = await createTestBlock(blockchain, wallets[0].address);
  
  // Create invalid block (wrong previous hash)
  const invalidBlock = await createTestBlock(blockchain, wallets[0].address);
  invalidBlock.header.previousHash = 'invalid_hash';
  invalidBlock.invalidateHash();
  
  return {
    blockchain,
    validBlock,
    invalidBlock
  };
}

/**
 * Scenario 8: Balance tracking
 */
export async function scenarioBalanceTracking() {
  const wallets = generateTestWallets(3);
  const blockchain = new BlockchainImpl(wallets[0].address);
  
  // Track balances over time
  const balances: {
    wallet0: number[];
    wallet1: number[];
    wallet2: number[];
  } = {
    wallet0: [],
    wallet1: [],
    wallet2: []
  };
  
  // Initial state
  balances.wallet0.push(blockchain.getBalance(wallets[0].address));
  balances.wallet1.push(blockchain.getBalance(wallets[1].address));
  balances.wallet2.push(blockchain.getBalance(wallets[2].address));
  
  // Add blocks and track changes
  for (let i = 0; i < 5; i++) {
    const block = await createTestBlock(blockchain, wallets[0].address);
    await blockchain.addBlock(block);
    
    balances.wallet0.push(blockchain.getBalance(wallets[0].address));
    balances.wallet1.push(blockchain.getBalance(wallets[1].address));
    balances.wallet2.push(blockchain.getBalance(wallets[2].address));
  }
  
  return {
    blockchain,
    wallets,
    balances
  };
}
