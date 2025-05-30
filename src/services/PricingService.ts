import 'reflect-metadata';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { injectable } from 'tsyringe';

import { IPricingService } from '../interfaces.js';

interface PricingConfig {
  defaultRate: number;
  models: Record<string, number>;
  patterns: Record<string, number>;
}

@injectable()
export class PricingService implements IPricingService {
  private pricing: PricingConfig | null = null;

  async loadPricing(): Promise<void> {
    if (this.pricing) return;

    try {
      // Try to load user-provided pricing first
      const userPricingPath = path.join(process.cwd(), 'pricing.json');
      const content = await fs.readFile(userPricingPath, 'utf-8');
      this.pricing = JSON.parse(content);
    } catch {
      // Fall back to default pricing
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const defaultPricingPath = path.join(__dirname, '../config/pricing.json');

      try {
        const content = await fs.readFile(defaultPricingPath, 'utf-8');
        this.pricing = JSON.parse(content);
      } catch {
        // If all else fails, use minimal defaults
        this.pricing = {
          defaultRate: 0.002,
          models: {},
          patterns: {
            free: 0,
            turbo: 0.0005,
            mini: 0.0002,
          },
        };
      }
    }
  }

  calculate(modelId: string, usage: { totalTokens: number }): number {
    if (!this.pricing) {
      // Use sync loading if not loaded
      this.loadPricingSync();
    }

    const rate = this.findRate(modelId);
    return (usage.totalTokens / 1000) * rate;
  }

  private findRate(modelId: string): number {
    if (!this.pricing) {
      return 0.002; // Default fallback
    }

    const modelLower = modelId.toLowerCase();

    // Check exact model matches first
    for (const [model, rate] of Object.entries(this.pricing.models)) {
      if (modelLower.includes(model)) {
        return rate;
      }
    }

    // Check patterns
    for (const [pattern, rate] of Object.entries(this.pricing.patterns)) {
      if (modelLower.includes(pattern)) {
        return rate;
      }
    }

    return this.pricing.defaultRate;
  }

  private loadPricingSync(): void {
    if (this.pricing) return;

    try {
      // Try to load user-provided pricing first
      const userPricingPath = path.join(process.cwd(), 'pricing.json');
      const content = require('fs').readFileSync(userPricingPath, 'utf-8');
      this.pricing = JSON.parse(content);
    } catch {
      // Fall back to default pricing
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const defaultPricingPath = path.join(__dirname, '../config/pricing.json');

      try {
        const content = require('fs').readFileSync(defaultPricingPath, 'utf-8');
        this.pricing = JSON.parse(content);
      } catch {
        // If all else fails, use minimal defaults
        this.pricing = {
          defaultRate: 0.002,
          models: {},
          patterns: {
            free: 0,
            turbo: 0.0005,
            mini: 0.0002,
          },
        };
      }
    }
  }

  getPricingInfo(): PricingConfig | null {
    if (!this.pricing) {
      this.loadPricingSync();
    }
    return this.pricing;
  }
}
