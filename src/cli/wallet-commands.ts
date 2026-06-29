import { Command } from 'commander';
import { Wallet } from '../wallet/wallet';
import { WalletManager } from '../wallet/wallet-manager';
import { BlockchainImpl } from '../core/blockchain';
import { Storage } from '../storage/storage';
import { AddressUtils } from '../core/address';

/**
 * Wallet-related CLI commands
 * Handles wallet creation, balance checking, address generation, and transaction sending
 */
export class WalletCommands {
  private walletManager: WalletManager;
  private blockchain: BlockchainImpl;
  private storage: Storage;

  constructor() {
    this.storage = new Storage();
    this.blockchain = new BlockchainImpl();
    this.walletManager = new WalletManager();
  }

  /**
   * Initialize blockchain and wallet manager
   */
  private async initialize(): Promise<void> {
    // Initialize blockchain with a default genesis address if needed
    await this.blockchain.initialize();
  }

  /**
   * Add wallet commands to the CLI program
   * @param program - Commander program instance
   */
  addCommands(program: Command): void {
    const walletCmd = program
      .command('wallet')
      .description('Wallet management commands');

    // Create new wallet
    walletCmd
      .command('create')
      .description('Create a new wallet')
      .option('-n, --name <name>', 'Wallet name (optional)')
      .option('-p, --password <password>', 'Wallet password for encryption (optional)')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.createWallet(options.name, options.password);
        } catch (error) {
          console.error(`Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Get wallet balance
    walletCmd
      .command('balance')
      .description('Check wallet balance')
      .option('-a, --address <address>', 'Wallet address to check balance for')
      .option('-n, --name <name>', 'Wallet name to check balance for')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.getBalance(options.address, options.name);
        } catch (error) {
          console.error(`Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Generate new address
    walletCmd
      .command('address')
      .description('Generate a new wallet address or show existing address')
      .option('-n, --name <name>', 'Wallet name to get address for')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.getAddress(options.name);
        } catch (error) {
          console.error(`Failed to get address: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Send transaction
    walletCmd
      .command('send')
      .description('Send Th3Coin to another address')
      .requiredOption('-t, --to <address>', 'Recipient address')
      .requiredOption('-a, --amount <amount>', 'Amount to send (in satoshis)')
      .option('-f, --fee <fee>', 'Transaction fee (in satoshis)', '1000')
      .option('-n, --name <name>', 'Sender wallet name')
      .option('-p, --password <password>', 'Wallet password if encrypted')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.sendTransaction(
            options.to,
            parseInt(options.amount),
            parseInt(options.fee),
            options.name,
            options.password
          );
        } catch (error) {
          console.error(`Failed to send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // List wallets
    walletCmd
      .command('list')
      .description('List all available wallets')
      .action(async () => {
        try {
          await this.initialize();
          await this.listWallets();
        } catch (error) {
          console.error(`Failed to list wallets: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });

    // Import wallet from private key
    walletCmd
      .command('import')
      .description('Import wallet from private key')
      .requiredOption('-k, --key <privateKey>', 'Private key to import')
      .option('-n, --name <name>', 'Wallet name (optional)')
      .option('-p, --password <password>', 'Wallet password for encryption (optional)')
      .action(async (options) => {
        try {
          await this.initialize();
          await this.importWallet(options.key, options.name, options.password);
        } catch (error) {
          console.error(`Failed to import wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
          process.exit(1);
        }
      });
  }

  /**
   * Create a new wallet
   */
  private async createWallet(name?: string, password?: string): Promise<void> {
    console.log('Creating new wallet...');
    
    const wallet = await this.walletManager.createWallet(password);
    const address = wallet.getAddress();
    
    console.log('✅ Wallet created successfully!');
    console.log(`Address: ${address}`);
    console.log(`Public Key: ${wallet.getPublicKey()}`);
    
    if (name) {
      console.log(`Name: ${name} (Note: Wallet names are not yet supported)`);
    }
    
    if (password) {
      console.log('🔒 Wallet is encrypted with password');
    }
    
    console.log('\n⚠️  Important: Keep your private key safe and never share it!');
    console.log(`Private Key: ${wallet.getRawPrivateKey()}`);
    console.log('💡 Use "th3coin wallet balance" to check your balance');
  }

  /**
   * Get wallet balance
   */
  private async getBalance(address?: string, name?: string): Promise<void> {
    if (!address && !name) {
      // Show balance for all wallets
      const wallets = await this.walletManager.listWallets();
      if (wallets.length === 0) {
        console.log('No wallets found. Create a wallet first with "th3coin wallet create"');
        return;
      }
      
      console.log('Wallet Balances:');
      console.log('================');
      
      for (const walletAddress of wallets) {
        const balance = this.blockchain.getBalance(walletAddress);
        console.log(`${walletAddress}: ${this.formatBalance(balance)} Th3Coin`);
      }
      return;
    }

    let targetAddress = address;
    if (name && !address) {
      const wallet = await this.walletManager.loadWallet(name);
      if (!wallet) {
        throw new Error(`Wallet with name "${name}" not found`);
      }
      targetAddress = wallet.getAddress();
    }

    if (!targetAddress) {
      throw new Error('No address specified');
    }

    if (!AddressUtils.validateAddress(targetAddress)) {
      throw new Error('Invalid address format');
    }

    const balance = this.blockchain.getBalance(targetAddress);
    console.log(`Balance for ${targetAddress}: ${this.formatBalance(balance)} Th3Coin`);
  }

  /**
   * Get wallet address
   */
  private async getAddress(name?: string): Promise<void> {
    if (name) {
      const wallet = await this.walletManager.loadWallet(name);
      if (!wallet) {
        throw new Error(`Wallet with name "${name}" not found`);
      }
      console.log(`Address for wallet "${name}": ${wallet.getAddress()}`);
    } else {
      // Show addresses for all wallets
      const wallets = await this.walletManager.listWallets();
      if (wallets.length === 0) {
        console.log('No wallets found. Create a wallet first with "th3coin wallet create"');
        return;
      }
      
      console.log('Wallet Addresses:');
      console.log('=================');
      
      for (const address of wallets) {
        console.log(address);
      }
    }
  }

  /**
   * Send transaction
   */
  private async sendTransaction(
    to: string,
    amount: number,
    fee: number,
    name?: string,
    password?: string
  ): Promise<void> {
    // Validate recipient address
    if (!AddressUtils.validateAddress(to)) {
      throw new Error('Invalid recipient address');
    }

    // Validate amount
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Validate fee
    if (fee < 0) {
      throw new Error('Fee cannot be negative');
    }

    console.log('Creating transaction...');
    console.log(`To: ${to}`);
    console.log(`Amount: ${this.formatBalance(amount)} Th3Coin`);
    console.log(`Fee: ${this.formatBalance(fee)} Th3Coin`);

    // Get wallet to send from
    let wallet: Wallet | null;
    if (name) {
      wallet = await this.walletManager.loadWallet(name, password);
      if (!wallet) {
        throw new Error(`Wallet with name "${name}" not found`);
      }
    } else {
      wallet = await this.walletManager.loadDefaultWallet(password);
      if (!wallet) {
        throw new Error('No default wallet found. Create a wallet first or specify wallet name.');
      }
    }

    // Check balance
    const balance = this.blockchain.getBalance(wallet.getAddress());
    const totalRequired = amount + fee;
    
    if (balance < totalRequired) {
      throw new Error(`Insufficient balance. Required: ${this.formatBalance(totalRequired)} Th3Coin, Available: ${this.formatBalance(balance)} Th3Coin`);
    }

    console.log('⚠️  Transaction creation not yet fully implemented.');
    console.log('This feature will be completed when UTXO management is integrated.');
    console.log(`From: ${wallet.getAddress()}`);
    console.log(`Balance: ${this.formatBalance(balance)} Th3Coin`);
  }

  /**
   * List all wallets
   */
  private async listWallets(): Promise<void> {
    const wallets = await this.walletManager.listWallets();
    
    if (wallets.length === 0) {
      console.log('No wallets found. Create a wallet first with "th3coin wallet create"');
      return;
    }

    console.log('Available Wallets:');
    console.log('==================');
    
    for (let i = 0; i < wallets.length; i++) {
      const address = wallets[i];
      const balance = this.blockchain.getBalance(address);
      console.log(`${i + 1}. ${address} (${this.formatBalance(balance)} Th3Coin)`);
    }
  }

  /**
   * Import wallet from private key
   */
  private async importWallet(privateKey: string, name?: string, password?: string): Promise<void> {
    console.log('Importing wallet from private key...');
    
    const wallet = await this.walletManager.importWallet(privateKey, password);
    const address = wallet.getAddress();
    
    console.log('✅ Wallet imported successfully!');
    console.log(`Address: ${address}`);
    console.log(`Public Key: ${wallet.getPublicKey()}`);
    
    if (name) {
      console.log(`Name: ${name} (Note: Wallet names are not yet supported)`);
    }
    
    if (password) {
      console.log('🔒 Wallet is encrypted with password');
    }
    
    const balance = this.blockchain.getBalance(address);
    console.log(`Current Balance: ${this.formatBalance(balance)} Th3Coin`);
  }

  /**
   * Format balance for display (convert from satoshis to Th3Coin)
   */
  private formatBalance(satoshis: number): string {
    const th3coins = satoshis / 100000000; // 1 Th3Coin = 100,000,000 satoshis
    return th3coins.toFixed(8);
  }
}