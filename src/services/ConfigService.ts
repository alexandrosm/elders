import 'reflect-metadata';
import { injectable } from 'tsyringe';

import { ConfigLoader } from '../config/ConfigLoader.js';
import { Config } from '../config-schema.js';
import { IConfigService } from '../interfaces.js';
import { CouncilConfig } from '../types.js';

@injectable()
export class ConfigService implements IConfigService {
  private configLoader: ConfigLoader;
  private config: Config | null = null;

  constructor() {
    this.configLoader = new ConfigLoader();
  }

  async loadConfig(councilName?: string): Promise<CouncilConfig> {
    if (!this.config) {
      this.config = await this.configLoader.load();
    }

    const coeConfig = this.config.coeConfig;

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
    if (!this.config) {
      return '';
    }
    return this.config.openRouterApiKey || '';
  }

  getDefaultCouncil(): string {
    if (!this.config) {
      return 'default';
    }
    return this.config.coeConfig.defaultCouncil || 'default';
  }

  getAllCouncils(): string[] {
    if (!this.config) {
      return [];
    }
    return Object.keys(this.config.coeConfig.councils || {});
  }
}
