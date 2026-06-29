# 🪙 Th3-Coin - Decentralized Cryptocurrency

**A decentralized cryptocurrency prototype built with TypeScript**

Th3-Coin is a TypeScript implementation of a decentralized cryptocurrency inspired by Bitcoin. It demonstrates the core concepts behind blockchain technology, including proof-of-work mining, the UTXO transaction model, wallet management, and peer-to-peer networking.

> **⚠️ Note:** This project is intended for educational and research purposes. It is **not** designed for production or real-world financial use.

---

## 📁 Project Structure

```text
src/
├── interfaces/          # Core TypeScript interfaces and types
│   └── index.ts         # Shared interfaces
├── core/                # Blockchain implementation
│   ├── blockchain.ts
│   ├── block.ts
│   ├── transaction.ts
│   ├── mining.ts
│   └── mempool.ts
├── wallet/              # Wallet and key management
│   ├── wallet.ts
│   └── keypair.ts
├── network/             # Peer-to-peer networking
│   ├── p2p.ts
│   └── protocol.ts
├── storage/             # Persistent storage
│   └── storage.ts
└── index.ts
```

## ✨ Features

* Blockchain implementation
* Proof-of-Work (PoW) mining
* UTXO-based transaction system
* SHA-256 hashing & ECDSA digital signatures
* Wallet generation and transaction signing
* Peer-to-peer networking
* Mempool management
* Persistent blockchain and wallet storage
* Command-line interface (CLI)
* Configurable node and mining settings
* Performance optimizations
* Comprehensive testing suite

## 🔍 Key Concepts

Th3-Coin implements several core cryptocurrency concepts:

* **Blockchain** – A distributed ledger that records every transaction.
* **Proof-of-Work** – A consensus mechanism that secures the network through computational work.
* **UTXO Model** – Tracks ownership using unspent transaction outputs.
* **Digital Signatures** – Uses ECDSA to verify transaction authenticity.
* **Peer-to-Peer Network** – Enables decentralized communication between nodes.

## 🚀 Getting Started

### Prerequisites

* Node.js 18 or later
* npm (or Yarn)

### Installation

```bash
npm install
```

### Quick Start

#### Running a Full Node

```bash
# Start a node using the default configuration
npm run start:node

# Or create a custom configuration
cp th3coin.config.example.json th3coin.config.json

# Edit the configuration if needed
npm run start:node
```

#### Using the CLI

```bash
# Start the command-line interface
npm run cli

# After building
./dist/cli/th3coin.js --help
```

### Configuration

Create a `th3coin.config.json` file to customize your node.

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

For advanced configuration and optimization, see the documentation in the `docs/` directory.

## 🛠️ Development

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

# Run performance benchmarks
npm run test:performance

# Clean build files
npm run clean
```

## 🧪 Testing

The project uses **Vitest** for unit, integration, and system testing.

Reusable test fixtures and scenarios are available in the `test-data/` directory:

* `test-fixtures.ts`
* `test-scenarios.ts`
* `test-config.json`

## ⚙️ How It Works

### Transaction Flow

1. Create a transaction.
2. Sign it using the sender's private key.
3. Broadcast it to the network.
4. Validate and store it in the mempool.
5. Mine it into a block.
6. Broadcast the newly mined block.
7. Validate and append the block to the blockchain.
8. Transactions gain confirmations as additional blocks are mined.

### Security Features

* SHA-256 hashing
* ECDSA digital signatures
* Proof-of-Work consensus
* Immutable blockchain
* Decentralized peer-to-peer architecture

## 🏗️ Architecture

Th3-Coin follows a modular architecture with clear separation of responsibilities:

* **Interfaces** – Shared contracts and types
* **Core** – Blockchain, blocks, transactions, and mining
* **Wallet** – Key management and transaction creation
* **Network** – P2P communication and synchronization
* **Storage** – Persistent blockchain and wallet data

## 📌 Future Enhancements

Planned improvements include:

* Smart Contracts
* Proof-of-Stake consensus
* Light (SPV) clients
* Privacy enhancements
* Cross-chain interoperability
* Mobile wallet
* Hardware wallet integration

## 📄 License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.

---

<div align="center">

**By Th3-C0der**

</div>
