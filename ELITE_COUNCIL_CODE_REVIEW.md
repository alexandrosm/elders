# Elite Council Code Review Request

## Overview
The Council of Elders (COE) CLI has grown significantly and now exhibits several architectural issues that need addressing. I'm seeking the Elite Council's expertise to review the current implementation and provide specific, actionable recommendations for refactoring.

## Key Problem Areas

### 1. Monolithic CLI File (cli.ts - 978 lines)

The main CLI file has become unwieldy with mixed concerns:

#### Command Registration & Parsing
```typescript
// Lines 42-665: Multiple commands mixed with business logic
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

// Lines 103-294: Verify command with 200+ lines of validation logic
program
  .command('verify')
  .description('Verify configuration and model availability')
  .option('--fix', 'Suggest fixes for invalid models')
  .option('--council <name>', 'Verify a specific council')
  .option('-i, --interactive', 'Interactive mode to fix issues')
  .action(async (options: CliOptions) => {
    // 200+ lines of inline validation logic...
```

#### Main Query Logic (300+ lines)
```typescript
// Lines 314-661: Massive action handler for main command
.action(async (promptParts: string[], options: CliOptions) => {
    // File handling
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
      // ... continues for 300+ more lines
```

#### Helper Functions at Bottom
```typescript
// Lines 673-812: Helper functions that should be in separate modules
async function runConsensusRounds(
  client: CouncilClient,
  config: CoeConfig,
  prompt: string,
  rounds: number,
  temperature: number,
  abortSignal?: AbortSignal,
  firstN?: number,
  webSearch?: boolean | { search_context_size?: string; id?: string; max_results?: number }
): Promise<ModelResponse[][]> {
  // Complex consensus logic mixed with UI concerns
  const progressBars = new Map<string, ReturnType<typeof ora>>();
  modelIds.forEach((model) => {
    progressBars.set(model, ora(`${model}`).start());
  });
```

### 2. Large Council Client (council-client.ts - 508 lines)

The council client has multiple responsibilities:

#### HTTP Client Logic
```typescript
// Lines 65-78: Constructor with OpenRouter setup
export class CouncilClient {
  private openrouter: ReturnType<typeof createOpenRouter>;
  private apiKey: string;

  constructor(options: CouncilClientOptions) {
    this.apiKey = options.apiKey;
    this.openrouter = createOpenRouter({
      apiKey: options.apiKey,
      headers: {
        'HTTP-Referer': options.referer || 'https://github.com/council-of-elders',
        'X-Title': options.title || 'Council of Elders',
      },
    });
  }
```

#### Complex Query Methods
```typescript
// Lines 155-233: First-N response handling with complex Promise logic
private async getFirstNResponses(
  promises: Promise<ModelResponse>[],
  modelIds: string[],
  n: number
): Promise<ModelResponse[]> {
  const results: ModelResponse[] = [];
  const completed = new Set<number>();

  return new Promise((resolve) => {
    promises.forEach((promise, index) => {
      promise
        .then((response) => {
          if (completed.size < n) {
            completed.add(index);
            results.push(response);

            if (completed.size === n) {
              // Create full result array maintaining order
              const allResults: ModelResponse[] = [];
              for (let i = 0; i < modelIds.length; i++) {
                if (completed.has(i)) {
                  const result = results.find((r) => r.model === modelIds[i]);
                  if (result) allResults.push(result);
                } else {
                  allResults.push({
                    model: modelIds[i],
                    error: 'Response not needed (first-n limit reached)',
                  });
                }
              }
              resolve(allResults);
            }
          }
        })
```

#### Cost Calculation Logic
```typescript
// Lines 334-356: Hardcoded pricing logic that should be externalized
private estimateCost(
  model: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
): number {
  // Rough estimates - should be updated based on OpenRouter's pricing
  const costPer1kTokens: Record<string, number> = {
    'gpt-4o': 0.005,
    'gpt-4o-mini': 0.0002,
    'claude-3.5-sonnet': 0.003,
    'claude-3-haiku': 0.00025,
    'perplexity/sonar-pro': 0.003,
    'perplexity/sonar': 0.001,
    'deepseek/deepseek-r1': 0.001,
    'google/gemini-2.0-flash-exp:free': 0,
  };

  const baseCost = 0.002; // Default cost per 1k tokens
  const modelKey = Object.keys(costPer1kTokens).find((key) => model.includes(key));
  const rate = modelKey ? costPer1kTokens[modelKey] : baseCost;

  return (usage.totalTokens / 1000) * rate;
}
```

### 3. Complex Configuration Management

Multiple config files with overlapping concerns:

#### config.ts
```typescript
// Lines 37-55: Multiple config loading strategies
async function loadUserDefaults(): Promise<UserDefaults | undefined> {
  try {
    // Try .coerc in current directory first
    const localRcPath = path.join(process.cwd(), '.coerc');
    try {
      const content = await fs.readFile(localRcPath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      return UserDefaultsSchema.parse(parsed);
    } catch {
      // Try home directory
      const homeRcPath = path.join(homedir(), '.coerc');
      const content = await fs.readFile(homeRcPath, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      return UserDefaultsSchema.parse(parsed);
    }
  } catch {
    return undefined;
  }
}
```

