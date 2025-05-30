import fs from 'fs/promises';
import path from 'path';

import chalk from 'chalk';
import Enquirer from 'enquirer';
import fetch from 'node-fetch';
import ora from 'ora';

import { defaultModelList, defaultSystemPrompt, CoeConfig } from './config.js';
import { OpenRouterModel } from './council-client.js';
import type { PromptChoice } from './types.js';

const enquirer = new Enquirer();

// Helper function to safely prompt with proper typing
async function prompt<T extends Record<string, unknown>>(
  questions: Record<string, unknown> | Record<string, unknown>[]
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return enquirer.prompt(questions as any) as Promise<T>;
}

// Predefined councils for quick setup
const PRESET_COUNCILS = {
  balanced: {
    name: 'Balanced (Recommended)',
    description: 'A well-rounded mix of quality and cost',
    models: [
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-exp:free',
      'x-ai/grok-2-1212',
    ],
  },
  elite: {
    name: 'Elite',
    description: 'Premium models for complex tasks',
    models: [
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet',
      'perplexity/sonar-pro',
      'deepseek/deepseek-r1',
    ],
  },
  fast: {
    name: 'Fast & Affordable',
    description: 'Quick responses at low cost',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku', 'google/gemini-2.0-flash-exp:free'],
  },
  research: {
    name: 'Research',
    description: 'Models with web search capabilities',
    models: [
      'perplexity/llama-3.1-sonar-large-128k-online',
      'perplexity/sonar-pro',
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet',
    ],
  },
  free: {
    name: 'Free Tier',
    description: 'No-cost models for experimentation',
    models: [
      'google/gemini-2.0-flash-exp:free',
      'deepseek/deepseek-r1:free',
      'meta-llama/llama-3.1-8b-instruct:free',
    ],
  },
};

