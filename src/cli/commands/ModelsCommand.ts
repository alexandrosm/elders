import 'reflect-metadata';
import chalk from 'chalk';
import { Command } from 'commander';
import { injectable, inject } from 'tsyringe';

import { ICouncilService, IConfigService } from '../../interfaces.js';

@injectable()
export class ModelsCommand {
  constructor(
    @inject('ICouncilService') private councilService: ICouncilService,
    @inject('IConfigService') private configService: IConfigService
  ) {}

  register(program: Command): void {
    program
      .command('models')
      .description('List available OpenRouter models')
      .option('--config <path>', 'Path to config file (overrides default config discovery)')
      .action(async (options: { config?: string }) => {
        try {
          // Ensure config is loaded
          await this.configService.loadConfig(undefined, options.config);

          const models = await this.councilService.getAvailableModels();

          console.log(chalk.bold(`Available OpenRouter Models (${models.length}):`));
          console.log(chalk.gray('─'.repeat(60)) + '\n');

          models.forEach((model) => {
            console.log(`  ${model}`);
          });
        } catch (error) {
          console.error(chalk.red('Error fetching models:'), error);
        }
      });
  }
}
