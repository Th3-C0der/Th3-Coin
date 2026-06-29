import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockchainImpl } from '../core/blockchain';
import { Wallet } from '../wallet/wallet';
import { UTXOManager } from '../core/utxo-manager';
import { MinerImpl } from '../core/mining';
import { Mempool } from '../core/mempool';
import { TransactionImpl } from '../core/transaction';
import { Transaction, Block } from '../interfaces';
import * as fs from 'fs';
import * as path from 'path';

describe('End-to-End Transaction Flow Integration Tests', () => {
  let blockchain: BlockchainImpl;
  let senderWallet: Wallet;
  let recipientWallet: Wallet;
  let minerWallet: Wallet;
  let miner: MinerImpl;
  let mempool: Mempool;
  let testDataDir: string;

  beforeEach(async () => {
    // Create test data directory
    testDataDir = path.join(__dirname, '../../test-data', `test-${Date.now()}`);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Initialize wallets
    senderWallet = new Wallet();
    recipientWallet = new Wallet();
    minerWallet = new Wallet();

    // Initialize blockchain with miner address
    blockchain = new BlockchainImpl();
    await blockchain.initialize(minerWallet.getAddress());

    // Initialize miner
    miner = new MinerImpl(minerWallet.getAddress(), {
      difficulty: 1, // Low difficulty for fast testing
      blockReward: 2500000000, // 25 Th3Coins
      targetBlockTime: 10 // 10 seconds for testing
    });

    // Initialize mempool with UTXO provider that returns all UTXOs
    mempool = new Mempool(() => {
      // Get all UTXOs from the blockchain's UTXO manager
      const utxoManager = (blockchain as any).utxoManager;
      return utxoManager ? utxoManager.getAllUTXOs() : [];
    });

    // Create a new miner that mines to the sender's address to fund them
    const senderMiner = new MinerImpl(senderWallet.getAddress(), {
      difficulty: 1,
      blockReward: 2500000000,
      targetBlockTime: 10
    });

    // Mine a block with sender as coinbase recipient
    const latestBlock = blockchain.getLatestBlock();
    const latestBlockHash = miner.calculateHash(latestBlock);
    const senderFundingBlock = await senderMiner.mineBlock([], latestBlockHash);
    await blockchain.addBlock(senderFundingBlock);
  });

  afterEach(() => {
    // Clean up test data directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Complete Transaction Lifecycle', () => {
    it('should complete full transaction flow from creation to confirmation', async () => {
      const transferAmount = 1000000000; // 10 Th3Coins
      const transactionFee = 10000000; // 0.1 Th3Coins

      // Step 1: Check initial balances
      const initialSenderBalance = blockchain.getBalance(senderWallet.getAddress());
      const initialRecipientBalance = blockchain.getBalance(recipientWallet.getAddress());
      
      expect(initialSenderBalance).toBeGreaterThan(transferAmount + transactionFee);
      expect(initialRecipientBalance).toBe(0);

      // Step 2: Create transaction
      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);
      const transaction = senderWallet.createTransaction(
        recipientWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );

      expect(transaction).toBeDefined();
      expect(transaction.inputs.length).toBeGreaterThan(0);
      expect(transaction.outputs.length).toBeGreaterThan(0);

      // Step 3: Sign transaction
      senderWallet.signTransaction(transaction);
      expect(transaction.signature).toBeDefined();
      expect(senderWallet.verifyTransactionSignature(transaction)).toBe(true);

      // Step 4: Add transaction to mempool
      const addedToMempool = mempool.addTransaction(transaction);
      expect(addedToMempool).toBe(true);
      expect(mempool.getPendingTransactions()).toContain(transaction);

      // Step 5: Mine block with transaction
      const pendingTransactions = mempool.getPendingTransactions();
      const currentLatestBlock = blockchain.getLatestBlock();
      const currentLatestBlockHash = miner.calculateHash(currentLatestBlock);
      const newBlock = await miner.mineBlock(pendingTransactions, currentLatestBlockHash);
      
      expect(newBlock.transactions.length).toBe(pendingTransactions.length + 1); // +1 for coinbase
      expect(newBlock.transactions.slice(1)).toContain(transaction); // Skip coinbase

      // Step 6: Add block to blockchain
      const blockAdded = await blockchain.addBlock(newBlock);
      expect(blockAdded).toBe(true);

      // Step 7: Remove confirmed transactions from mempool
      for (const tx of pendingTransactions) {
        mempool.removeTransaction(tx.id);
      }
      expect(mempool.getPendingTransactions().length).toBe(0);

      // Step 8: Verify final balances
      const finalSenderBalance = blockchain.getBalance(senderWallet.getAddress());
      const finalRecipientBalance = blockchain.getBalance(recipientWallet.getAddress());

      expect(finalRecipientBalance).toBe(transferAmount);
      expect(finalSenderBalance).toBe(initialSenderBalance - transferAmount - transactionFee);
    });

    it('should handle transaction validation errors', async () => {
      // Create transaction with insufficient funds
      const transferAmount = 10000000000; // 100 Th3Coins (more than available)
      const transactionFee = 10000000;

      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);
      
      expect(() => {
        senderWallet.createTransaction(
          recipientWallet.getAddress(),
          transferAmount,
          transactionFee,
          utxoManager
        );
      }).toThrow();
    });

    it('should reject invalid transactions in mempool', async () => {
      // Create invalid transaction (negative amount)
      const invalidTransaction = new TransactionImpl(
        [{ txId: '1'.repeat(64), outputIndex: 0, signature: 'sig', publicKey: senderWallet.getPublicKey() }],
        [{ address: recipientWallet.getAddress(), amount: -1000000000 }]
      );

      const addedToMempool = mempool.addTransaction(invalidTransaction);
      expect(addedToMempool).toBe(false);
      expect(mempool.getPendingTransactions()).not.toContain(invalidTransaction);
    });

    it('should handle double spending attempts', async () => {
      const transferAmount = 1000000000;
      const transactionFee = 10000000;

      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);

      // Create first transaction
      const transaction1 = senderWallet.createTransaction(
        recipientWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );
      senderWallet.signTransaction(transaction1);

      // Create second transaction using same UTXOs (double spend attempt)
      const utxoManager2 = new UTXOManager(senderUTXOs); // Fresh manager with same UTXOs
      const transaction2 = senderWallet.createTransaction(
        new Wallet().getAddress(),
        transferAmount,
        transactionFee,
        utxoManager2
      );
      senderWallet.signTransaction(transaction2);

      // Add first transaction to mempool
      expect(mempool.addTransaction(transaction1)).toBe(true);

      // Second transaction should be rejected (double spend)
      expect(mempool.addTransaction(transaction2)).toBe(false);
    });
  });

  describe('Wallet-to-Wallet Transfer Tests', () => {
    it('should handle multiple sequential transfers', async () => {
      const transferAmount = 500000000; // 5 Th3Coins
      const transactionFee = 5000000; // 0.05 Th3Coins

      // Create intermediate wallet
      const intermediateWallet = new Wallet();

      // Transfer 1: Sender -> Intermediate
      let senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      let utxoManager = new UTXOManager(senderUTXOs);
      const tx1 = senderWallet.createTransaction(
        intermediateWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );
      senderWallet.signTransaction(tx1);
      mempool.addTransaction(tx1);

      // Mine block with first transaction
      let pendingTxs = mempool.getPendingTransactions();
      let currentLatest = blockchain.getLatestBlock();
      let currentHash = miner.calculateHash(currentLatest);
      let block = await miner.mineBlock(pendingTxs, currentHash);
      await blockchain.addBlock(block);
      mempool.removeTransaction(tx1.id);

      // Verify intermediate wallet received funds
      expect(blockchain.getBalance(intermediateWallet.getAddress())).toBe(transferAmount);

      // Transfer 2: Intermediate -> Recipient
      const intermediateUTXOs = blockchain.getUTXOs(intermediateWallet.getAddress());
      utxoManager = new UTXOManager(intermediateUTXOs);
      const tx2 = intermediateWallet.createTransaction(
        recipientWallet.getAddress(),
        transferAmount - transactionFee, // Account for fee
        transactionFee,
        utxoManager
      );
      intermediateWallet.signTransaction(tx2);
      mempool.addTransaction(tx2);

      // Mine block with second transaction
      pendingTxs = mempool.getPendingTransactions();
      currentLatest = blockchain.getLatestBlock();
      currentHash = miner.calculateHash(currentLatest);
      block = await miner.mineBlock(pendingTxs, currentHash);
      await blockchain.addBlock(block);
      mempool.removeTransaction(tx2.id);

      // Verify final balances
      expect(blockchain.getBalance(recipientWallet.getAddress())).toBe(transferAmount - transactionFee);
      expect(blockchain.getBalance(intermediateWallet.getAddress())).toBe(0);
    });

    it('should handle multiple concurrent transfers from same wallet', async () => {
      const transferAmount = 200000000; // 2 Th3Coins each
      const transactionFee = 5000000; // 0.05 Th3Coins each

      // Create multiple recipient wallets
      const recipient1 = new Wallet();
      const recipient2 = new Wallet();
      const recipient3 = new Wallet();

      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);

      // Create multiple transactions
      const tx1 = senderWallet.createTransaction(recipient1.getAddress(), transferAmount, transactionFee, utxoManager);
      senderWallet.signTransaction(tx1);

      // Update UTXO manager to reflect spent UTXOs from tx1
      utxoManager.processTransaction(tx1);

      const tx2 = senderWallet.createTransaction(recipient2.getAddress(), transferAmount, transactionFee, utxoManager);
      senderWallet.signTransaction(tx2);

      utxoManager.processTransaction(tx2);

      const tx3 = senderWallet.createTransaction(recipient3.getAddress(), transferAmount, transactionFee, utxoManager);
      senderWallet.signTransaction(tx3);

      // Add all transactions to mempool
      expect(mempool.addTransaction(tx1)).toBe(true);
      expect(mempool.addTransaction(tx2)).toBe(true);
      expect(mempool.addTransaction(tx3)).toBe(true);

      // Mine block with all transactions
      const pendingTxs = mempool.getPendingTransactions();
      const currentLatest = blockchain.getLatestBlock();
      const currentHash = miner.calculateHash(currentLatest);
      const block = await miner.mineBlock(pendingTxs, currentHash);
      await blockchain.addBlock(block);

      // Clear mempool
      for (const tx of pendingTxs) {
        mempool.removeTransaction(tx.id);
      }

      // Verify all recipients received funds
      expect(blockchain.getBalance(recipient1.getAddress())).toBe(transferAmount);
      expect(blockchain.getBalance(recipient2.getAddress())).toBe(transferAmount);
      expect(blockchain.getBalance(recipient3.getAddress())).toBe(transferAmount);
    });

    it('should properly calculate and handle change outputs', async () => {
      const transferAmount = 123456789; // Odd amount to ensure change
      const transactionFee = 1000000;

      const initialBalance = blockchain.getBalance(senderWallet.getAddress());
      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);

      const transaction = senderWallet.createTransaction(
        recipientWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );
      senderWallet.signTransaction(transaction);

      // Verify transaction has change output
      const recipientOutput = transaction.outputs.find(o => o.address === recipientWallet.getAddress());
      const changeOutput = transaction.outputs.find(o => o.address === senderWallet.getAddress());

      expect(recipientOutput).toBeDefined();
      expect(recipientOutput!.amount).toBe(transferAmount);

      if (changeOutput) {
        expect(changeOutput.amount).toBeGreaterThan(0);
      }

      // Process transaction
      mempool.addTransaction(transaction);
      const currentLatest = blockchain.getLatestBlock();
      const currentHash = miner.calculateHash(currentLatest);
      const block = await miner.mineBlock(mempool.getPendingTransactions(), currentHash);
      await blockchain.addBlock(block);
      mempool.removeTransaction(transaction.id);

      // Verify balances
      const finalSenderBalance = blockchain.getBalance(senderWallet.getAddress());
      const finalRecipientBalance = blockchain.getBalance(recipientWallet.getAddress());

      expect(finalRecipientBalance).toBe(transferAmount);
      expect(finalSenderBalance).toBe(initialBalance - transferAmount - transactionFee);
    });
  });

  describe('Transaction Error Handling and Edge Cases', () => {
    it('should handle transactions with zero fee', async () => {
      const transferAmount = 1000000000;
      const transactionFee = 0; // Zero fee

      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);
      const transaction = senderWallet.createTransaction(
        recipientWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );
      senderWallet.signTransaction(transaction);

      // Should be able to add to mempool (though might be deprioritized)
      expect(mempool.addTransaction(transaction)).toBe(true);

      // Should be able to mine
      const currentLatest = blockchain.getLatestBlock();
      const currentHash = miner.calculateHash(currentLatest);
      const block = await miner.mineBlock(mempool.getPendingTransactions(), currentHash);
      await blockchain.addBlock(block);

      expect(blockchain.getBalance(recipientWallet.getAddress())).toBe(transferAmount);
    });

    it('should handle very small transactions', async () => {
      const transferAmount = 1; // 1 satoshi
      const transactionFee = 1000000; // 0.01 Th3Coins

      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);
      const transaction = senderWallet.createTransaction(
        recipientWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );
      senderWallet.signTransaction(transaction);

      mempool.addTransaction(transaction);
      const currentLatest = blockchain.getLatestBlock();
      const currentHash = miner.calculateHash(currentLatest);
      const block = await miner.mineBlock(mempool.getPendingTransactions(), currentHash);
      await blockchain.addBlock(block);

      expect(blockchain.getBalance(recipientWallet.getAddress())).toBe(transferAmount);
    });

    it('should handle transaction with invalid signature', async () => {
      const transferAmount = 1000000000;
      const transactionFee = 10000000;

      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);
      const transaction = senderWallet.createTransaction(
        recipientWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );

      // Don't sign the transaction or provide invalid signature
      transaction.signature = 'invalid-signature';

      // Should be rejected by mempool
      expect(mempool.addTransaction(transaction)).toBe(false);
    });

    it('should handle transaction to same address (self-transfer)', async () => {
      const transferAmount = 1000000000;
      const transactionFee = 10000000;

      const initialBalance = blockchain.getBalance(senderWallet.getAddress());
      const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);

      // Transfer to self
      const transaction = senderWallet.createTransaction(
        senderWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );
      senderWallet.signTransaction(transaction);

      mempool.addTransaction(transaction);
      const currentLatest = blockchain.getLatestBlock();
      const currentHash = miner.calculateHash(currentLatest);
      const block = await miner.mineBlock(mempool.getPendingTransactions(), currentHash);
      await blockchain.addBlock(block);

      // Balance should only decrease by fee
      const finalBalance = blockchain.getBalance(senderWallet.getAddress());
      expect(finalBalance).toBe(initialBalance - transactionFee);
    });
  });

  describe('Balance Updates and UTXO Management', () => {
    it('should correctly update UTXO set after transactions', async () => {
      const transferAmount = 1000000000;
      const transactionFee = 10000000;

      // Get initial UTXOs
      const initialUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const initialUTXOCount = initialUTXOs.length;

      const utxoManager = new UTXOManager(initialUTXOs);
      const transaction = senderWallet.createTransaction(
        recipientWallet.getAddress(),
        transferAmount,
        transactionFee,
        utxoManager
      );
      senderWallet.signTransaction(transaction);

      // Process transaction
      mempool.addTransaction(transaction);
      const currentLatest = blockchain.getLatestBlock();
      const currentHash = miner.calculateHash(currentLatest);
      const block = await miner.mineBlock(mempool.getPendingTransactions(), currentHash);
      await blockchain.addBlock(block);

      // Check UTXO changes
      const finalUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
      const recipientUTXOs = blockchain.getUTXOs(recipientWallet.getAddress());

      // Recipient should have new UTXO
      expect(recipientUTXOs.length).toBe(1);
      expect(recipientUTXOs[0].amount).toBe(transferAmount);

      // Sender UTXOs should be updated (some spent, possibly change created)
      expect(finalUTXOs.length).toBeLessThanOrEqual(initialUTXOCount);
    });

    it('should handle complex UTXO selection scenarios', async () => {
      // Create multiple small UTXOs by receiving multiple small transactions
      const smallAmount = 100000000; // 1 Th3Coin
      const fee = 1000000;

      // Create multiple sender wallets with small amounts
      const smallSenders = [new Wallet(), new Wallet(), new Wallet()];
      
      // Fund each small sender
      for (const sender of smallSenders) {
        const fundingTx = new TransactionImpl(
          [{ txId: '0'.repeat(64), outputIndex: -1, signature: '', publicKey: '' }],
          [{ address: sender.getAddress(), amount: smallAmount + fee }]
        );
        const currentLatest = blockchain.getLatestBlock();
        const currentHash = miner.calculateHash(currentLatest);
        const fundingBlock = await miner.mineBlock([fundingTx], currentHash);
        await blockchain.addBlock(fundingBlock);
      }

      // Each small sender sends to main recipient
      for (const sender of smallSenders) {
        const senderUTXOs = blockchain.getUTXOs(sender.getAddress());
        const utxoManager = new UTXOManager(senderUTXOs);
        const tx = sender.createTransaction(recipientWallet.getAddress(), smallAmount, fee, utxoManager);
        sender.signTransaction(tx);
        mempool.addTransaction(tx);
      }

      // Mine block with all small transactions
      const currentLatest = blockchain.getLatestBlock();
      const currentHash = miner.calculateHash(currentLatest);
      const block = await miner.mineBlock(mempool.getPendingTransactions(), currentHash);
      await blockchain.addBlock(block);

      // Recipient should have multiple UTXOs
      const recipientUTXOs = blockchain.getUTXOs(recipientWallet.getAddress());
      expect(recipientUTXOs.length).toBe(3);
      expect(blockchain.getBalance(recipientWallet.getAddress())).toBe(smallAmount * 3);

      // Now recipient makes a large transaction requiring multiple UTXOs
      const largeAmount = smallAmount * 2.5; // Requires combining UTXOs
      const utxoManager = new UTXOManager(recipientUTXOs);
      const largeTx = recipientWallet.createTransaction(senderWallet.getAddress(), largeAmount, fee, utxoManager);
      recipientWallet.signTransaction(largeTx);

      // Should successfully create transaction using multiple UTXOs
      expect(largeTx.inputs.length).toBeGreaterThan(1);
    });
  });
});