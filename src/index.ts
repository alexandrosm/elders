#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterClient, OpenRouterMessage } from './openrouter.js';
import { loadConfig, getModelId, defaultSystemPrompt } from './config.js';

async function main() {
  const config = await loadConfig();
  const openRouterClient = new OpenRouterClient(config.openRouterApiKey);

  const server = new Server(
    {
      name: 'council-of-elders',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: any[] = [
      {
        name: 'consult_elders',
        description: 'Consult the Council of Elders - queries multiple LLMs for their wisdom on a given topic',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The question or topic to ask the council',
            },
            models: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Optional list of specific models to query. If not provided, uses default models.',
            },
            systemPrompt: {
              type: 'string',
              description: 'Optional system prompt to provide context to all models',
            },
            temperature: {
              type: 'number',
              description: 'Temperature for responses (0-1). Default is 0.7',
              minimum: 0,
              maximum: 1,
            },
            rounds: {
              type: 'number',
              description: 'Number of consensus rounds (default: 1)',
              minimum: 1,
            },
          },
          required: ['query'],
        },
      },
    ];

    // Add tools for each configured council
    if (config.coeConfig.councils) {
      for (const [councilName, councilConfig] of Object.entries(config.coeConfig.councils)) {
        tools.push({
          name: `consult_${councilName}_council`,
          description: `Consult the ${councilName} council - ${councilConfig.system || 'queries specialized LLMs for their wisdom'}`,
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: `The question or topic to ask the ${councilName} council`,
              },
              systemPrompt: {
                type: 'string',
                description: 'Optional system prompt to override the council\'s default prompt',
              },
              temperature: {
                type: 'number',
                description: `Temperature for responses (0-1). Default is ${councilConfig.defaults?.temperature || 0.7}`,
                minimum: 0,
                maximum: 1,
              },
              rounds: {
                type: 'number',
                description: `Number of consensus rounds (default: ${councilConfig.rounds || 1})`,
                minimum: 1,
              },
            },
            required: ['query'],
          },
        });
      }
    }

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments as {
      query: string;
      models?: string[];
      systemPrompt?: string;
      temperature?: number;
      rounds?: number;
    };
    const query = args.query;
    let models: string[];
    let systemPrompt: string;
    let temperature: number;
    let rounds: number;

    // Handle council-specific tools
    let councilName: string | undefined;
    if (toolName.startsWith('consult_') && toolName.endsWith('_council')) {
      councilName = toolName.replace('consult_', '').replace('_council', '');
      
      if (!config.coeConfig.councils || !config.coeConfig.councils[councilName]) {
        throw new Error(`Unknown council: ${councilName}`);
      }
      
      const councilConfig = config.coeConfig.councils[councilName];
      models = councilConfig.models.map(m => getModelId(m));
      systemPrompt = args.systemPrompt || councilConfig.system || config.coeConfig.system || defaultSystemPrompt;
      temperature = args.temperature ?? councilConfig.defaults?.temperature ?? 0.7;
      rounds = args.rounds || councilConfig.rounds || 1;
    } else if (toolName === 'consult_elders') {
      // Handle the generic consult_elders tool
      models = args.models || config.coeConfig.models.map(m => getModelId(m));
      systemPrompt = args.systemPrompt || config.coeConfig.system || defaultSystemPrompt;
      temperature = args.temperature ?? 0.7;
      rounds = args.rounds || 1;
    } else {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    try {
      if (rounds === 1) {
        // Simple query
        const messages: OpenRouterMessage[] = [
          { role: 'system', content: systemPrompt || '' },
          { role: 'user', content: query }
        ];

        const responses = await openRouterClient.queryMultipleModels(
          models,
          messages,
          temperature
        );

        const formattedResponses = responses.map(resp => {
          if (resp.error) {
            return `## ${resp.model}\n\n**Error:** ${resp.error}\n`;
          }
          return `## ${resp.model}\n\n${resp.content}\n`;
        }).join('\n---\n\n');

        const title = councilName 
          ? `# ${councilName.charAt(0).toUpperCase() + councilName.slice(1)} Council Response`
          : '# Council of Elders Response';
        
        return {
          content: [
            {
              type: 'text',
              text: `${title}\n\n${formattedResponses}`,
            },
          ],
        };
      } else {
        // Multi-round consensus
        const allResponses = await openRouterClient.runConsensusRounds(
          models,
          query,
          systemPrompt || '',
          rounds,
          temperature
        );

        const finalResponses = allResponses[allResponses.length - 1];
        const formattedResponses = finalResponses.map(resp => {
          if (resp.error) {
            return `## ${resp.model}\n\n**Error:** ${resp.error}\n`;
          }
          return `## ${resp.model}\n\n${resp.content}\n`;
        }).join('\n---\n\n');

        const title = councilName 
          ? `# ${councilName.charAt(0).toUpperCase() + councilName.slice(1)} Council Response (Round ${rounds})`
          : `# Council of Elders Response (Round ${rounds})`;
        
        return {
          content: [
            {
              type: 'text',
              text: `${title}\n\n${formattedResponses}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error consulting the elders: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Council of Elders MCP server running...');
}

main().catch(console.error);