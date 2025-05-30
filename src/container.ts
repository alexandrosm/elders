import 'reflect-metadata';
import { container } from 'tsyringe';

import { IConfigService, ICouncilService } from './interfaces.js';
import { ConfigService } from './services/ConfigService.js';
import { CouncilService } from './services/CouncilService.js';

// Register services
container.registerSingleton<IConfigService>('IConfigService', ConfigService);
container.registerSingleton<ICouncilService>('ICouncilService', CouncilService);

export { container };
