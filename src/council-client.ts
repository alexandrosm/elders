import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, streamText, generateObject } from 'ai';
import { z } from 'zod';

import { SynthesisSchema } from './synthesis-schema.js';
import { withRetry } from './utils.js';

// Types moved from openrouter.ts
export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface UrlCitation {
  url: string;
  title: string;
  content?: string;
  start_index: number;
  end_index: number;
}

export interface ModelResponse {
  model: string;
  content?: string;
  error?: string;
  citations?: UrlCitation[];
  meta?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    estimatedCost?: number;
  };
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

export interface CouncilClientOptions {
  apiKey: string;
  referer?: string;
  title?: string;
}

export interface QueryOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  webSearch?:
    | boolean
    | { maxResults?: number; search_context_size?: string; id?: string; max_results?: number };
  firstN?: number;
}

export class CouncilClient {
  private openrouter: ReturnType<typeof createOpenRouter>;
  private apiKey: string;

  constructor(options: CouncilClientOptions) {
    this.apiKey = options.apiKey;
    this.openrouter = createOpenRouter({
      apiKey: options.apiKey,
      headers: {
        'HTTP-Referer': options.referer || 'https://github.com/council-of-elders',
        'X-Title': options.title || 'Council of Elders',
      },
    });
  }

  /**
   * Query a single model
   */
  async queryModel(
    modelId: string,
    messages: OpenRouterMessage[],
    options: QueryOptions = {}
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      // Apply web search suffix if needed
      const model =
        options.webSearch === true
          ? this.openrouter(`${modelId}:online`)
          : this.openrouter(modelId);

      const result = await withRetry(
        () =>
          generateText({
            model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            temperature: options.temperature ?? 0.7,
            maxTokens: options.maxTokens,
            abortSignal: options.signal,
            ...(options.webSearch &&
              typeof options.webSearch === 'object' && {
                experimental_providerMetadata: {
                  openrouter: {
                    plugins: [{ id: 'web', max_results: options.webSearch.maxResults || 5 }],
                  },
                },
              }),
          }),
        {
          retries: 3,
          delay: 1000,
          onRetry: (attempt) => console.log(`Retrying ${modelId} (attempt ${attempt})...`),
        }
      );

      const latencyMs = Date.now() - startTime;

      // Extract citations if available
      const citations: UrlCitation[] = [];
      // TODO: Extract citations from Vercel AI SDK response when available

      return {
        model: modelId,
        content: result.text,
        citations: citations.length > 0 ? citations : undefined,
        meta: result.usage
          ? {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
              latencyMs,
              estimatedCost: this.estimateCost(modelId, result.usage),
            }
          : undefined,
      };
    } catch (error) {
      return {
        model: modelId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Query multiple models in parallel
   */
  async queryMultipleModels(
    modelIds: string[],
    messages: OpenRouterMessage[],
    options: QueryOptions = {}
  ): Promise<ModelResponse[]> {
    const promises = modelIds.map((modelId) => this.queryModel(modelId, messages, options));

    if (options.firstN && options.firstN < modelIds.length) {
      return this.getFirstNResponses(promises, modelIds, options.firstN);
    }

    return Promise.all(promises);
  }

  /**
   * Get first N responses, marking others as not needed
   */
  private async getFirstNResponses(
    promises: Promise<ModelResponse>[],
    modelIds: string[],
    n: number
  ): Promise<ModelResponse[]> {
    const results: ModelResponse[] = [];
    const completed = new Set<number>();

    return new Promise((resolve) => {
      promises.forEach((promise, index) => {
        promise
          .then((response) => {
            if (completed.size < n) {
              completed.add(index);
              results.push(response);

              if (completed.size === n) {
                // Create full result array maintaining order
                const allResults: ModelResponse[] = [];
                for (let i = 0; i < modelIds.length; i++) {
                  if (completed.has(i)) {
                    const result = results.find((r) => r.model === modelIds[i]);
                    if (result) allResults.push(result);
                  } else {
                    allResults.push({
                      model: modelIds[i],
                      error: 'Response not needed (first-n limit reached)',
                    });
                  }
                }
                resolve(allResults);
              }
            }
          })
          .catch((error) => {
            if (completed.size < n) {
              completed.add(index);
              results.push({
                model: modelIds[index],
                error: error instanceof Error ? error.message : String(error),
              });

              if (completed.size === n) {
                const allResults: ModelResponse[] = [];
                for (let i = 0; i < modelIds.length; i++) {
                  if (completed.has(i)) {
                    const result = results.find((r) => r.model === modelIds[i]);
                    if (result) allResults.push(result);
                  } else {
                    allResults.push({
                      model: modelIds[i],
                      error: 'Response not needed (first-n limit reached)',
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

  /**
   * Run consensus rounds between models
   */
  async runConsensusRounds(
    modelIds: string[],
    initialPrompt: string,
    systemPrompt: string,
    rounds: number,
    options: QueryOptions = {},
    onProgress?: (round: number, model: string, status: string) => void
  ): Promise<ModelResponse[][]> {
    const allResponses: ModelResponse[][] = [];

    // Round 1: Initial responses
    const initialMessages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: initialPrompt },
    ];

    if (onProgress) {
      modelIds.forEach((model) => onProgress(1, model, 'querying'));
    }

    const round1Responses = await this.queryMultipleModels(modelIds, initialMessages, options);
    allResponses.push(round1Responses);

    if (onProgress) {
      modelIds.forEach((model) => onProgress(1, model, 'complete'));
    }

    // Subsequent rounds: consensus building
    for (let round = 2; round <= rounds; round++) {
      const previousRoundResponses = allResponses[round - 2];

      const consensusPromises = modelIds.map(async (modelId, i) => {
        const previousResponse = previousRoundResponses[i];

        if (previousResponse.error) {
          return previousResponse;
        }

        if (onProgress) {
          onProgress(round, modelId, 'preparing');
        }

        // Build consensus messages
        const consensusMessages: OpenRouterMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: initialPrompt },
          { role: 'assistant', content: previousResponse.content! },
          {
            role: 'user',
            content: this.buildConsensusPrompt(modelId, previousResponse, previousRoundResponses),
          },
        ];

        if (onProgress) {
          onProgress(round, modelId, 'querying');
        }

        const response = await this.queryModel(modelId, consensusMessages, options);

        if (onProgress) {
          onProgress(round, modelId, 'complete');
        }

        return response;
      });

      const roundResponses = await Promise.all(consensusPromises);
      allResponses.push(roundResponses);
    }

    return allResponses;
  }

  /**
   * Build consensus prompt for a model based on peer responses
   */
  private buildConsensusPrompt(
    currentModel: string,
    ownResponse: ModelResponse,
    allResponses: ModelResponse[]
  ): string {
    let prompt = "Consider your peers' views and revise your response if needed:\n\n";

    allResponses.forEach((response) => {
      if (response.model !== currentModel && !response.error) {
        prompt += `**${response.model}**:\n${response.content}\n\n`;
      }
    });

    prompt += 'Based on these perspectives, would you like to revise or expand your answer?';

    return prompt;
  }

  /**
   * Estimate cost based on token usage
   */
  private estimateCost(
    model: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): number {
    // Rough estimates - should be updated based on OpenRouter's pricing
    const costPer1kTokens: Record<string, number> = {
      'gpt-4o': 0.005,
      'gpt-4o-mini': 0.0002,
      'claude-3.5-sonnet': 0.003,
      'claude-3-haiku': 0.00025,
      'perplexity/sonar-pro': 0.003,
      'perplexity/sonar': 0.001,
      'deepseek/deepseek-r1': 0.001,
      'google/gemini-2.0-flash-exp:free': 0,
    };

    const baseCost = 0.002; // Default cost per 1k tokens
    const modelKey = Object.keys(costPer1kTokens).find((key) => model.includes(key));
    const rate = modelKey ? costPer1kTokens[modelKey] : baseCost;

    return (usage.totalTokens / 1000) * rate;
  }

  /**
   * Stream responses from a single model
   */
  async streamModel(
    modelId: string,
    messages: OpenRouterMessage[],
    options: QueryOptions & { onChunk?: (text: string) => void } = {}
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      const model =
        options.webSearch === true
          ? this.openrouter(`${modelId}:online`)
          : this.openrouter(modelId);

      let fullContent = '';
      const stream = streamText({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens,
        abortSignal: options.signal,
      });

      for await (const chunk of stream.textStream) {
        fullContent += chunk;
        options.onChunk?.(chunk);
      }

      const latencyMs = Date.now() - startTime;

      const finalUsage = await stream.usage;
      return {
        model: modelId,
        content: fullContent,
        meta: finalUsage
          ? {
              promptTokens: finalUsage.promptTokens,
              completionTokens: finalUsage.completionTokens,
              totalTokens: finalUsage.totalTokens,
              latencyMs,
              estimatedCost: this.estimateCost(modelId, finalUsage),
            }
          : undefined,
      };
    } catch (error) {
      return {
        model: modelId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate structured output with Zod schema
   */
  async generateStructured<T>(
    modelId: string,
    messages: OpenRouterMessage[],
    schema: z.Schema<T>,
    options: QueryOptions = {}
  ): Promise<{ data?: T; error?: string }> {
    try {
      const model = this.openrouter(modelId);
      const { object } = await generateObject({
        model,
        messages,
        schema,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens,
      });

      return { data: object };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get available models from OpenRouter
   */
  async getAvailableModels(): Promise<OpenRouterModel[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/council-of-elders',
          'X-Title': 'Council of Elders',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = (await response.json()) as { data: OpenRouterModel[] };
      return data.data || [];
    } catch (error) {
      console.error('Error fetching OpenRouter models:', error);
      return [];
    }
  }

  /**
   * Generate structured synthesis using Zod schema
   */
  async generateStructuredSynthesis(
    modelId: string,
    messages: OpenRouterMessage[],
    options: QueryOptions = {}
  ): Promise<{ synthesis: string; meta?: Record<string, unknown> }> {
    const startTime = Date.now();

    try {
      const model = this.openrouter(modelId);
      const { object } = await withRetry(
        () =>
          generateObject({
            model,
            messages,
            schema: SynthesisSchema,
            temperature: options.temperature ?? 0.7,
            maxTokens: options.maxTokens,
            abortSignal: options.signal,
          }),
        {
          retries: 2,
          delay: 1000,
        }
      );

      const latencyMs = Date.now() - startTime;

      return {
        synthesis: object.summary,
        meta: {
          latencyMs,
          keyPoints: object.keyPoints?.length || 0,
          perspectives: object.perspectives?.length || 0,
          disagreements: object.disagreements?.length || 0,
          confidence: object.confidence,
        },
      };
    } catch (error) {
      throw new Error(
        `Structured synthesis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
