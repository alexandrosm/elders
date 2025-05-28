import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
}

interface ModelCategory {
  name: string;
  models: OpenRouterModel[];
}

async function fetchAvailableModels(apiKey: string): Promise<OpenRouterModel[]> {
  const spinner = ora('Fetching available models from OpenRouter...').start();
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/council-of-elders',
        'X-Title': 'Council of Elders'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json() as { data: OpenRouterModel[] };
    spinner.succeed('Successfully fetched model catalog');
    return data.data;
  } catch (error) {
    spinner.fail('Failed to fetch models');
    throw error;
  }
}

function categorizeModels(models: OpenRouterModel[]): ModelCategory[] {
  const categories: { [key: string]: OpenRouterModel[] } = {
    'Premium/Advanced': [],
    'GPT/OpenAI': [],
    'Claude/Anthropic': [],
    'Google/Gemini': [],
    'Meta/Llama': [],
    'Mistral': [],
    'Open Source': [],
    'Other': []
  };

  models.forEach(model => {
    const id = model.id.toLowerCase();
    const name = model.name.toLowerCase();
    
    if (id.includes('o1') || id.includes('o3') || name.includes('opus') || name.includes('pro')) {
      categories['Premium/Advanced'].push(model);
    } else if (id.includes('gpt') || id.includes('openai')) {
      categories['GPT/OpenAI'].push(model);
    } else if (id.includes('claude') || id.includes('anthropic')) {
      categories['Claude/Anthropic'].push(model);
    } else if (id.includes('gemini') || id.includes('google')) {
      categories['Google/Gemini'].push(model);
    } else if (id.includes('llama') || id.includes('meta')) {
      categories['Meta/Llama'].push(model);
    } else if (id.includes('mistral')) {
      categories['Mistral'].push(model);
    } else if (id.includes('grok') || id.includes('deepseek') || id.includes('qwen')) {
      categories['Open Source'].push(model);
    } else {
      categories['Other'].push(model);
    }
  });

  return Object.entries(categories)
    .filter(([_, models]) => models.length > 0)
    .map(([name, models]) => ({ name, models }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function runInitWizard() {
  console.log(chalk.bold.cyan('\n🧙 Council of Elders - Setup Wizard\n'));
  
  // Check if .env file exists and has API key
  const envPath = path.join(path.dirname(__dirname), '.env');
  let existingApiKey = '';
  let existingModels: string[] = [];
  let existingModelsByCompany: { [company: string]: string[] } = {};
  let isFirstRun = true;
  
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const apiKeyMatch = envContent.match(/OPENROUTER_API_KEY=(.+)/m);
    if (apiKeyMatch && apiKeyMatch[1]) {
      existingApiKey = apiKeyMatch[1].trim();
      isFirstRun = false;
    }
    
    // Parse existing models
    const modelsMatch = envContent.match(/DEFAULT_MODELS=(.+)/m);
    if (modelsMatch && modelsMatch[1]) {
      existingModels = modelsMatch[1].split(',').map(m => m.trim()).filter(Boolean);
    }
    
    // Parse existing models by company
    const modelsByCompanyMatch = envContent.match(/MODELS_BY_COMPANY=(.+)/m);
    if (modelsByCompanyMatch && modelsByCompanyMatch[1]) {
      try {
        existingModelsByCompany = JSON.parse(modelsByCompanyMatch[1]);
      } catch (e) {
        // Invalid JSON, ignore
      }
    }
  } catch (error) {
    // .env file doesn't exist, this is a first run
  }
  
  let apiKey = existingApiKey;
  
  if (isFirstRun) {
    console.log(chalk.gray('This wizard will help you configure your OpenRouter API key and select default models.\n'));
    
    // Step 1: Get API Key only on first run
    const { apiKey: newApiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your OpenRouter API key:',
        validate: (input) => input.length > 0 || 'API key is required',
        mask: '*'
      }
    ]);
    apiKey = newApiKey;
  } else {
    console.log(chalk.gray('Updating model selection. Your API key is already configured.\n'));
    
    // Show current configuration
    if (Object.keys(existingModelsByCompany).length > 0) {
      console.log(chalk.bold.green('Current Model Configuration:'));
      Object.entries(existingModelsByCompany).forEach(([company, models]) => {
        console.log(chalk.yellow(`\n${company}:`));
        models.forEach(model => {
          console.log(`  • ${model}`);
        });
      });
      console.log();
    } else if (existingModels.length > 0) {
      console.log(chalk.bold.green('Current Models:'));
      existingModels.forEach(model => {
        console.log(`  • ${model}`);
      });
      console.log();
    }
  }

  // Step 2: Fetch and categorize models
  let models: OpenRouterModel[];
  try {
    models = await fetchAvailableModels(apiKey);
  } catch (error) {
    console.error(chalk.red('\nError fetching models. Please check your API key and internet connection.'));
    process.exit(1);
  }

  const categories = categorizeModels(models);
  
  // Step 3: Select models by company/category
  console.log(chalk.bold.yellow('\n📋 Select models for your Council of Elders:'));
  console.log(chalk.gray('You can select multiple models from each company/category.'));
  console.log(chalk.gray('(Use space to select/deselect, enter to confirm)\n'));

  const modelsByCompany: { [company: string]: string[] } = {};
  
  // First, let user select which companies/categories they want to configure
  const categoryChoices = categories.map(cat => ({
    name: cat.name,
    value: cat.name,
    checked: Object.keys(existingModelsByCompany).includes(cat.name) || 
             (Object.keys(existingModelsByCompany).length === 0 && ['Premium/Advanced', 'GPT/OpenAI', 'Claude/Anthropic'].includes(cat.name))
  }));
  
  const { selectedCategories } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedCategories',
      message: 'Select which companies/categories to configure:',
      choices: categoryChoices,
      validate: (answer) => answer.length > 0 || 'Please select at least one category'
    }
  ]);
  
  // For each selected category, let user select multiple models
  for (const categoryName of selectedCategories) {
    const category = categories.find(c => c.name === categoryName);
    if (!category) continue;
    
    const choices = category.models.map(model => ({
      name: `${model.name} (${model.id})`,
      value: model.id,
      short: model.id,
      checked: existingModelsByCompany[categoryName]?.includes(model.id) || 
               (Object.keys(existingModelsByCompany).length === 0 && existingModels.includes(model.id))
    }));

    const { selected } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: `Select models from ${chalk.green(category.name)} (press Enter to skip):`,
        choices,
        pageSize: 10
      }
    ]);

    if (selected.length > 0) {
      modelsByCompany[categoryName] = selected;
    }
  }
  
  // Flatten all selected models for backward compatibility
  const selectedModels: string[] = Object.values(modelsByCompany).flat();

  if (selectedModels.length === 0) {
    console.log(chalk.yellow('\nNo models selected. Using default models.'));
    selectedModels.push(
      'x-ai/grok-2-vision-1212',
      'anthropic/claude-3-5-sonnet-20241022',
      'google/gemini-2.0-pro-exp-1219'
    );
  }

  // Step 4: Confirm selection
  console.log(chalk.bold.cyan('\n📝 Configuration Summary:\n'));
  if (!isFirstRun) {
    console.log(chalk.green('API Key: ') + chalk.gray('Already configured'));
  }
  console.log(chalk.green('\nNew Model Selection by Company:'));
  if (Object.keys(modelsByCompany).length > 0) {
    Object.entries(modelsByCompany).forEach(([company, models]) => {
      console.log(chalk.yellow(`\n${company}:`));
      models.forEach(model => {
        console.log(`  • ${model}`);
      });
    });
  } else {
    console.log(chalk.yellow('\nNo models selected'));
  }

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

  // Step 5: Save configuration
  let envContent = '';
  
  if (isFirstRun) {
    // Include API key on first run
    envContent = `OPENROUTER_API_KEY=${apiKey}\n`;
  } else {
    // Preserve existing content and update models
    try {
      const existingContent = await fs.readFile(envPath, 'utf-8');
      // Remove existing DEFAULT_MODELS and MODELS_BY_COMPANY lines
      envContent = existingContent
        .split('\n')
        .filter(line => !line.startsWith('DEFAULT_MODELS=') && !line.startsWith('MODELS_BY_COMPANY='))
        .join('\n');
      if (!envContent.endsWith('\n')) envContent += '\n';
    } catch (error) {
      envContent = `OPENROUTER_API_KEY=${apiKey}\n`;
    }
  }
  
  // Add models configuration
  envContent += `DEFAULT_MODELS=${selectedModels.join(',')}\n`;
  envContent += `MODELS_BY_COMPANY=${JSON.stringify(modelsByCompany)}\n`;

  try {
    await fs.writeFile(envPath, envContent);
    console.log(chalk.green('\n✅ Configuration saved to .env file'));
    console.log(chalk.gray('\nYou can now use:'));
    console.log(chalk.cyan('  • council-of-elders ask "your question"') + ' - Ask the council');
    console.log(chalk.cyan('  • council-of-elders config') + ' - View configuration');
    console.log(chalk.cyan('  • council-of-elders init') + ' - Update model selection');
    if (isFirstRun) {
      console.log(chalk.cyan('  • Add to Claude Desktop for MCP integration\n'));
    }
  } catch (error) {
    console.error(chalk.red('\nError saving configuration:'), error);
    process.exit(1);
  }
}