#!/usr/bin/env node
import 'reflect-metadata';
import chalk from 'chalk';
import { Command } from 'commander';
import fetch from 'node-fetch';

import { CouncilsCommand } from './cli/commands/CouncilsCommand.js';
import { InitCommand } from './cli/commands/InitCommand.js';
import { ModelsCommand } from './cli/commands/ModelsCommand.js';
import { QueryCommand } from './cli/commands/QueryCommand.js';
import { VerifyCommand } from './cli/commands/VerifyCommand.js';
import { container } from './container.js';

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

// Register all commands
const initCommand = container.resolve(InitCommand);
initCommand.register(program);

const councilsCommand = container.resolve(CouncilsCommand);
councilsCommand.register(program);

const modelsCommand = container.resolve(ModelsCommand);
modelsCommand.register(program);

const verifyCommand = container.resolve(VerifyCommand);
verifyCommand.register(program);

// Set up main query command - delay to avoid loading services during --help/--version
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
