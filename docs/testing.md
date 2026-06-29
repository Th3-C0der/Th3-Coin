# Th3Coin Testing Guide

## Overview

Th3Coin includes a comprehensive testing suite with 40+ test files covering unit tests, integration tests, and system tests. The project uses Vitest as the testing framework and provides reusable test fixtures and scenarios in the `test-data` directory.

## Test Structure

### Test Organization

```
src/
├── __tests__/                    # System and integration tests
│   ├── system-integration.test.ts
│   ├── performance-benchmarks.test.ts
│   ├── network-integration.test.ts
│   └── transaction-flow-integration.test.ts
├── core/__tests__/               # Core blockchain tests
│   ├── blockchain.test.ts
│   ├── block.test.ts
│   ├── transaction.test.ts
│   ├── mining.test.ts
│   └── crypto.test.ts
├── wallet/__tests__/             # Wallet tests
│   ├── wallet.test.ts
│   ├── wallet-transactions.test.ts
│   └── wallet-persistence-integration.test.ts
├── network/__tests__/            # Network tests
│   ├── p2p-network.test.ts
│   ├── protocol.test.ts
│   └── sync-integration.test.ts
└── cli/__tests__/                # CLI tests
    ├── blockchain-commands.test.ts
    ├── wallet-commands.test.ts
    └── network-commands.test.ts
```

### Test Data Directory

The `test-data` directory provides reusable test utilities:

- **test-fixtures.ts**: Helper functions for common test operations
- **test-scenarios.ts**: Pre-defined test scenarios
- **test-config.json**: Base configuration for testing
- **README.md**: Documentation for test utilities

## Running Tests

### All Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### Specific Test Categories

```bash
# Run system integration tests
npm run test:system

# Run performance benchmarks
npm run test:performance
```

### Individual Test Files

```bash
# Run specific test file
npx vitest src/core/__tests__/blockchain.test.ts

# Run tests matching a pattern
npx vitest --run src/core/__tests__/block*.test.ts
```

## Test Fixtures

### Available Fixtures

The `test-data/test-fixtures.ts` file provides these utilities:

```typescript
import { 
  generateTestWallets, 
  createTestBlockchain, 
  createTestBlock,
  createTestTransaction,
  createTestConfig,
  generateTestUTXOs,
  createTestPeers,
  delay,
  generateRandomHash
} from '../test-data/test-fixtures';
```

#### generateTestWallets(count)

Generate test key pairs and addresses:

```typescript
const wallets = generateTestWallets(3);
// Returns array of { keyPair, address, privateKey, publicKey }
```

#### createTestBlockchain(minerAddress)

Create a blockchain with genesis block:

```typescript
const blockchain = createTestBlockchain(wallets[0].address);
// Returns initialized BlockchainImpl with genesis block
```

#### createTestBlock(blockchain, minerAddress, transactions)

Create a valid test block:

```typescript
const block = await createTestBlock(blockchain, minerAddress, [tx]);
// Returns mined BlockImpl with valid proof-of-work
```

#### createTestTransaction(from, to, amount, privateKey, utxo)

Create a test transaction:

```typescript
const tx = createTestTransaction(
  fromAddress, 
  toAddress, 
  1000000000, 
  privateKey,
  { txId: 'abc', outputIndex: 0 }
);
```

#### createTestConfig(overrides)

Create test configuration with custom overrides:

```typescript
const config = createTestConfig({
  mining: { enabled: true, difficulty: 2 }
});
```

## Test Scenarios

### Available Scenarios

The `test-data/test-scenarios.ts` file provides pre-defined scenarios:

```typescript
import {
  scenarioSimpleBlockchain,
  scenarioBlockchainWithTransactions,
  scenarioChainReorganization,
  scenarioDifficultyAdjustment,
  scenarioMultipleTransactions,
  scenarioEmptyBlockchain,
  scenarioInvalidBlock,
  scenarioBalanceTracking
} from '../test-data/test-scenarios';
```

### Scenario Examples

#### Simple Blockchain

```typescript
describe('My Feature', () => {
  it('should work with simple blockchain', async () => {
    const { blockchain, wallets, blockCount } = await scenarioSimpleBlockchain();
    expect(blockchain.getBlockHeight()).toBe(blockCount + 1); // +1 for genesis
  });
});
```

#### Blockchain with Transactions

```typescript
it('should handle transactions', async () => {
  const { blockchain, wallets, transactionCount } = await scenarioBlockchainWithTransactions();
  expect(transactionCount).toBeGreaterThan(0);
});
```

#### Chain Reorganization

```typescript
it('should handle chain reorganization', async () => {
  const { originalChain, competingChain, originalHeight, competingHeight } = 
    await scenarioChainReorganization();
  
  expect(competingHeight).toBeGreaterThan(originalHeight);
});
```

#### Difficulty Adjustment

```typescript
it('should adjust difficulty', async () => {
  const { blockchain, initialDifficulty, finalDifficulty } = 
    await scenarioDifficultyAdjustment();
  
  expect(finalDifficulty).toBeGreaterThan(initialDifficulty);
});
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BlockchainImpl } from '../blockchain';
import { generateTestWallets } from '../../test-data/test-fixtures';

describe('My Feature', () => {
  let blockchain;
  let wallets;

  beforeEach(() => {
    wallets = generateTestWallets(2);
    blockchain = new BlockchainImpl(wallets[0].address);
  });

  it('should do something', () => {
    const result = blockchain.someMethod();
    expect(result).toBe(expected);
  });
});
```

### Async Tests

