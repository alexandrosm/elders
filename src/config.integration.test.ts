import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { loadConfig } from './config.js';

describe('Config Integration Tests', () => {
  const testConfigPath = path.join(process.cwd(), 'coe.config.json');
  const testEnvPath = path.join(process.cwd(), '.env');
  let originalEnv: string | undefined;
  let originalConfig: string | undefined;
  const hasApiKey = !!process.env.OPENROUTER_API_KEY;

  beforeEach(async () => {
    // Backup existing files
    try {
      originalEnv = await fs.readFile(testEnvPath, 'utf-8');
    } catch (e) {
      // File doesn't exist
    }

    try {
      originalConfig = await fs.readFile(testConfigPath, 'utf-8');
    } catch (e) {
      // File doesn't exist
    }
  });

  afterEach(async () => {
    // Restore original files
    if (originalEnv) {
      await fs.writeFile(testEnvPath, originalEnv);
    } else {
      try {
        await fs.unlink(testEnvPath);
      } catch (e) {
        // File doesn't exist
      }
    }

    if (originalConfig) {
      await fs.writeFile(testConfigPath, originalConfig);
    } else {
      try {
        await fs.unlink(testConfigPath);
      } catch (e) {
        // File doesn't exist
      }
    }
  });

  it.skipIf(!hasApiKey)('should load default configuration when files are missing', async () => {
    // Remove config files
    try {
      await fs.unlink(testConfigPath);
      await fs.unlink(testEnvPath);
    } catch (e) {
      // Files don't exist
    }

    const config = await loadConfig();

    expect(config.openRouterApiKey).toBe('');
    expect(config.coeConfig.models).toEqual([
      'x-ai/grok-2-1212',
      'perplexity/llama-3.1-sonar-large-128k-online',
      'openai/gpt-4o',
      'anthropic/claude-3-5-sonnet',
      'deepseek/deepseek-r1',
      'google/gemini-2.0-flash-exp:free',
    ]);
    expect(config.coeConfig.system).toBe(
      'You are a respected member of the Council of Elders. Provide clear, expert guidance.'
    );
    expect(config.coeConfig.output?.format).toBe('text');
    expect(config.coeConfig.output?.showMeta).toBe(false);
    expect(config.coeConfig.rounds).toBe(1);
  });

  it('should load API key from environment', async () => {
    // Since dotenv is already loaded, we test that it reads from env
    process.env.OPENROUTER_API_KEY = 'test-key-from-env';

    const config = await loadConfig();
    expect(config.openRouterApiKey).toBe('test-key-from-env');

    delete process.env.OPENROUTER_API_KEY;
  });

  it.skipIf(!hasApiKey)('should load custom coe.config.json', async () => {
    const customConfig = {
      models: ['model1', 'model2'],
      system: 'Custom system prompt',
      output: {
        format: 'json' as const,
        showMeta: true,
      },
      rounds: 3,
    };

    await fs.writeFile(testConfigPath, JSON.stringify(customConfig, null, 2));

    const config = await loadConfig();

    expect(config.coeConfig.models).toEqual(['model1', 'model2']);
    expect(config.coeConfig.system).toBe('Custom system prompt');
    expect(config.coeConfig.output?.format).toBe('json');
    expect(config.coeConfig.output?.showMeta).toBe(true);
    expect(config.coeConfig.rounds).toBe(3);
  });

  it.skipIf(!hasApiKey)('should handle partial config gracefully', async () => {
    const partialConfig = {
      models: ['custom-model'],
      // Missing other fields
    };

    await fs.writeFile(testConfigPath, JSON.stringify(partialConfig, null, 2));

    const config = await loadConfig();

    expect(config.coeConfig.models).toEqual(['custom-model']);
    expect(config.coeConfig.system).toBe(
      'You are a respected member of the Council of Elders. Provide clear, expert guidance.'
    );
    expect(config.coeConfig.output?.format).toBe('text');
    expect(config.coeConfig.rounds).toBe(1);
  });

  it.skipIf(!hasApiKey)('should handle invalid JSON gracefully', async () => {
    await fs.writeFile(testConfigPath, 'invalid json {{{');

    const config = await loadConfig();

    // Should fall back to defaults
    expect(config.coeConfig.models.length).toBe(6);
    expect(config.coeConfig.system).toBe(
      'You are a respected member of the Council of Elders. Provide clear, expert guidance.'
    );
  });

  it.skipIf(!hasApiKey)('should support per-model system prompts', async () => {
    const configWithModelOverrides = {
      models: [
        'gpt-4',
        {
          model: 'claude-3',
          system: 'You are Claude with a custom prompt',
        },
      ],
      system: 'Default system prompt',
    };

    await fs.writeFile(testConfigPath, JSON.stringify(configWithModelOverrides, null, 2));

    const config = await loadConfig();

    expect(config.coeConfig.models).toHaveLength(2);
    expect(config.coeConfig.models[0]).toBe('gpt-4');
    expect(config.coeConfig.models[1]).toEqual({
      model: 'claude-3',
      system: 'You are Claude with a custom prompt',
    });
  });

  it('should handle environment variable override', async () => {
    process.env.OPENROUTER_API_KEY = 'env-override-key';

    await fs.writeFile(testEnvPath, 'OPENROUTER_API_KEY=file-key\n');

    const config = await loadConfig();

    // process.env takes precedence when already loaded
    expect(config.openRouterApiKey).toBe('env-override-key');

    delete process.env.OPENROUTER_API_KEY;
  });
});
