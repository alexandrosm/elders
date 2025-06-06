import 'reflect-metadata';
import * as fs from 'fs/promises';
import * as path from 'path';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { injectable, inject } from 'tsyringe';

import { ModelResponse } from '../../council-client.js';
import { ICouncilService, IConfigService } from '../../interfaces.js';
import { ResponseBuilder } from '../../response-builder.js';
import { ExportService } from '../../services/ExportService.js';
import { CliOptions, CouncilConfig, ConsensusResponse } from '../../types.js';

@injectable()
export class QueryCommand {
  constructor(
    @inject('ICouncilService') private councilService: ICouncilService,
    @inject('IConfigService') private configService: IConfigService,
    private exportService: ExportService
  ) {}

  register(program: Command): void {
    program
      .argument('[prompt...]', 'The prompt to send to the council')
      .option(
        '-r, --rounds <N>',
        'Number of consensus rounds (default: from config or 1)',
        parseInt
      )
      .option('-j, --json', 'Output as JSON instead of plain text')
      .option('-m, --meta', 'Include metadata (tokens, cost, latency)')
      .option('-s, --show-models', 'Show model identities (hidden by default)')
      .option('-S, --single', 'Synthesize all responses into a single unified answer')
      .option('-t, --temperature <temp>', 'Temperature for responses (0-1)', parseFloat, 0.7)
      .option('-f, --files <paths...>', 'Files to append to the prompt')
      .option('-c, --council <name>', 'Use a specific council configuration')
      .option('--model <model>', 'Query a single model instead of a council')
      .option('-n, --first-n <count>', 'Only use the first N models to respond', parseInt)
      .option('-e, --export <format>', 'Export conversation to file (markdown, json, txt)')
      .option('-w, --web', 'Enable web search for all models')
      .option('--web-max-results <N>', 'Maximum web search results (default: 5)', parseInt)
      .option(
        '--web-context <size>',
        'Web search context size for native search (low, medium, high)'
      )
      .option(
        '--time-limit <seconds>',
        'Time limit per model per round (filters out slower models)',
        parseFloat
      )
      .option('--config <path>', 'Path to config file (overrides default config discovery)')
      .action(async (promptParts: string[], options: CliOptions) => {
        await this.execute(promptParts, options);
      });
  }

