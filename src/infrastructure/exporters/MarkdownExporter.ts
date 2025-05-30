import { injectable } from 'tsyringe';

import { BaseExporter, ExportData } from './BaseExporter.js';

@injectable()
export class MarkdownExporter extends BaseExporter {
  getExtension(): string {
    return 'md';
  }

  formatData(data: ExportData): string {
    let md = `# Council of Elders Session\n\n`;
    md += `**Date:** ${new Date(data.timestamp).toLocaleString()}\n`;

    if (data.council) {
      md += `**Council:** ${data.council}\n`;
    }

    if (data.rounds) {
      md += `**Rounds:** ${data.rounds}\n`;
    }

    if (data.temperature !== undefined) {
      md += `**Temperature:** ${data.temperature}\n`;
    }

    if (data.options?.firstN) {
      md += `**First-N:** ${data.options.firstN}\n`;
    }

    md += `\n## Prompt\n\n${data.prompt || 'No prompt provided'}\n\n`;

    if (data.options?.synthesized && data.synthesis) {
      md += `## Synthesized Response\n\n${data.synthesis.content || data.synthesis.error}\n\n`;
    }

    if (data.responses && data.responses.length > 0) {
      md += `## Council Responses\n\n`;

      data.responses.forEach((round, roundIndex) => {
        if (data.responses!.length > 1) {
          md += `### Round ${roundIndex + 1}\n\n`;
        }

        round.forEach((response, responseIndex) => {
          const elderTitle = data.options?.showModels
            ? response.model
            : `Elder ${responseIndex + 1}`;
          md += `#### ${elderTitle}\n\n`;

          if (response.error) {
            md += `*Error: ${response.error}*\n\n`;
          } else {
            md += `${response.content}\n\n`;
          }

          // Add metadata if requested
          if (response.meta) {
            md += `<details>\n<summary>Metadata</summary>\n\n`;
            md += `- Tokens: ${response.meta.totalTokens || 0}\n`;
            md += `- Latency: ${response.meta.latencyMs ? (response.meta.latencyMs / 1000).toFixed(2) : 0}s\n`;
            md += `- Cost: $${response.meta.estimatedCost?.toFixed(4) || 0}\n`;
            md += `</details>\n\n`;
          }
        });
      });
    }

    // Add session metadata
    if (data.metadata) {
      md += `## Session Metadata\n\n`;
      md += `- **Total Cost:** $${data.metadata.totalCost.toFixed(4)}\n`;
      md += `- **Total Tokens:** ${data.metadata.totalTokens}\n`;
      md += `- **Average Latency:** ${(data.metadata.averageLatency / 1000).toFixed(2)}s\n`;
      md += `- **Model Count:** ${data.metadata.modelCount}\n`;
    }

    return md;
  }
}
