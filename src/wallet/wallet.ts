import * as crypto from 'crypto';
import { IWallet, KeyPair, Transaction } from '../interfaces';
import { CryptoUtils } from '../core/crypto';
import { AddressUtils } from '../core/address';
import { KeyPairImpl } from './keypair';

/**
 * Wallet class for Th3Coin
 * Manages key pairs, addresses, and provides transaction functionality
 */
export class Wallet implements IWallet {
  private keyPair: KeyPair;
  private address: string;
  private encryptionKey?: string;

  /**
   * Create a new wallet with generated key pair
   */
  constructor(privateKey?: string, encryptionKey?: string) {
    if (privateKey !== undefined) {
      // Create wallet from existing private key
      if (!privateKey || !CryptoUtils.isValidPrivateKey(privateKey)) {
        throw new Error('Invalid private key provided');
      }
      const publicKey = CryptoUtils.getPublicKeyFromPrivate(privateKey);
      this.keyPair = new KeyPairImpl(privateKey, publicKey);
    } else {
      // Generate new key pair
      this.keyPair = this.generateKeyPair();
    }
    
    this.address = AddressUtils.generateAddress(this.keyPair.publicKey);
    this.encryptionKey = encryptionKey;
  }

  /**
   * Generate a new ECDSA key pair
   * @returns KeyPair object with private and public keys
   */
  generateKeyPair(): KeyPair {
    const cryptoKeyPair = CryptoUtils.generateKeyPair();
    return new KeyPairImpl(cryptoKeyPair.privateKey, cryptoKeyPair.publicKey);
  }

  /**
   * Get wallet address derived from public key
   * @returns Wallet address string
   */
  getAddress(): string {
    return this.address;
  }

  /**
   * Get public key
   * @returns Public key in hex format
   */
  getPublicKey(): string {
    return this.keyPair.publicKey;
  }

  /**
   * Get private key (encrypted if encryption key is set)
   * @returns Private key in hex format or encrypted format
   */
  getPrivateKey(): string {
    if (this.encryptionKey) {
      return this.encryptPrivateKey(this.keyPair.privateKey, this.encryptionKey);
    }
    return this.keyPair.privateKey;
  }

  /**
   * Get raw private key (unencrypted)
   * @returns Raw private key in hex format
   */
  getRawPrivateKey(): string {
    return this.keyPair.privateKey;
  }

  /**
   * Set encryption key for private key security
   * @param encryptionKey - Key to encrypt private key with
   */
  setEncryptionKey(encryptionKey: string): void {
    this.encryptionKey = encryptionKey;
  }

  /**
   * Remove encryption from private key
   */
  removeEncryption(): void {
    this.encryptionKey = undefined;
  }

  /**
   * Verify if the wallet owns a specific address
   * @param address - Address to check
   * @returns True if wallet owns the address
   */
  ownsAddress(address: string): boolean {
    return this.address === address;
  }

  /**
   * Sign data with wallet's private key
   * @param data - Data to sign
   * @returns Signature in hex format
   */
  signData(data: string): string {
    return CryptoUtils.sign(data, this.keyPair.privateKey);
  }

  /**
   * Verify signature with wallet's public key
   * @param data - Original data
   * @param signature - Signature to verify
   * @returns True if signature is valid
   */
  verifySignature(data: string, signature: string): boolean {
    return CryptoUtils.verify(data, signature, this.keyPair.publicKey);
  }

  /**
   * Export wallet data for persistence
   * @returns Wallet data object
   */
  exportWalletData(): {
    privateKey: string;
    publicKey: string;
    address: string;
    encrypted: boolean;
  } {
    return {
      privateKey: this.getPrivateKey(), // Returns encrypted if encryption key is set
      publicKey: this.keyPair.publicKey,
      address: this.address,
      encrypted: !!this.encryptionKey
    };
  }

