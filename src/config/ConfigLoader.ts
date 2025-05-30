import 'reflect-metadata';
import { readFileSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { cosmiconfigSync, cosmiconfig } from 'cosmiconfig';
import { config as loadEnv } from 'dotenv';
import { injectable } from 'tsyringe';

import { ConfigSchema, Config } from '../config-schema.js';

// Load environment variables
loadEnv();

@injectable()
export class ConfigLoader {
  private readonly moduleName = 'coe';
  private config: Config | null = null;

  async load(configPath?: string): Promise<Config> {
    // If a specific path is provided, don't use cache
    if (configPath) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const parsed = JSON.parse(content) as unknown;
        return this.parseConfig(parsed);
      } catch (error) {
        throw new Error(
          `Failed to load config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (this.config) {
      return this.config;
    }

    // Use cosmiconfig to find and load configuration
    const explorer = cosmiconfig(this.moduleName, {
      searchPlaces: ['package.json', 'coe.config.js', 'coe.config.cjs', 'coe.config.json'],
      packageProp: 'coe',
    });

    const result = await explorer.search();

    if (
      !result ||
      !result.config ||
      Object.keys(result.config as Record<string, unknown>).length === 0
    ) {
      // If no config found, check for legacy coe.config.json
      const legacyPath = path.join(process.cwd(), 'coe.config.json');
      try {
        const content = await fs.readFile(legacyPath, 'utf-8');
        const parsed = JSON.parse(content) as unknown;
        return this.parseConfig(parsed);
      } catch {
        throw new Error(
          'No configuration file found. Please run "coe init" to set up your configuration.'
        );
      }
    }

    this.config = this.parseConfig(result.config);
    return this.config;
  }

  loadSync(): Config {
    if (this.config) {
      return this.config;
    }

    const explorer = cosmiconfigSync(this.moduleName, {
      searchPlaces: ['package.json', 'coe.config.js', 'coe.config.cjs', 'coe.config.json'],
      packageProp: 'coe',
    });

    const result = explorer.search();

    if (!result) {
      // If no config found, check for legacy coe.config.json
      const legacyPath = path.join(process.cwd(), 'coe.config.json');
      try {
        const content = readFileSync(legacyPath, 'utf-8');
        const parsed = JSON.parse(content) as unknown;
        return this.parseConfig(parsed);
      } catch {
        throw new Error(
          'No configuration file found. Please run "coe init" to set up your configuration.'
        );
      }
    }

    this.config = this.parseConfig(result.config);
    return this.config;
  }

  private parseConfig(rawConfig: unknown): Config {
    const config = rawConfig as Record<string, unknown>;

    // Handle null/undefined config
    if (!config) {
      throw new Error('Invalid configuration: config is null or undefined');
    }

    // Check if this is already in the full config format (has coeConfig property)
    if (config.coeConfig) {
      // Full config format
      const configWithEnv = {
        ...config,
        openRouterApiKey: config.openRouterApiKey || process.env.OPENROUTER_API_KEY || '',
      };
      return ConfigSchema.parse(configWithEnv);
    } else {
      // Legacy format - just the coeConfig contents
      const configWithEnv = {
        openRouterApiKey: config.openRouterApiKey || process.env.OPENROUTER_API_KEY || '',
        coeConfig: config,
      };
      return ConfigSchema.parse(configWithEnv);
    }
  }
}