```typescript
it('should handle async operations', async () => {
  const block = await createTestBlock(blockchain, minerAddress);
  const result = await blockchain.addBlock(block);
  expect(result).toBe(true);
});
```

### Integration Tests

```typescript
import { scenarioSimpleBlockchain } from '../../test-data/test-scenarios';

describe('Integration Test', () => {
  it('should integrate multiple components', async () => {
    const { blockchain, wallets } = await scenarioSimpleBlockchain();
    
    // Test integration between components
    const balance = blockchain.getBalance(wallets[0].address);
    expect(balance).toBeGreaterThan(0);
  });
});
```

## Test Coverage

### Coverage Reports

```bash
# Generate coverage report
npx vitest --coverage

# Coverage with HTML report
npx vitest --coverage --reporter=html
```

### Coverage Configuration

Coverage is configured in `vitest.config.ts`:

```typescript
coverage: {
  reporter: ['text', 'json', 'html'],
  exclude: [
    'node_modules/',
    'dist/',
    '**/*.d.ts',
    '**/*.config.ts',
    'test-data/'
  ]
}
```

## Performance Testing

### Running Benchmarks

```bash
npm run test:performance
```

### Performance Test Structure

Performance tests measure:

- Transaction validation speed
- Block validation performance
- UTXO cache hit rates
- Mining hash rates
- Memory usage

### Custom Performance Tests

```typescript
import { performanceMonitor } from '../performance-monitor';

it('should validate transactions quickly', async () => {
  const startTime = Date.now();
  
  for (let i = 0; i < 1000; i++) {
    await validateTransaction(testTransaction);
  }
  
  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(5000); // < 5 seconds for 1000 txs
});
```

## System Integration Tests

### Running System Tests

```bash
npm run test:system
```

### System Test Coverage

System integration tests cover:

- Node lifecycle (start/stop/restart)
- Configuration management
- Component integration
- Mining operations
- Network functionality
- Error handling
- Graceful shutdown

### Custom System Tests

```typescript
import { Th3CoinNode } from '../node/th3coin-node';
import { createTestConfig } from '../../test-data/test-fixtures';

describe('System Integration', () => {
  it('should start and stop node', async () => {
    const config = createTestConfig();
    const node = new Th3CoinNode(config);
    
    await node.initialize();
    await node.start();
    expect(node.isNodeRunning()).toBe(true);
    
    await node.stop();
    expect(node.isNodeRunning()).toBe(false);
  });
});
```

## Test Configuration

### Vitest Configuration

The `vitest.config.ts` file configures:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.ts']
    }
  }
});
```

### Test Configuration

Test configurations in `test-data/test-config.json`:

```json
{
  "network": {
    "port": 18333,
    "maxPeers": 5,
    "seedNodes": []
  },
  "mining": {
    "enabled": false,
    "difficulty": 1,
    "blockReward": 5000000000
  },
  "storage": {
    "dataDirectory": "./test-data/temp"
  },
  "logging": {
    "level": "error"
  }
}
```

## Best Practices

### 1. Use Test Fixtures

Always use provided fixtures instead of creating test data manually:

```typescript
// Good
const wallets = generateTestWallets(3);

// Avoid
const wallet = { 
  privateKey: '...', 
  publicKey: '...' 
};
```

### 2. Use Test Scenarios

For complex setups, use pre-defined scenarios:

```typescript
// Good
const { blockchain, wallets } = await scenarioBlockchainWithTransactions();

// Avoid manually setting up complex scenarios
```

### 3. Clean Up Resources

Always clean up in `afterEach`:

```typescript
afterEach(async () => {
  if (node && node.isNodeRunning()) {
    await node.stop();
  }
  // Clean up test data
});
```

### 4. Test Isolation

Ensure tests are independent:

```typescript
beforeEach(() => {
  // Fresh state for each test
  blockchain = createTestBlockchain();
});
```

### 5. Meaningful Assertions

Use specific, meaningful assertions:

```typescript
// Good
expect(blockchain.getBlockHeight()).toBe(5);
expect(balance).toBeGreaterThan(0);

// Avoid
expect(result).toBeTruthy();
```

## Troubleshooting

### Test Failures

1. **Check test data**: Ensure fixtures are up to date
2. **Verify configuration**: Test config should use low difficulty
3. **Clean state**: Clear temporary test data between runs
4. **Async issues**: Ensure proper async/await usage

### Performance Issues

1. **Disable mining**: Set `mining.enabled = false` in test config
2. **Reduce difficulty**: Use `difficulty = 1` for fast tests
3. **Limit iterations**: Reduce loop counts in performance tests
4. **Skip heavy tests**: Use `test.skip` for expensive tests

### Memory Issues

1. **Clean up resources**: Ensure proper cleanup in afterEach
2. **Limit cache sizes**: Use smaller caches in tests
3. **Monitor memory**: Check for memory leaks in long-running tests

## Continuous Integration

### CI Configuration

Example CI configuration:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:system
      - run: npm run test:performance
```

### Test Reports

Generate test reports for CI:

```bash
# JSON report for CI parsing
npx vitest --reporter=json --outputFile=test-results.json

# JUnit report for CI integration
npx vitest --reporter=junit --outputFile=test-results.xml
```

## Contributing Tests

When adding new features:

1. **Write unit tests** for individual components
2. **Write integration tests** for component interactions
3. **Add fixtures** if new test data is needed
4. **Add scenarios** for complex test setups
5. **Update documentation** for new test utilities
6. **Ensure coverage** remains above 80%

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Test Data README](../test-data/README.md)
- [System Startup Guide](./system-startup.md)
- [Performance Optimizations](./performance-optimizations.md)