  /**
   * Create wallet from exported data
   * @param walletData - Exported wallet data
   * @param encryptionKey - Encryption key if data is encrypted
   * @returns New Wallet instance
   */
  static fromWalletData(
    walletData: {
      privateKey: string;
      publicKey: string;
      address: string;
      encrypted: boolean;
    },
    encryptionKey?: string
  ): Wallet {
    let privateKey = walletData.privateKey;
    
    // Decrypt private key if it's encrypted
    if (walletData.encrypted && encryptionKey) {
      privateKey = Wallet.decryptPrivateKey(walletData.privateKey, encryptionKey);
    } else if (walletData.encrypted && !encryptionKey) {
      throw new Error('Encryption key required for encrypted wallet data');
    }

    return new Wallet(privateKey, encryptionKey);
  }

  /**
   * Encrypt private key using AES-256-CBC
   * @param privateKey - Private key to encrypt
   * @param encryptionKey - Key to encrypt with
   * @returns Encrypted private key with IV
   */
  private encryptPrivateKey(privateKey: string, encryptionKey: string): string {
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(privateKey, 'hex', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine IV and encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt private key using AES-256-CBC
   * @param encryptedPrivateKey - Encrypted private key with IV
   * @param encryptionKey - Key to decrypt with
   * @returns Decrypted private key
   */
  static decryptPrivateKey(encryptedPrivateKey: string, encryptionKey: string): string {
    const parts = encryptedPrivateKey.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted private key format');
    }

    try {
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];

      // Validate IV length (should be 16 bytes for AES-256-CBC)
      if (iv.length !== 16) {
        throw new Error('Invalid encrypted private key format');
      }

      // Validate hex format
      if (!/^[a-f0-9]+$/i.test(parts[0]) || !/^[a-f0-9]+$/i.test(parts[1])) {
        throw new Error('Invalid encrypted private key format');
      }

      const key = crypto.scryptSync(encryptionKey, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(encrypted, 'hex', 'hex');
      decrypted += decipher.final('hex');

      return decrypted;
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid encrypted private key format') {
        throw error;
      }
      throw new Error('Failed to decrypt private key');
    }
  }

