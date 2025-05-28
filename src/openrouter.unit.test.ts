import { describe, it, expect, vi } from 'vitest';
import { OpenRouterClient } from './openrouter.js';

// Unit tests that don't require actual API calls
describe('OpenRouterClient Unit Tests', () => {
  describe('constructor', () => {
    it('should create client with API key', () => {
      const client = new OpenRouterClient('test-api-key');
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(OpenRouterClient);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost for known models', () => {
      const client = new OpenRouterClient('test-key');
      
      // Access private method through any cast for testing
      const estimateCost = (client as any).estimateCost.bind(client);
      
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      };
      
      // Test known model
      const cost1 = estimateCost('grok-3', usage);
      expect(cost1).toBeCloseTo(0.0015, 4); // 150/1000 * 0.01
      
      // Test unknown model (should use default rate)
      const cost2 = estimateCost('unknown-model', usage);
      expect(cost2).toBeCloseTo(0.0003, 4); // 150/1000 * 0.002
    });
  });

  describe('buildConsensusPrompt', () => {
    it('should build proper consensus prompt', () => {
      const client = new OpenRouterClient('test-key');
      
      // Access private method through any cast for testing
      const buildConsensusPrompt = (client as any).buildConsensusPrompt.bind(client);
      
      const currentModel = 'gpt-4';
      const ownResponse = { model: 'gpt-4', content: 'My answer' };
      const allResponses = [
        { model: 'gpt-4', content: 'My answer' },
        { model: 'claude-3', content: 'Claude answer' },
        { model: 'gemini', content: 'Gemini answer' },
        { model: 'failed-model', error: 'Error occurred' }
      ];
      
      const prompt = buildConsensusPrompt(currentModel, ownResponse, allResponses);
      
      expect(prompt).toContain('Consider your peers');
      expect(prompt).toContain('**claude-3**');
      expect(prompt).toContain('Claude answer');
      expect(prompt).toContain('**gemini**');
      expect(prompt).toContain('Gemini answer');
      expect(prompt).not.toContain('gpt-4'); // Should not include own response
      expect(prompt).not.toContain('failed-model'); // Should not include errored models
      expect(prompt).toContain('revise or expand your answer');
    });
  });

  describe('error handling structure', () => {
    it('should return proper error response structure', async () => {
      // Mock fetch to simulate network error
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const client = new OpenRouterClient('test-key');
      const response = await client.queryModel(
        'test-model',
        [{ role: 'user', content: 'test' }],
        0.7
      );
      
      expect(response.model).toBe('test-model');
      expect(response.error).toBe('Network error');
      expect(response.content).toBeUndefined();
      expect(response.meta).toBeUndefined();
      
      // Restore original fetch
      global.fetch = originalFetch;
    });
  });

  describe('parallel execution', () => {
    it('should query multiple models in parallel', async () => {
      const originalFetch = global.fetch;
      let callCount = 0;
      const delays = [100, 200, 150]; // Different delays to test parallelism
      
      // Mock fetch with delays
      global.fetch = vi.fn().mockImplementation(async () => {
        const index = callCount++;
        const delay = delays[index];
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: `Response ${index + 1}` } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30
            }
          })
        };
      });
      
      const client = new OpenRouterClient('test-key');
      const startTime = Date.now();
      
      const responses = await client.queryMultipleModels(
        ['model1', 'model2', 'model3'],
        [{ role: 'user', content: 'test' }],
        0.7
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(responses).toHaveLength(3);
      expect(callCount).toBe(3);
      
      // Should complete in roughly the time of the longest delay (200ms)
      // not the sum (450ms), proving parallel execution
      expect(duration).toBeLessThan(300);
      expect(duration).toBeGreaterThanOrEqual(150);
      
      // Restore original fetch
      global.fetch = originalFetch;
    });
  });
});