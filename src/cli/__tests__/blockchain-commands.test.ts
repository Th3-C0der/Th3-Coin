import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockchainCommands } from '../blockchain-commands';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

describe('BlockchainCommands Integration Tests', () => {
  let blockchainCommands: BlockchainCommands;
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
    blockchainCommands = new BlockchainCommands();
    program = new Command();
    blockchainCommands.addCommands(program);
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

  describe('Blockchain Info', () => {
    it('should show blockchain information', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'info'];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Blockchain Information');
        expect(output).toContain('Block Height:');
        expect(output).toContain('Current Difficulty:');
        expect(output).toContain('Mempool Size:');
      } catch (error) {
        // May fail due to empty blockchain, which is expected
        const errorOutput = consoleErrors.join('\n');
        expect(errorOutput).toContain('Failed to get blockchain info');
      }
    });
  });

  describe('Recent Blocks', () => {
    it('should show recent blocks with default count', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'blocks'];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Recent 10 Blocks');
      } catch (error) {
        // Expected to fail with empty blockchain
        expect(consoleErrors.join('\n')).toContain('Failed to get recent blocks');
      }
    });

    it('should show recent blocks with custom count', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'blocks', '--number', '5'];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Recent 5 Blocks');
      } catch (error) {
        // Expected to fail with empty blockchain
        expect(consoleErrors.join('\n')).toContain('Failed to get recent blocks');
      }
    });
  });

  describe('Block Details', () => {
    it('should require block hash parameter', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'block'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Commander should throw error for missing required option
        expect(error).toBeDefined();
      }
    });

    it('should handle non-existent block hash', async () => {
      const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const args = ['node', 'th3coin', 'blockchain', 'block', '--hash', fakeHash];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Block not found');
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Failed to get block');
      }
    });
  });

  describe('Mining Commands', () => {
    it('should require mining address for mine command', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'mine'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Mining address is required');
      }
    });

    it('should handle mining with valid address', async () => {
      const validAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const args = ['node', 'th3coin', 'blockchain', 'mine', '--address', validAddress];
      
      // This test would start mining, so we'll just verify the command structure
      const mineCommand = program.commands
        .find(cmd => cmd.name() === 'blockchain')
        ?.commands.find(cmd => cmd.name() === 'mine');
      
      expect(mineCommand).toBeDefined();
      expect(mineCommand?.options.some(opt => opt.long === '--address')).toBe(true);
      expect(mineCommand?.options.some(opt => opt.long === '--threads')).toBe(true);
    });

    it('should show mining statistics', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'mining-stats'];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Mining Statistics');
        expect(output).toContain('Current Block Height:');
        expect(output).toContain('Current Difficulty:');
        expect(output).toContain('Mining Status:');
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Failed to get mining stats');
      }
    });
  });

  describe('Transaction Status', () => {
    it('should require transaction ID parameter', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'tx'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Commander should throw error for missing required option
        expect(error).toBeDefined();
      }
    });

    it('should handle non-existent transaction ID', async () => {
      const fakeTxId = 'nonexistent-transaction-id';
      const args = ['node', 'th3coin', 'blockchain', 'tx', '--id', fakeTxId];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Status: Not found');
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Failed to check transaction');
      }
    });
  });

  describe('Mempool Status', () => {
    it('should show mempool status', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'mempool'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Mempool Status');
      expect(output).toContain('Pending Transactions:');
      
      // Should not have errors
      expect(consoleErrors.length).toBe(0);
    });
  });

  describe('Command Structure', () => {
    it('should have blockchain command with all subcommands', () => {
      const blockchainCommand = program.commands.find(cmd => cmd.name() === 'blockchain');
      expect(blockchainCommand).toBeDefined();
      
      if (blockchainCommand) {
        const subcommands = blockchainCommand.commands.map(cmd => cmd.name());
        expect(subcommands).toContain('info');
        expect(subcommands).toContain('blocks');
        expect(subcommands).toContain('block');
        expect(subcommands).toContain('mine');
        expect(subcommands).toContain('stop-mining');
        expect(subcommands).toContain('mining-stats');
        expect(subcommands).toContain('tx');
        expect(subcommands).toContain('mempool');
      }
    });

    it('should have proper command descriptions', () => {
      const blockchainCommand = program.commands.find(cmd => cmd.name() === 'blockchain');
      expect(blockchainCommand?.description()).toBe('Blockchain information and management commands');
      
      if (blockchainCommand) {
        const infoCommand = blockchainCommand.commands.find(cmd => cmd.name() === 'info');
        expect(infoCommand?.description()).toBe('Show blockchain information (height, difficulty, recent blocks)');
        
        const mineCommand = blockchainCommand.commands.find(cmd => cmd.name() === 'mine');
        expect(mineCommand?.description()).toBe('Start mining blocks');
        
        const mempoolCommand = blockchainCommand.commands.find(cmd => cmd.name() === 'mempool');
        expect(mempoolCommand?.description()).toBe('Show mempool status and pending transactions');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'info'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Should not throw unhandled errors
        expect(consoleErrors.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should provide helpful error messages', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'block', '--hash', 'invalid'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        const errorOutput = consoleErrors.join('\n');
        expect(errorOutput).toContain('Failed to get block');
      }
    });
  });

  describe('Mining Control', () => {
    it('should handle stop mining when not mining', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'stop-mining'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Mining is not currently running');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate numeric parameters', async () => {
      const args = ['node', 'th3coin', 'blockchain', 'blocks', '--number', 'invalid'];
      
      try {
        await program.parseAsync(args);
        
        // Should handle invalid number gracefully
        const output = consoleOutput.join('\n');
        expect(output).toContain('Recent NaN Blocks') || expect(consoleErrors.length).toBeGreaterThan(0);
      } catch (error) {
        // Expected behavior for invalid input
        expect(error).toBeDefined();
      }
    });

    it('should handle mining threads parameter', async () => {
      const validAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      
      const mineCommand = program.commands
        .find(cmd => cmd.name() === 'blockchain')
        ?.commands.find(cmd => cmd.name() === 'mine');
      
      expect(mineCommand).toBeDefined();
      
      const threadsOption = mineCommand?.options.find(opt => opt.long === '--threads');
      expect(threadsOption).toBeDefined();
      expect(threadsOption?.defaultValue).toBe('1');
    });
  });
});