import 'reflect-metadata';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { injectable, inject } from 'tsyringe';

import { getModelId } from '../config.js';
import {
  CouncilClient,
  OpenRouterMessage,
  ModelResponse,
  QueryOptions,
} from '../council-client.js';
import { ICouncilService, IConfigService, IPricingService } from '../interfaces.js';
import { CouncilConfig, ConsensusResponse } from '../types.js';

@injectable()
export class CouncilService implements ICouncilService {
  private client: CouncilClient | null = null;

  constructor(
    @inject('IConfigService') private configService: IConfigService,
    @inject('IPricingService') private pricingService: IPricingService
  ) {}

  private getClient(): CouncilClient {
    if (!this.client) {
      const apiKey = this.configService.getApiKey();
      if (!apiKey) {
        throw new Error('OpenRouter API key is required but not configured');
      }
      this.client = new CouncilClient({ apiKey });
    }
    return this.client;
  }

  async query(prompt: string, config: CouncilConfig): Promise<ModelResponse[]> {
    const modelIds = config.models.map((m) => getModelId(m));
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: config.system || 'You are a helpful AI assistant.' },
      { role: 'user', content: prompt },
    ];

    const queryOptions: QueryOptions = {
      temperature: config.defaults?.temperature || 0.7,
      firstN: config.defaults?.firstN,
      webSearch: this.buildWebSearchConfig(config),
    };

    const responses = await this.getClient().queryMultipleModels(modelIds, messages, queryOptions);

    // Filter by time limit if specified
    if (config.defaults?.timeLimit) {
      const timeLimitMs = config.defaults.timeLimit * 1000;
      return this.filterByTimeLimit(responses, timeLimitMs);
    }

    return responses;
  }

  async queryWithConsensus(prompt: string, config: CouncilConfig): Promise<ConsensusResponse> {
    const rounds = config.rounds || 1;
    const modelIds = config.models.map((m) => getModelId(m));

    const queryOptions: QueryOptions = {
      temperature: config.defaults?.temperature || 0.7,
      firstN: config.defaults?.firstN,
      webSearch: this.buildWebSearchConfig(config),
    };

    // Progress tracking
    const progressBars = new Map<string, Ora>();
    modelIds.forEach((model) => {
      progressBars.set(model, ora(`${model}`).start());
    });

    const onProgress = (round: number, model: string, status: string) => {
      const spinner = progressBars.get(model);
      if (spinner) {
        const statusEmoji = status === 'complete' ? '✓' : status === 'querying' ? '🔄' : '⏳';
        spinner.text = `Round ${round}/${rounds} - ${model} ${statusEmoji}`;
        if (status === 'complete' && round === rounds) {
          spinner.succeed();
        }
      }
    };

    const allRounds = await this.getClient().runConsensusRounds(
      modelIds,
      prompt,
      config.system || '',
      rounds,
      queryOptions,
      onProgress
    );

    // Filter rounds by time limit if specified
    let filteredRounds = allRounds;
    if (config.defaults?.timeLimit) {
      const timeLimitMs = config.defaults.timeLimit * 1000;
      filteredRounds = allRounds.map((round) => this.filterByTimeLimit(round, timeLimitMs));

      // Log filtered models
      const filteredModels = new Set<string>();
      allRounds.forEach((round, idx) => {
        const filtered = round.filter(
          (r) => !filteredRounds[idx].some((fr) => fr.model === r.model)
        );
        filtered.forEach((r) => filteredModels.add(r.model));
      });

      if (filteredModels.size > 0) {
        console.log(
          chalk.yellow(
            `\nFiltered out slow models (>${config.defaults.timeLimit}s): ${[...filteredModels].join(', ')}\n`
          )
        );
      }
    }

    // Synthesize if needed
    let synthesis: ModelResponse | undefined;
    if (config.defaults?.single) {
      synthesis = await this.synthesizeResponses(prompt, filteredRounds, config);
    }

    return {
      rounds: filteredRounds,
      synthesis,
      metadata: this.calculateMetadata(filteredRounds),
    };
  }

  async getAvailableModels(): Promise<string[]> {
    const models = await this.getClient().getAvailableModels();
    return models.map((m) => m.id);
  }

  private buildWebSearchConfig(config: CouncilConfig) {
    const webEnabled = config.defaults?.web || false;
    if (!webEnabled) return undefined;

    const webContext = config.defaults?.webContext;
    const webMaxResults = config.defaults?.webMaxResults || 5;

    if (webContext) {
      // Native web search
      return { search_context_size: webContext };
    } else {
      // Plugin-based web search
      return { id: 'web', max_results: webMaxResults };
    }
  }

  private async synthesizeResponses(
    originalPrompt: string,
    allRounds: ModelResponse[][],
    config: CouncilConfig
  ): Promise<ModelResponse> {
    const synthesizerModel = config.synthesizer || 'openai/gpt-4o-mini';
    const modelId = getModelId(synthesizerModel);

    const finalResponses = allRounds[allRounds.length - 1];
    const successfulResponses = finalResponses.filter((r) => !r.error && r.content);

    if (successfulResponses.length === 0) {
      return {
        model: modelId,
        error: 'No successful responses to synthesize',
      };
    }

    let synthesisPrompt = `You are tasked with providing a single, unified answer to a question based on a council discussion.

Original Question: "${originalPrompt}"

`;

    if (allRounds.length > 1) {
      synthesisPrompt += `Full Council Discussion (${allRounds.length} rounds):\n\n`;

      allRounds.forEach((roundResponses, roundIndex) => {
        synthesisPrompt += `=== Round ${roundIndex + 1} ===\n`;
        roundResponses.forEach((response, modelIndex) => {
          if (!response.error && response.content) {
            synthesisPrompt += `\nElder ${modelIndex + 1}:\n${response.content}\n`;
          }
        });
        synthesisPrompt += '\n';
      });

      synthesisPrompt += `\nBased on this full discussion, including how perspectives evolved across rounds, provide a comprehensive synthesis.`;
    } else {
      synthesisPrompt += `Expert Perspectives:\n`;
      successfulResponses.forEach((r, i) => {
        synthesisPrompt += `\nPerspective ${i + 1}:\n${r.content}\n`;
      });
      synthesisPrompt += `\nBased on these perspectives, provide a direct, comprehensive answer.`;
    }

    synthesisPrompt += `\n\nDo not mention the council, multiple perspectives, or synthesis process. Simply answer the question as if you are providing the definitive response.`;

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content:
          'You are an expert synthesizer. Provide clear, direct answers based on the information given. Never mention the synthesis process or multiple sources.',
      },
      { role: 'user', content: synthesisPrompt },
    ];

    return this.getClient().queryModel(modelId, messages, {
      temperature: config.defaults?.temperature || 0.7,
    });
  }

  private calculateMetadata(allRounds: ModelResponse[][]) {
    let totalCost = 0;
    let totalTokens = 0;
    let totalLatency = 0;
    let responseCount = 0;

    allRounds.forEach((round) => {
      round.forEach((response) => {
        if (response.meta) {
          // Use pricing service if estimated cost is not provided
          if (response.meta.estimatedCost) {
            totalCost += response.meta.estimatedCost;
          } else if (response.meta.totalTokens) {
            const cost = this.pricingService.calculate(response.model, {
              totalTokens: response.meta.totalTokens,
            });
            totalCost += cost;
          }

          totalTokens += response.meta.totalTokens || 0;
          totalLatency += response.meta.latencyMs || 0;
          responseCount++;
        }
      });
    });

    return {
      totalCost,
      totalTokens,
      averageLatency: responseCount > 0 ? totalLatency / responseCount : 0,
      modelCount: allRounds[0]?.length || 0,
    };
  }

  private filterByTimeLimit(responses: ModelResponse[], timeLimitMs: number): ModelResponse[] {
    return responses.filter((response) => {
      // Keep responses that completed successfully within the time limit
      if (!response.error && response.meta?.latencyMs) {
        return response.meta.latencyMs <= timeLimitMs;
      }
      // Keep error responses (they didn't timeout, they failed for other reasons)
      return true;
    });
  }
}
