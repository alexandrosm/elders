import fetch from 'node-fetch';
import { OpenRouterError, RateLimitError, NetworkError, ValidationError } from './errors.js';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelResponse {
  model: string;
  content?: string;
  error?: string;
  meta?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    estimatedCost?: number;
  };
}

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: {
    finish_reason: string | null;
    message: {
      content: string | null;
      role: string;
    };
  }[];
  usage?: OpenRouterUsage;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: {
    prompt: string;
    completion: string;
  };
  context_length?: number;
  top_provider?: {
    max_completion_tokens?: number;
  };
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private maxRetries = 3;
  private initialRetryDelay = 1000;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchWithRetry(
    url: string,
    options: any,
    retries: number = this.maxRetries
  ): Promise<any> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);
        
        // Check for rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.initialRetryDelay * Math.pow(2, attempt);
          
          if (attempt < retries) {
            await this.sleep(delay);
            continue;
          }
          
          throw new RateLimitError(
            'Rate limit exceeded',
            retryAfter ? parseInt(retryAfter) : undefined
          );
        }
        
        // Server errors are retryable
        if (response.status >= 500 && attempt < retries) {
          await this.sleep(this.initialRetryDelay * Math.pow(2, attempt));
          continue;
        }
        
        return response;
      } catch (error) {
        lastError = error as Error;
        
        // Network errors are retryable
        if (attempt < retries && error instanceof TypeError) {
          await this.sleep(this.initialRetryDelay * Math.pow(2, attempt));
          continue;
        }
      }
    }
    
    throw new NetworkError(
      `Failed after ${retries + 1} attempts: ${lastError?.message}`,
      lastError
    );
  }

  async queryModel(
    model: string,
    messages: OpenRouterMessage[],
    temperature: number = 0.7,
    abortSignal?: AbortSignal
  ): Promise<ModelResponse> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/council-of-elders',
            'X-Title': 'Council of Elders'
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            stream: false
          }),
          signal: abortSignal
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: any;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        
        throw new OpenRouterError(
          errorData.error?.message || errorData.message || `API error: ${response.status}`,
          response.status,
          errorData,
          response.status >= 500
        );
      }

      const data = await response.json() as OpenRouterResponse;
      const latencyMs = Date.now() - startTime;
      
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new ValidationError('No content in response');
      }

      const result: ModelResponse = {
        model,
        content
      };

      // Add metadata if usage is available
      if (data.usage) {
        result.meta = {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          latencyMs,
          estimatedCost: this.estimateCost(model, data.usage)
        };
      }

      return result;
    } catch (error) {
      return {
        model,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async queryMultipleModels(
    models: string[],
    messages: OpenRouterMessage[],
    temperature: number = 0.7,
    abortSignal?: AbortSignal,
    firstN?: number
  ): Promise<ModelResponse[]> {
    const promises = models.map(model => 
      this.queryModel(model, messages, temperature, abortSignal)
    );
    
    if (firstN && firstN < models.length) {
      // Race to get first N responses
      return this.getFirstNResponses(promises, models, firstN);
    }
    
    return Promise.all(promises);
  }

  private async getFirstNResponses(
    promises: Promise<ModelResponse>[],
    models: string[],
    n: number
  ): Promise<ModelResponse[]> {
    const results: ModelResponse[] = [];
    const completed = new Set<number>();
    
    return new Promise((resolve) => {
      promises.forEach((promise, index) => {
        promise.then(response => {
          if (completed.size < n) {
            completed.add(index);
            results.push(response);
            
            if (completed.size === n) {
              // We have enough responses, create placeholder errors for the rest
              const allResults: ModelResponse[] = [];
              for (let i = 0; i < models.length; i++) {
                if (completed.has(i)) {
                  const result = results.find(r => r.model === models[i]);
                  if (result) allResults.push(result);
                } else {
                  allResults.push({
                    model: models[i],
                    error: 'Response not needed (first-n limit reached)'
                  });
                }
              }
              resolve(allResults);
            }
          }
        }).catch(error => {
          // Even if a model fails, we still need to track it
          if (completed.size < n) {
            completed.add(index);
            results.push({
              model: models[index],
              error: error instanceof Error ? error.message : String(error)
            });
            
            if (completed.size === n) {
              const allResults: ModelResponse[] = [];
              for (let i = 0; i < models.length; i++) {
                if (completed.has(i)) {
                  const result = results.find(r => r.model === models[i]);
                  if (result) allResults.push(result);
                } else {
                  allResults.push({
                    model: models[i],
                    error: 'Response not needed (first-n limit reached)'
                  });
                }
              }
              resolve(allResults);
            }
          }
        });
      });
    });
  }

  async runConsensusRounds(
    models: string[],
    initialPrompt: string,
    systemPrompt: string,
    rounds: number,
    temperature: number = 0.7,
    onProgress?: (round: number, model: string, status: string) => void,
    abortSignal?: AbortSignal,
    firstN?: number
  ): Promise<ModelResponse[][]> {
    const allResponses: ModelResponse[][] = [];
    
    // Round 1: Initial responses
    const initialMessages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: initialPrompt }
    ];
    
    if (onProgress) {
      models.forEach(model => onProgress(1, model, 'querying'));
    }
    
    const round1Responses = await this.queryMultipleModels(models, initialMessages, temperature, abortSignal, firstN);
    allResponses.push(round1Responses);
    
    if (onProgress) {
      models.forEach(model => onProgress(1, model, 'complete'));
    }
    
    // Subsequent rounds: consensus building
    for (let round = 2; round <= rounds; round++) {
      const previousRoundResponses = allResponses[round - 2];
      
      // Filter to only include models that responded successfully in round 1
      const activeModels = firstN ? 
        models.filter((_, i) => {
          const response = previousRoundResponses[i];
          return !response.error || !response.error.includes('first-n limit reached');
        }) : models;
      
      // Prepare all consensus queries in parallel
      const consensusPromises = models.map(async (model, i) => {
        const previousResponse = previousRoundResponses[i];
        
        if (previousResponse.error) {
          // Skip models that errored in previous rounds
          return previousResponse;
        }
        
        if (onProgress) {
          onProgress(round, model, 'preparing');
        }
        
        // Build consensus prompt
        const consensusMessages: OpenRouterMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: initialPrompt },
          { role: 'assistant', content: previousResponse.content! },
          { 
            role: 'user', 
            content: this.buildConsensusPrompt(model, previousResponse, previousRoundResponses)
          }
        ];
        
        if (onProgress) {
          onProgress(round, model, 'querying');
        }
        
        const response = await this.queryModel(model, consensusMessages, temperature, abortSignal);
        
        if (onProgress) {
          onProgress(round, model, 'complete');
        }
        
        return response;
      });
      
      const roundResponses = await Promise.all(consensusPromises);
      allResponses.push(roundResponses);
    }
    
    return allResponses;
  }

  private buildConsensusPrompt(
    currentModel: string,
    ownResponse: ModelResponse,
    allResponses: ModelResponse[]
  ): string {
    let prompt = 'Consider your peers\' views and revise your response if needed:\n\n';
    
    allResponses.forEach((response) => {
      if (response.model !== currentModel && !response.error) {
        prompt += `**${response.model}**:\n${response.content}\n\n`;
      }
    });
    
    prompt += 'Based on these perspectives, would you like to revise or expand your answer?';
    
    return prompt;
  }

  private estimateCost(model: string, usage: OpenRouterUsage): number {
    // Rough estimates - actual costs vary by model
    // These should be updated based on OpenRouter's pricing
    const costPer1kTokens = {
      'grok-3': 0.01,
      'perplexity-sonar-large': 0.005,
      'o3-high': 0.02,
      'claude-opus-4': 0.015,
      'deepseek-r1-0528': 0.001,
      'gemini-2.5-pro': 0.01
    };
    
    const baseCost = 0.002; // Default cost per 1k tokens
    const rate = costPer1kTokens[model as keyof typeof costPer1kTokens] || baseCost;
    
    return (usage.total_tokens / 1000) * rate;
  }

  async getAvailableModels(): Promise<OpenRouterModel[]> {
    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/models`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new OpenRouterError(
          `Failed to fetch models: ${response.status}`,
          response.status
        );
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      if (error instanceof OpenRouterError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to fetch available models: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}