import { injectable } from 'tsyringe';

import { BaseExporter, ExportData } from './BaseExporter.js';

@injectable()
export class JsonExporter extends BaseExporter {
  getExtension(): string {
    return 'json';
  }

  formatData(data: ExportData): string {
    return JSON.stringify(data, null, 2);
  }
}