export async function runInitWizard() {
  console.clear();
  console.log(chalk.bold.cyan('🧙 Council of Elders - Setup Wizard'));
  console.log(chalk.gray('━'.repeat(50)) + '\n');

  const envPath = path.join(process.cwd(), '.env');
  const configPath = path.join(process.cwd(), 'coe.config.json');

  // Check for existing API key
  let existingApiKey = '';
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const apiKeyMatch = envContent.match(/OPENROUTER_API_KEY=(.+)/m);
    if (apiKeyMatch?.[1]) {
      existingApiKey = apiKeyMatch[1].trim();
    }
  } catch {
    // .env doesn't exist
  }

  // Step 1: API Key Setup
  console.log(chalk.bold('Step 1: API Configuration\n'));

  let apiKey = existingApiKey;
  if (existingApiKey) {
    const { useExisting } = await prompt<{ useExisting: boolean }>({
      type: 'confirm',
      name: 'useExisting',
      message: `Found existing API key (${existingApiKey.slice(0, 8)}...). Use this key?`,
      initial: true,
    });

    if (!useExisting) {
      const { newKey } = await prompt<{ newKey: string }>({
        type: 'password',
        name: 'newKey',
        message: 'Enter your OpenRouter API key:',
        validate: (input: string) => input.length > 0 || 'API key is required',
      });
      apiKey = newKey;
    }
  } else {
    const { newKey } = await prompt<{ newKey: string }>({
      type: 'password',
      name: 'newKey',
      message: 'Enter your OpenRouter API key (get one at https://openrouter.ai/keys):',
      validate: (input: string) => input.length > 0 || 'API key is required',
    });
    apiKey = newKey;
  }

  // Test API key and fetch available models
  console.log('\n' + chalk.bold('Step 2: Model Selection\n'));

  const spinner = ora('Testing API key and fetching available models...').start();
  let availableModels: OpenRouterModel[] = [];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = (await response.json()) as { data: OpenRouterModel[] };
    availableModels = data.data || [];
    spinner.succeed(`Found ${availableModels.length} available models`);
  } catch (error) {
    spinner.fail('Failed to fetch models');
    console.error(chalk.red('Error:'), error);

    const { continueOffline } = await prompt<{ continueOffline: boolean }>({
      type: 'confirm',
      name: 'continueOffline',
      message: 'Continue with default model list?',
      initial: true,
    });

    if (!continueOffline) {
      process.exit(1);
    }
  }

  // Step 3: Setup Method
  const { setupMethod } = await prompt<{ setupMethod: string }>({
    type: 'select',
    name: 'setupMethod',
    message: 'How would you like to set up your council?',
    choices: [
      {
        name: 'preset',
        message: '🎯 Use a preset council (Recommended)',
        hint: 'Quick setup with curated model groups',
      },
      { name: 'custom', message: '🛠️  Custom selection', hint: 'Choose specific models' },
      { name: 'minimal', message: '⚡ Minimal setup', hint: 'Just the essentials' },
    ],
  });

  let selectedModels: string[] = [];
  let systemPrompt = defaultSystemPrompt;
  let rounds = 1;

  if (setupMethod === 'preset') {
    // Preset council selection
    const { council } = await prompt<{ council: string }>({
      type: 'select',
      name: 'council',
      message: 'Select a preset council:',
      choices: Object.entries(PRESET_COUNCILS).map(([key, preset]) => ({
        name: key,
        message: chalk.bold(preset.name),
        hint: preset.description,
      })),
    });

    selectedModels = PRESET_COUNCILS[council as keyof typeof PRESET_COUNCILS].models;

    // Show selected models
    console.log(chalk.green('\n✓ Selected models:'));
    selectedModels.forEach((model) => {
      console.log(chalk.gray(`  - ${model}`));
    });
  } else if (setupMethod === 'custom') {
    // Custom model selection with search
    if (availableModels.length > 0) {
      // Group models by provider
      interface ModelsByProvider {
        [key: string]: OpenRouterModel[];
      }
      const modelsByProvider: ModelsByProvider = {};
      availableModels.forEach((model) => {
        const provider = model.id.split('/')[0];
        if (!modelsByProvider[provider]) {
          modelsByProvider[provider] = [];
        }
        modelsByProvider[provider].push(model);
      });

      // Create choices grouped by provider
      const choices: PromptChoice[] = [];
      Object.entries(modelsByProvider).forEach(([provider, models]) => {
        models.forEach((model) => {
          const price = parseFloat(model.pricing?.prompt || '0') * 1000;
          const priceStr =
            price === 0 ? chalk.green('FREE') : chalk.yellow(`$${price.toFixed(3)}/1K`);
          choices.push({
            name: model.id,
            message: `[${provider}] ${model.name} ${priceStr}`,
            value: model.id,
          });
        });
      });

      const { models } = await prompt<{ models: string[] }>({
        type: 'multiselect',
        name: 'models',
        message: 'Select models for your council:',
        choices,
        initial: defaultModelList,
        limit: 15,
      });

      selectedModels = models;
    } else {
      // Fallback to input
      const { models } = await prompt<{ models: string }>({
        type: 'list',
        name: 'models',
        message: 'Enter model IDs (comma-separated):',
        initial: defaultModelList.join(', '),
      });

      selectedModels = models
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
    }
  } else {
    // Minimal setup
    selectedModels = [
      'openai/gpt-4o-mini',
      'anthropic/claude-3-haiku',
      'google/gemini-2.0-flash-exp:free',
    ];
  }

  // Step 4: Advanced Options
  console.log('\n' + chalk.bold('Step 3: Configuration Options\n'));

  const { configureAdvanced } = await prompt<{ configureAdvanced: boolean }>({
    type: 'confirm',
    name: 'configureAdvanced',
    message: 'Configure advanced options?',
    initial: false,
  });

  if (configureAdvanced) {
    // System prompt
    const { customPrompt } = await prompt<{ customPrompt: string }>({
      type: 'input',
      name: 'customPrompt',
      message: 'System prompt for all models:',
      initial: defaultSystemPrompt,
      multiline: true,
    });
    systemPrompt = customPrompt;

    // Consensus rounds
    const { consensusRounds } = await prompt<{ consensusRounds: number }>({
      type: 'numeral',
      name: 'consensusRounds',
      message: 'Default consensus rounds (1-5):',
      initial: 1,
      min: 1,
      max: 5,
    });
    rounds = consensusRounds;

    // Output format
    const { _outputFormat } = await prompt<{ _outputFormat: string }>({
      type: 'select',
      name: '_outputFormat',
      message: 'Default output format:',
      choices: [
        { name: 'text', message: 'Text (Human-friendly)' },
        { name: 'json', message: 'JSON (Machine-readable)' },
      ],
    });

    // Metadata display
    const { _showMeta } = await prompt<{ _showMeta: boolean }>({
      type: 'confirm',
      name: '_showMeta',
      message: 'Show metadata by default? (tokens, cost, latency)',
      initial: false,
    });
  }

  // Step 5: Save Configuration
  console.log('\n' + chalk.bold('Step 4: Saving Configuration\n'));

  // Save .env file
  if (apiKey !== existingApiKey) {
    const envContent = `OPENROUTER_API_KEY=${apiKey}\n`;
    await fs.writeFile(envPath, envContent);
    console.log(chalk.green('✓ Saved .env file'));
  }

  // Save config
  const config: CoeConfig = {
    models: selectedModels,
    system: systemPrompt,
    output: {
      format: 'text',
      showMeta: false,
      showModels: false,
    },
    rounds,
  };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  console.log(chalk.green('✓ Saved coe.config.json'));

  // Success message
  console.log(chalk.bold.green('\n✨ Setup complete!\n'));
  console.log('You can now use the Council of Elders:');
  console.log(chalk.cyan('  coe "Your question here"'));
  console.log('\nFor more options, run:');
  console.log(chalk.cyan('  coe --help'));

  // Show a sample query
  const { runSample } = await prompt<{ runSample: boolean }>({
    type: 'confirm',
    name: 'runSample',
    message: 'Run a test query now?',
    initial: true,
  });

  if (runSample) {
    console.log(chalk.gray('\nRunning: coe "Hello, Council of Elders!"'));
    // The CLI will handle the actual execution
    process.exit(2); // Special exit code to trigger sample
  }
}
