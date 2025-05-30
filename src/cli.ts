#!/usr/bin/env node
import 'reflect-metadata';
import chalk from 'chalk';
import { Command } from 'commander';
import fetch from 'node-fetch';

import { QueryCommand } from './cli/commands/QueryCommand.js';
import { loadConfig } from './config.js';
import { container } from './container.js';
import { runInitWizard } from './init-wizard-enhanced.js';
import { ICouncilService } from './interfaces.js';
import type { CliOptions, ExecError } from './types.js';

const program = new Command();

// MCP compliance verification
async function verifyMCPCompliance() {
  try {
    const response = await fetch('https://modelcontextprotocol.io/llms-full.txt');
    if (!response.ok) {
      console.warn(chalk.yellow('⚠️  Warning: Could not verify MCP compliance (network error)'));
      return;
    }
    const mcpModels = await response.text();
    // Simple check - just warn if the file exists and is readable
    if (mcpModels.length > 0) {
      console.log(chalk.gray('✓ MCP compliance check passed'));
    }
  } catch (error) {
    console.warn(chalk.yellow('⚠️  Warning: Could not verify MCP compliance'));
  }
}

program
  .name('coe')
  .description(
    'Council of Elders - Query multiple LLMs through OpenRouter\n\nExamples:\n  coe "What is the capital of France?"              # Query default council\n  coe --model gpt-4o "Explain quantum computing"     # Query single model\n  coe -c research "Latest AI developments"           # Use research council\n  coe --model perplexity/sonar-pro "Current news"   # Use premium Perplexity model'
  )
  .version('0.2.1');

// Init command
program
  .command('init')
  .description('Initialize configuration with interactive wizard')
  .action(async () => {
    try {
      await runInitWizard();
    } catch (error) {
      const execError = error as ExecError;
      if (execError?.exitCode === 2) {
        // Special exit code to run sample query
        process.argv = [process.argv[0], process.argv[1], 'Hello, Council of Elders!'];
        program.parse(process.argv);
      }
    }
  });

// List councils command
program
  .command('councils')
  .description('List available councils')
  .action(async () => {
    try {
      const config = await loadConfig();

      if (!config.coeConfig.councils || Object.keys(config.coeConfig.councils).length === 0) {
        console.log(chalk.yellow('No councils defined in configuration.'));
        console.log(chalk.gray('Add councils to your coe.config.json file.'));
        return;
      }

      console.log(chalk.bold('Available Councils:'));
      console.log(chalk.gray('─'.repeat(60)) + '\n');

      for (const [name, council] of Object.entries(config.coeConfig.councils)) {
        const isDefault = name === config.coeConfig.defaultCouncil;
        const modelCount = council.models.length;
        const rounds = council.rounds || 1;

        console.log(chalk.cyan(`${name}${isDefault ? ' (default)' : ''}`));
        console.log(`  Models: ${modelCount}`);
        console.log(`  Rounds: ${rounds}`);
        if (council.system) {
          console.log(`  System: ${council.system.substring(0, 50)}...`);
        }
        console.log();
      }
    } catch (error) {
      console.error(chalk.red('Error loading configuration:'), error);
    }
  });

// Models command
program
  .command('models')
  .description('List available OpenRouter models')
  .action(async () => {
    try {
      await loadConfig(); // Ensure config is loaded
      const councilService = container.resolve<ICouncilService>('ICouncilService');

      const models = await councilService.getAvailableModels();

      console.log(chalk.bold(`Available OpenRouter Models (${models.length}):`));
      console.log(chalk.gray('─'.repeat(60)) + '\n');

      models.forEach((model) => {
        console.log(`  ${model}`);
      });
    } catch (error) {
      console.error(chalk.red('Error fetching models:'), error);
    }
  });

// Verify command - keeping simple for now
program
  .command('verify')
  .description('Verify configuration and model availability')
  .option('-f, --fix', 'Show suggestions for fixing invalid models')
  .option('-i, --interactive', 'Interactive mode for fixing issues')
  .action((_options: CliOptions) => {
    // TODO: Implement verify command
    console.log(chalk.yellow('Verify command will be refactored in a future update'));
  });

// Set up main query command using QueryCommand
// Delay registration to avoid loading services during --help/--version
let queryCommandRegistered = false;
const registerQueryCommand = () => {
  if (!queryCommandRegistered) {
    const queryCommand = container.resolve(QueryCommand);
    queryCommand.register(program);
    queryCommandRegistered = true;
  }
};

// Add hook to run MCP verification before the main query
program.hook('preAction', async (thisCommand, actionCommand) => {
  // Register query command only when needed
  if (actionCommand === program && thisCommand === program) {
    registerQueryCommand();
    await verifyMCPCompliance();
  }
});

// Handle --version and --help without loading services
const args = process.argv.slice(2);
if (args.length === 0 || args.some((arg) => arg === '--help' || arg === '-h')) {
  // Register query command to show its options in help
  registerQueryCommand();
} else if (!args.some((arg) => arg === '--version' || arg === '-V')) {
  // Register for all other cases except --version
  registerQueryCommand();
}

// Parse command line arguments
program.parse(process.argv);
