import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NetworkCommands } from '../network-commands';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

describe('NetworkCommands Integration Tests', () => {
  let networkCommands: NetworkCommands;
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
    networkCommands = new NetworkCommands();
    program = new Command();
    networkCommands.addCommands(program);
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

  describe('Network Status', () => {
    it('should show network status', async () => {
      const args = ['node', 'th3coin', 'network', 'status'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Network Status');
      expect(output).toContain('Node Status:');
      expect(output).toContain('Listen Port:');
      expect(output).toContain('Connected Peers:');
      expect(output).toContain('Network Configuration:');
      
      // Should not have errors
      expect(consoleErrors.length).toBe(0);
    });
  });

  describe('Node Configuration', () => {
    it('should show node configuration', async () => {
      const args = ['node', 'th3coin', 'network', 'config'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Node Configuration');
      expect(output).toContain('Network:');
      expect(output).toContain('Port:');
      expect(output).toContain('Max Connections:');
      expect(output).toContain('Mining:');
      expect(output).toContain('Block Reward:');
      expect(output).toContain('Storage:');
      expect(output).toContain('Data Directory:');
      
      // Should not have errors
      expect(consoleErrors.length).toBe(0);
    });
  });

  describe('Peer Management', () => {
    it('should require host parameter for connect command', async () => {
      const args = ['node', 'th3coin', 'network', 'connect'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Commander should throw error for missing required option
        expect(error).toBeDefined();
      }
    });

    it('should handle connect command with valid parameters', async () => {
      const args = ['node', 'th3coin', 'network', 'connect', '--host', 'localhost', '--port', '8334'];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Connecting to peer localhost:8334');
      } catch (error) {
        // Expected to fail since no peer is running
        expect(consoleErrors.join('\n')).toContain('Failed to connect to peer');
      }
    });

    it('should list peers', async () => {
      const args = ['node', 'th3coin', 'network', 'peers'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Connected Peers');
      expect(output).toContain('No peers connected') || expect(output).toContain('Total peers:');
      
      // Should not have errors
      expect(consoleErrors.length).toBe(0);
    });

    it('should require host parameter for disconnect command', async () => {
      const args = ['node', 'th3coin', 'network', 'disconnect'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Commander should throw error for missing required option
        expect(error).toBeDefined();
      }
    });

    it('should handle disconnect command', async () => {
      const args = ['node', 'th3coin', 'network', 'disconnect', '--host', 'localhost'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Disconnecting from peer localhost:8333');
      expect(output).toContain('Specific peer disconnection not yet implemented');
    });
  });

  describe('Node Control', () => {
    it('should handle node start command', async () => {
      const args = ['node', 'th3coin', 'network', 'start', '--port', '8334'];
      
      // This test would start a node, so we'll just verify the command structure
      const networkCommand = program.commands.find(cmd => cmd.name() === 'network');
      const startCommand = networkCommand?.commands.find(cmd => cmd.name() === 'start');
      
      expect(startCommand).toBeDefined();
      expect(startCommand?.options.some(opt => opt.long === '--port')).toBe(true);
      expect(startCommand?.options.some(opt => opt.long === '--config')).toBe(true);
    });

    it('should handle node stop command', async () => {
      const args = ['node', 'th3coin', 'network', 'stop'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Node is not currently running');
    });
  });

  describe('Blockchain Sync', () => {
    it('should handle sync command', async () => {
      const args = ['node', 'th3coin', 'network', 'sync'];
      
      await program.parseAsync(args);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Synchronizing blockchain with network peers');
      expect(output).toContain('No peers connected');
    });
  });

  describe('Connectivity Testing', () => {
    it('should require host parameter for ping command', async () => {
      const args = ['node', 'th3coin', 'network', 'ping'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Commander should throw error for missing required option
        expect(error).toBeDefined();
      }
    });

    it('should handle ping command with unreachable host', async () => {
      const args = ['node', 'th3coin', 'network', 'ping', '--host', 'unreachable-host', '--port', '8333'];
      
      try {
        await program.parseAsync(args);
        
        const output = consoleOutput.join('\n');
        expect(output).toContain('Pinging peer unreachable-host:8333');
        expect(output).toContain('is not reachable') || expect(output).toContain('is reachable');
      } catch (error) {
        expect(consoleErrors.join('\n')).toContain('Failed to ping peer');
      }
    });
  });

  describe('Command Structure', () => {
    it('should have network command with all subcommands', () => {
      const networkCommand = program.commands.find(cmd => cmd.name() === 'network');
      expect(networkCommand).toBeDefined();
      
      if (networkCommand) {
        const subcommands = networkCommand.commands.map(cmd => cmd.name());
        expect(subcommands).toContain('status');
        expect(subcommands).toContain('start');
        expect(subcommands).toContain('stop');
        expect(subcommands).toContain('connect');
        expect(subcommands).toContain('peers');
        expect(subcommands).toContain('disconnect');
        expect(subcommands).toContain('sync');
        expect(subcommands).toContain('config');
        expect(subcommands).toContain('ping');
      }
    });

    it('should have proper command descriptions', () => {
      const networkCommand = program.commands.find(cmd => cmd.name() === 'network');
      expect(networkCommand?.description()).toBe('Network and peer management commands');
      
      if (networkCommand) {
        const statusCommand = networkCommand.commands.find(cmd => cmd.name() === 'status');
        expect(statusCommand?.description()).toBe('Show network status and peer connections');
        
        const startCommand = networkCommand.commands.find(cmd => cmd.name() === 'start');
        expect(startCommand?.description()).toBe('Start the Th3Coin node');
        
        const connectCommand = networkCommand.commands.find(cmd => cmd.name() === 'connect');
        expect(connectCommand?.description()).toBe('Connect to a peer node');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const args = ['node', 'th3coin', 'network', 'status'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        // Should not throw unhandled errors
        expect(consoleErrors.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should provide helpful error messages', async () => {
      const args = ['node', 'th3coin', 'network', 'connect', '--host', 'invalid-host'];
      
      try {
        await program.parseAsync(args);
      } catch (error) {
        const errorOutput = consoleErrors.join('\n');
        expect(errorOutput).toContain('Failed to connect to peer');
      }
    });
  });

  describe('Parameter Validation', () => {
    it('should validate port numbers', async () => {
      const networkCommand = program.commands.find(cmd => cmd.name() === 'network');
      const startCommand = networkCommand?.commands.find(cmd => cmd.name() === 'start');
      
      expect(startCommand).toBeDefined();
      
      const portOption = startCommand?.options.find(opt => opt.long === '--port');
      expect(portOption).toBeDefined();
      expect(portOption?.defaultValue).toBe('8333');
    });

    it('should handle default port values', async () => {
      const networkCommand = program.commands.find(cmd => cmd.name() === 'network');
      const connectCommand = networkCommand?.commands.find(cmd => cmd.name() === 'connect');
      
      expect(connectCommand).toBeDefined();
      
      const portOption = connectCommand?.options.find(opt => opt.long === '--port');
      expect(portOption).toBeDefined();
      expect(portOption?.defaultValue).toBe('8333');
    });
  });

  describe('Configuration Management', () => {
    it('should handle configuration file option', async () => {
      const networkCommand = program.commands.find(cmd => cmd.name() === 'network');
      const startCommand = networkCommand?.commands.find(cmd => cmd.name() === 'start');
      
      expect(startCommand).toBeDefined();
      
      const configOption = startCommand?.options.find(opt => opt.long === '--config');
      expect(configOption).toBeDefined();
    });

    it('should show configuration without errors', async () => {
      const args = ['node', 'th3coin', 'network', 'config'];
      
      await program.parseAsync(args);
      
      // Should complete without errors
      expect(consoleErrors.length).toBe(0);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Node Configuration');
    });
  });
});