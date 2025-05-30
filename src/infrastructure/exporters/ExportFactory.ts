import 'reflect-metadata';
import { injectable, inject, DependencyContainer } from 'tsyringe';

import { IExporter } from '../../interfaces.js';

import { JsonExporter } from './JsonExporter.js';
import { MarkdownExporter } from './MarkdownExporter.js';
import { TextExporter } from './TextExporter.js';

@injectable()
export class ExportFactory {
  private exporterMap: Record<string, new () => IExporter> = {
    markdown: MarkdownExporter,
    md: MarkdownExporter,
    json: JsonExporter,
    text: TextExporter,
    txt: TextExporter,
  };

  constructor(@inject('DependencyContainer') private container: DependencyContainer) {}

  getExporter(format: string): IExporter {
    const ExporterClass = this.exporterMap[format.toLowerCase()];

    if (!ExporterClass) {
      throw new Error(
        `Unknown export format: ${format}. Supported formats: ${Object.keys(this.exporterMap).join(', ')}`
      );
    }

    return this.container.resolve(ExporterClass);
  }

  getSupportedFormats(): string[] {
    return Object.keys(this.exporterMap);
  }
}
