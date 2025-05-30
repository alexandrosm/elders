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