  private async execute(promptParts: string[], options: CliOptions): Promise<void> {
    // If no prompt provided, show help
    if (!promptParts || promptParts.length === 0) {
      return;
    }

    let prompt = promptParts.join(' ');

    // Append file contents if --files option is provided
    if (options.files && options.files.length > 0) {
      prompt = await this.appendFileContents(prompt, options.files);
    }

    // Load configuration
    let config;
    try {
      config = await this.configService.loadConfig(options.council, options.config);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('OpenRouter API key is required') ||
          error.message.includes('No configuration file found'))
      ) {
        console.error(chalk.red('Error: Missing configuration'));
        console.error(chalk.yellow('Please run "coe init" to configure'));
        process.exit(1);
      }
      throw error;
    }

    // Handle single model mode
    if (options.model) {
      await this.querySingleModel(prompt, options.model, options);
      return;
    }

    // Apply options to config
    const updatedConfig = {
      ...config,
      rounds: options.rounds || config.rounds || 1,
      defaults: {
        ...config.defaults,
        temperature: options.temperature || config.defaults?.temperature || 0.7,
        firstN: options.firstN || config.defaults?.firstN,
        single: options.single || config.defaults?.single || false,
        web: options.web !== undefined ? options.web : config.defaults?.web || false,
        webMaxResults: options.webMaxResults || config.defaults?.webMaxResults || 5,
        webContext: options.webContext || config.defaults?.webContext,
        timeLimit: options.timeLimit || config.defaults?.timeLimit,
      },
    };

    // Execute query
    if (updatedConfig.rounds === 1) {
      await this.executeSingleRound(prompt, updatedConfig, options);
    } else {
      await this.executeMultiRound(prompt, updatedConfig, options);
    }
  }

  private async appendFileContents(prompt: string, files: string[]): Promise<string> {
    const fileContents: string[] = [];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const fileName = path.basename(filePath);
        fileContents.push(`\n\n### ${fileName}\n\`\`\`\n${content}\n\`\`\``);
      } catch (error) {
        console.error(chalk.red(`Error reading file ${filePath}:`), error);
        process.exit(1);
      }
    }

    if (fileContents.length > 0) {
      prompt += '\n\n## Attached Files:' + fileContents.join('');
    }

    return prompt;
  }

  private async querySingleModel(
    prompt: string,
    modelId: string,
    options: CliOptions
  ): Promise<void> {
    const spinner = ora(`Querying ${modelId}...`).start();

    // Create a minimal config for single model
    const singleModelConfig = {
      models: [modelId],
      system: 'You are a helpful AI assistant.',
      defaults: {
        temperature: options.temperature || 0.7,
        web: options.web || false,
        webMaxResults: options.webMaxResults || 5,
        webContext: options.webContext,
        timeLimit: options.timeLimit,
      },
    };

    try {
      const responses = await this.councilService.query(prompt, singleModelConfig);
      spinner.stop();

      const builder = new ResponseBuilder({
        format: options.json ? 'json' : 'text',
        showMeta: options.meta || false,
        showModels: options.showModels || false,
      });
      console.log(builder.format(responses, 1));

      // Check if the model failed and exit with error code (but not in JSON mode)
      if (responses.length > 0 && responses[0].error && !options.json) {
        console.error(chalk.red('Error: Model failed to respond'));
        process.exit(1);
      }

      // Export if requested
      if (options.export) {
        await this.exportResults(prompt, responses, options);
      }
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  }

  private async executeSingleRound(
    prompt: string,
    config: CouncilConfig,
    options: CliOptions
  ): Promise<void> {
    const modelCount = config.models.length;
    const firstN = config.defaults?.firstN;
    const spinnerText = `Consulting ${modelCount} elders${firstN ? ` (first ${firstN} to respond)` : ''}...`;
    const spinner = ora(spinnerText).start();

    try {
      const responses = await this.councilService.query(prompt, config);
      spinner.stop();

      // Check if all models failed
      const allFailed = responses.every((r) => r.error !== null && r.error !== undefined);

      if (!config.defaults?.single) {
        const builder = new ResponseBuilder({
          format: options.json ? 'json' : 'text',
          showMeta: options.meta || false,
          showModels: options.showModels || false,
        });
        console.log(builder.format(responses, 1));
      }

      // Exit with error code if all models failed (but not in JSON mode)
      if (allFailed && !options.json) {
        console.error(chalk.red('Error: All models failed to respond'));
        process.exit(1);
      }

      // Export if requested
      if (options.export) {
        await this.exportResults(prompt, responses, options);
      }
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  }

  private async executeMultiRound(
    prompt: string,
    config: CouncilConfig,
    options: CliOptions
  ): Promise<void> {
    console.log(chalk.bold.cyan(`\n🧙 Council of Elders - ${config.rounds} Rounds\n`));

    try {
      const result = await this.councilService.queryWithConsensus(prompt, config);

      // Display results
      const finalResponses = result.rounds[result.rounds.length - 1];

      if (!config.defaults?.single) {
        const builder = new ResponseBuilder({
          format: options.json ? 'json' : 'text',
          showMeta: options.meta || false,
          showModels: options.showModels || false,
        });
        console.log(builder.format(finalResponses, config.rounds));
      } else if (result.synthesis) {
        const builder = new ResponseBuilder({
          format: options.json ? 'json' : 'text',
          showMeta: options.meta || false,
          showModels: options.showModels || false,
        });
        console.log(builder.format([result.synthesis], 1));
      }

      // Show metadata if requested
      if (options.meta && result.metadata) {
        console.log(chalk.gray('\n=== Session Metadata ==='));
        console.log(chalk.gray(`Total Cost: $${result.metadata.totalCost.toFixed(4)}`));
        console.log(chalk.gray(`Total Tokens: ${result.metadata.totalTokens}`));
        console.log(
          chalk.gray(`Average Latency: ${(result.metadata.averageLatency / 1000).toFixed(2)}s`)
        );
      }

      // Export if requested
      if (options.export) {
        await this.exportConsensusResults(prompt, result, options, config);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  }

  private async exportResults(
    prompt: string,
    responses: ModelResponse[],
    options: CliOptions
  ): Promise<void> {
    if (!options.export) return;

    await this.exportService.export(responses, {
      format: options.export,
      prompt,
      council: options.council,
      temperature: options.temperature,
      showModels: options.showModels,
      firstN: options.firstN,
      synthesized: false,
    });
  }

  private async exportConsensusResults(
    prompt: string,
    result: ConsensusResponse,
    options: CliOptions,
    config: CouncilConfig
  ): Promise<void> {
    if (!options.export) return;

    await this.exportService.export(result, {
      format: options.export,
      prompt,
      council: options.council,
      temperature: options.temperature,
      showModels: options.showModels,
      firstN: options.firstN,
      synthesized: config.defaults?.single || false,
    });
  }
}
