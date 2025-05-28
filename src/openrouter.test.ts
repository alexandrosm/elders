import { describe, it, expect, beforeAll } from 'vitest';
import { OpenRouterClient, ModelResponse } from './openrouter.js';
import { loadConfig } from './config.js';

describe('OpenRouterClient Integration Tests', () => {
  let client: OpenRouterClient;
  let apiKey: string;

  beforeAll(async () => {
    const config = await loadConfig();
    apiKey = config.openRouterApiKey || process.env.OPENROUTER_API_KEY || '';
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required for integration tests');
    }
    client = new OpenRouterClient(apiKey);
  });

  describe('queryModel', () => {
    it('should successfully query a single model', async () => {
      const response = await client.queryModel(
        'openai/gpt-3.5-turbo',
        [
          { role: 'system', content: 'You are a helpful assistant. Keep responses very brief.' },
          { role: 'user', content: 'Say "Hello, test!" and nothing else.' }
        ],
        0.1
      );

      expect(response.model).toBe('openai/gpt-3.5-turbo');
      expect(response.content).toBeDefined();
      expect(response.error).toBeUndefined();
      expect(response.content?.toLowerCase()).toContain('hello');
    }, 30000);

    it('should return metadata when available', async () => {
      const response = await client.queryModel(
        'openai/gpt-3.5-turbo',
        [
          { role: 'user', content: 'Count to 3' }
        ],
        0.1
      );

      expect(response.meta).toBeDefined();
      expect(response.meta?.promptTokens).toBeGreaterThan(0);
      expect(response.meta?.completionTokens).toBeGreaterThan(0);
      expect(response.meta?.totalTokens).toBeGreaterThan(0);
      expect(response.meta?.latencyMs).toBeGreaterThan(0);
      expect(response.meta?.estimatedCost).toBeGreaterThan(0);
    }, 30000);

    it('should handle invalid model gracefully', async () => {
      const response = await client.queryModel(
        'invalid-model-xyz',
        [{ role: 'user', content: 'test' }],
        0.7
      );

      expect(response.model).toBe('invalid-model-xyz');
      expect(response.error).toBeDefined();
      expect(response.content).toBeUndefined();
      expect(response.error).toContain('400');
    }, 30000);
  });

  describe('queryMultipleModels', () => {
    it('should query multiple models in parallel', async () => {
      const models = [
        'openai/gpt-3.5-turbo',
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.2-1b-instruct:free'
      ];

      const responses = await client.queryMultipleModels(
        models,
        [
          { role: 'system', content: 'Reply with just "OK" and nothing else' },
          { role: 'user', content: 'Confirm' }
        ],
        0.1
      );

      expect(responses).toHaveLength(3);
      
      // At least one should succeed
      const successfulResponses = responses.filter(r => !r.error);
      expect(successfulResponses.length).toBeGreaterThan(0);
      
      // Check structure
      responses.forEach(response => {
        expect(response.model).toBeDefined();
        expect(response).toHaveProperty('content');
        expect(response).toHaveProperty('error');
      });
    }, 60000);
  });

  describe('runConsensusRounds', () => {
    it('should run 2 consensus rounds successfully', async () => {
      const models = [
        'openai/gpt-3.5-turbo',
        'google/gemini-2.0-flash-exp:free'
      ];

      const rounds = await client.runConsensusRounds(
        models,
        'What is 2+2? Answer with just the number.',
        'You are a helpful math assistant. Be very brief.',
        2,
        0.1
      );

      expect(rounds).toHaveLength(2);
      
      // Round 1
      expect(rounds[0]).toHaveLength(2);
      const round1Success = rounds[0].filter(r => !r.error);
      expect(round1Success.length).toBeGreaterThan(0);
      
      // Round 2 
      expect(rounds[1]).toHaveLength(2);
      const round2Success = rounds[1].filter(r => !r.error);
      expect(round2Success.length).toBeGreaterThan(0);
      
      // Responses should contain "4"
      round1Success.forEach(response => {
        expect(response.content).toContain('4');
      });
    }, 90000);

    it('should pass peer responses in consensus rounds', async () => {
      const models = ['openai/gpt-3.5-turbo'];
      let progressCalls = 0;

      const rounds = await client.runConsensusRounds(
        models,
        'Say "apple"',
        'You are helpful. In round 2, if you see peer responses, say "banana" instead.',
        2,
        0.1,
        (round, model, status) => {
          progressCalls++;
          expect(round).toBeGreaterThanOrEqual(1);
          expect(round).toBeLessThanOrEqual(2);
          expect(model).toBe('openai/gpt-3.5-turbo');
          expect(['preparing', 'querying', 'complete']).toContain(status);
        }
      );

      expect(progressCalls).toBeGreaterThan(0);
      expect(rounds[0][0].content?.toLowerCase()).toContain('apple');
      // In round 2, it should see its own response and potentially change
      expect(rounds[1][0].content).toBeDefined();
    }, 60000);
  });

  describe('cost estimation', () => {
    it('should provide reasonable cost estimates', async () => {
      const response = await client.queryModel(
        'openai/gpt-4o-mini',
        [{ role: 'user', content: 'Hi' }],
        0.1
      );

      if (response.meta?.estimatedCost) {
        expect(response.meta.estimatedCost).toBeGreaterThan(0);
        expect(response.meta.estimatedCost).toBeLessThan(0.01); // Should be less than 1 cent for "Hi"
      }
    }, 30000);
  });
});