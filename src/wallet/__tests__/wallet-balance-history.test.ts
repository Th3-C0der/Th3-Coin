import { describe, it, expect, beforeEach } from 'vitest';
import { Wallet } from '../wallet';
import { UTXOManager } from '../../core/utxo-manager';
import { UTXOImpl } from '../../core/utxo';
import { TransactionImpl } from '../../core/transaction';
import { Transaction } from '../../interfaces';

describe('Wallet Balance and History Tracking', () => {
  let wallet: Wallet;
  let otherWallet: Wallet;
  let utxoManager: UTXOManager;
  let mockBlockchain: any;
  let mockStorage: any;

  beforeEach(() => {
    wallet = new Wallet();
    otherWallet = new Wallet();
    utxoManager = new UTXOManager();

    // Add some UTXOs for testing
    const txId1 = '1'.repeat(64);
    const txId2 = '2'.repeat(64);
    const txId3 = '3'.repeat(64);
    
    const utxo1 = new UTXOImpl(txId1, 0, wallet.getAddress(), 1000, false);
    const utxo2 = new UTXOImpl(txId2, 0, wallet.getAddress(), 500, false);
    const utxo3 = new UTXOImpl(txId3, 0, wallet.getAddress(), 200, false);
    const utxo4 = new UTXOImpl(txId1, 1, wallet.getAddress(), 100, true); // spent UTXO
    
    utxoManager.addUTXO(utxo1);
    utxoManager.addUTXO(utxo2);
    utxoManager.addUTXO(utxo3);
    utxoManager.addUTXO(utxo4);

    // Mock blockchain
    mockBlockchain = {
      getAllBlocks: () => [
        {
          transactions: [
            {
              id: txId1,
              inputs: [{ txId: '0'.repeat(64), outputIndex: -1, signature: '', publicKey: '' }],
              outputs: [
                { address: wallet.getAddress(), amount: 1000 },
                { address: wallet.getAddress(), amount: 100 }
              ],
              timestamp: Date.now() - 3600000, // 1 hour ago
              signature: 'signature1'
            },
            {
              id: txId2,
              inputs: [{ txId: txId1, outputIndex: 1, signature: 'sig', publicKey: wallet.getPublicKey() }],
              outputs: [{ address: otherWallet.getAddress(), amount: 50 }],
              timestamp: Date.now() - 1800000, // 30 minutes ago
              signature: 'signature2'
            }
          ]
        }
      ]
    };

    // Mock storage
    mockStorage = {
      saveWallet: async (data: any) => {
        mockStorage._savedData = data;
      },
      loadWallet: async () => {
        return mockStorage._savedData || null;
      },
      _savedData: null
    };
  });

  describe('Balance Calculation', () => {
    it('should get wallet balance correctly', async () => {
      const balance = await wallet.getBalance(utxoManager);
      expect(balance).toBe(1700); // 1000 + 500 + 200 (excluding spent UTXO)
    });

    it('should get wallet balance synchronously', () => {
      const balance = wallet.getBalanceSync(utxoManager);
      expect(balance).toBe(1700);
    });

    it('should throw error when no UTXO manager provided for balance', async () => {
      await expect(wallet.getBalance()).rejects.toThrow('UTXO manager required to calculate balance');
    });

    it('should throw error when no UTXO manager provided for sync balance', () => {
      expect(() => wallet.getBalanceSync()).toThrow('UTXO manager required to calculate balance');
    });

    it('should handle balance calculation errors gracefully', async () => {
      const faultyUtxoManager = {
        getBalance: () => {
          throw new Error('Database error');
        }
      };

      await expect(wallet.getBalance(faultyUtxoManager))
        .rejects.toThrow('Failed to get balance: Database error');
    });
  });

  describe('UTXO Management', () => {
    it('should get unspent UTXOs for wallet', () => {
      const utxos = wallet.getUTXOs(utxoManager, false);
      expect(utxos.length).toBe(3); // Only unspent UTXOs
      expect(utxos.every(utxo => utxo.address === wallet.getAddress())).toBe(true);
      expect(utxos.every(utxo => !utxo.isSpent)).toBe(true);
    });

    it('should get all UTXOs including spent ones', () => {
      const utxos = wallet.getUTXOs(utxoManager, true);
      expect(utxos.length).toBe(4); // All UTXOs including spent
      expect(utxos.every(utxo => utxo.address === wallet.getAddress())).toBe(true);
    });

    it('should throw error when no UTXO manager provided for UTXOs', () => {
      expect(() => wallet.getUTXOs()).toThrow('UTXO manager required to get UTXOs');
    });

    it('should handle UTXO retrieval errors gracefully', () => {
      const faultyUtxoManager = {
        getUTXOsForAddress: () => {
          throw new Error('Database error');
        }
      };

      expect(() => wallet.getUTXOs(faultyUtxoManager))
        .toThrow('Failed to get UTXOs: Database error');
    });
  });

  describe('Transaction History', () => {
    it('should get transaction history from blockchain', () => {
      const history = wallet.getTransactionHistory(mockBlockchain);
      expect(history.length).toBe(2);
      expect(history[0].timestamp).toBeGreaterThan(history[1].timestamp); // Sorted by newest first
    });

    it('should return empty array when no blockchain provided', () => {
      const history = wallet.getTransactionHistory();
      expect(history).toEqual([]);
    });

    it('should limit transaction history when limit specified', () => {
      const history = wallet.getTransactionHistory(mockBlockchain, 1);
      expect(history.length).toBe(1);
    });

    it('should handle blockchain errors gracefully', () => {
      const faultyBlockchain = {
        getAllBlocks: () => {
          throw new Error('Blockchain error');
        }
      };

      const history = wallet.getTransactionHistory(faultyBlockchain);
      expect(history).toEqual([]);
    });

    it('should identify relevant transactions correctly', () => {
      const relevantTx = {
        id: 'test',
        inputs: [{ txId: 'prev', outputIndex: 0, signature: 'sig', publicKey: wallet.getPublicKey() }],
        outputs: [{ address: otherWallet.getAddress(), amount: 100 }],
        timestamp: Date.now()
      };

      const irrelevantTx = {
        id: 'test2',
        inputs: [{ txId: 'prev', outputIndex: 0, signature: 'sig', publicKey: otherWallet.getPublicKey() }],
        outputs: [{ address: otherWallet.getAddress(), amount: 100 }],
        timestamp: Date.now()
      };

      expect((wallet as any).isTransactionRelevant(relevantTx)).toBe(true);
      expect((wallet as any).isTransactionRelevant(irrelevantTx)).toBe(false);
    });
  });

  describe('Wallet Statistics', () => {
    it('should calculate wallet statistics correctly', () => {
      const stats = wallet.getWalletStatistics(utxoManager);

      expect(stats.balance).toBe(1700);
      expect(stats.utxoCount).toBe(3);
      expect(stats.spentUtxoCount).toBe(1);
      expect(stats.largestUtxo).toBe(1000);
      expect(stats.smallestUtxo).toBe(200);
      expect(stats.averageUtxoAmount).toBeCloseTo(1700 / 3);
    });

    it('should return zero statistics when no UTXO manager provided', () => {
      const stats = wallet.getWalletStatistics();

      expect(stats.balance).toBe(0);
      expect(stats.utxoCount).toBe(0);
      expect(stats.spentUtxoCount).toBe(0);
      expect(stats.largestUtxo).toBe(0);
      expect(stats.smallestUtxo).toBe(0);
      expect(stats.averageUtxoAmount).toBe(0);
    });

    it('should handle empty UTXO set correctly', () => {
      const emptyUtxoManager = new UTXOManager();
      const stats = wallet.getWalletStatistics(emptyUtxoManager);

      expect(stats.balance).toBe(0);
      expect(stats.utxoCount).toBe(0);
      expect(stats.smallestUtxo).toBe(0);
      expect(stats.averageUtxoAmount).toBe(0);
    });
  });

  describe('Wallet State Management', () => {
    it('should export wallet state correctly', () => {
      const state = wallet.exportWalletState(mockBlockchain, utxoManager);

      expect(state.walletData).toBeDefined();
      expect(state.balance).toBe(1700);
      expect(state.transactionHistory).toBeDefined();
      expect(state.utxos).toBeDefined();
      expect(state.statistics).toBeDefined();
      expect(state.exportTimestamp).toBeDefined();
    });

    it('should export wallet state with defaults when no blockchain/utxo manager', () => {
      const state = wallet.exportWalletState();

      expect(state.walletData).toBeDefined();
      expect(state.balance).toBe(0);
      expect(state.transactionHistory).toEqual([]);
      expect(state.utxos).toEqual([]);
      expect(state.exportTimestamp).toBeDefined();
    });

    it('should save wallet state to storage', async () => {
      await wallet.saveWalletState(mockStorage, mockBlockchain, utxoManager);

      expect(mockStorage._savedData).toBeDefined();
      expect(mockStorage._savedData.balance).toBe(1700);
      expect(mockStorage._savedData.walletData).toBeDefined();
    });

    it('should throw error when no storage provided for save', async () => {
      await expect(wallet.saveWalletState())
        .rejects.toThrow('Storage interface required to save wallet state');
    });

    it('should load wallet state from storage', async () => {
      // First save a wallet state
      await wallet.saveWalletState(mockStorage, mockBlockchain, utxoManager);

      // Then load it
      const loadedState = await Wallet.loadWalletState(mockStorage);

      expect(loadedState.wallet).toBeInstanceOf(Wallet);
      expect(loadedState.wallet.getAddress()).toBe(wallet.getAddress());
      expect(loadedState.balance).toBe(1700);
      expect(loadedState.transactionHistory).toBeDefined();
      expect(loadedState.utxos).toBeDefined();
    });

    it('should throw error when no storage provided for load', async () => {
      await expect(Wallet.loadWalletState())
        .rejects.toThrow('Storage interface required to load wallet state');
    });

    it('should throw error when no wallet data found in storage', async () => {
      const emptyStorage = {
        loadWallet: async () => null
      };

      await expect(Wallet.loadWalletState(emptyStorage))
        .rejects.toThrow('No wallet data found in storage');
    });
  });

  describe('Balance Checking Utilities', () => {
    it('should check if wallet has sufficient balance', () => {
      expect(wallet.hasSufficientBalance(1000, 50, utxoManager)).toBe(true);
      expect(wallet.hasSufficientBalance(1700, 1, utxoManager)).toBe(false);
      expect(wallet.hasSufficientBalance(2000, 0, utxoManager)).toBe(false);
    });

    it('should return false when no UTXO manager provided for balance check', () => {
      expect(wallet.hasSufficientBalance(100, 10)).toBe(false);
    });

    it('should handle balance check errors gracefully', () => {
      const faultyUtxoManager = {
        getBalance: () => {
          throw new Error('Database error');
        }
      };

      expect(wallet.hasSufficientBalance(100, 10, faultyUtxoManager)).toBe(false);
    });
  });

  describe('Pending Transactions', () => {
    it('should get pending transactions from mempool', () => {
      const mockMempool = {
        getPendingTransactions: () => [
          {
            id: 'pending1',
            inputs: [{ txId: 'prev', outputIndex: 0, signature: 'sig', publicKey: wallet.getPublicKey() }],
            outputs: [{ address: otherWallet.getAddress(), amount: 100 }],
            timestamp: Date.now()
          },
          {
            id: 'pending2',
            inputs: [{ txId: 'prev', outputIndex: 0, signature: 'sig', publicKey: otherWallet.getPublicKey() }],
            outputs: [{ address: 'other-address', amount: 50 }],
            timestamp: Date.now()
          }
        ]
      };

      const pendingTxs = wallet.getPendingTransactions(mockMempool);
      expect(pendingTxs.length).toBe(1); // Only the transaction involving this wallet
      expect(pendingTxs[0].id).toBe('pending1');
    });

    it('should return empty array when no mempool provided', () => {
      const pendingTxs = wallet.getPendingTransactions();
      expect(pendingTxs).toEqual([]);
    });

    it('should handle mempool errors gracefully', () => {
      const faultyMempool = {
        getPendingTransactions: () => {
          throw new Error('Mempool error');
        }
      };

      const pendingTxs = wallet.getPendingTransactions(faultyMempool);
      expect(pendingTxs).toEqual([]);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete wallet lifecycle', async () => {
      // Create transaction
      const transaction = wallet.createTransaction(otherWallet.getAddress(), 300, 10, utxoManager);
      wallet.signTransaction(transaction);

      // Check balance before
      const balanceBefore = await wallet.getBalance(utxoManager);
      expect(balanceBefore).toBe(1700);

      // Check if can afford transaction
      expect(wallet.hasSufficientBalance(300, 10, utxoManager)).toBe(true);

      // Get statistics
      const stats = wallet.getWalletStatistics(utxoManager);
      expect(stats.balance).toBe(1700);
      expect(stats.utxoCount).toBe(3);

      // Export and save state
      await wallet.saveWalletState(mockStorage, mockBlockchain, utxoManager);

      // Load state
      const loadedState = await Wallet.loadWalletState(mockStorage);
      expect(loadedState.wallet.getAddress()).toBe(wallet.getAddress());
      expect(loadedState.balance).toBe(1700);
    });

    it('should work with encrypted wallet state', async () => {
      const encryptionKey = 'test-password';
      const encryptedWallet = new Wallet(undefined, encryptionKey);

      // Add UTXOs for encrypted wallet
      const utxo = new UTXOImpl('1'.repeat(64), 0, encryptedWallet.getAddress(), 1000, false);
      utxoManager.addUTXO(utxo);

      // Save encrypted wallet state
      await encryptedWallet.saveWalletState(mockStorage, mockBlockchain, utxoManager);

      // Load encrypted wallet state
      const loadedState = await Wallet.loadWalletState(mockStorage, encryptionKey);
      expect(loadedState.wallet.getAddress()).toBe(encryptedWallet.getAddress());
      expect(loadedState.wallet.getRawPrivateKey()).toBe(encryptedWallet.getRawPrivateKey());
    });

    it('should handle multiple wallets with shared UTXO manager', () => {
      const wallet2 = new Wallet();
      
      // Add UTXOs for second wallet
      const utxo = new UTXOImpl('4'.repeat(64), 0, wallet2.getAddress(), 800, false);
      utxoManager.addUTXO(utxo);

      // Check balances
      expect(wallet.getBalanceSync(utxoManager)).toBe(1700);
      expect(wallet2.getBalanceSync(utxoManager)).toBe(800);

      // Check statistics
      const stats1 = wallet.getWalletStatistics(utxoManager);
      const stats2 = wallet2.getWalletStatistics(utxoManager);

      expect(stats1.balance).toBe(1700);
      expect(stats2.balance).toBe(800);
      expect(stats1.utxoCount).toBe(3);
      expect(stats2.utxoCount).toBe(1);
    });
  });
});