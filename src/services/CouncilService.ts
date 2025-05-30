import 'reflect-metadata';
import ora, { Ora } from 'ora';
import { injectable, inject } from 'tsyringe';

import { getModelId } from '../config.js';
import {
  CouncilClient,
  OpenRouterMessage,
  ModelResponse,
  QueryOptions,
} from '../council-client.js';
import { ICouncilService, IConfigService } from '../interfaces.js';
import { CouncilConfig, ConsensusResponse } from '../types.js';

@injectable()
export class CouncilService implements ICouncilService {
  private client: CouncilClient;

  constructor(@inject('IConfigService') private configService: IConfigService) {
    const apiKey = this.configService.getApiKey();
    this.client = new CouncilClient({ apiKey });
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

    return this.client.queryMultipleModels(modelIds, messages, queryOptions);
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

    const allRounds = await this.client.runConsensusRounds(
      modelIds,
      prompt,
      config.system || '',
      rounds,
      queryOptions,
      onProgress
    );

    // Synthesize if needed
    let synthesis: ModelResponse | undefined;
    if (config.defaults?.single) {
      synthesis = await this.synthesizeResponses(prompt, allRounds, config);
    }

    return {
      rounds: allRounds,
      synthesis,
      metadata: this.calculateMetadata(allRounds),
    };
  }

  async getAvailableModels(): Promise<string[]> {
    const models = await this.client.getAvailableModels();
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

    return this.client.queryModel(modelId, messages, {
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
          totalCost += response.meta.estimatedCost || 0;
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
}
