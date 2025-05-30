// Type definitions for CLI and tests

export interface ExecError extends Error {
  code?: number;
  stderr?: string;
  stdout?: string;
  exitCode?: number;
}

export interface CliOptions {
  model?: string;
  council?: string;
  fix?: boolean;
  interactive?: boolean;
  exitCode?: number;
  rounds?: number;
  json?: boolean;
  meta?: boolean;
  showModels?: boolean;
  single?: boolean;
  temperature?: number;
  files?: string[];
  firstN?: number;
  export?: string;
  web?: boolean;
  webMaxResults?: number;
  webContext?: 'low' | 'medium' | 'high';
}

export interface JsonResponse {
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

export interface MpcResponse {
  jsonrpc: string;
  id: number;
  result?: {
    tools?: Array<{
      name: string;
      description: string;
    }>;
    content?: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    message: string;
  };
}

export interface PromptChoice {
  name: string;
  message: string;
  value?: string;
  hint?: string;
}

// Council types
export type ModelConfig = string | { model: string; system?: string };

export interface CouncilConfig {
  models: ModelConfig[];
  system?: string;
  synthesizer?: string | { model: string; system?: string };
  rounds?: number;
  defaults?: {
    temperature?: number;
    firstN?: number;
    single?: boolean;
    web?: boolean;
    webMaxResults?: number;
    webContext?: 'low' | 'medium' | 'high';
    json?: boolean;
    meta?: boolean;
    showModels?: boolean;
    rounds?: number;
  };
}

// Import ModelResponse from council-client to maintain consistency
import { ModelResponse } from './council-client.js';

export interface ConsensusResponse {
  rounds: ModelResponse[][];
  synthesis?: ModelResponse;
  metadata?: {
    totalCost: number;
    totalTokens: number;
    averageLatency: number;
    modelCount: number;
  };
}
