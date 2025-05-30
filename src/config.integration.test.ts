import { config as loadEnv } from 'dotenv';
import { describe, it, expect } from 'vitest';

import { ConfigLoader } from './config/ConfigLoader.js';

// Load environment variables from .env file
loadEnv();

describe('Config Integration Tests', () => {
  it('should load API key from environment', async () => {
    // Since dotenv is already loaded, we test that it reads from env
    const originalKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key-from-env';

    const loader = new ConfigLoader();
    const config = await loader.load();
    expect(config.openRouterApiKey).toBe('test-key-from-env');

    // Restore original key
    if (originalKey) {
      process.env.OPENROUTER_API_KEY = originalKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it('should handle environment variable override', async () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'env-override-key';

    const loader = new ConfigLoader();
    const config = await loader.load();

    // process.env takes precedence
    expect(config.openRouterApiKey).toBe('env-override-key');

    // Restore original key
    if (originalKey) {
      process.env.OPENROUTER_API_KEY = originalKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it('should load default configuration', async () => {
    const loader = new ConfigLoader();
    const config = await loader.load();

    // Should load the default config from coe.config.json
    expect(config.coeConfig.models).toBeDefined();
    expect(Array.isArray(config.coeConfig.models)).toBe(true);
    expect(config.coeConfig.rounds).toBe(1);
  });
});