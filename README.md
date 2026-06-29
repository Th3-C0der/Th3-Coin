# Th3-Coin - Decentralized Cryptocurrency

**Prototype Currency by Th3-C0der**

A TypeScript implementation of a decentralized cryptocurrency similar to Bitcoin, featuring blockchain technology, proof-of-work mining, wallet functionality, and peer-to-peer networking. This project serves as an educational prototype to demonstrate the fundamental concepts behind cryptocurrency systems.

## Project Structure

```
src/
├── interfaces/          # Core TypeScript interfaces and types
│   └── index.ts        # All interface definitions
├── core/               # Core blockchain components
│   ├── blockchain.ts   # Main blockchain implementation
│   ├── block.ts        # Block and BlockHeader classes
│   ├── transaction.ts  # Transaction-related classes
│   ├── mining.ts       # Mining and proof-of-work
│   └── mempool.ts      # Transaction pool management
├── wallet/             # Wallet management
│   ├── wallet.ts       # Main wallet implementation
│   └── keypair.ts      # Cryptographic key pair handling
├── network/            # P2P networking
│   ├── p2p.ts          # Peer-to-peer network manager
│   └── protocol.ts     # Network protocol handler
├── storage/            # Data persistence
│   └── storage.ts      # Blockchain and wallet storage
└── index.ts            # Main entry point
```

## Features

- ✅ **Project Structure**: TypeScript project with proper configuration
- ✅ **Core Interfaces**: Complete interface definitions for all components
- ✅ **Cryptographic Utilities**: SHA-256 hashing and ECDSA signatures
- ✅ **Transaction System**: UTXO model with transaction validation
- ✅ **Blockchain Core**: Block validation and chain management
- ✅ **Proof-of-Work Mining**: Mining algorithm with difficulty adjustment
- ✅ **Wallet Functionality**: Key management and transaction creation
- ✅ **P2P Networking**: Peer discovery and data propagation
- ✅ **Data Persistence**: Blockchain and wallet storage
- ✅ **Command-Line Interface**: User-friendly CLI for all operations
- ✅ **System Integration**: Full node with configuration and monitoring
- ✅ **Graceful Shutdown**: Proper cleanup and signal handling
- ✅ **Performance Optimizations**: UTXO caching, parallel validation, and monitoring
- ✅ **Comprehensive Benchmarks**: Performance testing and optimization metrics

## Key Concepts

Th3-Coin implements several core cryptocurrency concepts:

- **Blockchain**: A distributed ledger that records all transactions across the network
- **Proof-of-Work**: Mining mechanism that secures the network through computational puzzles
- **UTXO Model**: Unspent Transaction Output model for tracking coin ownership
- **Digital Signatures**: ECDSA cryptography for transaction authentication
- **P2P Network**: Decentralized peer-to-peer communication protocol

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

```bash
npm install
```

### Quick Start

#### Running a Full Node

```bash
# Start a Th3Coin node with default configuration
npm run start:node

# Or create a custom configuration file
cp th3coin.config.example.json th3coin.config.json
# Edit th3coin.config.json as needed
npm run start:node
```

#### Using the CLI

```bash
# Start the CLI for wallet and blockchain operations
npm run cli

# Or after building
./dist/cli/th3coin.js --help
```

### Configuration

Create a `th3coin.config.json` file to customize your node:

```json
{
  "network": {
    "port": 8333,
    "maxPeers": 10,
    "seedNodes": []
  },
  "mining": {
    "enabled": true,
    "difficulty": 4,
    "blockReward": 5000000000
  },
  "storage": {
    "dataDirectory": "./data"
  },
  "logging": {
    "level": "info"
  }
}
```

See [System Startup Documentation](docs/system-startup.md) for detailed configuration options and [Performance Optimizations](docs/performance-optimizations.md) for performance tuning.

### Development

```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Watch tests
npm run test:watch

# Run system integration tests
npm run test:system

# Clean build directory
npm run clean
```

### Testing

The project uses Vitest for testing with 40+ test files covering unit, integration, and system tests.

```bash
npm test
```

# Run tests in watch mode
npm run test:watch

# Run system integration tests
npm run test:system

# Run performance benchmarks
npm run test:performance
```

#### Test Utilities

The project includes reusable test fixtures and scenarios in the `test-data` directory:

- **test-fixtures.ts**: Helper functions for generating test wallets, blocks, transactions, and configurations
- **test-scenarios.ts**: Pre-defined test scenarios for common use cases
- **test-config.json**: Base configuration for testing

See [Testing Documentation](docs/testing.md) for detailed testing guide and [test-data README](test-data/README.md) for fixture usage.

## How It Works

### Transaction Flow

1. **Create Transaction**: Users create transactions using their wallet, specifying recipients and amounts
2. **Sign Transaction**: Transaction is signed with the sender's private key
3. **Broadcast**: Transaction is broadcast to the P2P network
4. **Mempool**: Valid transactions are stored in the mempool pending inclusion in a block
5. **Mining**: Miners select transactions from the mempool and attempt to solve the proof-of-work puzzle
6. **Block Creation**: When a miner finds a valid hash, they create a new block containing the transactions
7. **Block Propagation**: The new block is broadcast to the network
8. **Validation**: Other nodes validate the block and add it to their blockchain
9. **Confirmation**: Transactions receive confirmations as more blocks are added on top

### Security Features

- **Cryptographic Security**: SHA-256 hashing and ECDSA signatures ensure transaction integrity
- **Decentralized Consensus**: Proof-of-work mechanism prevents double-spending attacks
- **Immutable Ledger**: Once blocks are added to the blockchain, they cannot be altered
- **Network Resilience**: P2P architecture ensures no single point of failure

## Architecture

Th3-Coin follows a modular architecture with clear separation of concerns:

- **Interfaces**: Define contracts for all components
- **Core**: Blockchain logic, transactions, and mining
- **Wallet**: Key management and transaction creation
- **Network**: P2P communication and synchronization
- **Storage**: Data persistence and retrieval

## Future Enhancements

Potential improvements for future versions:

- **Smart Contracts**: Add support for programmable transactions
- **Proof-of-Stake**: Implement alternative consensus mechanism
- **Light Clients**: Enable lightweight SPV clients
- **Privacy Features**: Add transaction mixing or zero-knowledge proofs
- **Cross-Chain Compatibility**: Enable interoperability with other blockchains
- **Mobile Wallet**: Develop mobile application for wallet management
- **Hardware Wallet Integration**: Support for hardware wallet devices

## License

MIT License - see LICENSE file for details.

---

**By Th3-C0der**