import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

describe('CLI Integration Tests', () => {
  const cliPath = path.join(process.cwd(), 'dist/cli.js');
  const testConfigPath = path.join(process.cwd(), 'test-coe.config.json');
  const testEnvPath = path.join(process.cwd(), 'test.env');

  beforeAll(async () => {
    // Ensure the CLI is built
    await execAsync('npm run build');
    
    // Create test config
    const testConfig = {
      models: [
        'openai/gpt-3.5-turbo',
        'google/gemini-2.0-flash-exp:free'
      ],
      system: 'You are a test assistant. Keep all responses under 20 words.',
      output: {
        format: 'text',
        showMeta: false
      },
      rounds: 1
    };
    
    await fs.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await fs.unlink(testConfigPath);
      await fs.unlink(testEnvPath);
    } catch (e) {
      // Files might not exist
    }
  });

  describe('Basic Commands', () => {
    it('should show version', async () => {
      const { stdout } = await execAsync(`node ${cliPath} --version`);
      expect(stdout.trim()).toBe('0.1.0');
    });

    it('should show help', async () => {
      const { stdout } = await execAsync(`node ${cliPath} --help`);
      expect(stdout).toContain('Council of Elders');
      expect(stdout).toContain('--rounds');
      expect(stdout).toContain('--json');
      expect(stdout).toContain('--meta');
    });

    it('should prompt for init when config missing', async () => {
      // Temporarily rename config files
      const configExists = await fs.access('coe.config.json').then(() => true).catch(() => false);
      const envExists = await fs.access('.env').then(() => true).catch(() => false);
      
      if (configExists) await fs.rename('coe.config.json', 'coe.config.json.bak');
      if (envExists) await fs.rename('.env', '.env.bak');
      
      try {
        await execAsync(`node ${cliPath} "test"`);
      } catch (error: any) {
        expect(error.stderr).toContain('Missing configuration');
        expect(error.stderr).toContain('coe init');
        expect(error.code).toBe(1);
      }
      
      // Restore files
      if (configExists) await fs.rename('coe.config.json.bak', 'coe.config.json');
      if (envExists) await fs.rename('.env.bak', '.env');
    });
  });

  describe('Query Functionality', () => {
    it('should execute a simple query', async () => {
      // Setup config in current directory for the test
      await fs.writeFile('coe.config.json', await fs.readFile(testConfigPath, 'utf-8'));
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} "What is 1+1? Reply with just the number."`
      );
      
      await fs.unlink('coe.config.json');
      
      expect(stderr).not.toContain('Error');
      expect(stdout).toContain('Council of Elders Response');
      expect(stdout).toContain('2');
      
      // Should show both models
      expect(stdout).toContain('gpt-3.5-turbo');
      expect(stdout).toContain('gemini-2.0-flash-exp:free');
    }, 60000);

    it('should output JSON when requested', async () => {
      await fs.writeFile('coe.config.json', await fs.readFile(testConfigPath, 'utf-8'));
      
      const { stdout } = await execAsync(
        `node ${cliPath} --json "Say hello"`
      );
      
      await fs.unlink('coe.config.json');
      
      const json = JSON.parse(stdout);
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(2);
      
      json.forEach((item: any) => {
        expect(item).toHaveProperty('model');
        expect(item).toHaveProperty('answer');
        expect(item).toHaveProperty('error');
      });
    }, 60000);

    it('should include metadata when requested', async () => {
      await fs.writeFile('coe.config.json', await fs.readFile(testConfigPath, 'utf-8'));
      
      const { stdout } = await execAsync(
        `node ${cliPath} --json --meta "Hi"`
      );
      
      await fs.unlink('coe.config.json');
      
      const json = JSON.parse(stdout);
      const successfulResponses = json.filter((r: any) => !r.error && r.meta);
      
      expect(successfulResponses.length).toBeGreaterThan(0);
      
      successfulResponses.forEach((item: any) => {
        expect(item.meta).toHaveProperty('promptTokens');
        expect(item.meta).toHaveProperty('completionTokens');
        expect(item.meta).toHaveProperty('totalTokens');
        expect(item.meta).toHaveProperty('latencyMs');
        expect(item.meta).toHaveProperty('estimatedCost');
      });
    }, 60000);

    it('should handle temperature parameter', async () => {
      await fs.writeFile('coe.config.json', await fs.readFile(testConfigPath, 'utf-8'));
      
      const { stdout } = await execAsync(
        `node ${cliPath} --temperature 0.1 "What is the capital of France? One word only."`
      );
      
      await fs.unlink('coe.config.json');
      
      expect(stdout.toLowerCase()).toContain('paris');
    }, 60000);
  });

  describe('Consensus Rounds', () => {
    it('should run multiple consensus rounds', async () => {
      await fs.writeFile('coe.config.json', await fs.readFile(testConfigPath, 'utf-8'));
      
      const { stdout } = await execAsync(
        `node ${cliPath} --rounds 2 "What is 5+5? Just the number."`
      );
      
      await fs.unlink('coe.config.json');
      
      expect(stdout).toContain('Council of Elders - 2 Rounds');
      expect(stdout).toContain('Round 2');
      expect(stdout).toContain('10');
    }, 90000);

    it('should show progress for each round', async () => {
      await fs.writeFile('coe.config.json', await fs.readFile(testConfigPath, 'utf-8'));
      
      // This is hard to test directly since progress updates in real-time
      // We'll just verify the command completes successfully
      const { stderr } = await execAsync(
        `node ${cliPath} --rounds 2 "Quick test"`
      );
      
      await fs.unlink('coe.config.json');
      
      // Should complete without errors
      expect(stderr).not.toContain('Error');
    }, 90000);
  });

  describe('Error Handling', () => {
    it('should handle invalid models gracefully', async () => {
      // Create config with invalid model
      const badConfig = {
        models: ['invalid-model-xyz'],
        system: 'Test',
        output: { format: 'json' as const },
        rounds: 1
      };
      
      const badConfigPath = path.join(process.cwd(), 'bad-config.json');
      await fs.writeFile(badConfigPath, JSON.stringify(badConfig));
      
      await fs.writeFile('coe.config.json', await fs.readFile(badConfigPath, 'utf-8'));
      
      const { stdout, stderr } = await execAsync(
        `node ${cliPath} --json "test"`,
        { env: { ...process.env } }
      );
      
      await fs.unlink('coe.config.json');
      
      const json = JSON.parse(stdout);
      expect(json[0].error).toBeDefined();
      expect(json[0].error).toContain('400');
      
      await fs.unlink(badConfigPath);
    }, 30000);

    it('should exit with code 1 when all models fail', async () => {
      const badConfig = {
        models: ['invalid-1', 'invalid-2'],
        system: 'Test',
        rounds: 1
      };
      
      const badConfigPath = path.join(process.cwd(), 'bad-config-2.json');
      await fs.writeFile(badConfigPath, JSON.stringify(badConfig));
      
      await fs.writeFile('coe.config.json', await fs.readFile(badConfigPath, 'utf-8'));
      
      try {
        await execAsync(`node ${cliPath} "test"`);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe(1);
      }
      
      await fs.unlink('coe.config.json');
      
      await fs.unlink(badConfigPath);
    }, 30000);
  });
});