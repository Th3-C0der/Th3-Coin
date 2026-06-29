import { P2PNetwork } from '../p2p';
import { BlockchainImpl } from '../../core/blockchain';
import { TransactionImpl, TransactionOutputImpl } from '../../core/transaction';
import { BlockImpl, BlockHeaderImpl } from '../../core/block';
import { Block } from '../../interfaces';
import { vi } from 'vitest';

describe('P2P Network Blockchain Synchronization Tests', () => {
  let network1: P2PNetwork;
  let network2: P2PNetwork;
  let blockchain1: BlockchainImpl;
  let blockchain2: BlockchainImpl;

  const port1 = 18201;
  const port2 = 18202;

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

  describe('Block Request Handling', () => {
    it('should handle getBlocks requests', async () => {
      // Mock blockchain methods
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

      // Set up listener for blocks response
      const blocksReceived = new Promise<any>((resolve) => {
        network1.once('message', ({ message }) => {
          if (message.type === 'blocks') {
            resolve(message.data);
          }
        });
      });

      // Send getBlocks request from network1 to network2
      const request = network1.getNetworkNode()['protocolHandler'].createMessage('getBlocks', {
        startHeight: 0,
        maxBlocks: 10
      });

      network1.getNetworkNode().sendToPeer(`localhost:${port2}`, request);

      // Wait for response (with timeout)
      const response = await Promise.race([
        blocksReceived,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);

      expect(response.blocks).toBeDefined();
      expect(Array.isArray(response.blocks)).toBe(true);
    });

    it('should handle getBlock requests', async () => {
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

      // Mock blockchain getBlock method
      vi.spyOn(blockchain2, 'getBlock').mockResolvedValue(testBlock);

      // Set up listener for block response
      const blockReceived = new Promise<Block>((resolve) => {
        network1.once('message', ({ message }) => {
          if (message.type === 'block') {
            resolve(message.data);
          }
        });
      });

      // Send getBlock request
      const request = network1.getNetworkNode()['protocolHandler'].createMessage('getBlock', {
        blockHash: 'test-hash'
      });

      network1.getNetworkNode().sendToPeer(`localhost:${port2}`, request);

      // Wait for response
      const response = await Promise.race([
        blockReceived,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);

      expect(response.header.version).toBe(1);
      expect(blockchain2.getBlock).toHaveBeenCalledWith('test-hash');
    });

    it('should handle block not found responses', async () => {
      // Mock blockchain getBlock method to return null
      vi.spyOn(blockchain2, 'getBlock').mockResolvedValue(null);

      // Set up listener for blockNotFound response
      const blockNotFoundReceived = new Promise<any>((resolve) => {
        network1.once('message', ({ message }) => {
          if (message.type === 'blockNotFound') {
            resolve(message.data);
          }
        });
      });

      // Send getBlock request for non-existent block
      const request = network1.getNetworkNode()['protocolHandler'].createMessage('getBlock', {
        blockHash: 'non-existent-hash'
      });

      network1.getNetworkNode().sendToPeer(`localhost:${port2}`, request);

      // Wait for response
      const response = await Promise.race([
        blockNotFoundReceived,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);

      expect(response.blockHash).toBe('non-existent-hash');
    });
  });

  describe('Blockchain Synchronization', () => {
    it('should sync blockchain when peers have different heights', async () => {
      // Mock blockchain1 to have height 0
      vi.spyOn(blockchain1, 'getBlockHeight').mockReturnValue(0);
      
      // Mock blockchain2 to have height 2 with blocks
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

      // Mock blockchain1 addBlock to return true
      vi.spyOn(blockchain1, 'addBlock').mockResolvedValue(true);

      // Set up listener for sync events
      let syncedBlocks = 0;
      network1.on('blockSynced', () => {
        syncedBlocks++;
      });

      // Start synchronization
      await network1.syncBlockchain();

      // Wait for sync to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify sync occurred
      expect(syncedBlocks).toBeGreaterThan(0);
    });

    it('should handle sync timeout gracefully', async () => {
      // Mock blockchain1 to have height 0
      vi.spyOn(blockchain1, 'getBlockHeight').mockReturnValue(0);

      // Create network3 that won't respond to sync requests
      const network3 = new P2PNetwork();
      await network3.startNode(18203);
      await network1.connectToPeer('localhost', 18203);

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Disconnect network2 so only network3 is available (and won't respond)
      await network2.stopNode();

      // Attempt sync - should handle timeout
      await expect(network1.syncBlockchain()).rejects.toThrow();

      await network3.stopNode();
    });

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
      const result = await network1.requestBlock('test-hash', 5000);

      expect(result).toBeDefined();
      expect(result?.header.version).toBe(1);
    });

    it('should return null for non-existent blocks', async () => {
      // Mock blockchain2 getBlock method to return null
      vi.spyOn(blockchain2, 'getBlock').mockResolvedValue(null);

      // Request non-existent block
      const result = await network1.requestBlock('non-existent-hash', 5000);

      expect(result).toBeNull();
    });

    it('should handle sync with no peers', async () => {
      // Disconnect all peers
      await network2.stopNode();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Attempt sync with no peers
      await network1.syncBlockchain();

      // Should complete without error (just log message)
      expect(network1.getPeerCount()).toBe(0);
    });
  });

  describe('Sync Status and Monitoring', () => {
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
  });

  describe('Error Handling', () => {
    it('should handle invalid blocks response during sync', async () => {
      // Mock blockchain1 to have height 0
      vi.spyOn(blockchain1, 'getBlockHeight').mockReturnValue(0);

      // Mock blockchain2 to return invalid blocks
      vi.spyOn(blockchain2, 'getLatestBlock').mockReturnValue({
        header: 'invalid-header', // Invalid structure
        transactions: []
      } as any);

      // Attempt sync - should handle invalid blocks gracefully
      await expect(network1.syncBlockchain()).rejects.toThrow();
    });

    it('should handle blockchain addBlock failures during sync', async () => {
      // Mock blockchain1 to have height 0
      vi.spyOn(blockchain1, 'getBlockHeight').mockReturnValue(0);
      
      // Mock blockchain2 to have valid blocks
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

      // Attempt sync - should handle addBlock failures
      await expect(network1.syncBlockchain()).rejects.toThrow();
    });

    it('should handle sync without blockchain', async () => {
      const networkWithoutBlockchain = new P2PNetwork();
      await networkWithoutBlockchain.startNode(18204);

      // Attempt sync without blockchain
      await expect(networkWithoutBlockchain.syncBlockchain()).rejects.toThrow('No blockchain available');

      await networkWithoutBlockchain.stopNode();
    });
  });
});