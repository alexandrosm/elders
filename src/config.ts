import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';

dotenv.config();

export interface ModelConfig {
  model: string;
  system?: string;
}

export interface CouncilConfig {
  models: (string | ModelConfig)[];
  system?: string;
  synthesizer?: string | ModelConfig;
  output?: {
    format?: 'text' | 'json';
    showMeta?: boolean;
    showModels?: boolean;
  };
  rounds?: number;
  defaults?: {
    rounds?: number;
    single?: boolean;
    temperature?: number;
    showModels?: boolean;
    meta?: boolean;
    json?: boolean;
    firstN?: number;
    web?: boolean;
    webMaxResults?: number;
    webContext?: 'low' | 'medium' | 'high';
  };
  webSearch?: {
    enabled?: boolean;
    maxResults?: number;
    searchContext?: 'low' | 'medium' | 'high';
  };
}

export interface CoeConfig extends CouncilConfig {
  councils?: Record<string, CouncilConfig>;
  defaultCouncil?: string;
}

export interface UserDefaults {
  defaultCouncil?: string;
  temperature?: number;
  rounds?: number;
  single?: boolean;
  showModels?: boolean;
  meta?: boolean;
  json?: boolean;
  export?: string;
  web?: boolean;
  webMaxResults?: number;
  webContext?: 'low' | 'medium' | 'high';
}

export interface Config {
  openRouterApiKey: string;
  coeConfig: CoeConfig;
  userDefaults?: UserDefaults;
}

export const defaultModelList = [
  'x-ai/grok-2-1212',
  'perplexity/llama-3.1-sonar-large-128k-online',
  'openai/gpt-4o',
  'anthropic/claude-3-5-sonnet',
  'deepseek/deepseek-r1',
  'google/gemini-2.0-flash-exp:free'
];

export const defaultSystemPrompt = 'You are a respected member of the Council of Elders. Provide clear, expert guidance.';
export const defaultSynthesizerModel = 'openai/gpt-4o-mini';

async function loadUserDefaults(): Promise<UserDefaults | undefined> {
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

export async function loadConfig(councilName?: string): Promise<Config> {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
  
  // Load user defaults from .coerc
  const userDefaults = await loadUserDefaults();
  
  // Use council from parameter, user defaults, or config default
  const effectiveCouncilName = councilName || userDefaults?.defaultCouncil;
  
  // Try to load coe.config.json
  let coeConfig: CoeConfig = {
    models: defaultModelList,
    system: defaultSystemPrompt,
    output: {
      format: 'text',
      showMeta: false,
      showModels: false
    },
    rounds: 1
  };
  
  try {
    const configPath = path.join(process.cwd(), 'coe.config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const parsedConfig = JSON.parse(configContent) as Partial<CoeConfig>;
    
    // If councils are defined and a specific council is requested
    if (parsedConfig.councils && effectiveCouncilName) {
      const councilConfig = parsedConfig.councils[effectiveCouncilName];
      if (!councilConfig) {
        throw new Error(`Council "${effectiveCouncilName}" not found in configuration`);
      }
      
      // Merge council config with base config
      coeConfig = {
        models: councilConfig.models || parsedConfig.models || defaultModelList,
        system: councilConfig.system || parsedConfig.system || defaultSystemPrompt,
        synthesizer: councilConfig.synthesizer || parsedConfig.synthesizer || defaultSynthesizerModel,
        output: {
          format: councilConfig.output?.format || parsedConfig.output?.format || 'text',
          showMeta: councilConfig.output?.showMeta ?? parsedConfig.output?.showMeta ?? false,
          showModels: councilConfig.output?.showModels ?? parsedConfig.output?.showModels ?? false
        },
        rounds: councilConfig.rounds || parsedConfig.rounds || 1,
        councils: parsedConfig.councils,
        defaultCouncil: parsedConfig.defaultCouncil
      };
    } else if (parsedConfig.councils && parsedConfig.defaultCouncil && !effectiveCouncilName) {
      // Use default council if no council specified
      const councilConfig = parsedConfig.councils[parsedConfig.defaultCouncil];
      if (councilConfig) {
        coeConfig = {
          models: councilConfig.models || parsedConfig.models || defaultModelList,
          system: councilConfig.system || parsedConfig.system || defaultSystemPrompt,
          synthesizer: councilConfig.synthesizer || parsedConfig.synthesizer || defaultSynthesizerModel,
          output: {
            format: councilConfig.output?.format || parsedConfig.output?.format || 'text',
            showMeta: councilConfig.output?.showMeta ?? parsedConfig.output?.showMeta ?? false,
            showModels: councilConfig.output?.showModels ?? parsedConfig.output?.showModels ?? false
          },
          rounds: councilConfig.rounds || parsedConfig.rounds || 1,
          councils: parsedConfig.councils,
          defaultCouncil: parsedConfig.defaultCouncil
        };
      }
    } else {
      // Use base config (backward compatibility)
      coeConfig = {
        models: parsedConfig.models || defaultModelList,
        system: parsedConfig.system || defaultSystemPrompt,
        synthesizer: parsedConfig.synthesizer || defaultSynthesizerModel,
        output: {
          format: parsedConfig.output?.format || 'text',
          showMeta: parsedConfig.output?.showMeta || false,
          showModels: parsedConfig.output?.showModels || false
        },
        rounds: parsedConfig.rounds || 1,
        councils: parsedConfig.councils,
        defaultCouncil: parsedConfig.defaultCouncil
      };
    }
  } catch (error) {
    // coe.config.json doesn't exist or is invalid, use defaults
    if (error instanceof Error && error.message.includes('Council')) {
      throw error; // Re-throw council not found errors
    }
  }

  return {
    openRouterApiKey,
    coeConfig,
    userDefaults
  };
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