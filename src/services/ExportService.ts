import 'reflect-metadata';
import { injectable, inject, DependencyContainer } from 'tsyringe';

import { ModelResponse } from '../council-client.js';
import { ExportFactory } from '../infrastructure/exporters/ExportFactory.js';
import { ConsensusResponse } from '../types.js';

export interface ExportOptions {
  format: string;
  outputPath?: string;
  prompt: string;
  council?: string;
  temperature?: number;
  showModels?: boolean;
  firstN?: number;
  synthesized?: boolean;
}

@injectable()
export class ExportService {
  private exportFactory: ExportFactory;

  constructor(@inject('DependencyContainer') container: DependencyContainer) {
    // Create factory with container
    this.exportFactory = new ExportFactory(container);
  }

  async export(data: ModelResponse[] | ConsensusResponse, options: ExportOptions): Promise<void> {
    const exporter = this.exportFactory.getExporter(options.format);

    // Enhance the data with export options
    const enhancedData = this.enhanceExportData(data, options);

    await exporter.export(enhancedData, options.outputPath);
  }

  getSupportedFormats(): string[] {
    return this.exportFactory.getSupportedFormats();
  }

  private enhanceExportData(
    data: ModelResponse[] | ConsensusResponse,
    options: ExportOptions
  ): any {
    // For now, just pass through the data
    // In a future enhancement, we could modify the export interface
    // to accept additional context
    return data;
  }
}
