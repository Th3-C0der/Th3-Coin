# Test Data Directory

This directory contains test fixtures, utilities, and configuration files for testing the Th3-Coin cryptocurrency implementation.

## Files

- **test-fixtures.ts**: Reusable test utilities and helper functions for common test scenarios
- **test-scenarios.ts**: Pre-defined test scenarios for integration and system testing
- **test-config.json**: Base configuration file for testing (can be overridden in tests)

## Usage

### Test Fixtures

The `test-fixtures.ts` file provides utilities for:

- `generateTestWallets(count)`: Generate test key pairs and addresses
- `createTestBlockchain(minerAddress)`: Create a blockchain with genesis block
- `createTestBlock(blockchain, minerAddress, transactions)`: Create valid test blocks
- `createTestTransaction(from, to, amount, privateKey, utxo)`: Create test transactions
- `createTestConfig(overrides)`: Create test configuration with custom overrides
- `generateTestUTXOs(address, count)`: Generate test UTXO sets
- `createTestPeers(count)`: Create test peer lists
- `delay(ms)`: Async delay helper
- `generateRandomHash()`: Generate random hash strings

### Test Scenarios

The `test-scenarios.ts` file provides pre-defined scenarios:

- `scenarioSimpleBlockchain()`: Basic blockchain with multiple blocks
- `scenarioBlockchainWithTransactions()`: Blockchain with transactions
- `scenarioChainReorganization()`: Chain reorganization testing
- `scenarioDifficultyAdjustment()`: Difficulty adjustment testing
- `scenarioMultipleTransactions()`: Multiple transactions in single block
- `scenarioEmptyBlockchain()`: Empty blockchain scenario
- `scenarioInvalidBlock()`: Invalid block detection
- `scenarioBalanceTracking()`: Balance tracking over time

### Example Usage

```typescript
import { generateTestWallets, createTestBlockchain } from './test-data/test-fixtures';

// Generate test wallets
const wallets = generateTestWallets(3);

// Create test blockchain
const blockchain = createTestBlockchain(wallets[0].address);

// Use in tests
expect(blockchain.getBlockHeight()).toBe(1);
```

## Integration with Existing Tests

```typescript
import { scenarioSimpleBlockchain } from './test-data/test-scenarios';

describe('My Feature', () => {
  it('should work with simple blockchain', async () => {
    const { blockchain, wallets } = await scenarioSimpleBlockchain();
    // Test your feature with the pre-configured scenario
  });
});
```

## Notes

- All test data uses generated keys and should not be used for production
- The fixtures align with the existing test patterns in the project
- Configuration uses low difficulty and disabled mining by default for fast testing
- Temporary test data is created in subdirectories to avoid conflicts
