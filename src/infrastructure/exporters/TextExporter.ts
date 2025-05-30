import { injectable } from 'tsyringe';

import { BaseExporter, ExportData } from './BaseExporter.js';

@injectable()
export class TextExporter extends BaseExporter {
  getExtension(): string {
    return 'txt';
  }

  formatData(data: ExportData): string {
    let text = `COUNCIL OF ELDERS SESSION\n`;
    text += `${'='.repeat(50)}\n\n`;

    text += `Date: ${new Date(data.timestamp).toLocaleString()}\n`;

    if (data.council) {
      text += `Council: ${data.council}\n`;
    }

    if (data.rounds) {
      text += `Rounds: ${data.rounds}\n`;
    }

    if (data.temperature !== undefined) {
      text += `Temperature: ${data.temperature}\n`;
    }

    text += `\nPROMPT:\n${'-'.repeat(50)}\n`;
    text += `${data.prompt || 'No prompt provided'}\n\n`;

    if (data.options?.synthesized && data.synthesis) {
      text += `SYNTHESIZED RESPONSE:\n${'-'.repeat(50)}\n`;
      text += `${data.synthesis.content || data.synthesis.error}\n\n`;
    }

    if (data.responses && data.responses.length > 0) {
      text += `COUNCIL RESPONSES:\n${'-'.repeat(50)}\n\n`;

      data.responses.forEach((round, roundIndex) => {
        if (data.responses!.length > 1) {
          text += `Round ${roundIndex + 1}:\n`;
        }

        round.forEach((response, responseIndex) => {
          const elderTitle = data.options?.showModels
            ? response.model
            : `Elder ${responseIndex + 1}`;
          text += `${elderTitle}:\n`;

          if (response.error) {
            text += `[Error: ${response.error}]\n\n`;
          } else {
            text += `${response.content}\n\n`;
          }
        });

        if (roundIndex < data.responses!.length - 1) {
          text += `${'-'.repeat(50)}\n\n`;
        }
      });
    }

    // Add session metadata
    if (data.metadata) {
      text += `\nSESSION METADATA:\n${'-'.repeat(50)}\n`;
      text += `Total Cost: $${data.metadata.totalCost.toFixed(4)}\n`;
      text += `Total Tokens: ${data.metadata.totalTokens}\n`;
      text += `Average Latency: ${(data.metadata.averageLatency / 1000).toFixed(2)}s\n`;
      text += `Model Count: ${data.metadata.modelCount}\n`;
    }

    return text;
  }
}
