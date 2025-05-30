import * as fs from 'fs/promises';

import { ModelResponse } from '../../council-client.js';
import { IExporter } from '../../interfaces.js';
import { ConsensusResponse } from '../../types.js';

export interface ExportData {
  timestamp: string;
  prompt: string;
  council?: string;
  rounds?: number;
  temperature?: number;
  options?: {
    showModels?: boolean;
    firstN?: number;
    synthesized?: boolean;
  };
  responses?: ModelResponse[][];
  synthesis?: ModelResponse;
  metadata?: {
    totalCost: number;
    totalTokens: number;
    averageLatency: number;
    modelCount: number;
  };
}

export abstract class BaseExporter implements IExporter {
  abstract formatData(data: ExportData): string;
  abstract getExtension(): string;

  async export(data: ModelResponse[] | ConsensusResponse, outputPath?: string): Promise<void> {
    const exportData = this.prepareExportData(data);
    const content = this.formatData(exportData);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = outputPath || `coe-export-${timestamp}.${this.getExtension()}`;

    await fs.writeFile(filename, content, 'utf-8');

    console.log(`✓ Exported to ${filename}`);
  }

  private prepareExportData(data: ModelResponse[] | ConsensusResponse): ExportData {
    const timestamp = new Date().toISOString();

    // Check if it's a ConsensusResponse
    if ('rounds' in data && 'synthesis' in data) {
      return {
        timestamp,
        prompt: '', // This should be passed from the caller
        rounds: data.rounds.length,
        responses: data.rounds,
        synthesis: data.synthesis,
        metadata: data.metadata,
      };
    }

    // It's a simple ModelResponse array
    return {
      timestamp,
      prompt: '', // This should be passed from the caller
      rounds: 1,
      responses: [data as ModelResponse[]],
    };
  }
}
