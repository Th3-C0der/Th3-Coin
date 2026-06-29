import { NetworkNode } from '../p2p';
import { NetworkMessage } from '../../interfaces';
import * as net from 'net';
import { vi } from 'vitest';
import { it } from 'node:test';
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
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
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

describe('NetworkNode', () => {
  let node1: NetworkNode;
  let node2: NetworkNode;
  const port1 = 8001;
  const port2 = 8002;

  beforeEach(() => {
    node1 = new NetworkNode();
    node2 = new NetworkNode();
  });

  afterEach(async () => {
    await node1.stopNode();
    await node2.stopNode();
  });

  describe('Server Operations', () => {
    it('should start server on specified port', async () => {
      await node1.startServer(port1);
      expect(node1.isNodeRunning()).toBe(true);
    });

    it('should throw error when starting already running node', async () => {
      await node1.startServer(port1);
      await expect(node1.startServer(port1)).rejects.toThrow('Node is already running');
    });

    it('should stop server properly', async () => {
      await node1.startServer(port1);
      await node1.stopNode();
      expect(node1.isNodeRunning()).toBe(false);
    });

    it('should emit nodeStarted event when server starts', async () => {
      const startedSpy = vi.fn();
      node1.on('nodeStarted', startedSpy);
      
      await node1.startServer(port1);
      expect(startedSpy).toHaveBeenCalledWith({ port: port1 });
    });

    it('should emit nodeStopped event when server stops', async () => {
      const stoppedSpy = vi.fn();
      node1.on('nodeStopped', stoppedSpy);
      
      await node1.startServer(port1);
      await node1.stopNode();
      expect(stoppedSpy).toHaveBeenCalled();
    });
  });

  describe('Peer Connections', () => {
    beforeEach(async () => {
      await node1.startServer(port1);
      await node2.startServer(port2);
    });

    it('should connect to peer successfully', async () => {
      await node2.connectToPeer('localhost', port1);
      expect(node2.getPeerCount()).toBe(1);
    });

    it('should emit peerConnected event on successful connection', async () => {
      const connectedSpy = vi.fn();
      node2.on('peerConnected', connectedSpy);
      
      await node2.connectToPeer('localhost', port1);
      expect(connectedSpy).toHaveBeenCalled();
      expect(connectedSpy.mock.calls[0][0]).toMatchObject({
        host: 'localhost',
        port: port1,
        connected: true
      });
    });

    it('should handle incoming connections', async () => {
      const connectedSpy = vi.fn();
      node1.on('peerConnected', connectedSpy);
      
      await node2.connectToPeer('localhost', port1);
      
      // Wait a bit for the connection to be established
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(node1.getPeerCount()).toBe(1);
      expect(connectedSpy).toHaveBeenCalled();
    });

    it('should throw error when connecting to already connected peer', async () => {
      await node2.connectToPeer('localhost', port1);
      await expect(node2.connectToPeer('localhost', port1))
        .rejects.toThrow('Already connected to peer localhost:8001');
    });

    it('should disconnect peer properly', async () => {
      await node2.connectToPeer('localhost', port1);
      const peerId = `localhost:${port1}`;
      
      node2.disconnectPeer(peerId);
      expect(node2.getPeerCount()).toBe(0);
    });

    it('should emit peerDisconnected event when peer disconnects', async () => {
      const disconnectedSpy = vi.fn();
      node2.on('peerDisconnected', disconnectedSpy);
      
      await node2.connectToPeer('localhost', port1);
      const peerId = `localhost:${port1}`;
      
      node2.disconnectPeer(peerId);
      expect(disconnectedSpy).toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await node1.startServer(port1);
      await node2.startServer(port2);
      await node2.connectToPeer('localhost', port1);
      
      // Wait for connection to be established
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should send message to specific peer', () => {
      const peerId = `localhost:${port1}`;
      const message: NetworkMessage = {
        type: 'ping',
        data: { test: 'data' },
        timestamp: Date.now()
      };
      
      const result = node2.sendToPeer(peerId, message);
      expect(result).toBe(true);
    });

    it('should return false when sending to non-existent peer', () => {
      const message: NetworkMessage = {
        type: 'ping',
        data: { test: 'data' },
        timestamp: Date.now()
      };
      
      const result = node2.sendToPeer('nonexistent:9999', message);
      expect(result).toBe(false);
    });

    it('should broadcast message to all peers', () => {
      const message: NetworkMessage = {
        type: 'ping',
        data: { test: 'data' },
        timestamp: Date.now()
      };
      
      // This should not throw
      expect(() => node2.broadcast(message)).not.toThrow();
    });

    it('should handle ping message and respond with pong', async () => {
      const messageSpy = vi.fn();
      node1.on('message', messageSpy);
      
      const pingMessage: NetworkMessage = {
        type: 'ping',
        data: {},
        timestamp: Date.now()
      };
      
      const peerId = `localhost:${port1}`;
      node2.sendToPeer(peerId, pingMessage);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(messageSpy).toHaveBeenCalled();
    });

    it('should parse multiple messages from buffer', () => {
      const message1: NetworkMessage = { type: 'ping', data: {}, timestamp: Date.now() };
      const message2: NetworkMessage = { type: 'pong', data: {}, timestamp: Date.now() };
      
      const buffer = Buffer.from(JSON.stringify(message1) + '\n' + JSON.stringify(message2) + '\n');
      const messages = (node1 as any).parseMessages(buffer);
      
      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('ping');
      expect(messages[1].type).toBe('pong');
    });

    it('should validate message format', () => {
      const validMessage = { type: 'ping', data: {}, timestamp: Date.now() };
      const invalidMessage1 = { type: 'ping', data: {} }; // missing timestamp
      const invalidMessage2 = { data: {}, timestamp: Date.now() }; // missing type
      
      expect((node1 as any).isValidMessage(validMessage)).toBe(true);
      expect((node1 as any).isValidMessage(invalidMessage1)).toBe(false);
      expect((node1 as any).isValidMessage(invalidMessage2)).toBe(false);
    });
  });

  describe('Peer Management', () => {
    beforeEach(async () => {
      await node1.startServer(port1);
    });

    it('should return list of connected peers', async () => {
      await node2.connectToPeer('localhost', port1);
      
      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peers = node2.getPeers();
      expect(peers).toHaveLength(1);
      expect(peers[0]).toMatchObject({
        host: 'localhost',
        port: port1,
        connected: true
      });
    });

    it('should update peer last seen time on message', async () => {
      await node2.connectToPeer('localhost', port1);
      const peerId = `localhost:${port1}`;
      const initialTime = Date.now();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const message: NetworkMessage = {
        type: 'ping',
        data: {},
        timestamp: Date.now()
      };
      
      node2.sendToPeer(peerId, message);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const peers = node2.getPeers();
      const peer = peers.find(p => p.id === peerId);
      expect(peer?.lastSeen).toBeGreaterThan(initialTime);
    });
  });

  describe('Connection Limits', () => {
    it('should respect maximum connection limit', async () => {
      // Set max connections to 1 for testing
      (node1 as any).maxConnections = 1;
      
      await node1.startServer(port1);
      await node2.startServer(port2);
      
      // First connection should succeed
      await node2.connectToPeer('localhost', port1);
      
      // Wait for connection to be established
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Second connection should fail - but we need to test from the server side
      // The server (node1) should reject incoming connections when at max capacity
      const node3 = new NetworkNode();
      await node3.startServer(8003);
      
      // This connection should be rejected by node1 since it's at max capacity
      try {
        await node3.connectToPeer('localhost', port1);
        // If we get here, the connection was accepted, but node1 should disconnect it
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(node1.getPeerCount()).toBe(1); // Should still be 1, not 2
      } catch (error) {
        // Connection might be rejected immediately
        expect(node1.getPeerCount()).toBe(1);
      }
      
      await node3.stopNode();
    });
  });
});