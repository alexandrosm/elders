import 'reflect-metadata';
import { injectable } from 'tsyringe';

import { loadConfig as loadConfigOriginal, CoeConfig } from '../config.js';
import { IConfigService } from '../interfaces.js';
import { CouncilConfig } from '../types.js';

@injectable()
export class ConfigService implements IConfigService {
  private config: CoeConfig | null = null;
  private apiKey: string | null = null;

  async loadConfig(councilName?: string): Promise<CouncilConfig> {
    const { coeConfig, openRouterApiKey } = await loadConfigOriginal(councilName);
    this.config = coeConfig;
    this.apiKey = openRouterApiKey;

    if (councilName && coeConfig.councils?.[councilName]) {
      return {
        ...coeConfig.councils[councilName],
        defaults: {
          ...coeConfig.councils[councilName].defaults,
        },
      };
    }

    // Return default council config
    const defaultCouncilName = this.getDefaultCouncil();
    if (defaultCouncilName && coeConfig.councils?.[defaultCouncilName]) {
      return {
        ...coeConfig.councils[defaultCouncilName],
        defaults: {
          ...coeConfig.councils[defaultCouncilName].defaults,
        },
      };
    }

    // Fallback to root config
    return {
      models: coeConfig.models || [],
      system: coeConfig.system,
      synthesizer: coeConfig.synthesizer,
      rounds: coeConfig.rounds || 1,
      defaults: {},
    };
  }

  getApiKey(): string {
    if (!this.apiKey) {
      throw new Error('API key not loaded. Call loadConfig first.');
    }
    return this.apiKey;
  }

  getDefaultCouncil(): string {
    if (!this.config) {
      throw new Error('Config not loaded. Call loadConfig first.');
    }
    return this.config.defaultCouncil || 'default';
  }

  getAllCouncils(): string[] {
    if (!this.config) {
      throw new Error('Config not loaded. Call loadConfig first.');
    }
    return Object.keys(this.config.councils || {});
  }
}
