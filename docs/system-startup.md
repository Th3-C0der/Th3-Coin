# Th3Coin System Startup and Configuration

## Overview

Th3Coin provides a comprehensive system for starting and configuring a cryptocurrency node. The system includes configuration management, logging, graceful shutdown procedures, and full system integration.

## Quick Start

### Running the Node

```bash
# Start the node with default configuration
npm run start:node

# Or build and run
npm run build
npm start

# Run the CLI
npm run cli
```

### Configuration

Create a configuration file `th3coin.config.json` in the project root:

```json
{
  "network": {
    "port": 8333,
    "maxPeers": 10,
    "seedNodes": [
      "localhost:8334",
      "localhost:8335"
    ],
    "connectionTimeout": 30000
  },
  "mining": {
    "enabled": true,
    "difficulty": 4,
    "blockReward": 5000000000,
    "targetBlockTime": 600000
  },
  "storage": {
    "dataDirectory": "./data",
    "walletDirectory": "./data/wallets",
    "blockchainFile": "./data/blockchain.json"
  },
  "logging": {
    "level": "info",
    "file": "./logs/th3coin.log"
  }
}
```

## Configuration Options

### Network Configuration

- `port`: Port number for P2P network (default: 8333)
- `maxPeers`: Maximum number of peer connections (default: 10)
- `seedNodes`: Array of seed node addresses to connect to
- `connectionTimeout`: Connection timeout in milliseconds (default: 30000)

### Mining Configuration

- `enabled`: Whether to enable mining (default: false)
- `difficulty`: Mining difficulty level (default: 4)
- `blockReward`: Block reward in satoshis (default: 5000000000 = 50 Th3Coins)
- `targetBlockTime`: Target time between blocks in milliseconds (default: 600000 = 10 minutes)

### Storage Configuration

- `dataDirectory`: Directory for blockchain and node data (default: "./data")
- `walletDirectory`: Directory for wallet files (default: "./data/wallets")
- `blockchainFile`: Blockchain storage file (default: "./data/blockchain.json")

### Logging Configuration

- `level`: Log level - "debug", "info", "warn", or "error" (default: "info")
- `file`: Optional log file path for persistent logging

## System Architecture

### Node Components

The Th3Coin node consists of several integrated components:

1. **Configuration Manager**: Handles loading and validation of configuration
2. **Blockchain Engine**: Manages the blockchain and transaction validation
3. **P2P Network**: Handles peer-to-peer communication
4. **Mining Engine**: Performs proof-of-work mining (optional)
5. **Wallet Manager**: Manages wallets and keys
6. **Mempool**: Manages pending transactions
7. **Storage Layer**: Persists blockchain and wallet data

### Initialization Process

1. Load and validate configuration
2. Initialize logging system
3. Create wallet manager and default wallet
4. Initialize blockchain from storage
5. Set up mempool for pending transactions
6. Initialize P2P network layer
7. Initialize mining engine (if enabled)
8. Start network and connect to seed nodes
9. Begin mining (if enabled)

## Node Management

### Starting the Node

```typescript
import { Th3CoinNode } from './src/node/th3coin-node';

const node = new Th3CoinNode('./my-config.json');

// Initialize all components
await node.initialize();

// Start the node
await node.start();
```

### Node Statistics

```typescript
const stats = node.getStats();
console.log({
  uptime: stats.uptime,           // Node uptime in milliseconds
  blockHeight: stats.blockHeight, // Current blockchain height
  peerCount: stats.peerCount,     // Number of connected peers
  mempoolSize: stats.mempoolSize, // Number of pending transactions
  isMining: stats.isMining,       // Whether mining is active
  hashRate: stats.hashRate        // Current hash rate (if mining)
});
```

### Runtime Configuration Updates

```typescript
// Update configuration at runtime
node.updateConfig({
  mining: {
    enabled: true,
    difficulty: 5
  },
  logging: {
    level: 'debug'
  }
});
```

### Graceful Shutdown

```typescript
// Stop the node gracefully
await node.stop();

// Add custom shutdown handlers
node.addShutdownHandler(async () => {
  console.log('Performing cleanup...');
  // Custom cleanup logic
});
```

## Error Handling

### Configuration Validation

The system validates all configuration parameters:

- Network port must be between 1 and 65535
- Max peers must be at least 1
- Mining difficulty must be at least 1
- Block reward cannot be negative
- Target block time must be at least 1 second

### Graceful Error Recovery

- Invalid configuration files fall back to defaults
- Network connection failures are retried automatically
- Storage errors are logged and handled gracefully
- Mining errors don't crash the node

### Logging

All errors and important events are logged with appropriate levels:

```
[2025-08-15T15:52:41.799Z] INFO: [NODE] Th3Coin node started successfully
[2025-08-15T15:52:41.800Z] INFO: [NETWORK] Network started on port 8333
[2025-08-15T15:52:41.801Z] WARN: [NETWORK] Failed to connect to seed node localhost:8334
[2025-08-15T15:52:41.802Z] ERROR: [MINING] Mining error: Insufficient transactions
```

## Signal Handling

The node handles system signals gracefully:

- `SIGINT` (Ctrl+C): Graceful shutdown
- `SIGTERM`: Graceful shutdown
- `uncaughtException`: Log error and shutdown
- `unhandledRejection`: Log error and shutdown

## Testing

Run system integration tests:

```bash
npm run test:system
```

The tests cover:
- Node lifecycle (start/stop/restart)
- Configuration management
- Component integration
- Mining operations
- Network functionality
- Error handling
- Shutdown procedures

### Comprehensive Testing Suite

The project includes 40+ test files covering:

- **Unit Tests**: Individual component testing (blockchain, transactions, mining, wallet, network)
- **Integration Tests**: Component interaction testing
- **System Tests**: Full node lifecycle and integration testing
- **Performance Tests**: Benchmarking and optimization validation

### Running All Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run system integration tests
npm run test:system

# Run performance benchmarks
npm run test:performance
```

### Test Utilities

The project includes reusable test fixtures and scenarios in the `test-data` directory:

- **test-fixtures.ts**: Helper functions for generating test wallets, blocks, transactions, and configurations
- **test-scenarios.ts**: Pre-defined test scenarios for common use cases
- **test-config.json**: Base configuration for testing

See [Testing Documentation](./testing.md) for detailed testing guide and [test-data README](../test-data/README.md) for fixture usage.

## Production Deployment

### Recommended Configuration

```json
{
  "network": {
    "port": 8333,
    "maxPeers": 50,
    "seedNodes": [
      "seed1.th3coin.network:8333",
      "seed2.th3coin.network:8333"
    ]
  },
  "mining": {
    "enabled": true,
    "difficulty": 6
  },
  "storage": {
    "dataDirectory": "/var/lib/th3coin",
    "walletDirectory": "/var/lib/th3coin/wallets"
  },
  "logging": {
    "level": "info",
    "file": "/var/log/th3coin/node.log"
  }
}
```

### System Requirements

- Node.js 18 or higher
- At least 1GB RAM
- 10GB+ disk space for blockchain data
- Stable internet connection
- Open firewall port for P2P communication

### Monitoring

Monitor node health using:

```bash
# Check node status via CLI
npm run cli status

# View logs
tail -f /var/log/th3coin/node.log

# Monitor system resources
htop
```