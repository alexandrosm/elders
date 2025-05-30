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

    await exporter.export(data, options.outputPath);
  }

  getSupportedFormats(): string[] {
    return this.exportFactory.getSupportedFormats();
  }
}
