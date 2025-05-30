import fs from 'fs/promises';
import path from 'path';

import * as dotenv from 'dotenv';
import { z } from 'zod';

import {
  ModelConfig,
  CouncilConfig,
  CoeConfig,
  Config,
  CoeConfigSchema,
  ConfigSchema,
} from './config-schema.js';

dotenv.config();

// Re-export types from schema
export type { ModelConfig, CouncilConfig, CoeConfig, Config };

export const defaultModelList = [
  'x-ai/grok-2-1212',
  'perplexity/llama-3.1-sonar-large-128k-online',
  'openai/gpt-4o',
  'anthropic/claude-3-5-sonnet',
  'deepseek/deepseek-r1',
  'google/gemini-2.0-flash-exp:free',
];

export const defaultSystemPrompt =
  'You are a respected member of the Council of Elders. Provide clear, expert guidance.';
export const defaultSynthesizerModel = 'openai/gpt-4o-mini';

// User defaults functionality removed - no longer using .coerc files

export async function loadConfig(councilName?: string): Promise<Config> {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';

  // Use council from parameter or config default
  const effectiveCouncilName = councilName;

  // Default config
  const defaultConfig: CoeConfig = {
    models: defaultModelList,
    system: defaultSystemPrompt,
    output: {
      format: 'text',
      showMeta: false,
      showModels: false,
    },
    rounds: 1,
  };

  let coeConfig: CoeConfig;

  try {
    const configPath = path.join(process.cwd(), 'coe.config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const parsedJson = JSON.parse(configContent) as unknown;

    // Parse and validate with Zod
    const validatedConfig = CoeConfigSchema.parse(parsedJson);

    // If a specific council is requested
    if (validatedConfig.councils && effectiveCouncilName) {
      const councilConfig = validatedConfig.councils[effectiveCouncilName];
      if (!councilConfig) {
        throw new Error(`Council "${effectiveCouncilName}" not found in configuration`);
      }

      // Use the council config merged with base config defaults
      coeConfig = {
        ...validatedConfig,
        ...councilConfig,
        councils: validatedConfig.councils,
        defaultCouncil: validatedConfig.defaultCouncil,
      };
    } else if (
      validatedConfig.councils &&
      validatedConfig.defaultCouncil &&
      !effectiveCouncilName
    ) {
      // Use default council
      const councilConfig = validatedConfig.councils[validatedConfig.defaultCouncil];
      if (councilConfig) {
        coeConfig = {
          ...validatedConfig,
          ...councilConfig,
          councils: validatedConfig.councils,
          defaultCouncil: validatedConfig.defaultCouncil,
        };
      } else {
        coeConfig = validatedConfig;
      }
    } else {
      coeConfig = validatedConfig;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid configuration: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    if (error instanceof Error && error.message.includes('Council')) {
      throw error;
    }
    // Config file doesn't exist, use defaults
    coeConfig = defaultConfig;
  }

  // Validate the complete config
  const config: Config = {
    openRouterApiKey,
    coeConfig,
  };

  return ConfigSchema.parse(config);
}

export function getModelId(model: string | ModelConfig): string {
  return typeof model === 'string' ? model : model.model;
}

export function getSystemPrompt(model: string | ModelConfig, globalSystem?: string): string {
  if (typeof model === 'object' && model.system) {
    return model.system;
  }
  return globalSystem || defaultSystemPrompt;
}
