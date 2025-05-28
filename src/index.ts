#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterClient, OpenRouterMessage } from './openrouter.js';
import { loadConfig, getModelId } from './config.js';

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
    return {
      tools: [
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
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'consult_elders') {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const args = request.params.arguments as {
      query: string;
      models?: string[];
      systemPrompt?: string;
      temperature?: number;
      rounds?: number;
    };
    const query = args.query;
    const models = args.models || config.coeConfig.models.map(m => getModelId(m));
    const systemPrompt = args.systemPrompt || config.coeConfig.system;
    const temperature = args.temperature ?? 0.7;
    const rounds = args.rounds || 1;

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

        return {
          content: [
            {
              type: 'text',
              text: `# Council of Elders Response\n\n${formattedResponses}`,
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

        return {
          content: [
            {
              type: 'text',
              text: `# Council of Elders Response (Round ${rounds})\n\n${formattedResponses}`,
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