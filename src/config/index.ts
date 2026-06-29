import * as fs from 'fs';
import * as path from 'path';

export interface Th3CoinConfig {
  network: {
    port: number;
    maxPeers: number;
    seedNodes: string[];
    connectionTimeout: number;
  };
  mining: {
    enabled: boolean;
    difficulty: number;
    blockReward: number;
    targetBlockTime: number;
  };
  storage: {
    dataDirectory: string;
    walletDirectory: string;
    blockchainFile: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
}

export const DEFAULT_CONFIG: Th3CoinConfig = {
  network: {
    port: 8333,
    maxPeers: 10,
    seedNodes: [],
    connectionTimeout: 30000,
  },
  mining: {
    enabled: false,
    difficulty: 4,
    blockReward: 5000000000, // 50 Th3Coins in satoshis
    targetBlockTime: 600000, // 10 minutes in milliseconds
  },
  storage: {
    dataDirectory: './data',
    walletDirectory: './data/wallets',
    blockchainFile: './data/blockchain.json',
  },
  logging: {
    level: 'info',
  },
};

export class ConfigManager {
  private config: Th3CoinConfig;
  private configPath: string;

  constructor(configPath: string = './th3coin.config.json') {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file or use defaults
   */
  private loadConfig(): Th3CoinConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = JSON.parse(configData);
        return this.mergeConfig(DEFAULT_CONFIG, userConfig);
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}, using defaults:`, error);
    }
    
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Deep merge user config with default config
   */
  private mergeConfig(defaultConfig: Th3CoinConfig, userConfig: any): Th3CoinConfig {
    const merged = { ...defaultConfig };
    
    for (const key in userConfig) {
      if (key in merged) {
        if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
          (merged as any)[key] = { ...(merged as any)[key], ...userConfig[key] };
        } else {
          (merged as any)[key] = userConfig[key];
        }
      }
    }
    
    return merged;
  }

  /**
   * Get current configuration
   */
  getConfig(): Th3CoinConfig {
    return { ...this.config };
  }

  /**
   * Update configuration and save to file
   */
  updateConfig(updates: Partial<Th3CoinConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    this.saveConfig();
  }

  /**
   * Save current configuration to file
   */
  saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error(`Failed to save config to ${this.configPath}:`, error);
    }
  }

  /**
   * Create default configuration file
   */
  createDefaultConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
  }

  /**
   * Validate configuration values
   */
  validateConfig(): string[] {
    const errors: string[] = [];
    
    if (this.config.network.port < 1 || this.config.network.port > 65535) {
      errors.push('Network port must be between 1 and 65535');
    }
    
    if (this.config.network.maxPeers < 1) {
      errors.push('Max peers must be at least 1');
    }
    
    if (this.config.mining.difficulty < 1) {
      errors.push('Mining difficulty must be at least 1');
    }
    
    if (this.config.mining.blockReward < 0) {
      errors.push('Block reward cannot be negative');
    }
    
    if (this.config.mining.targetBlockTime < 1000) {
      errors.push('Target block time must be at least 1 second');
    }
    
    return errors;
  }
}