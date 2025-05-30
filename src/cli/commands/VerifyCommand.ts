import 'reflect-metadata';
import chalk from 'chalk';
import { Command } from 'commander';
import { difference } from 'lodash-es';
import { injectable, inject } from 'tsyringe';

import { getModelId, ModelConfig, loadConfig, CoeConfig } from '../../config.js';
import { IConfigService, ICouncilService } from '../../interfaces.js';
import { CliOptions } from '../../types.js';

@injectable()
export class VerifyCommand {
  constructor(
    @inject('IConfigService') private configService: IConfigService,
    @inject('ICouncilService') private councilService: ICouncilService
  ) {}

  register(program: Command): void {
    program
      .command('verify')
      .description('Verify configuration and model availability')
      .option('-f, --fix', 'Show suggestions for fixing invalid models')
      .option('-i, --interactive', 'Interactive mode for fixing issues')
      .action(async (options: CliOptions) => {
        await this.execute(options);
      });
  }

  private async execute(options: CliOptions): Promise<void> {
    try {
      console.log(chalk.bold('\n🔍 Verifying Council of Elders Configuration\n'));

      // Load config
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const config = await this.loadFullConfig();

      // 1. Configuration file check
      console.log(chalk.bold('1. Configuration file:'));
      console.log(chalk.green('  ✓ Configuration loaded successfully'));

      // 2. Model validation
      console.log(chalk.bold('\n2. Model validation:'));

      // Get available models from OpenRouter
      const availableModels = await this.councilService.getAvailableModels();
      const availableModelIds = new Set(availableModels);

      // Collect all configured models
      const allModels = new Set<string>();
      const invalidModels = new Set<string>();
      const modelSuggestions = new Map<string, string[]>();

      // Helper to collect models
      const collectModels = (models: ModelConfig[]) => {
        models.forEach((model) => {
          const modelId = getModelId(model);
          allModels.add(modelId);
          if (availableModelIds.size > 0 && !availableModelIds.has(modelId)) {
            invalidModels.add(modelId);
            if (options.fix) {
              modelSuggestions.set(modelId, this.findSimilarModels(modelId, availableModels));
            }
          }
        });
      };

      // Check root models
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (config.models) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        collectModels(config.models);
      }

      // Check synthesizer
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (config.synthesizer) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        const synthId = getModelId(config.synthesizer);
        allModels.add(synthId);
        if (availableModelIds.size > 0 && !availableModelIds.has(synthId)) {
          invalidModels.add(synthId);
          if (options.fix) {
            modelSuggestions.set(synthId, this.findSimilarModels(synthId, availableModels));
          }
        }
      }

      // Check councils if present
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (config.councils) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        for (const council of Object.values(config.councils)) {
          if (council.models) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            collectModels(council.models);
          }
          if (council.synthesizer) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            const synthId = getModelId(council.synthesizer);
            allModels.add(synthId);
            if (availableModelIds.size > 0 && !availableModelIds.has(synthId)) {
              invalidModels.add(synthId);
              if (options.fix) {
                modelSuggestions.set(synthId, this.findSimilarModels(synthId, availableModels));
              }
            }
          }
        }
      }

      // Report results
      if (availableModelIds.size === 0) {
        console.log(chalk.yellow('  ⚠ Could not verify models (offline mode)'));
        console.log(chalk.gray(`  Total models in config: ${allModels.size}`));
      } else {
        const validModels = difference([...allModels], [...invalidModels]);

        console.log(chalk.green(`  ✓ Valid models: ${validModels.length}`));
        if (invalidModels.size > 0) {
          console.log(chalk.red(`  ✗ Invalid models: ${invalidModels.size}`));

          console.log(chalk.red('\n  Invalid model IDs:'));
          for (const model of invalidModels) {
            console.log(chalk.red(`    - ${model}`));
            if (options.fix && modelSuggestions.has(model)) {
              const suggestions = modelSuggestions.get(model)!;
              if (suggestions.length > 0) {
                console.log(chalk.yellow(`      Suggestions: ${suggestions.join(', ')}`));
              }
            }
          }
        }
      }

      // Summary
      console.log(chalk.bold('\n3. Summary:'));
      const hasIssues = invalidModels.size > 0;

      if (hasIssues) {
        console.log(chalk.red('  ✗ Configuration has issues that need to be fixed'));
        if (options.fix) {
          console.log(chalk.yellow('\n  Suggested fixes have been provided above.'));
        } else {
          console.log(chalk.gray('\n  Run with --fix to see suggested corrections.'));
        }

        // Interactive fix mode
        if (options.interactive && invalidModels.size > 0) {
          console.log(chalk.yellow('\nInteractive fix mode coming soon!'));
          console.log(chalk.gray('For now, please manually update your coe.config.json file.'));
        }
      } else {
        console.log(chalk.green('  ✓ Configuration is valid!'));
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Council')) {
        console.error(chalk.red('Error:'), error.message);
      } else {
        console.error(chalk.red('Error verifying configuration:'), error);
      }
      process.exit(1);
    }
  }

  private async loadFullConfig(): Promise<CoeConfig> {
    // Load the full config directly
    const { coeConfig } = await loadConfig();
    return coeConfig;
  }

  private findSimilarModels(targetModel: string, availableModels: string[]): string[] {
    const target = targetModel.toLowerCase();
    const suggestions: string[] = [];

    // Extract key parts of the model name
    const parts = target.split(/[/-]/);

    for (const model of availableModels) {
      const modelLower = model.toLowerCase();

      // Check if model contains any significant part of the target
      for (const part of parts) {
        if (part.length > 3 && modelLower.includes(part)) {
          suggestions.push(model);
          break;
        }
      }

      if (suggestions.length >= 3) break;
    }

    return suggestions;
  }
}
