// Core interfaces for Th3Coin cryptocurrency

export interface BlockHeader {
  version: number;
  previousHash: string;
  merkleRoot: string;
  timestamp: number;
  difficulty: number;
  nonce: number;
}

export interface Block {
  header: BlockHeader;
  transactions: Transaction[];
}

export interface TransactionInput {
  txId: string;
  outputIndex: number;
  signature: string;
  publicKey: string;
}

export interface TransactionOutput {
  address: string;
  amount: number;
}

export interface Transaction {
  id: string;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  timestamp: number;
  signature?: string;
}

export interface UTXO {
  txId: string;
  outputIndex: number;
  address: string;
  amount: number;
  isSpent: boolean;
}

export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

// Core component interfaces
export interface IBlockchain {
  addBlock(block: Block): Promise<boolean>;
  getBlock(hash: string): Promise<Block | null>;
  getLatestBlock(): Block;
  validateBlock(block: Block): boolean;
  calculateDifficulty(): number;
  getBalance(address: string): number;
  getBlockHeight(): number;
  getUTXOs(address: string): UTXO[];
}

export interface IWallet {
  generateKeyPair(): KeyPair;
  createTransaction(to: string, amount: number, fee: number): Transaction;
  signTransaction(transaction: Transaction): void;
  getBalance(): Promise<number>;
  getAddress(): string;
  getPublicKey(): string;
  getPrivateKey(): string;
}

export interface IMiner {
  mineBlock(transactions: Transaction[]): Promise<Block>;
  calculateHash(block: Block): string;
  isValidProof(block: Block): boolean;
  adjustDifficulty(lastBlock: Block): number;
  startMining(): void;
  stopMining(): void;
}

export interface IMempool {
  addTransaction(transaction: Transaction): boolean;
  removeTransaction(txId: string): void;
  getPendingTransactions(): Transaction[];
  validateTransaction(transaction: Transaction): boolean;
  getTransactionCount(): number;
  clearMempool(): void;
}

export interface IP2PNetwork {
  startNode(port: number): Promise<void>;
  connectToPeer(host: string, port: number): Promise<void>;
  broadcastTransaction(transaction: Transaction): void;
  broadcastBlock(block: Block): void;
  syncBlockchain(): Promise<void>;
  getPeerCount(): number;
  stopNode(): Promise<void>;
}

export interface IStorage {
  saveBlock(block: Block): Promise<void>;
  loadBlock(hash: string): Promise<Block | null>;
  saveBlockchain(blockchain: Block[]): Promise<void>;
  loadBlockchain(): Promise<Block[]>;
  saveWallet(walletData: any): Promise<void>;
  loadWallet(address?: string): Promise<any>;
  saveUTXOs(utxos: UTXO[]): Promise<void>;
  loadUTXOs(): Promise<UTXO[]>;
  listWallets(): Promise<string[]>;
  deleteWallet(address: string): Promise<boolean>;
  verifyIntegrity(): Promise<boolean>;
}

// Network message types
export interface NetworkMessage {
  type: 'transaction' | 'block' | 'getBlocks' | 'getBlock' | 'blocks' | 'blockNotFound' | 'ping' | 'pong';
  data: any;
  timestamp: number;
}

// Configuration interfaces
export interface NetworkConfig {
  port: number;
  peers: string[];
  maxConnections: number;
}

export interface MiningConfig {
  difficulty: number;
  blockReward: number;
  targetBlockTime: number; // in seconds
}

export interface Th3CoinConfig {
  network: NetworkConfig;
  mining: MiningConfig;
  dataDir: string;
}