import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { defaultModelList, defaultSystemPrompt, CoeConfig } from './config.js';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
}

export async function runInitWizard() {
  console.log(chalk.bold.cyan('\n🧙 Council of Elders - Setup Wizard\n'));
  
  // Check if .env file exists
  const envPath = path.join(process.cwd(), '.env');
  const configPath = path.join(process.cwd(), 'coe.config.json');
  
  let existingApiKey = '';
  
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const apiKeyMatch = envContent.match(/OPENROUTER_API_KEY=(.+)/m);
    if (apiKeyMatch && apiKeyMatch[1]) {
      existingApiKey = apiKeyMatch[1].trim();
    }
  } catch (error) {
    // .env doesn't exist
  }
  
  // Step 1: API Key
  let apiKey = existingApiKey;
  if (!apiKey) {
    console.log(chalk.gray('First, let\'s configure your OpenRouter API key.\n'));
    const { newApiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'newApiKey',
        message: 'Enter your OpenRouter API key:',
        validate: (input) => input.length > 0 || 'API key is required',
        mask: '*'
      }
    ]);
    apiKey = newApiKey;
  } else {
    console.log(chalk.green('✓ API key already configured\n'));
  }
  
  // Step 2: Models
  console.log(chalk.bold.yellow('📋 Model Selection'));
  console.log(chalk.gray('Select models for your Council of Elders.\n'));
  
  const { useDefaultModels } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useDefaultModels',
      message: 'Use recommended default models?',
      default: true
    }
  ]);
  
  let selectedModels: string[] = [];
  
  if (useDefaultModels) {
    selectedModels = defaultModelList;
  } else {
    // Fetch available models
    const spinner = ora('Fetching available models from OpenRouter...').start();
    
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      
      const data = await response.json() as { data: OpenRouterModel[] };
      spinner.succeed('Model catalog loaded');
      
      // Simple model selection
      const modelChoices = data.data
        .filter(m => m.id.includes('grok') || m.id.includes('claude') || 
                     m.id.includes('gpt') || m.id.includes('gemini') || 
                     m.id.includes('deepseek') || m.id.includes('perplexity'))
        .slice(0, 30)
        .map(m => ({
          name: `${m.name} (${m.id})`,
          value: m.id,
          checked: defaultModelList.includes(m.id)
        }));
      
      const { models } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'models',
          message: 'Select models:',
          choices: modelChoices,
          pageSize: 15,
          validate: (answer) => answer.length > 0 || 'Please select at least one model'
        }
      ]);
      
      selectedModels = models;
    } catch (error) {
      spinner.fail('Failed to fetch models, using defaults');
      selectedModels = defaultModelList;
    }
  }
  
  // Step 3: System Prompt
  console.log(chalk.bold.yellow('\n💬 System Prompt'));
  
  const { customizePrompt } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'customizePrompt',
      message: 'Customize the global system prompt?',
      default: false
    }
  ]);
  
  let systemPrompt = defaultSystemPrompt;
  
  if (customizePrompt) {
    const { newPrompt } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newPrompt',
        message: 'Enter system prompt:',
        default: defaultSystemPrompt
      }
    ]);
    systemPrompt = newPrompt;
  }
  
  // Step 4: Output Settings
  console.log(chalk.bold.yellow('\n⚙️  Default Settings'));
  
  const { rounds, outputFormat, showMeta } = await inquirer.prompt([
    {
      type: 'number',
      name: 'rounds',
      message: 'Default number of consensus rounds:',
      default: 1,
      validate: (input) => (input && input >= 1) || 'Must be at least 1'
    },
    {
      type: 'list',
      name: 'outputFormat',
      message: 'Default output format:',
      choices: [
        { name: 'Plain text', value: 'text' },
        { name: 'JSON', value: 'json' }
      ],
      default: 'text'
    },
    {
      type: 'confirm',
      name: 'showMeta',
      message: 'Show metadata (tokens, cost, latency) by default?',
      default: false
    }
  ]);
  
  // Step 5: Summary and Confirmation
  console.log(chalk.bold.cyan('\n📝 Configuration Summary:\n'));
  
  if (!existingApiKey) {
    console.log(chalk.green('API Key: ') + chalk.gray('Will be saved'));
  }
  
  console.log(chalk.green('\nSelected Models:'));
  selectedModels.forEach(model => {
    console.log(`  • ${model}`);
  });
  
  console.log(chalk.green('\nSystem Prompt:'));
  console.log(chalk.gray(`  "${systemPrompt}"`));
  
  console.log(chalk.green('\nDefault Settings:'));
  console.log(`  • Rounds: ${rounds}`);
  console.log(`  • Output: ${outputFormat}`);
  console.log(`  • Show metadata: ${showMeta ? 'Yes' : 'No'}`);
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '\nSave this configuration?',
      default: true
    }
  ]);
  
  if (!confirm) {
    console.log(chalk.yellow('\nConfiguration cancelled.'));
    return;
  }
  
  // Step 6: Save Configuration
  try {
    // Save .env if needed
    if (!existingApiKey) {
      await fs.writeFile(envPath, `OPENROUTER_API_KEY=${apiKey}\n`);
    }
    
    // Save coe.config.json
    const config: CoeConfig = {
      models: selectedModels,
      system: systemPrompt,
      output: {
        format: outputFormat as 'text' | 'json',
        showMeta
      },
      rounds
    };
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    console.log(chalk.green('\n✅ Configuration saved!\n'));
    console.log(chalk.gray('You can now use:'));
    console.log(chalk.cyan('  • coe "your question"') + ' - Ask the council');
    console.log(chalk.cyan('  • coe --rounds 3 "question"') + ' - Multiple consensus rounds');
    console.log(chalk.cyan('  • coe --json --meta "question"') + ' - JSON output with metadata');
    console.log(chalk.cyan('  • coe init') + ' - Reconfigure settings\n');
  } catch (error) {
    console.error(chalk.red('\nError saving configuration:'), error);
    process.exit(1);
  }
}