import { P2PNetwork } from '../p2p';
import { BlockchainImpl } from '../../core/blockchain';
import { Block } from '../../interfaces';
import { vi } from 'vitest';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

describe('P2P Network Blockchain Synchronization Simple Tests', () => {
  let network1: P2PNetwork;
  let network2: P2PNetwork;
  let blockchain1: BlockchainImpl;
  let blockchain2: BlockchainImpl;

  const port1 = 18301;
  const port2 = 18302;

  beforeEach(async () => {
    // Create blockchains
    blockchain1 = new BlockchainImpl();
    blockchain2 = new BlockchainImpl();

    // Create networks with blockchains
    network1 = new P2PNetwork(blockchain1);
    network2 = new P2PNetwork(blockchain2);

    // Start nodes
    await network1.startNode(port1);
    await network2.startNode(port2);

    // Connect networks
    await network1.connectToPeer('localhost', port2);
    
    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await network1.stopNode();
    await network2.stopNode();
  });

  describe('Synchronization Core Functionality', () => {
    it('should successfully sync when blockchain heights differ', async () => {
      // Mock blockchain1 to have height 0 (needs sync)
      vi.spyOn(blockchain1, 'getBlockHeight').mockReturnValue(0);
      
      // Mock blockchain2 to have height 2 (has blocks to share)
      vi.spyOn(blockchain2, 'getBlockHeight').mockReturnValue(2);
      vi.spyOn(blockchain2, 'getLatestBlock').mockReturnValue({
        header: {
          version: 1,
          previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
          merkleRoot: 'merkle-root',
          timestamp: Date.now(),
          difficulty: 1,
          nonce: 0
        },
        transactions: []
      } as Block);

      // Mock blockchain1 addBlock to return true (successful addition)
      vi.spyOn(blockchain1, 'addBlock').mockResolvedValue(true);

      // Track sync events
      let syncedBlocks = 0;
      network1.on('blockSynced', () => {
        syncedBlocks++;
      });

      // Start synchronization
      await network1.syncBlockchain();

      // Verify sync occurred
      expect(syncedBlocks).toBeGreaterThan(0);
      expect(blockchain1.addBlock).toHaveBeenCalled();
    });

    it('should handle sync with no peers gracefully', async () => {
      // Disconnect all peers
      await network2.stopNode();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Attempt sync with no peers - should not throw
      await expect(network1.syncBlockchain()).resolves.not.toThrow();
    });

    it('should provide sync status information', () => {
      // Mock blockchain height
      vi.spyOn(blockchain1, 'getBlockHeight').mockReturnValue(10);

      const status = network1.getSyncStatus();

      expect(status.currentHeight).toBe(10);
      expect(status.peerCount).toBe(1); // Connected to network2
      expect(typeof status.isSyncing).toBe('boolean');
    });

    it('should handle sync status without blockchain', () => {
      const networkWithoutBlockchain = new P2PNetwork();
      const status = networkWithoutBlockchain.getSyncStatus();

      expect(status.currentHeight).toBe(0);
      expect(status.peerCount).toBe(0);
      expect(typeof status.isSyncing).toBe('boolean');
    });

    it('should throw error when syncing without blockchain', async () => {
      const networkWithoutBlockchain = new P2PNetwork();
      await networkWithoutBlockchain.startNode(18303);

      await expect(networkWithoutBlockchain.syncBlockchain()).rejects.toThrow('No blockchain available');

      await networkWithoutBlockchain.stopNode();
    });
  });

  describe('Block Request Functionality', () => {
    it('should request specific blocks by hash', async () => {
      const testBlock = {
        header: {
          version: 1,
          previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
          merkleRoot: 'merkle-root',
          timestamp: Date.now(),
          difficulty: 1,
          nonce: 0
        },
        transactions: []
      } as Block;

      // Mock blockchain2 getBlock method
      vi.spyOn(blockchain2, 'getBlock').mockResolvedValue(testBlock);

      // Request specific block
      const result = await network1.requestBlock('test-hash', 2000);

      expect(result).toBeDefined();
      expect(result?.header.version).toBe(1);
      expect(blockchain2.getBlock).toHaveBeenCalledWith('test-hash');
    });

    it('should return null for non-existent blocks', async () => {
      // Mock blockchain2 getBlock method to return null
      vi.spyOn(blockchain2, 'getBlock').mockResolvedValue(null);

      // Request non-existent block
      const result = await network1.requestBlock('non-existent-hash', 2000);

      expect(result).toBeNull();
      expect(blockchain2.getBlock).toHaveBeenCalledWith('non-existent-hash');
    });

    it('should handle request timeout', async () => {
      // Create network that won't respond
      const network3 = new P2PNetwork();
      await network3.startNode(18304);
      await network1.connectToPeer('localhost', 18304);
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Disconnect network2 so only network3 is available (won't respond)
      await network2.stopNode();

      // Request block with short timeout - should return null after trying all peers
      const result = await network1.requestBlock('test-hash', 500);
      expect(result).toBeNull();

      await network3.stopNode();
    });
  });

  describe('Message Handling', () => {
    it('should handle getBlocks requests properly', async () => {
      // Mock blockchain2 methods
      vi.spyOn(blockchain2, 'getBlockHeight').mockReturnValue(5);
      vi.spyOn(blockchain2, 'getLatestBlock').mockReturnValue({
        header: {
          version: 1,
          previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
          merkleRoot: 'merkle-root',
          timestamp: Date.now(),
          difficulty: 1,
          nonce: 0
        },
        transactions: []
      } as Block);

      // Send getBlocks request manually
      const request = network1.getNetworkNode()['protocolHandler'].createMessage('getBlocks', {
        startHeight: 0,
        maxBlocks: 10
      });

      const peers = network1.getNetworkNode().getPeers();
      expect(peers.length).toBe(1);

      const sent = network1.getNetworkNode().sendToPeer(peers[0].id, request);
      expect(sent).toBe(true);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify blockchain methods were called
      expect(blockchain2.getBlockHeight).toHaveBeenCalled();
    });

    it('should handle getBlock requests properly', async () => {
      const testBlock = {
        header: {
          version: 1,
          previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
          merkleRoot: 'merkle-root',
          timestamp: Date.now(),
          difficulty: 1,
          nonce: 0
        },
        transactions: []
      } as Block;

      // Mock blockchain2 getBlock method
      vi.spyOn(blockchain2, 'getBlock').mockResolvedValue(testBlock);

      // Send getBlock request manually
      const request = network1.getNetworkNode()['protocolHandler'].createMessage('getBlock', {
        blockHash: 'test-hash'
      });

      const peers = network1.getNetworkNode().getPeers();
      const sent = network1.getNetworkNode().sendToPeer(peers[0].id, request);
      expect(sent).toBe(true);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify blockchain method was called
      expect(blockchain2.getBlock).toHaveBeenCalledWith('test-hash');
    });
  });

  describe('Error Handling', () => {
    it('should handle blockchain errors during sync gracefully', async () => {
      // Mock blockchain1 to have height 0
      vi.spyOn(blockchain1, 'getBlockHeight').mockReturnValue(0);
      
      // Mock blockchain2 to have blocks
      vi.spyOn(blockchain2, 'getBlockHeight').mockReturnValue(1);
      vi.spyOn(blockchain2, 'getLatestBlock').mockReturnValue({
        header: {
          version: 1,
          previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
          merkleRoot: 'merkle-root',
          timestamp: Date.now(),
          difficulty: 1,
          nonce: 0
        },
        transactions: []
      } as Block);

      // Mock blockchain1 addBlock to fail
      vi.spyOn(blockchain1, 'addBlock').mockResolvedValue(false);

      // Sync should handle the failure gracefully (not throw)
      await expect(network1.syncBlockchain()).resolves.not.toThrow();
    });

    it('should handle network errors during requests', async () => {
      // Disconnect network2
      await network2.stopNode();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Try to request block with no peers
      await expect(network1.requestBlock('test-hash')).rejects.toThrow('No peers available');
    });
  });
});