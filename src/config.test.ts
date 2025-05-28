import { describe, it, expect } from 'vitest';
import { getModelId, getSystemPrompt, defaultSystemPrompt } from './config.js';

describe('Config utilities', () => {
  describe('getModelId', () => {
    it('should return string model as-is', () => {
      expect(getModelId('gpt-4')).toBe('gpt-4');
    });

    it('should extract model from object', () => {
      expect(getModelId({ model: 'claude-3', system: 'custom' })).toBe('claude-3');
    });
  });

  describe('getSystemPrompt', () => {
    it('should return default prompt for string model', () => {
      expect(getSystemPrompt('gpt-4')).toBe(defaultSystemPrompt);
    });

    it('should return global prompt for string model', () => {
      expect(getSystemPrompt('gpt-4', 'Global prompt')).toBe('Global prompt');
    });

    it('should return model-specific prompt', () => {
      expect(getSystemPrompt({ model: 'claude-3', system: 'Custom prompt' }, 'Global')).toBe('Custom prompt');
    });
  });
});