import { ModelResponse } from './council-client.js';
import { CouncilConfig, ConsensusResponse } from './types.js';

export interface ICouncilService {
  query(prompt: string, config: CouncilConfig): Promise<ModelResponse[]>;
  queryWithConsensus(prompt: string, config: CouncilConfig): Promise<ConsensusResponse>;
  getAvailableModels(): Promise<string[]>;
}

export interface IConfigService {
  loadConfig(councilName?: string, configPath?: string): Promise<CouncilConfig>;
  getApiKey(): string;
  getDefaultCouncil(): string;
  getAllCouncils(): string[];
}

export interface IExporter {
  export(data: ModelResponse[] | ConsensusResponse, outputPath?: string): Promise<void>;
}

export interface IPricingService {
  calculate(modelId: string, usage: { totalTokens: number }): number;
}
