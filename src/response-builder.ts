import chalk from 'chalk';
import { groupBy } from 'lodash-es';

import { ModelResponse } from './council-client.js';

export interface ResponseBuilderOptions {
  showModels?: boolean;
  showMeta?: boolean;
  format?: 'text' | 'json';
  elderNames?: string[];
}

const DEFAULT_ELDER_NAMES = [
  'Elder Alpha',
  'Elder Beta',
  'Elder Gamma',
  'Elder Delta',
  'Elder Epsilon',
  'Elder Zeta',
  'Elder Eta',
  'Elder Theta',
  'Elder Iota',
  'Elder Kappa',
];

export class ResponseBuilder {
  private options: ResponseBuilderOptions;

  constructor(options: ResponseBuilderOptions = {}) {
    this.options = {
      elderNames: DEFAULT_ELDER_NAMES,
      ...options,
    };
  }

  /**
   * Build a single response output
   */
  buildSingle(response: ModelResponse, index: number = 0): string {
    const { showModels, showMeta, elderNames } = this.options;
    const displayName = showModels ? response.model : elderNames![index % elderNames!.length];

    let output = chalk.bold.green(`📜 ${displayName}\n`);

    if (response.error) {
      output += chalk.red(`\n❌ Error: ${response.error}\n`);
    } else {
      output += `\n${response.content}\n`;

      // Citations
      if (response.citations && response.citations.length > 0) {
        output += chalk.gray('\nSources:\n');
        response.citations.forEach((citation, i) => {
          output += chalk.gray(`  ${i + 1}. ${citation.title} - ${citation.url}\n`);
        });
      }

      // Metadata
      if (showMeta && response.meta) {
        output += chalk.gray('\nMetadata:\n');
        output += chalk.gray(`  • Tokens: ${response.meta.totalTokens || 'N/A'}\n`);
        output += chalk.gray(`  • Latency: ${response.meta.latencyMs || 'N/A'}ms\n`);
        output += chalk.gray(
          `  • Est. Cost: $${response.meta.estimatedCost?.toFixed(4) || 'N/A'}\n`
        );
      }
    }

    return output;
  }

  /**
   * Build multiple responses output
   */
  buildMultiple(responses: ModelResponse[], round: number = 1): string {
    const grouped = groupBy(responses, (r) =>
      r.error ? (r.error.includes('first-n limit reached') ? 'skipped' : 'failed') : 'success'
    );

    const activeResponses = grouped.success || [];

    let output = chalk.bold.cyan(
      `\n🧙 Council of Elders Response${round > 1 ? ` (Round ${round})` : ''}\n`
    );
    output += chalk.gray('─'.repeat(60)) + '\n\n';

    activeResponses.forEach((response, index) => {
      output += this.buildSingle(response, index);

      if (index < activeResponses.length - 1) {
        output += chalk.gray('\n' + '─'.repeat(60) + '\n\n');
      }
    });

    return output;
  }

  /**
   * Build JSON output
   */
  buildJSON(responses: ModelResponse[]): Record<string, unknown>[] {
    const { showModels, showMeta, elderNames } = this.options;

    return responses
      .filter((r) => !r.error || !r.error.includes('first-n limit reached'))
      .map((r, index) => ({
        elder: showModels ? r.model : elderNames![index % elderNames!.length],
        ...(showModels ? { model: r.model } : {}),
        answer: r.content || null,
        error: r.error || null,
        ...(r.citations && r.citations.length > 0 ? { citations: r.citations } : {}),
        ...(showMeta && r.meta ? { meta: r.meta } : {}),
      }));
  }

  /**
   * Build synthesis output
   */
  buildSynthesis(response: ModelResponse): string {
    if (response.error) {
      return chalk.red(`Error: ${response.error}`);
    }

    let output = response.content || '';

    // Display citations if available
    if (response.citations && response.citations.length > 0) {
      output += chalk.gray('\n\nSources:\n');
      response.citations.forEach((citation, i) => {
        output += chalk.gray(`  ${i + 1}. ${citation.title} - ${citation.url}\n`);
      });
    }

    return output;
  }

  /**
   * Format responses based on options
   */
  format(
    responses: ModelResponse | ModelResponse[],
    round?: number
  ): string | Record<string, unknown>[] | Record<string, unknown> {
    const { format } = this.options;

    if (Array.isArray(responses)) {
      return format === 'json'
        ? JSON.stringify(this.buildJSON(responses), null, 2)
        : this.buildMultiple(responses, round);
    } else {
      return format === 'json'
        ? JSON.stringify(
            {
              answer: responses.content || null,
              error: responses.error || null,
              ...(responses.citations ? { citations: responses.citations } : {}),
              ...(this.options.showMeta && responses.meta ? { meta: responses.meta } : {}),
            },
            null,
            2
          )
        : this.buildSynthesis(responses);
    }
  }
}
