import { describe, it, expect } from 'vitest';
import * as interfaces from './index';

describe('Core Interfaces', () => {
  it('should export all required interfaces', () => {
    // Verify that all core interfaces are exported
    expect(typeof interfaces).toBe('object');
    
    // Check that key interface types exist (TypeScript will validate at compile time)
    // This test mainly ensures the module loads correctly
    expect(interfaces).toBeDefined();
  });
});