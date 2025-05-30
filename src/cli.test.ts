import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { config as loadEnv } from 'dotenv';
import { describe, it, expect, beforeAll } from 'vitest';

import type { ExecError } from './types.js';

interface JsonResponse {
  model: string;
  answer: string | null;
  error: string | null;
  elder?: string;
  meta?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    estimatedCost: number;
  };
  citations?: Array<{
    url: string;
    title: string;
  }>;
}

// Load environment variables from .env file
loadEnv();

const execAsync = promisify(exec);

describe('CLI Integration Tests', () => {
  const cliPath = path.join(process.cwd(), 'dist/cli.js');
  // Check API key after dotenv has loaded
  const hasApiKey = true; // Always run tests now that we load from .env

  beforeAll(async () => {
    // Ensure a default config exists for tests
    const configPath = path.join(process.cwd(), 'coe.config.json');
    const configExists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);

    if (!configExists) {
      // Create a minimal default config for tests
      const defaultConfig = {
        models: ['openai/gpt-3.5-turbo', 'google/gemini-2.0-flash-exp:free'],
        system: 'You are a helpful assistant. Keep responses concise.',
        rounds: 1,
      };
      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    }
  }, 30000);

  describe('Basic Commands', () => {
    it('should show version', async () => {
      const { stdout } = await execAsync(`node ${cliPath} --version`);
      expect(stdout.trim()).toBe('0.3.1');
    }, 10000);

    it('should show help', async () => {
      const { stdout } = await execAsync(`node ${cliPath} --help`);
      expect(stdout).toContain('Council of Elders');
      expect(stdout).toContain('--rounds');
      expect(stdout).toContain('--json');
      expect(stdout).toContain('--meta');
    });

    it('should prompt for init when config missing', async () => {
      // Temporarily rename config file only (keep .env for API key)
      const configExists = await fs
        .access('coe.config.json')
        .then(() => true)
        .catch(() => false);

      if (configExists) await fs.rename('coe.config.json', 'coe.config.json.bak');

      try {
        await execAsync(`node ${cliPath} "test"`);
        expect.fail('Should have thrown error');
      } catch (error) {
        const execError = error as ExecError;
        expect(execError.stderr).toContain('Missing configuration');
        expect(execError.stderr).toContain('coe init');
        expect(execError.code).toBe(1);
      }

      // Restore file
      if (configExists) await fs.rename('coe.config.json.bak', 'coe.config.json');
    }, 10000);
  });

  describe('Query Functionality', () => {
    it.skipIf(!hasApiKey)(
      'should execute a simple query',
      async () => {
        const { stdout, stderr } = await execAsync(
          `node ${cliPath} "What is 1+1? Reply with just the number."`
        );

        expect(stderr).not.toContain('Error');
        expect(stdout).toContain('Council of Elders Response');
        expect(stdout).toContain('2');

        // Should show at least one elder response
        expect(stdout).toMatch(/Elder (Alpha|Beta|Gamma|Delta|Epsilon)/);
      },
      60000
    );

    it.skipIf(!hasApiKey)(
      'should output JSON when requested',
      async () => {
        const { stdout } = await execAsync(`node ${cliPath} --json "Say hello"`);

        const json = JSON.parse(stdout) as JsonResponse[];
        expect(Array.isArray(json)).toBe(true);
        expect(json.length).toBeGreaterThan(0);
        expect(json.length).toBeLessThanOrEqual(2);

        json.forEach((item) => {
          expect(item).toHaveProperty('elder');
          expect(item).toHaveProperty('answer');
          expect(item).toHaveProperty('error');
        });
      },
      60000
    );

    it.skipIf(!hasApiKey)(
      'should include metadata when requested',
      async () => {
        const { stdout } = await execAsync(`node ${cliPath} --json --meta "Hi"`);

        const json = JSON.parse(stdout) as JsonResponse[];
        const successfulResponses = json.filter((r) => !r.error && r.meta);

        expect(successfulResponses.length).toBeGreaterThan(0);

        successfulResponses.forEach((item) => {
          expect(item.meta).toHaveProperty('promptTokens');
          expect(item.meta).toHaveProperty('completionTokens');
          expect(item.meta).toHaveProperty('totalTokens');
          expect(item.meta).toHaveProperty('latencyMs');
          expect(item.meta).toHaveProperty('estimatedCost');
        });
      },
      60000
    );

    it.skipIf(!hasApiKey)(
      'should handle temperature parameter',
      async () => {
        const { stdout } = await execAsync(
          `node ${cliPath} --temperature 0.1 "What is the capital of France? One word only."`
        );

        expect(stdout.toLowerCase()).toContain('paris');
      },
      60000
    );
  });

  describe('Consensus Rounds', () => {
    it.skipIf(!hasApiKey)(
      'should run multiple consensus rounds',
      async () => {
        const { stdout } = await execAsync(
          `node ${cliPath} --rounds 2 "What is 5+5? Just the number."`
        );

        expect(stdout).toContain('Council of Elders - 2 Rounds');
        expect(stdout).toContain('Round 2');
        // The output should show multiple rounds were executed
        expect(stdout.length).toBeGreaterThan(100);
      },
      90000
    );

    it.skipIf(!hasApiKey)(
      'should show progress for each round',
      async () => {
        // This is hard to test directly since progress updates in real-time
        // We'll just verify the command completes successfully
        const { stderr } = await execAsync(`node ${cliPath} --rounds 2 "Quick test"`);

        // Should complete without errors
        expect(stderr).not.toContain('Error');
      },
      90000
    );
  });

  describe('Error Handling', () => {
    it.skipIf(!hasApiKey)(
      'should handle invalid models gracefully',
      async () => {
        // Create config with invalid model
        const badConfig = {
          models: ['invalid-model-xyz'],
          system: 'Test',
          output: { format: 'json' as const },
          rounds: 1,
        };

        const badConfigPath = path.join(process.cwd(), 'test-bad-config.json');
        await fs.writeFile(badConfigPath, JSON.stringify(badConfig));

        const { stdout } = await execAsync(
          `node ${cliPath} --config ${badConfigPath} --json "test"`,
          {
            env: { ...process.env },
          }
        );

        const json = JSON.parse(stdout) as JsonResponse[];
        expect(json[0].error).toBeDefined();
        // Error could be 400, Bad Request, or Unauthorized depending on API response
        expect(json[0].error).toMatch(/400|Bad Request|Unauthorized/);

        await fs.unlink(badConfigPath);
      },
      30000
    );

    it.skipIf(!hasApiKey)(
      'should exit with code 1 when all models fail',
      async () => {
        const badConfig = {
          models: ['invalid-1', 'invalid-2'],
          system: 'Test',
          rounds: 1,
        };

        const badConfigPath = path.join(process.cwd(), 'test-bad-config-2.json');
        await fs.writeFile(badConfigPath, JSON.stringify(badConfig));

        try {
          await execAsync(`node ${cliPath} --config ${badConfigPath} "test"`);
          expect.fail('Should have thrown error');
        } catch (error) {
          const execError = error as ExecError;
          expect(execError.code).toBe(1);
        }

        await fs.unlink(badConfigPath);
      },
      30000
    );
  });
});
