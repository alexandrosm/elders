import 'reflect-metadata';
import chalk from 'chalk';
import { Command } from 'commander';
import { injectable, inject } from 'tsyringe';

import { IConfigService } from '../../interfaces.js';
import type { CouncilConfig } from '../../types.js';

@injectable()
export class CouncilsCommand {
  constructor(@inject('IConfigService') private configService: IConfigService) {}

  register(program: Command): void {
    program
      .command('councils')
      .description('List available councils')
      .option('--config <path>', 'Path to config file (overrides default config discovery)')
      .action(async (options: { config?: string }) => {
        try {
          // Load config to ensure it's available
          await this.configService.loadConfig(undefined, options.config);
          const councils = this.getAllCouncils();

          if (Object.keys(councils).length === 0) {
            console.log(chalk.yellow('No councils defined in configuration.'));
            console.log(chalk.gray('Add councils to your coe.config.json file.'));
            return;
          }

          console.log(chalk.bold('Available Councils:'));
          console.log(chalk.gray('─'.repeat(60)) + '\n');

          const defaultCouncil = this.configService.getDefaultCouncil();

          for (const [name, council] of Object.entries(councils)) {
            const typedCouncil = council;
            const isDefault = name === defaultCouncil;
            const modelCount = typedCouncil.models?.length || 0;
            const rounds = typedCouncil.rounds || 1;

            console.log(chalk.cyan(`${name}${isDefault ? ' (default)' : ''}`));
            console.log(`  Models: ${modelCount}`);
            console.log(`  Rounds: ${rounds}`);
            if (typedCouncil.system) {
              console.log(`  System: ${typedCouncil.system.substring(0, 50)}...`);
            }
            console.log();
          }
        } catch (error) {
          console.error(chalk.red('Error loading configuration:'), error);
        }
      });
  }

  private getAllCouncils(): Record<string, CouncilConfig> {
    // This is a workaround since we need access to the full config
    // In a future refactor, we should add a method to IConfigService to get all councils with details
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const configModule = require('../../config.js') as {
        loadConfigSync: () => { coeConfig: { councils?: Record<string, CouncilConfig> } };
      };
      const { coeConfig } = configModule.loadConfigSync();
      return coeConfig.councils || {};
    } catch {
      return {};
    }
  }
}
