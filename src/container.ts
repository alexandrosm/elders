import 'reflect-metadata';
import { container } from 'tsyringe';

import { CouncilsCommand } from './cli/commands/CouncilsCommand.js';
import { InitCommand } from './cli/commands/InitCommand.js';
import { ModelsCommand } from './cli/commands/ModelsCommand.js';
import { QueryCommand } from './cli/commands/QueryCommand.js';
import { VerifyCommand } from './cli/commands/VerifyCommand.js';
import { JsonExporter } from './infrastructure/exporters/JsonExporter.js';
import { MarkdownExporter } from './infrastructure/exporters/MarkdownExporter.js';
import { TextExporter } from './infrastructure/exporters/TextExporter.js';
import { IConfigService, ICouncilService, IExporter, IPricingService } from './interfaces.js';
import { ConfigService } from './services/ConfigService.js';
import { CouncilService } from './services/CouncilService.js';
import { ExportService } from './services/ExportService.js';
import { PricingService } from './services/PricingService.js';

// Commands

// Exporters

// Register services
container.registerSingleton<IConfigService>('IConfigService', ConfigService);
container.registerSingleton<ICouncilService>('ICouncilService', CouncilService);
container.registerSingleton<IPricingService>('IPricingService', PricingService);
container.registerSingleton(ExportService);

// Register exporters
container.register<IExporter>('MarkdownExporter', { useClass: MarkdownExporter });
container.register<IExporter>('JsonExporter', { useClass: JsonExporter });
container.register<IExporter>('TextExporter', { useClass: TextExporter });

// Register commands
container.register(QueryCommand, { useClass: QueryCommand });
container.register(InitCommand, { useClass: InitCommand });
container.register(CouncilsCommand, { useClass: CouncilsCommand });
container.register(ModelsCommand, { useClass: ModelsCommand });
container.register(VerifyCommand, { useClass: VerifyCommand });

// Register container for factory pattern
container.register('DependencyContainer', { useValue: container });

export { container };
