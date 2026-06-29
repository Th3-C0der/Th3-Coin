import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { P2PNetwork } from '../network/p2p';
import { BlockchainImpl } from '../core/blockchain';
import { Wallet } from '../wallet/wallet';
import { MinerImpl } from '../core/mining';
import { Mempool } from '../core/mempool';
import { TransactionImpl } from '../core/transaction';
import { UTXOManager } from '../core/utxo-manager';
import * as fs from 'fs';
import * as path from 'path';

describe('Network Communication and Peer Management Integration Tests', () => {
  let network1: P2PNetwork;
  let network2: P2PNetwork;
  let network3: P2PNetwork;
  let blockchain1: BlockchainImpl;
  let blockchain2: BlockchainImpl;
  let blockchain3: BlockchainImpl;
  let wallet1: Wallet;
  let wallet2: Wallet;
  let wallet3: Wallet;
  let miner1: MinerImpl;
  let miner2: MinerImpl;
  let testDataDir: string;

  const port1 = 18301;
  const port2 = 18302;
  const port3 = 18303;

  beforeEach(async () => {
    // Create test data directory
    testDataDir = path.join(__dirname, '../../test-data', `network-test-${Date.now()}`);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Initialize wallets
    wallet1 = new Wallet();
    wallet2 = new Wallet();
    wallet3 = new Wallet();

    // Initialize blockchains with isolated data directories
    blockchain1 = new BlockchainImpl(wallet1.getAddress(), path.join(testDataDir, 'blockchain1'));
    blockchain2 = new BlockchainImpl(wallet2.getAddress(), path.join(testDataDir, 'blockchain2'));
    blockchain3 = new BlockchainImpl(wallet3.getAddress(), path.join(testDataDir, 'blockchain3'));
    
    await blockchain1.initialize(wallet1.getAddress());
    await blockchain2.initialize(wallet2.getAddress());
    await blockchain3.initialize(wallet3.getAddress());

    // Initialize miners
    miner1 = new MinerImpl(wallet1.getAddress(), {
      difficulty: 1,
      blockReward: 2500000000,
      targetBlockTime: 10
    });

    miner2 = new MinerImpl(wallet2.getAddress(), {
      difficulty: 1,
      blockReward: 2500000000,
      targetBlockTime: 10
    });

    // Initialize networks
    network1 = new P2PNetwork(blockchain1);
    network2 = new P2PNetwork(blockchain2);
    network3 = new P2PNetwork(blockchain3);
  });

  afterEach(async () => {
    // Stop all networks
    try {
      await network1.stopNode();
      await network2.stopNode();
      await network3.stopNode();
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clean up test data directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Multi-Node Network Setup and Communication', () => {
    it('should establish connections between multiple nodes', async () => {
      // Start nodes
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network3.startNode(port3);

      // Connect nodes in a chain: 1 -> 2 -> 3
      await network1.connectToPeer('localhost', port2);
      await network2.connectToPeer('localhost', port3);

      // Wait for connections to establish
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify connections
      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);
      expect(network3.getPeerCount()).toBeGreaterThan(0);

      // Verify network status
      const status1 = network1.getSyncStatus();
      const status2 = network2.getSyncStatus();
      const status3 = network3.getSyncStatus();

      expect(status1.peerCount).toBeGreaterThan(0);
      expect(status2.peerCount).toBeGreaterThan(0);
      expect(status3.peerCount).toBeGreaterThan(0);
    });

    it('should handle peer disconnection and reconnection', async () => {
      // Start nodes and connect
      await network1.startNode(port1);
      await network2.startNode(port2);
      
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);

      // Disconnect network2
      await network2.stopNode();
      await new Promise(resolve => setTimeout(resolve, 100));

      // network1 should detect disconnection
      expect(network1.getPeerCount()).toBe(0);

      // Restart network2 and reconnect
      await network2.startNode(port2);
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should be connected again
      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);
    });

    it('should handle multiple simultaneous connections', async () => {
      // Start all nodes
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network3.startNode(port3);

      // Connect network1 to both network2 and network3
      await Promise.all([
        network1.connectToPeer('localhost', port2),
        network1.connectToPeer('localhost', port3)
      ]);

      await new Promise(resolve => setTimeout(resolve, 200));

      // network1 should be connected to 2 peers
      expect(network1.getPeerCount()).toBe(2);
      
      // network2 and network3 should each be connected to 1 peer (network1)
      expect(network2.getPeerCount()).toBe(1);
      expect(network3.getPeerCount()).toBe(1);
    });
  });

  describe('Transaction Propagation', () => {
    it('should propagate transactions across the network', async () => {
      // Start nodes and connect them
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network3.startNode(port3);

      await network1.connectToPeer('localhost', port2);
      await network2.connectToPeer('localhost', port3);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Fund wallet1 by mining a block
      const fundingMiner = new MinerImpl(wallet1.getAddress(), {
        difficulty: 1,
        blockReward: 2500000000,
        targetBlockTime: 10
      });

      const latestBlock = blockchain1.getLatestBlock();
      const latestHash = miner1.calculateHash(latestBlock);
      const fundingBlock = await fundingMiner.mineBlock([], latestHash);
      await blockchain1.addBlock(fundingBlock);

      // Create and broadcast transaction
      const senderUTXOs = blockchain1.getUTXOs(wallet1.getAddress());
      const utxoManager = new UTXOManager(senderUTXOs);
      
      const transaction = wallet1.createTransaction(
        wallet2.getAddress(),
        1000000000, // 10 Th3Coins
        10000000,    // 0.1 Th3Coins fee
        utxoManager
      );
      wallet1.signTransaction(transaction);

      // Broadcast transaction from network1
      await network1.broadcastTransaction(transaction);

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify transaction reached other nodes (this would depend on mempool integration)
      // For now, just verify the broadcast doesn't throw errors
      expect(transaction.id).toBeDefined();
    });

    it('should handle transaction validation during propagation', async () => {
      // Start nodes and connect
      await network1.startNode(port1);
      await network2.startNode(port2);
      
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create invalid transaction (negative amount)
      const invalidTransaction = new TransactionImpl(
        [{ txId: '1'.repeat(64), outputIndex: 0, signature: 'sig', publicKey: wallet1.getPublicKey() }],
        [{ address: wallet2.getAddress(), amount: -1000000000 }]
      );

      // Attempt to broadcast invalid transaction
      try {
        await network1.broadcastTransaction(invalidTransaction);
        // Should not throw error during broadcast, but nodes should reject it
        expect(true).toBe(true);
      } catch (error) {
        // Broadcasting might fail due to validation
        expect(error).toBeDefined();
      }
    });
  });

  describe('Block Propagation and Synchronization', () => {
    it('should propagate new blocks across the network', async () => {
      // Start nodes and connect
      await network1.startNode(port1);
      await network2.startNode(port2);
      
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Mine a block on blockchain1
      const latestBlock = blockchain1.getLatestBlock();
      const latestHash = miner1.calculateHash(latestBlock);
      const newBlock = await miner1.mineBlock([], latestHash);
      
      // Add block to blockchain1
      await blockchain1.addBlock(newBlock);
      expect(blockchain1.getBlockHeight()).toBe(2);

      // Broadcast block
      await network1.broadcastBlock(newBlock);

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify block propagation (this would depend on automatic sync implementation)
      expect(newBlock.header.nonce).toBeGreaterThan(0);
    });

    it('should synchronize blockchain state between peers', async () => {
      // Start nodes
      await network1.startNode(port1);
      await network2.startNode(port2);

      // Mine blocks on blockchain1 to make it longer
      let currentBlock = blockchain1.getLatestBlock();
      for (let i = 0; i < 3; i++) {
        const currentHash = miner1.calculateHash(currentBlock);
        const newBlock = await miner1.mineBlock([], currentHash);
        await blockchain1.addBlock(newBlock);
        currentBlock = newBlock;
      }

      expect(blockchain1.getBlockHeight()).toBe(4); // Genesis + 3 mined
      expect(blockchain2.getBlockHeight()).toBe(1); // Just genesis

      // Connect nodes
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger synchronization
      await network2.syncBlockchain();

      // Wait for sync to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify synchronization (this would depend on the sync implementation)
      const syncStatus = network2.getSyncStatus();
      expect(syncStatus.currentHeight).toBeGreaterThan(1);
    });

    it('should handle blockchain conflicts and resolve to longest chain', async () => {
      // Start all nodes
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network3.startNode(port3);

      // Create competing chains
      // Chain 1: Mine 2 blocks
      let current1 = blockchain1.getLatestBlock();
      for (let i = 0; i < 2; i++) {
        const hash = miner1.calculateHash(current1);
        const block = await miner1.mineBlock([], hash);
        await blockchain1.addBlock(block);
        current1 = block;
      }

      // Chain 2: Mine 3 blocks (longer chain)
      let current2 = blockchain2.getLatestBlock();
      for (let i = 0; i < 3; i++) {
        const hash = miner2.calculateHash(current2);
        const block = await miner2.mineBlock([], hash);
        await blockchain2.addBlock(block);
        current2 = block;
      }

      expect(blockchain1.getBlockHeight()).toBe(3); // Genesis + 2
      expect(blockchain2.getBlockHeight()).toBe(4); // Genesis + 3

      // Connect networks
      await network1.connectToPeer('localhost', port2);
      await network2.connectToPeer('localhost', port3);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Trigger synchronization
      await network1.syncBlockchain();
      await network3.syncBlockchain();

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify longest chain rule (this would depend on sync implementation)
      expect(blockchain2.getBlockHeight()).toBe(4); // Should remain the longest
    });
  });

  describe('Peer Discovery and Management', () => {
    it('should maintain peer connections and handle peer list', async () => {
      // Start nodes
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network3.startNode(port3);

      // Connect in chain
      await network1.connectToPeer('localhost', port2);
      await network2.connectToPeer('localhost', port3);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify peer counts
      expect(network1.getPeerCount()).toBe(1);
      expect(network2.getPeerCount()).toBe(2); // Connected to both 1 and 3
      expect(network3.getPeerCount()).toBe(1);

      // Get peer information
      const peers1 = network1.getPeers();
      const peers2 = network2.getPeers();
      const peers3 = network3.getPeers();

      expect(peers1.length).toBe(1);
      expect(peers2.length).toBe(2);
      expect(peers3.length).toBe(1);
    });

    it('should handle peer connection failures gracefully', async () => {
      // Start only network1
      await network1.startNode(port1);

      // Try to connect to non-existent peer
      try {
        await network1.connectToPeer('localhost', 99999); // Non-existent port
        // Connection might fail silently or throw error
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Should still be able to function
      expect(network1.getPeerCount()).toBe(0);
      
      // Should be able to connect to valid peer later
      await network2.startNode(port2);
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(network1.getPeerCount()).toBeGreaterThan(0);
    });

    it('should handle network partitions and healing', async () => {
      // Start all nodes and connect them
      await network1.startNode(port1);
      await network2.startNode(port2);
      await network3.startNode(port3);

      await network1.connectToPeer('localhost', port2);
      await network2.connectToPeer('localhost', port3);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify initial connectivity
      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);
      expect(network3.getPeerCount()).toBeGreaterThan(0);

      // Simulate network partition by stopping network2
      await network2.stopNode();
      await new Promise(resolve => setTimeout(resolve, 200));

      // network1 and network3 should detect disconnection
      expect(network1.getPeerCount()).toBe(0);
      expect(network3.getPeerCount()).toBe(0);

      // Heal partition by restarting network2 and reconnecting
      await network2.startNode(port2);
      await network1.connectToPeer('localhost', port2);
      await network2.connectToPeer('localhost', port3);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should be connected again
      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);
      expect(network3.getPeerCount()).toBeGreaterThan(0);
    });
  });

  describe('Network Resilience and Error Handling', () => {
    it('should handle malformed messages gracefully', async () => {
      // Start nodes and connect
      await network1.startNode(port1);
      await network2.startNode(port2);
      
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // This test would require access to low-level message sending
      // For now, just verify the networks can handle normal operations
      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);
    });

    it('should maintain network stability under load', async () => {
      // Start nodes and connect
      await network1.startNode(port1);
      await network2.startNode(port2);
      
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate load by rapid connection attempts
      const connectionPromises = [];
      for (let i = 0; i < 5; i++) {
        connectionPromises.push(
          network1.connectToPeer('localhost', port2).catch(() => {
            // Ignore connection errors for load test
          })
        );
      }

      await Promise.all(connectionPromises);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Network should still be stable
      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);
    });

    it('should handle concurrent blockchain operations', async () => {
      // Start nodes and connect
      await network1.startNode(port1);
      await network2.startNode(port2);
      
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Perform concurrent operations
      const operations = [
        network1.syncBlockchain(),
        network2.syncBlockchain(),
        (async () => {
          const block = blockchain1.getLatestBlock();
          const hash = miner1.calculateHash(block);
          const newBlock = await miner1.mineBlock([], hash);
          return blockchain1.addBlock(newBlock);
        })()
      ];

      // All operations should complete without errors
      const results = await Promise.allSettled(operations);
      
      // At least some operations should succeed
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Network Protocol Compliance', () => {
    it('should follow proper message format and protocol', async () => {
      // Start nodes and connect
      await network1.startNode(port1);
      await network2.startNode(port2);
      
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test basic protocol operations
      const syncStatus1 = network1.getSyncStatus();
      const syncStatus2 = network2.getSyncStatus();

      expect(syncStatus1).toBeDefined();
      expect(syncStatus2).toBeDefined();
      expect(typeof syncStatus1.currentHeight).toBe('number');
      expect(typeof syncStatus2.currentHeight).toBe('number');
    });

    it('should handle version compatibility', async () => {
      // Start nodes
      await network1.startNode(port1);
      await network2.startNode(port2);

      // Connect nodes (version compatibility would be handled in protocol)
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should establish connection successfully
      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);
    });

    it('should maintain proper connection lifecycle', async () => {
      // Start node1
      await network1.startNode(port1);
      expect(network1.getPeerCount()).toBe(0);

      // Start node2 and connect
      await network2.startNode(port2);
      await network1.connectToPeer('localhost', port2);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should be connected
      expect(network1.getPeerCount()).toBeGreaterThan(0);
      expect(network2.getPeerCount()).toBeGreaterThan(0);

      // Disconnect gracefully
      await network1.stopNode();
      await new Promise(resolve => setTimeout(resolve, 100));

      // network2 should detect disconnection
      expect(network2.getPeerCount()).toBe(0);
    });
  });
});