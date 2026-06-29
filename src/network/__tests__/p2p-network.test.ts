import { P2PNetwork } from '../p2p';
import { Transaction, Block } from '../../interfaces';
import { vi } from 'vitest';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

describe('P2PNetwork', () => {
  let network1: P2PNetwork;
  let network2: P2PNetwork;
  const port1 = 8101;
  const port2 = 8102;

  beforeEach(() => {
    network1 = new P2PNetwork();
    network2 = new P2PNetwork();
  });

  afterEach(async () => {
    await network1.stopNode();
    await network2.stopNode();
  });

  describe('Network Operations', () => {
    it('should start network node', async () => {
      await network1.startNode(port1);
      expect(network1.getNetworkNode().isNodeRunning()).toBe(true);
    });

    it('should stop network node', async () => {
      await network1.startNode(port1);
      await network1.stopNode();
      expect(network1.getNetworkNode().isNodeRunning()).toBe(false);
    });

    it('should connect to peer', async () => {
      await network1.startNode(port1);
      await network2.startNode(port2);
      
      await network2.connectToPeer('localhost', port1);
      expect(network2.getPeerCount()).toBe(1);
    });

    it('should track known peers', async () => {
      await network1.startNode(port1);
      await network2.connectToPeer('localhost', port1);
      
      const knownPeers = network2.getKnownPeers();
      expect(knownPeers).toContain('localhost:8101');
    });

    it('should add known peer manually', () => {
      network1.addKnownPeer('example.com:8333');
      const knownPeers = network1.getKnownPeers();
      expect(knownPeers).toContain('example.com:8333');
    });

    it('should not duplicate known peers', () => {
      network1.addKnownPeer('example.com:8333');
      network1.addKnownPeer('example.com:8333');
      const knownPeers = network1.getKnownPeers();
      expect(knownPeers.filter(peer => peer === 'example.com:8333')).toHaveLength(1);
    });
  });

  describe('Transaction Broadcasting', () => {
    beforeEach(async () => {
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network2.connectToPeer('localhost', port1);
      
      // Wait for connection to be established
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should broadcast transaction to all peers', () => {
      const transaction: Transaction = {
        id: 'tx123',
        inputs: [{
          txId: 'prev123',
          outputIndex: 0,
          signature: 'sig123',
          publicKey: 'pub123'
        }],
        outputs: [{
          address: 'addr123',
          amount: 100
        }],
        timestamp: Date.now()
      };

      // This should not throw
      expect(() => network2.broadcastTransaction(transaction)).not.toThrow();
    });

    it('should handle received transaction messages', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const transaction: Transaction = {
        id: 'tx123',
        inputs: [{
          txId: 'prev123',
          outputIndex: 0,
          signature: 'sig123',
          publicKey: 'pub123'
        }],
        outputs: [{
          address: 'addr123',
          amount: 100
        }],
        timestamp: Date.now()
      };

      network2.broadcastTransaction(transaction);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      // The test should verify that the connection was established and transaction was broadcast
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Block Broadcasting', () => {
    beforeEach(async () => {
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network2.connectToPeer('localhost', port1);
      
      // Wait for connection to be established
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should broadcast block to all peers', () => {
      const block: Block = {
        header: {
          version: 1,
          previousHash: 'prev123',
          merkleRoot: 'merkle123',
          timestamp: Date.now(),
          difficulty: 4,
          nonce: 12345
        },
        transactions: [{
          id: 'tx123',
          inputs: [{
            txId: 'prev123',
            outputIndex: 0,
            signature: 'sig123',
            publicKey: 'pub123'
          }],
          outputs: [{
            address: 'addr123',
            amount: 100
          }],
          timestamp: Date.now()
        }]
      };

      // This should not throw
      expect(() => network2.broadcastBlock(block)).not.toThrow();
    });
  });

  describe('Event Handling', () => {
    it('should log peer connection events', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network2.connectToPeer('localhost', port1);
      
      // Wait for connection events
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Connected to peer'));
      consoleSpy.mockRestore();
    });

    it('should log peer disconnection events', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network2.connectToPeer('localhost', port1);
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Disconnect
      const peerId = `localhost:${port1}`;
      network2.getNetworkNode().disconnectPeer(peerId);
      
      // Wait for disconnection event
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Disconnected from peer'));
      consoleSpy.mockRestore();
    });

    it('should log network errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await network1.startNode(port1);
      
      // Simulate error by emitting it
      network1.getNetworkNode().emit('error', new Error('Test error'));
      
      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(consoleSpy).toHaveBeenCalledWith('Network error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network2.connectToPeer('localhost', port1);
      
      // Wait for connection to be established
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle transaction messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Simulate receiving a transaction message
      const mockPeer = { id: 'test:1234' };
      const mockMessage = { type: 'transaction', data: {}, timestamp: Date.now() };
      
      (network1 as any).handleTransactionMessage(mockPeer, mockMessage);
      
      expect(consoleSpy).toHaveBeenCalledWith('Received transaction from test:1234');
      consoleSpy.mockRestore();
    });

    it('should handle block messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Simulate receiving a block message
      const mockPeer = { id: 'test:1234' };
      const mockMessage = { type: 'block', data: {}, timestamp: Date.now() };
      
      (network1 as any).handleBlockMessage(mockPeer, mockMessage);
      
      expect(consoleSpy).toHaveBeenCalledWith('Received block from test:1234');
      consoleSpy.mockRestore();
    });

    it('should handle getBlocks messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Simulate receiving a getBlocks message
      const mockPeer = { id: 'test:1234' };
      const mockMessage = { type: 'getBlocks', data: {}, timestamp: Date.now() };
      
      (network1 as any).handleGetBlocksMessage(mockPeer, mockMessage);
      
      expect(consoleSpy).toHaveBeenCalledWith('Received getBlocks request from test:1234');
      consoleSpy.mockRestore();
    });

    it('should handle getBlock messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Simulate receiving a getBlock message
      const mockPeer = { id: 'test:1234' };
      const mockMessage = { type: 'getBlock', data: {}, timestamp: Date.now() };
      
      (network1 as any).handleGetBlockMessage(mockPeer, mockMessage);
      
      expect(consoleSpy).toHaveBeenCalledWith('Received getBlock request from test:1234');
      consoleSpy.mockRestore();
    });
  });

  describe('Blockchain Synchronization', () => {
    it('should log sync message for now', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await network1.syncBlockchain();
      
      expect(consoleSpy).toHaveBeenCalledWith('Blockchain sync will be implemented in subtask 9.3');
      consoleSpy.mockRestore();
    });
  });

  describe('Network Node Access', () => {
    it('should provide access to underlying network node', () => {
      const networkNode = network1.getNetworkNode();
      expect(networkNode).toBeDefined();
      expect(typeof networkNode.startServer).toBe('function');
      expect(typeof networkNode.connectToPeer).toBe('function');
    });
  });
});