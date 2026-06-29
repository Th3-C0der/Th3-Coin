#!/usr/bin/env node

import { Th3CoinCLI } from './index';

// Create and run CLI
const cli = new Th3CoinCLI();
cli.run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});