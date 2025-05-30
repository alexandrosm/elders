import 'reflect-metadata';
import * as fs from 'fs/promises';
import { homedir } from 'os';
import * as path from 'path';

import { cosmiconfigSync, cosmiconfig } from 'cosmiconfig';
import dotenv from 'dotenv';
import { injectable } from 'tsyringe';

import { ConfigSchema, CoeConfig, Config } from '../config-schema.js';

// Load environment variables
dotenv.config();

@injectable()
export class ConfigLoader {
  private readonly moduleName = 'coe';
  private config: Config | null = null;

  async load(): Promise<Config> {
    if (this.config) {
      return this.config;
    }

    // Use cosmiconfig to find and load configuration
    const explorer = cosmiconfig(this.moduleName, {
      searchPlaces: [
        'package.json',
        '.coerc',
        '.coerc.json',
        '.coerc.yaml',
        '.coerc.yml',
        '.coerc.js',
        '.coerc.cjs',
        '.config/coerc',
        '.config/coerc.json',
        '.config/coerc.yaml',
        '.config/coerc.yml',
        '.config/coerc.js',
        '.config/coerc.cjs',
        'coe.config.js',
        'coe.config.cjs',
        'coe.config.json',
      ],
      packageProp: 'coe',
    });

    const result = await explorer.search();

    if (!result) {
      // If no config found, check for legacy coe.config.json
      const legacyPath = path.join(process.cwd(), 'coe.config.json');
      try {
        const content = await fs.readFile(legacyPath, 'utf-8');
        const parsed = JSON.parse(content);
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
      searchPlaces: [
        'package.json',
        '.coerc',
        '.coerc.json',
        '.coerc.yaml',
        '.coerc.yml',
        '.coerc.js',
        '.coerc.cjs',
        '.config/coerc',
        '.config/coerc.json',
        '.config/coerc.yaml',
        '.config/coerc.yml',
        '.config/coerc.js',
        '.config/coerc.cjs',
        'coe.config.js',
        'coe.config.cjs',
        'coe.config.json',
      ],
      packageProp: 'coe',
    });

    const result = explorer.search();

    if (!result) {
      // If no config found, check for legacy coe.config.json
      const legacyPath = path.join(process.cwd(), 'coe.config.json');
      try {
        const content = require('fs').readFileSync(legacyPath, 'utf-8');
        const parsed = JSON.parse(content);
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
    // Add API key from environment if not in config
    const configWithEnv = {
      ...(rawConfig as Record<string, any>),
      openRouterApiKey:
        (rawConfig as any)?.openRouterApiKey || process.env.OPENROUTER_API_KEY || '',
    };

    // Parse and validate using Zod
    return ConfigSchema.parse(configWithEnv);
  }

  async getUserDefaults(): Promise<Record<string, any> | undefined> {
    try {
      // Try .coerc in current directory first
      const localRcPath = path.join(process.cwd(), '.coerc');
      try {
        const content = await fs.readFile(localRcPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        // Try home directory
        const homeRcPath = path.join(homedir(), '.coerc');
        const content = await fs.readFile(homeRcPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      return undefined;
    }
  }

  clearCache(): void {
    this.config = null;
  }
}
