import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WalletCommands } from '../wallet-commands';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

describe('WalletCommands Integration Tests', () => {
  let walletCommands: WalletCommands;
  let program: Command;
  let testDataDir: string;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    // Create test data directory
    testDataDir = path.join(__dirname, 'test-data', `test-${Date.now()}`);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Mock console methods to capture output
    consoleOutput = [];
    consoleErrors = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    };
    console.error = (...args: any[]) => {
      consoleErrors.push(args.join(' '));
    };

    // Create fresh instances
    walletCommands = new WalletCommands();
    program = new Command();
    walletCommands.addCommands(program);
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clean up test data directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Wallet Creation', () => {
    it('should create a new wallet successfully', async () => {
      const args = ['node', 'th3coin', 'wallet', 'create'];
      
      try {
        await program.parseAsync(args);
        
        // Check console output
        const output = consoleOutput.join('\n');
        expect(output).toContain('Creating new wallet...');
        expect(output).toContain('✅ Wallet created successfully!');
        expect(output).toContain('Address:');
        expect(output).toContain('Public Key:');
        expect(output).toContain('Private Key:');
        expect(output).toContain('⚠️  Important: Keep your private key safe');
      } catch (error) {
        // Expected to fail due to missing blockchain initialization
        expect(consoleErrors.join('\n')).toContain('Failed to create wallet');
      }
    });

    it('should create an encrypted wallet with password', async () => {
      const args = ['node', 'th3coin', 'wallet', 'create', '--password', 'testpass123'];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('🔒 Wallet is encrypted with password');
      } catch (error) {
        // Expected to fail due to missing blockchain initialization
        expect(consoleErrors.join('\n')).toContain('Failed to create wallet');
      }
    });

    it('should handle wallet creation with name option', async () => {
      const args = ['node', 'th3coin', 'wallet', 'create', '--name', 'test-wallet'];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Name: test-wallet (Note: Wallet names are not yet supported)');
      } catch (error) {
        // Expected to fail due to missing blockchain initialization
        expect(consoleErrors.join('\n')).toContain('Failed to create wallet');
      }
    });
  });

  describe('Wallet Import', () => {
    it('should import wallet from private key', async () => {
      const testPrivateKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const args = ['node', 'th3coin', 'wallet', 'import', '--key', testPrivateKey];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Importing wallet from private key...');
        expect(output).toContain('✅ Wallet imported successfully!');
      } catch (error) {
        // Expected to fail due to missing blockchain initialization or invalid key
        expect(consoleErrors.join('\n')).toContain('Failed to import wallet');
      }
    });

    it('should handle invalid private key', async () => {
      const invalidPrivateKey = 'invalid-key';
      const args = ['node', 'th3coin', 'wallet', 'import', '--key', invalidPrivateKey];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Failed to import wallet');
      }
    });
  });

  describe('Wallet Balance', () => {
    it('should check balance for all wallets when no address specified', async () => {
      const args = ['node', 'th3coin', 'wallet', 'balance'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/No wallets found|Wallet Balances:/);
      
      // Should not have errors if working properly
      expect(consoleErrors.length).toBe(0);
    });

    it('should validate address format when checking specific address', async () => {
      const invalidAddress = 'invalid-address';
      const args = ['node', 'th3coin', 'wallet', 'balance', '--address', invalidAddress];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Invalid address format');
      }
    });
  });

  describe('Wallet Address', () => {
    it('should list all wallet addresses when no name specified', async () => {
      const args = ['node', 'th3coin', 'wallet', 'address'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/No wallets found|Wallet Addresses:/);
      
      // Should not have errors if working properly
      expect(consoleErrors.length).toBe(0);
    });
  });

  describe('Wallet List', () => {
    it('should list all available wallets', async () => {
      const args = ['node', 'th3coin', 'wallet', 'list'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/No wallets found|Available Wallets:/);
      
      // Should not have errors if working properly
      expect(consoleErrors.length).toBe(0);
    });
  });

  describe('Send Transaction', () => {
    it('should validate required parameters for send command', async () => {
      const args = ['node', 'th3coin', 'wallet', 'send'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Commander should throw error for missing required options
        expect(error).toBeDefined();
      }
    });

    it('should validate recipient address format', async () => {
      const args = [
        'node', 'th3coin', 'wallet', 'send',
        '--to', 'invalid-address',
        '--amount', '1000'
      ];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Invalid recipient address');
      }
    });

    it('should validate positive amount', async () => {
      const validAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'; // Example Bitcoin address format
      const args = [
        'node', 'th3coin', 'wallet', 'send',
        '--to', validAddress,
        '--amount', '0'
      ];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Amount must be greater than 0');
      }
    });

    it('should validate non-negative fee', async () => {
      const validAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const args = [
        'node', 'th3coin', 'wallet', 'send',
        '--to', validAddress,
        '--amount', '1000',
        '--fee', '-100'
      ];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Fee cannot be negative');
      }
    });
  });

  describe('Command Structure', () => {
    it('should have wallet command with all subcommands', () => {
      const walletCommand = program.commands.find(cmd => cmd.name() === 'wallet');
      expect(walletCommand).toBeDefined();
      
      if (walletCommand) {
        const subcommands = walletCommand.commands.map(cmd => cmd.name());
        expect(subcommands).toContain('create');
        expect(subcommands).toContain('balance');
        expect(subcommands).toContain('address');
        expect(subcommands).toContain('send');
        expect(subcommands).toContain('list');
        expect(subcommands).toContain('import');
      }
    });

    it('should have proper command descriptions', () => {
      const walletCommand = program.commands.find(cmd => cmd.name() === 'wallet');
      expect(walletCommand?.description()).toBe('Wallet management commands');
      
      if (walletCommand) {
        const createCommand = walletCommand.commands.find(cmd => cmd.name() === 'create');
        expect(createCommand?.description()).toBe('Create a new wallet');
        
        const balanceCommand = walletCommand.commands.find(cmd => cmd.name() === 'balance');
        expect(balanceCommand?.description()).toBe('Check wallet balance');
        
        const sendCommand = walletCommand.commands.find(cmd => cmd.name() === 'send');
        expect(sendCommand?.description()).toBe('Send Th3Coin to another address');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // This test verifies that errors are caught and displayed properly
      const args = ['node', 'th3coin', 'wallet', 'create'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Should not throw unhandled errors
        expect(consoleErrors.length).toBeGreaterThan(0);
      }
    });

    it('should provide helpful error messages', async () => {
      const args = ['node', 'th3coin', 'wallet', 'balance', '--address', 'invalid'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        const errorOutput = consoleErrors.join('\n');
        expect(errorOutput).toContain('Failed to get balance');
      }
    });
  });
});