#!/usr/bin/env node

import { Command } from 'commander';
import { WalletCommands } from './wallet-commands';
import { BlockchainCommands } from './blockchain-commands';
import { NetworkCommands } from './network-commands';

/**
 * Main CLI entry point for Th3Coin
 * Provides command-line interface for wallet operations, blockchain queries, and network management
 */
export class Th3CoinCLI {
  private program: Command;
  private walletCommands: WalletCommands;
  private blockchainCommands: BlockchainCommands;
  private networkCommands: NetworkCommands;

  constructor() {
    this.program = new Command();
    this.walletCommands = new WalletCommands();
    this.blockchainCommands = new BlockchainCommands();
    this.networkCommands = new NetworkCommands();
    
    this.setupCommands();
  }

  /**
   * Set up all CLI commands and options
   */
  private setupCommands(): void {
    this.program
      .name('th3coin')
      .description('Th3Coin - Decentralized Cryptocurrency CLI')
      .version('1.0.0');

    // Add wallet commands
    this.walletCommands.addCommands(this.program);
    
    // Add blockchain commands
    this.blockchainCommands.addCommands(this.program);
    
    // Add network commands
    this.networkCommands.addCommands(this.program);

    // Global error handling
    this.program.exitOverride((err) => {
      if (err.code === 'commander.help') {
        process.exit(0);
      }
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
  }

  /**
   * Parse command line arguments and execute commands
   * @param argv - Command line arguments
   */
  async run(argv: string[] = process.argv): Promise<void> {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      console.error(`CLI Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new Th3CoinCLI();
  cli.run().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}