  /**
   * Create a transaction to send cryptocurrency
   * @param to - Recipient address
   * @param amount - Amount to send
   * @param fee - Transaction fee
   * @param utxoManager - UTXO manager to select inputs from
   * @returns Created transaction
   */
  createTransaction(to: string, amount: number, fee: number, utxoManager?: any): Transaction {
    // Validate inputs
    if (!AddressUtils.validateAddress(to)) {
      throw new Error('Invalid recipient address');
    }

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (fee < 0) {
      throw new Error('Fee cannot be negative');
    }

    // For now, throw error if no UTXO manager provided (will be implemented in task 6.3)
    if (!utxoManager) {
      throw new Error('UTXO manager required for transaction creation. Will be fully implemented in task 6.3');
    }

    const totalRequired = amount + fee;

    try {
      // Select UTXOs for the transaction
      const { selectedUTXOs, changeAmount } = utxoManager.selectUTXOsForTransaction(
        this.address,
        totalRequired,
        'greedy'
      );

      // Create transaction inputs from selected UTXOs
      const inputs = selectedUTXOs.map((utxo: any) => ({
        txId: utxo.txId,
        outputIndex: utxo.outputIndex,
        signature: '', // Will be filled when signing
        publicKey: this.keyPair.publicKey
      }));

      // Create transaction outputs
      const outputs = [
        {
          address: to,
          amount: amount
        }
      ];

      // Add change output if necessary
      if (changeAmount > 0) {
        outputs.push({
          address: this.address, // Send change back to sender
          amount: changeAmount
        });
      }

      // Create the transaction
      const transaction = {
        id: '', // Will be calculated when transaction is created
        inputs,
        outputs,
        timestamp: Date.now(),
        signature: undefined
      };

      return transaction;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create transaction: ${error.message}`);
      }
      throw new Error('Failed to create transaction: Unknown error');
    }
  }

  /**
   * Sign a transaction with the wallet's private key
   * @param transaction - Transaction to sign
   */
  signTransaction(transaction: Transaction): void {
    if (!transaction) {
      throw new Error('Transaction is required');
    }

    if (!transaction.inputs || !Array.isArray(transaction.inputs)) {
      throw new Error('Transaction must have inputs');
    }

    if (!transaction.outputs || !Array.isArray(transaction.outputs)) {
      throw new Error('Transaction must have outputs');
    }

    try {
      // Sign each input that belongs to this wallet
      for (const input of transaction.inputs) {
        if (input.publicKey === this.keyPair.publicKey) {
          // Create transaction data for signature verification (matching getDataForSigning format)
          const txForSigning = {
            inputs: transaction.inputs.map(inp => ({
              txId: inp.txId,
              outputIndex: inp.outputIndex,
              publicKey: inp.publicKey
            })),
            outputs: transaction.outputs.map(output => ({
              address: output.address,
              amount: output.amount
            })),
            timestamp: transaction.timestamp
          };

          const dataToSign = JSON.stringify(txForSigning);
          input.signature = CryptoUtils.sign(dataToSign, this.keyPair.privateKey);
        }
      }

      // Sign the entire transaction
      const transactionData = {
        inputs: transaction.inputs.map(input => ({
          txId: input.txId,
          outputIndex: input.outputIndex,
          publicKey: input.publicKey
        })),
        outputs: transaction.outputs.map(output => ({
          address: output.address,
          amount: output.amount
        })),
        timestamp: transaction.timestamp
      };

      const dataToSign = JSON.stringify(transactionData);
      transaction.signature = CryptoUtils.sign(dataToSign, this.keyPair.privateKey);

      // Recalculate transaction ID after signing
      transaction.id = CryptoUtils.sha256(JSON.stringify({
        ...transactionData,
        signature: transaction.signature
      }));

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to sign transaction: ${error.message}`);
      }
      throw new Error('Failed to sign transaction: Unknown error');
    }
  }

  /**
   * Verify if a transaction was signed by this wallet
   * @param transaction - Transaction to verify
   * @returns True if transaction was signed by this wallet
   */
  verifyTransactionSignature(transaction: Transaction): boolean {
    if (!transaction || !transaction.signature) {
      return false;
    }

    try {
      const transactionData = {
        inputs: transaction.inputs.map(input => ({
          txId: input.txId,
          outputIndex: input.outputIndex,
          publicKey: input.publicKey
        })),
        outputs: transaction.outputs.map(output => ({
          address: output.address,
          amount: output.amount
        })),
        timestamp: transaction.timestamp
      };

      const dataToSign = JSON.stringify(transactionData);
      return CryptoUtils.verify(dataToSign, transaction.signature, this.keyPair.publicKey);
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate the total amount needed for a transaction (amount + fee)
   * @param amount - Amount to send
   * @param fee - Transaction fee
   * @returns Total amount needed
   */
  calculateTotalRequired(amount: number, fee: number): number {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (fee < 0) {
      throw new Error('Fee cannot be negative');
    }

    return amount + fee;
  }

  /**
   * Estimate transaction fee based on transaction size
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param feePerByte - Fee per byte (default: 1)
   * @returns Estimated fee
   */
  estimateTransactionFee(inputCount: number, outputCount: number, feePerByte: number = 1): number {
    if (inputCount < 0 || outputCount < 0) {
      throw new Error('Input and output counts must be non-negative');
    }

    if (feePerByte < 0) {
      throw new Error('Fee per byte must be non-negative');
    }

    // Rough estimation of transaction size in bytes
    // Each input: ~150 bytes (txId + outputIndex + signature + publicKey)
    // Each output: ~35 bytes (address + amount)
    // Base transaction: ~10 bytes (version, timestamp, etc.)
    const estimatedSize = 10 + (inputCount * 150) + (outputCount * 35);
    
    return Math.ceil(estimatedSize * feePerByte);
  }

  /**
   * Check if wallet can afford a transaction
   * @param amount - Amount to send
   * @param fee - Transaction fee
   * @param utxoManager - UTXO manager to check balance
   * @returns True if wallet can afford the transaction
   */
  canAffordTransaction(amount: number, fee: number, utxoManager?: any): boolean {
    if (!utxoManager) {
      return false;
    }

    try {
      const totalRequired = this.calculateTotalRequired(amount, fee);
      const balance = utxoManager.getBalance(this.address);
      return balance >= totalRequired;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get wallet balance from UTXO set
   * @param utxoManager - UTXO manager to calculate balance from
   * @returns Promise resolving to wallet balance
   */
  async getBalance(utxoManager?: any): Promise<number> {
    if (!utxoManager) {
      throw new Error('UTXO manager required to calculate balance');
    }

    try {
      return utxoManager.getBalance(this.address);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get balance: ${error.message}`);
      }
      throw new Error('Failed to get balance: Unknown error');
    }
  }

  /**
   * Get wallet balance synchronously
   * @param utxoManager - UTXO manager to calculate balance from
   * @returns Wallet balance
   */
  getBalanceSync(utxoManager?: any): number {
    if (!utxoManager) {
      throw new Error('UTXO manager required to calculate balance');
    }

    try {
      return utxoManager.getBalance(this.address);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get balance: ${error.message}`);
      }
      throw new Error('Failed to get balance: Unknown error');
    }
  }

  /**
   * Get all UTXOs belonging to this wallet
   * @param utxoManager - UTXO manager to get UTXOs from
   * @param includeSpent - Whether to include spent UTXOs
   * @returns Array of UTXOs
   */
  getUTXOs(utxoManager?: any, includeSpent: boolean = false): any[] {
    if (!utxoManager) {
      throw new Error('UTXO manager required to get UTXOs');
    }

    try {
      return utxoManager.getUTXOsForAddress(this.address, includeSpent);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get UTXOs: ${error.message}`);
      }
      throw new Error('Failed to get UTXOs: Unknown error');
    }
  }

  /**
   * Get transaction history for this wallet
   * @param blockchain - Blockchain to get transaction history from
   * @param limit - Maximum number of transactions to return
   * @returns Array of transactions involving this wallet
   */
  getTransactionHistory(blockchain?: any, limit?: number): Transaction[] {
    if (!blockchain) {
      // Return empty array if no blockchain provided
      return [];
    }

    try {
      const transactions: Transaction[] = [];
      const blocks = blockchain.getAllBlocks ? blockchain.getAllBlocks() : [];

      for (const block of blocks) {
        if (block.transactions) {
          for (const tx of block.transactions) {
            // Check if transaction involves this wallet
            if (this.isTransactionRelevant(tx)) {
              transactions.push(tx);
            }
          }
        }
      }

      // Sort by timestamp (newest first)
      transactions.sort((a, b) => b.timestamp - a.timestamp);

      // Apply limit if specified
      if (limit && limit > 0) {
        return transactions.slice(0, limit);
      }

      return transactions;
    } catch (error) {
      // Return empty array on error
      return [];
    }
  }

  /**
   * Check if a transaction is relevant to this wallet
   * @param transaction - Transaction to check
   * @returns True if transaction involves this wallet
   */
  private isTransactionRelevant(transaction: Transaction): boolean {
    // Check if wallet is sender (has inputs with matching public key)
    for (const input of transaction.inputs) {
      if (input.publicKey === this.keyPair.publicKey) {
        return true;
      }
    }

    // Check if wallet is recipient (has outputs to wallet address)
    for (const output of transaction.outputs) {
      if (output.address === this.address) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get wallet statistics
   * @param utxoManager - UTXO manager to get statistics from
   * @returns Wallet statistics object
   */
  getWalletStatistics(utxoManager?: any): {
    balance: number;
    utxoCount: number;
    spentUtxoCount: number;
    largestUtxo: number;
    smallestUtxo: number;
    averageUtxoAmount: number;
  } {
    if (!utxoManager) {
      return {
        balance: 0,
        utxoCount: 0,
        spentUtxoCount: 0,
        largestUtxo: 0,
        smallestUtxo: 0,
        averageUtxoAmount: 0
      };
    }

    try {
      const unspentUtxos = this.getUTXOs(utxoManager, false);
      const spentUtxos = this.getUTXOs(utxoManager, true).filter((utxo: any) => utxo.isSpent);
      const balance = this.getBalanceSync(utxoManager);

      let largestUtxo = 0;
      let smallestUtxo = Number.MAX_SAFE_INTEGER;

      for (const utxo of unspentUtxos) {
        if (utxo.amount > largestUtxo) {
          largestUtxo = utxo.amount;
        }
        if (utxo.amount < smallestUtxo) {
          smallestUtxo = utxo.amount;
        }
      }

      if (unspentUtxos.length === 0) {
        smallestUtxo = 0;
      }

      return {
        balance,
        utxoCount: unspentUtxos.length,
        spentUtxoCount: spentUtxos.length,
        largestUtxo,
        smallestUtxo,
        averageUtxoAmount: unspentUtxos.length > 0 ? balance / unspentUtxos.length : 0
      };
    } catch (error) {
      return {
        balance: 0,
        utxoCount: 0,
        spentUtxoCount: 0,
        largestUtxo: 0,
        smallestUtxo: 0,
        averageUtxoAmount: 0
      };
    }
  }

  /**
   * Export wallet state including transaction history
   * @param blockchain - Blockchain to get transaction history from
   * @param utxoManager - UTXO manager to get balance and UTXOs from
   * @returns Wallet state object
   */
  exportWalletState(blockchain?: any, utxoManager?: any): {
    walletData: any;
    balance: number;
    transactionHistory: Transaction[];
    utxos: any[];
    statistics: any;
    exportTimestamp: number;
  } {
    return {
      walletData: this.exportWalletData(),
      balance: utxoManager ? this.getBalanceSync(utxoManager) : 0,
      transactionHistory: this.getTransactionHistory(blockchain),
      utxos: utxoManager ? this.getUTXOs(utxoManager, true) : [],
      statistics: this.getWalletStatistics(utxoManager),
      exportTimestamp: Date.now()
    };
  }

  /**
   * Save wallet state to storage
   * @param storage - Storage interface to save to
   * @param blockchain - Blockchain to get transaction history from
   * @param utxoManager - UTXO manager to get balance and UTXOs from
   * @returns Promise resolving when save is complete
   */
  async saveWalletState(storage?: any, blockchain?: any, utxoManager?: any): Promise<void> {
    if (!storage) {
      throw new Error('Storage interface required to save wallet state');
    }

    try {
      const walletState = this.exportWalletState(blockchain, utxoManager);
      await storage.saveWallet(walletState);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to save wallet state: ${error.message}`);
      }
      throw new Error('Failed to save wallet state: Unknown error');
    }
  }

  /**
   * Load wallet state from storage
   * @param storage - Storage interface to load from
   * @param encryptionKey - Encryption key if wallet data is encrypted
   * @returns Promise resolving to loaded wallet state
   */
  static async loadWalletState(storage?: any, encryptionKey?: string): Promise<{
    wallet: Wallet;
    balance: number;
    transactionHistory: Transaction[];
    utxos: any[];
    statistics: any;
  }> {
    if (!storage) {
      throw new Error('Storage interface required to load wallet state');
    }

    try {
      const walletState = await storage.loadWallet();
      
      if (!walletState || !walletState.walletData) {
        throw new Error('No wallet data found in storage');
      }

      const wallet = Wallet.fromWalletData(walletState.walletData, encryptionKey);

      return {
        wallet,
        balance: walletState.balance || 0,
        transactionHistory: walletState.transactionHistory || [],
        utxos: walletState.utxos || [],
        statistics: walletState.statistics || {}
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load wallet state: ${error.message}`);
      }
      throw new Error('Failed to load wallet state: Unknown error');
    }
  }

  /**
   * Check if wallet has sufficient balance for a transaction
   * @param amount - Amount to check
   * @param fee - Transaction fee
   * @param utxoManager - UTXO manager to check balance
   * @returns True if wallet has sufficient balance
   */
  hasSufficientBalance(amount: number, fee: number, utxoManager?: any): boolean {
    if (!utxoManager) {
      return false;
    }

    try {
      const balance = this.getBalanceSync(utxoManager);
      const totalRequired = this.calculateTotalRequired(amount, fee);
      return balance >= totalRequired;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get pending transactions (transactions in mempool involving this wallet)
   * @param mempool - Mempool to check for pending transactions
   * @returns Array of pending transactions
   */
  getPendingTransactions(mempool?: any): Transaction[] {
    if (!mempool) {
      return [];
    }

    try {
      const pendingTransactions = mempool.getPendingTransactions ? mempool.getPendingTransactions() : [];
      return pendingTransactions.filter((tx: Transaction) => this.isTransactionRelevant(tx));
    } catch (error) {
      return [];
    }
  }
}