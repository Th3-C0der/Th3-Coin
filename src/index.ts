#!/usr/bin/env node

// Main entry point for Th3Coin
import { Th3CoinNode } from './node/th3coin-node';
import { logger } from './utils/logger';

async function main() {
  try {
    logger.info('Starting Th3Coin - Decentralized Cryptocurrency');
    
    // Create and initialize node
    const node = new Th3CoinNode();
    
    // Setup event listeners
    node.on('initialized', () => {
      logger.info('Node initialized successfully');
    });
    
    node.on('started', () => {
      logger.info('Node started successfully');
      const stats = node.getStats();
      logger.info('Node statistics:', stats);
    });
    
    node.on('stopped', () => {
      logger.info('Node stopped');
    });
    
    node.on('error', (error) => {
      logger.error('Node error:', error);
    });

    // Initialize and start the node
    await node.initialize();
    await node.start();
    
    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await node.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start Th3Coin node:', error);
    process.exit(1);
  }
}

// Run main function if this file is executed directly
if (require.main === module) {
  main();
}

// Export modules for library usage
export * from './interfaces';
export * from './core';
export * from './wallet';
export * from './network';
export * from './storage';
export { ConfigManager, DEFAULT_CONFIG } from './config';
export * from './utils/logger';
export * from './node/th3coin-node';