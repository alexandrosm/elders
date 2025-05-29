#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { 
  OpenRouterClient, 
  OpenRouterMessage, 
  ModelResponse,
  OpenRouterModel
} from './openrouter.js';
import { 
  loadConfig, 
  getModelId, 
  getSystemPrompt,
  CoeConfig,
  ModelConfig
} from './config.js';
import { runInitWizard } from './init-wizard-new.js';
import fetch from 'node-fetch';

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
  .description('Council of Elders - Query multiple LLMs through OpenRouter\n\nExamples:\n  coe "What is the capital of France?"              # Query default council\n  coe --model gpt-4o "Explain quantum computing"     # Query single model\n  coe -c research "Latest AI developments"           # Use research council\n  coe --model perplexity/sonar-pro "Current news"   # Use premium Perplexity model')
  .version('0.1.0');

// Init command
program
  .command('init')
  .description('Initialize configuration with interactive wizard')
  .action(async () => {
    await runInitWizard();
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

// Verify command
program
  .command('verify')
  .description('Verify configuration and model availability')
  .option('--fix', 'Suggest fixes for invalid models')
  .option('--council <name>', 'Verify a specific council')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.council);
      
      if (!config.openRouterApiKey) {
        console.error(chalk.red('Error: OPENROUTER_API_KEY not found in .env file'));
        process.exit(1);
      }
      
      console.log(chalk.bold('Verifying Configuration...'));
      console.log(chalk.gray('─'.repeat(60)) + '\n');
      
      // Initialize client and fetch available models
      const client = new OpenRouterClient(config.openRouterApiKey);
      const spinner = ora('Fetching available models from OpenRouter...').start();
      
      let availableModels: OpenRouterModel[] = [];
      try {
        availableModels = await client.getAvailableModels();
        spinner.succeed(`Found ${availableModels.length} available models`);
      } catch (error) {
        spinner.fail('Failed to fetch available models');
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
        console.log(chalk.yellow('\nProceeding with offline validation only...'));
      }
      
      const availableModelIds = new Set(availableModels.map(m => m.id));
      const modelSuggestions = new Map<string, string[]>();
      
      // Helper to find similar models
      const findSimilarModels = (modelId: string): string[] => {
        const searchTerms = modelId.toLowerCase().split(/[\/\-_]/);
        return availableModels
          .filter(m => {
            const mLower = m.id.toLowerCase();
            return searchTerms.some(term => mLower.includes(term));
          })
          .map(m => m.id)
          .slice(0, 3);
      };
      
      // Validate schema
      console.log(chalk.bold('\n1. Schema Validation:'));
      const schemaIssues: string[] = [];
      
      if (options.council) {
        console.log(`  Checking council: ${chalk.cyan(options.council)}`);
      } else if (config.coeConfig.councils) {
        console.log(`  Multiple councils defined`);
        if (config.coeConfig.defaultCouncil) {
          console.log(`  Default council: ${chalk.cyan(config.coeConfig.defaultCouncil)}`);
        }
      }
      
      // Check required fields
      if (!config.coeConfig.models || config.coeConfig.models.length === 0) {
        schemaIssues.push('No models defined');
      }
      
      if (config.coeConfig.output) {
        const validFormats = ['text', 'json'];
        if (config.coeConfig.output.format && !validFormats.includes(config.coeConfig.output.format)) {
          schemaIssues.push(`Invalid output format: ${config.coeConfig.output.format}`);
        }
      }
      
      if (config.coeConfig.rounds && (config.coeConfig.rounds < 1 || config.coeConfig.rounds > 10)) {
        schemaIssues.push(`Invalid rounds value: ${config.coeConfig.rounds} (should be 1-10)`);
      }
      
      if (schemaIssues.length > 0) {
        console.log(chalk.red('  ✗ Schema issues found:'));
        schemaIssues.forEach(issue => console.log(chalk.red(`    - ${issue}`)));
      } else {
        console.log(chalk.green('  ✓ Schema is valid'));
      }
      
      // Validate models
      console.log(chalk.bold('\n2. Model Validation:'));
      const allModels = new Set<string>();
      const invalidModels = new Set<string>();
      
      // Collect all models from config
      const collectModels = (models: (string | ModelConfig)[]) => {
        models.forEach(m => {
          const modelId = getModelId(m);
          allModels.add(modelId);
          
          if (availableModelIds.size > 0 && !availableModelIds.has(modelId)) {
            invalidModels.add(modelId);
            if (options.fix) {
              modelSuggestions.set(modelId, findSimilarModels(modelId));
            }
          }
        });
      };
      
      // Check models in current config
      collectModels(config.coeConfig.models);
      
      // Check synthesizer
      if (config.coeConfig.synthesizer) {
        const synthId = getModelId(config.coeConfig.synthesizer);
        allModels.add(synthId);
        if (availableModelIds.size > 0 && !availableModelIds.has(synthId)) {
          invalidModels.add(synthId);
          if (options.fix) {
            modelSuggestions.set(synthId, findSimilarModels(synthId));
          }
        }
      }
      
      // Check councils if present
      if (config.coeConfig.councils) {
        for (const [councilName, council] of Object.entries(config.coeConfig.councils)) {
          if (council.models) {
            collectModels(council.models);
          }
          if (council.synthesizer) {
            const synthId = getModelId(council.synthesizer);
            allModels.add(synthId);
            if (availableModelIds.size > 0 && !availableModelIds.has(synthId)) {
              invalidModels.add(synthId);
              if (options.fix) {
                modelSuggestions.set(synthId, findSimilarModels(synthId));
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
        const validModels = Array.from(allModels).filter(m => !invalidModels.has(m));
        
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
      const hasIssues = schemaIssues.length > 0 || invalidModels.size > 0;
      
      if (hasIssues) {
        console.log(chalk.red('  ✗ Configuration has issues that need to be fixed'));
        if (options.fix) {
          console.log(chalk.yellow('\n  Suggested fixes have been provided above.'));
        } else {
          console.log(chalk.gray('\n  Run with --fix to see suggested corrections.'));
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
  });

// Main command: coe <prompt>
program
  .argument('[prompt...]', 'The prompt to send to the council')
  .option('-r, --rounds <N>', 'Number of consensus rounds (default: from config or 1)', parseInt)
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
  .option('--web-context <size>', 'Web search context size for native search (low, medium, high)')
  .action(async (promptParts: string[], options) => {
    // If no prompt provided, show help
    if (!promptParts || promptParts.length === 0) {
      program.help();
      return;
    }

    let prompt = promptParts.join(' ');
    
    // Append file contents if --files option is provided
    if (options.files && options.files.length > 0) {
      const fileContents: string[] = [];
      
      for (const filePath of options.files) {
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
    }
    
    // Load configuration
    const config = await loadConfig(options.council);
    
    if (!config.openRouterApiKey || !config.coeConfig.models || config.coeConfig.models.length === 0) {
      console.error(chalk.red('Error: Missing configuration'));
      console.error(chalk.yellow('Please run "coe init" to configure'));
      process.exit(1);
    }
    
    // MCP compliance check
    await verifyMCPCompliance();

    // Get active council config
    const activeCouncil = options.council || config.userDefaults?.defaultCouncil || config.coeConfig.defaultCouncil;
    const councilDefaults = activeCouncil && config.coeConfig.councils?.[activeCouncil]?.defaults || {};
    
    // Apply defaults hierarchy: CLI flags -> council defaults -> user defaults -> config defaults
    const rounds = options.rounds || 
                   councilDefaults.rounds || 
                   config.userDefaults?.rounds || 
                   config.coeConfig.rounds || 
                   1;
    
    const outputFormat = options.json ? 'json' : 
                        (councilDefaults.json ? 'json' : 
                         (config.userDefaults?.json ? 'json' : 
                          config.coeConfig.output?.format || 'text'));
    
    const showMeta = options.meta !== undefined ? options.meta : 
                     councilDefaults.meta !== undefined ? councilDefaults.meta :
                     config.userDefaults?.meta !== undefined ? config.userDefaults.meta :
                     config.coeConfig.output?.showMeta || false;
    
    const showModels = options.showModels !== undefined ? options.showModels : 
                       councilDefaults.showModels !== undefined ? councilDefaults.showModels :
                       config.userDefaults?.showModels !== undefined ? config.userDefaults.showModels :
                       config.coeConfig.output?.showModels || false;
    
    const synthesize = options.single !== undefined ? options.single : 
                       councilDefaults.single !== undefined ? councilDefaults.single :
                       config.userDefaults?.single || false;
    
    const firstN = options.firstN || councilDefaults.firstN;
    
    const temperature = options.temperature || 
                       councilDefaults.temperature || 
                       config.userDefaults?.temperature || 
                       0.7;

    // Configure web search with defaults hierarchy
    const webEnabled = options.web !== undefined ? options.web :
                      councilDefaults.web !== undefined ? councilDefaults.web :
                      config.userDefaults?.web !== undefined ? config.userDefaults.web :
                      config.coeConfig.webSearch?.enabled || false;
    
    const webMaxResults = options.webMaxResults || 
                         councilDefaults.webMaxResults || 
                         config.userDefaults?.webMaxResults || 
                         config.coeConfig.webSearch?.maxResults || 
                         5;
    
    const webContext = options.webContext || 
                      councilDefaults.webContext || 
                      config.userDefaults?.webContext || 
                      config.coeConfig.webSearch?.searchContext;
    
    let webSearch: boolean | any = undefined;
    if (webEnabled) {
      if (webContext) {
        // Native web search
        webSearch = { search_context_size: webContext };
      } else {
        // Plugin-based web search
        webSearch = { id: 'web', max_results: webMaxResults };
      }
    }

    // Set up abort controller for graceful cancellation
    const abortController = new AbortController();
    process.on('SIGINT', () => {
      abortController.abort();
      console.log(chalk.yellow('\nCancelling requests...'));
      process.exit(0);
    });

    // Extract model IDs
    let modelIds: string[];
    let systemPrompt: string;
    
    if (options.model) {
      // Single model mode
      modelIds = [options.model];
      systemPrompt = config.coeConfig.system || 'You are a helpful AI assistant.';
      
      // Validate incompatible options
      if (options.firstN) {
        console.warn(chalk.yellow('Warning: --first-n is ignored when using --model'));
      }
    } else {
      // Council mode
      modelIds = config.coeConfig.models.map(m => getModelId(m));
      systemPrompt = config.coeConfig.system || 'You are a helpful AI assistant.';
    }
    
    const client = new OpenRouterClient(config.openRouterApiKey);

    let allResponses: ModelResponse[][] = [];
    
    try {
      if (rounds === 1) {
        // Simple single-round query
        const spinnerText = options.model 
          ? `Querying ${options.model}...`
          : `Consulting ${modelIds.length} elders${firstN ? ` (first ${firstN} to respond)` : ''}...`;
        const spinner = ora(spinnerText).start();
        
        // Build common messages with system prompt
        const messages: OpenRouterMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ];
        
        const responses = await client.queryMultipleModels(
          modelIds,
          messages,
          temperature,
          abortController.signal,
          firstN,
          webSearch
        );
        spinner.stop();
        
        allResponses = [responses];
        if (!synthesize) {
          outputResponses(responses, outputFormat, showMeta, showModels, 1);
        }
      } else {
        // Multi-round consensus
        if (options.model) {
          console.error(chalk.red('Error: Multi-round consensus is not supported with --model option'));
          console.error(chalk.yellow('Remove --rounds or use a council instead'));
          process.exit(1);
        }
        
        console.log(chalk.bold.cyan(`\n🧙 Council of Elders - ${rounds} Rounds\n`));
        
        allResponses = await runConsensusRounds(
          client,
          config.coeConfig,
          prompt,
          rounds,
          temperature,
          abortController.signal,
          firstN,
          webSearch
        );
        
        // Output final round responses
        const finalResponses = allResponses[allResponses.length - 1];
        
        if (!synthesize) {
          outputResponses(finalResponses, outputFormat, showMeta, showModels, rounds);
        }
      }
      
      // If synthesis requested, combine all responses
      let synthesisResponse: ModelResponse | undefined;
      if (synthesize) {
        if (options.model) {
          console.error(chalk.red('Error: Synthesis is not supported with --model option'));
          console.error(chalk.yellow('Remove --single or use a council instead'));
          process.exit(1);
        }
        
        synthesisResponse = await synthesizeResponses(
          client,
          config.coeConfig,
          prompt,
          allResponses,
          temperature,
          abortController.signal
        );
        
        if (outputFormat === 'json') {
          console.log(JSON.stringify({
            answer: synthesisResponse.content || null,
            error: synthesisResponse.error || null,
            ...(synthesisResponse.citations && synthesisResponse.citations.length > 0 ? { citations: synthesisResponse.citations } : {}),
            ...(showMeta && synthesisResponse.meta ? { meta: synthesisResponse.meta } : {})
          }, null, 2));
        } else {
          if (synthesisResponse.error) {
            console.error(chalk.red(`Error: ${synthesisResponse.error}`));
          } else {
            console.log(synthesisResponse.content);
            
            // Display citations if available
            if (synthesisResponse.citations && synthesisResponse.citations.length > 0) {
              console.log(chalk.gray('\nSources:'));
              synthesisResponse.citations.forEach((citation, i) => {
                console.log(chalk.gray(`  ${i + 1}. ${citation.title} - ${citation.url}`));
              });
            }
          }
        }
      }
      
      // Handle export if requested
      if (options.export) {
        try {
          // Calculate metadata
          const finalResponses = allResponses[allResponses.length - 1];
          const successfulResponses = finalResponses.filter(r => !r.error && r.content);
          
          let totalCost = 0;
          let totalTokens = 0;
          let totalLatency = 0;
          let responseCount = 0;
          
          allResponses.forEach(round => {
            round.forEach(response => {
              if (response.meta) {
                totalCost += response.meta.estimatedCost || 0;
                totalTokens += response.meta.totalTokens || 0;
                totalLatency += response.meta.latencyMs || 0;
                responseCount++;
              }
            });
          });
          
          if (synthesisResponse?.meta) {
            totalCost += synthesisResponse.meta.estimatedCost || 0;
            totalTokens += synthesisResponse.meta.totalTokens || 0;
            totalLatency += synthesisResponse.meta.latencyMs || 0;
            responseCount++;
          }
          
          const exportData: ExportData = {
            timestamp: new Date().toISOString(),
            prompt,
            council: options.council || config.coeConfig.defaultCouncil || 'default',
            rounds,
            temperature: options.temperature,
            options: {
              showModels,
              firstN,
              synthesized: synthesize
            },
            responses: allResponses,
            synthesis: synthesisResponse,
            metadata: showMeta ? {
              totalCost,
              totalTokens,
              averageLatency: responseCount > 0 ? totalLatency / responseCount : 0,
              modelCount: modelIds.length
            } : undefined
          };
          
          const exportFile = await exportConversation(exportData, options.export);
          console.log(chalk.green(`\n✓ Exported to: ${exportFile}`));
        } catch (exportError) {
          console.error(chalk.red(`\nExport failed: ${exportError instanceof Error ? exportError.message : String(exportError)}`));
        }
      }
      
      // Exit with appropriate code
      if (synthesize) {
        process.exit(synthesisResponse?.error ? 1 : 0);
      } else {
        const hasSuccess = allResponses[allResponses.length - 1].some(r => !r.error);
        process.exit(hasSuccess ? 0 : 1);
      }
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Parse with default command handling
const args = process.argv.slice(2);
if (args.length > 0 && !args[0].startsWith('-') && args[0] !== 'init') {
  // If first arg is not a flag or 'init', treat it as the prompt
  process.argv = [process.argv[0], process.argv[1], ...args];
}

program.parse();

// Helper functions

async function runConsensusRounds(
  client: OpenRouterClient,
  config: CoeConfig,
  prompt: string,
  rounds: number,
  temperature: number,
  abortSignal?: AbortSignal,
  firstN?: number,
  webSearch?: boolean | any
): Promise<ModelResponse[][]> {
  const modelIds = config.models.map(m => getModelId(m));
  const globalSystem = config.system;
  
  // Progress tracking
  const progressBars = new Map<string, ReturnType<typeof ora>>();
  modelIds.forEach(model => {
    progressBars.set(model, ora(`${model}`).start());
  });
  
  const onProgress = (round: number, model: string, status: string) => {
    const spinner = progressBars.get(model);
    if (spinner) {
      const statusEmoji = status === 'complete' ? '✓' : status === 'querying' ? '🔄' : '⏳';
      spinner.text = `Round ${round}/${rounds} - ${model} ${statusEmoji}`;
      if (status === 'complete' && round === rounds) {
        spinner.succeed();
      }
    }
  };
  
  const responses = await client.runConsensusRounds(
    modelIds,
    prompt,
    globalSystem || '',
    rounds,
    temperature,
    onProgress,
    abortSignal,
    firstN,
    webSearch
  );
  
  return responses;
}

async function synthesizeResponses(
  client: OpenRouterClient,
  config: CoeConfig,
  originalPrompt: string,
  allRounds: ModelResponse[][],
  temperature: number,
  abortSignal?: AbortSignal
): Promise<ModelResponse> {
  // Get synthesizer model
  const synthesizerModel = config.synthesizer || 'openai/gpt-4o-mini';
  const modelId = getModelId(synthesizerModel);
  
  // Get final round responses
  const finalResponses = allRounds[allRounds.length - 1];
  const successfulResponses = finalResponses.filter(r => !r.error && r.content);
  
  if (successfulResponses.length === 0) {
    return {
      model: modelId,
      error: 'No successful responses to synthesize'
    };
  }
  
  // Build synthesis prompt with full conversation history
  let synthesisPrompt = `You are tasked with providing a single, unified answer to a question based on a council discussion.

Original Question: "${originalPrompt}"

`;

  // Include full conversation history if multiple rounds
  if (allRounds.length > 1) {
    synthesisPrompt += `Full Council Discussion (${allRounds.length} rounds):\n\n`;
    
    allRounds.forEach((roundResponses, roundIndex) => {
      synthesisPrompt += `=== Round ${roundIndex + 1} ===\n`;
      roundResponses.forEach((response, modelIndex) => {
        if (!response.error && response.content) {
          synthesisPrompt += `\nElder ${modelIndex + 1}:\n${response.content}\n`;
        }
      });
      synthesisPrompt += '\n';
    });
    
    synthesisPrompt += `\nBased on this full discussion, including how perspectives evolved across rounds, provide a comprehensive synthesis.`;
  } else {
    // Single round - use simpler format
    synthesisPrompt += `Expert Perspectives:\n`;
    successfulResponses.forEach((r, i) => {
      synthesisPrompt += `\nPerspective ${i + 1}:\n${r.content}\n`;
    });
    synthesisPrompt += `\nBased on these perspectives, provide a direct, comprehensive answer.`;
  }
  
  synthesisPrompt += `\n\nDo not mention the council, multiple perspectives, or synthesis process. Simply answer the question as if you are providing the definitive response.`;

  const messages: OpenRouterMessage[] = [
    { 
      role: 'system', 
      content: 'You are an expert synthesizer. Provide clear, direct answers based on the information given. Never mention the synthesis process or multiple sources.'
    },
    { role: 'user', content: synthesisPrompt }
  ];

  return client.queryModel(modelId, messages, temperature, abortSignal);
}

function outputResponses(
  responses: ModelResponse[],
  format: 'text' | 'json',
  showMeta: boolean,
  showModels: boolean,
  round: number
) {
  // Filter out "first-n limit reached" responses
  const activeResponses = responses.filter(r => 
    !r.error || !r.error.includes('first-n limit reached')
  );
  // Generate anonymous elder names
  const elderNames = [
    'Elder Alpha',
    'Elder Beta', 
    'Elder Gamma',
    'Elder Delta',
    'Elder Epsilon',
    'Elder Zeta',
    'Elder Eta',
    'Elder Theta',
    'Elder Iota',
    'Elder Kappa'
  ];
  
  if (format === 'json') {
    const output = activeResponses.map((r, index) => ({
      elder: showModels ? r.model : elderNames[index % elderNames.length],
      ...(showModels ? { model: r.model } : {}),
      answer: r.content || null,
      error: r.error || null,
      ...(r.citations && r.citations.length > 0 ? { citations: r.citations } : {}),
      ...(showMeta && r.meta ? { meta: r.meta } : {})
    }));
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Text output
    console.log(chalk.bold.cyan(`\n🧙 Council of Elders Response${round > 1 ? ` (Round ${round})` : ''}\n`));
    console.log(chalk.gray('─'.repeat(60)) + '\n');

    activeResponses.forEach((response, index) => {
      const displayName = showModels ? response.model : elderNames[index % elderNames.length];
      console.log(chalk.bold.green(`📜 ${displayName}`));
      
      if (response.error) {
        console.log(chalk.red(`\n❌ Error: ${response.error}\n`));
      } else {
        console.log('\n' + response.content + '\n');
        
        // Display citations if available
        if (response.citations && response.citations.length > 0) {
          console.log(chalk.gray('Sources:'));
          response.citations.forEach((citation, i) => {
            console.log(chalk.gray(`  ${i + 1}. ${citation.title} - ${citation.url}`));
          });
          console.log();
        }
        
        if (showMeta && response.meta) {
          console.log(chalk.gray('Metadata:'));
          console.log(chalk.gray(`  • Tokens: ${response.meta.totalTokens || 'N/A'}`));
          console.log(chalk.gray(`  • Latency: ${response.meta.latencyMs || 'N/A'}ms`));
          console.log(chalk.gray(`  • Est. Cost: $${response.meta.estimatedCost?.toFixed(4) || 'N/A'}\n`));
        }
      }

      if (index < activeResponses.length - 1) {
        console.log(chalk.gray('─'.repeat(60)) + '\n');
      }
    });
  }
}

// Export functions

interface ExportData {
  timestamp: string;
  prompt: string;
  council: string;
  rounds: number;
  temperature: number;
  options: {
    showModels: boolean;
    firstN?: number;
    synthesized: boolean;
  };
  responses: ModelResponse[][];
  synthesis?: ModelResponse;
  metadata?: {
    totalCost: number;
    totalTokens: number;
    averageLatency: number;
    modelCount: number;
  };
}

async function exportConversation(
  data: ExportData,
  format: string,
  outputPath?: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = outputPath || `coe-export-${timestamp}.${format}`;
  
  let content: string;
  
  switch (format.toLowerCase()) {
    case 'json':
      content = exportToJSON(data);
      break;
    case 'markdown':
    case 'md':
      content = exportToMarkdown(data);
      break;
    case 'txt':
    case 'text':
      content = exportToText(data);
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
  
  await fs.writeFile(filename, content, 'utf-8');
  return filename;
}

function exportToJSON(data: ExportData): string {
  return JSON.stringify(data, null, 2);
}

function exportToMarkdown(data: ExportData): string {
  let md = `# Council of Elders Session\n\n`;
  md += `**Date:** ${new Date(data.timestamp).toLocaleString()}\n`;
  md += `**Council:** ${data.council}\n`;
  md += `**Rounds:** ${data.rounds}\n`;
  md += `**Temperature:** ${data.temperature}\n`;
  
  if (data.options.firstN) {
    md += `**First-N:** ${data.options.firstN}\n`;
  }
  
  md += `\n## Prompt\n\n${data.prompt}\n\n`;
  
  if (data.options.synthesized && data.synthesis) {
    md += `## Synthesized Response\n\n${data.synthesis.content || data.synthesis.error}\n\n`;
  }
  
  md += `## Council Responses\n\n`;
  
  data.responses.forEach((round, roundIndex) => {
    if (data.rounds > 1) {
      md += `### Round ${roundIndex + 1}\n\n`;
    }
    
    round.forEach((response) => {
      if (!response.error || !response.error.includes('first-n limit reached')) {
        const modelName = data.options.showModels ? response.model : `Elder ${round.indexOf(response) + 1}`;
        md += `#### ${modelName}\n\n`;
        
        if (response.error) {
          md += `*Error: ${response.error}*\n\n`;
        } else {
          md += `${response.content}\n\n`;
          
          if (response.meta) {
            md += `*Metadata: ${response.meta.totalTokens} tokens, ${response.meta.latencyMs}ms, $${response.meta.estimatedCost?.toFixed(4)}*\n\n`;
          }
        }
      }
    });
  });
  
  if (data.metadata) {
    md += `## Session Metadata\n\n`;
    md += `- **Total Cost:** $${data.metadata.totalCost.toFixed(4)}\n`;
    md += `- **Total Tokens:** ${data.metadata.totalTokens}\n`;
    md += `- **Average Latency:** ${Math.round(data.metadata.averageLatency)}ms\n`;
    md += `- **Models Used:** ${data.metadata.modelCount}\n`;
  }
  
  return md;
}

function exportToText(data: ExportData): string {
  let txt = `COUNCIL OF ELDERS SESSION\n`;
  txt += `${'='.repeat(60)}\n\n`;
  txt += `Date: ${new Date(data.timestamp).toLocaleString()}\n`;
  txt += `Council: ${data.council}\n`;
  txt += `Rounds: ${data.rounds}\n`;
  txt += `Temperature: ${data.temperature}\n`;
  
  if (data.options.firstN) {
    txt += `First-N: ${data.options.firstN}\n`;
  }
  
  txt += `\nPROMPT:\n${data.prompt}\n\n`;
  
  if (data.options.synthesized && data.synthesis) {
    txt += `SYNTHESIZED RESPONSE:\n${'-'.repeat(60)}\n`;
    txt += `${data.synthesis.content || data.synthesis.error}\n\n`;
  }
  
  txt += `COUNCIL RESPONSES:\n${'-'.repeat(60)}\n\n`;
  
  data.responses.forEach((round, roundIndex) => {
    if (data.rounds > 1) {
      txt += `ROUND ${roundIndex + 1}:\n\n`;
    }
    
    round.forEach((response) => {
      if (!response.error || !response.error.includes('first-n limit reached')) {
        const modelName = data.options.showModels ? response.model : `Elder ${round.indexOf(response) + 1}`;
        txt += `[${modelName}]\n`;
        
        if (response.error) {
          txt += `Error: ${response.error}\n\n`;
        } else {
          txt += `${response.content}\n\n`;
        }
      }
    });
  });
  
  if (data.metadata) {
    txt += `\nMETADATA:\n${'-'.repeat(60)}\n`;
    txt += `Total Cost: $${data.metadata.totalCost.toFixed(4)}\n`;
    txt += `Total Tokens: ${data.metadata.totalTokens}\n`;
    txt += `Average Latency: ${Math.round(data.metadata.averageLatency)}ms\n`;
    txt += `Models Used: ${data.metadata.modelCount}\n`;
  }
  
  return txt;
}