#### config-schema.ts with nested schemas
```typescript
// Lines 50-77: Complex nested council configuration
export const CouncilConfigSchema = z.object({
  models: z.array(ModelConfigSchema).min(1),
  system: z.string().optional(),
  synthesizer: ModelConfigSchema.optional(),
  output: OutputConfigSchema.optional(),
  rounds: z.number().min(1).max(10).default(1),
  defaults: CouncilDefaultsSchema,
  webSearch: WebSearchConfigSchema,
});

export const CoeConfigSchema = CouncilConfigSchema.extend({
  councils: z.record(z.string(), CouncilConfigSchema).optional(),
  defaultCouncil: z.string().optional(),
}).refine(
  (data) => {
    // If councils are defined and defaultCouncil is set, it must exist
    if (data.councils && data.defaultCouncil) {
      return data.defaultCouncil in data.councils;
    }
    return true;
  },
  {
    message: 'defaultCouncil must reference an existing council',
  }
);
```

### 4. Mixed UI/Business Logic in Init Wizard

The init wizard mixes UI prompts with business logic:

```typescript
// Lines 121-157: API key testing mixed with UI
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
```

### 5. Response Building Complexity

The ResponseBuilder has mixed concerns:

```typescript
// Lines 39-70: Complex formatting logic
buildSingle(response: ModelResponse, index: number = 0): string {
  const { showModels, showMeta, elderNames } = this.options;
  const displayName = showModels ? response.model : elderNames![index % elderNames!.length];

  let output = chalk.bold.green(`📜 ${displayName}\n`);

  if (response.error) {
    output += chalk.red(`\n❌ Error: ${response.error}\n`);
  } else {
    output += `\n${response.content}\n`;

    // Citations
    if (response.citations && response.citations.length > 0) {
      output += chalk.gray('\nSources:\n');
      response.citations.forEach((citation, i) => {
        output += chalk.gray(`  ${i + 1}. ${citation.title} - ${citation.url}\n`);
      });
    }

    // Metadata
    if (showMeta && response.meta) {
      output += chalk.gray('\nMetadata:\n');
      output += chalk.gray(`  • Tokens: ${response.meta.totalTokens || 'N/A'}\n`);
      output += chalk.gray(`  • Latency: ${response.meta.latencyMs || 'N/A'}ms\n`);
      output += chalk.gray(
        `  • Est. Cost: $${response.meta.estimatedCost?.toFixed(4) || 'N/A'}\n`
      );
    }
  }

  return output;
}
```

## Export Functions (Lines 837-977 in cli.ts)

Three large export functions embedded in the CLI:

```typescript
async function exportConversation(
  data: ExportData,
  format: string,
  outputPath?: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = outputPath || `coe-export-${timestamp}.${format}`;

  let content = '';

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

function exportToMarkdown(data: ExportData): string {
  let md = `# Council of Elders Session\n\n`;
  md += `**Date:** ${new Date(data.timestamp).toLocaleString()}\n`;
  // ... 50+ more lines of string concatenation
```

## Specific Questions for the Elite Council

1. **Architecture Pattern**: What's the best pattern to separate the CLI layer from business logic? Should we use a command pattern, mediator, or something else?

2. **Service Layer Design**: How should we structure the service layer? Should we have separate services for:
   - Model querying
   - Consensus building
   - Configuration management
   - Export functionality

3. **Dependency Injection**: The current code has hardcoded dependencies. Should we implement a DI container or use a simpler approach?

4. **Error Handling**: Currently using try-catch blocks throughout. What's a better pattern for consistent error handling across layers?

5. **Testing Strategy**: With the current monolithic structure, testing is difficult. How should we refactor to make the code more testable?

6. **Configuration Management**: We have config files, environment variables, and user defaults. How can we simplify this?

7. **Async Operations**: We have complex Promise handling (especially in firstN responses). Is there a cleaner pattern?

8. **Type Safety**: We're using Zod for validation but still have lots of type assertions. How can we improve type flow?

## Current File Structure
```
src/
├── cli.ts (978 lines) - Main CLI with all commands
├── council-client.ts (508 lines) - API client with business logic
├── init-wizard-enhanced.ts (361 lines) - Setup wizard
├── config.ts (155 lines) - Configuration loading
├── config-schema.ts (109 lines) - Zod schemas
├── response-builder.ts (166 lines) - Output formatting
├── utils.ts (112 lines) - Utility functions
└── types.ts - TypeScript types
```

## Desired Outcome

I'm looking for specific architectural recommendations with code examples showing how to:
1. Separate concerns properly
2. Make the code more testable
3. Reduce coupling between components
4. Improve maintainability
5. Follow SOLID principles

Please provide concrete examples of how to refactor the problematic areas shown above.