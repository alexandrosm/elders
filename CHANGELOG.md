# Changelog

All notable changes to Council of Elders (COE) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Time Limit Filtering**: New `--time-limit <seconds>` parameter
  - Automatically filters out models that respond slower than the specified limit
  - Works with both single model queries (`--model`) and council queries
  - In multi-round consensus, models are filtered per round
  - Shows which models were filtered out for exceeding the time limit
  - Configurable via CLI flag, council defaults, or user defaults (.coerc)
  - Accepts values from 0.1 to 300 seconds
  - Example: `coe "complex query" --time-limit 5` (only keeps models responding within 5 seconds)

## [0.3.0] - 2025-01-30

### Added
- **Dependency Injection**: Implemented TSyringe for IoC container
  - All services and commands are now injectable
  - Improved testability and reduced coupling
- **Command Pattern**: Extracted all CLI commands into separate classes
  - QueryCommand, InitCommand, CouncilsCommand, ModelsCommand, VerifyCommand
  - Each command is self-contained and testable
- **Service Layer**: Created dedicated services for business logic
  - CouncilService: Core querying and consensus logic
  - ConfigService: Configuration management
  - ExportService: Export functionality with strategy pattern
  - PricingService: Configurable model pricing
- **Cosmiconfig Integration**: Flexible configuration loading
  - Supports multiple file formats (.coerc, .coerc.json, .coerc.yaml, etc.)
  - Searches in standard locations (package.json, config directories)
  - Backward compatible with existing coe.config.json
- **Export Strategy Pattern**: Modular export system
  - BaseExporter abstract class for consistent behavior
  - Separate exporters for Markdown, JSON, and Text formats
  - Easy to add new export formats
- **External Pricing Configuration**: Pricing data extracted to configuration
  - Customizable model pricing via pricing.json
  - Pattern-based pricing (e.g., "turbo", "pro", "free")
  - Fallback to sensible defaults

### Changed
- **Massive CLI Refactoring**: cli.ts reduced from 987 to 84 lines (91% reduction!)
  - Improved separation of concerns
  - Each module has single responsibility
  - Following SOLID principles throughout
- **Improved Configuration Architecture**
  - ConfigLoader handles all configuration discovery
  - ConfigService provides clean interface for config access
  - Better error handling for missing configurations
- **Enhanced Code Organization**
  - Commands in `src/cli/commands/`
  - Services in `src/services/`
  - Infrastructure in `src/infrastructure/`
  - Clear module boundaries

### Fixed
- Test failures due to missing API key validation
- Lazy loading of services to fix --version and --help commands
- Better error messages for missing configuration

### Technical Improvements
- TypeScript decorators enabled for dependency injection
- Consistent use of interfaces for all services
- Reduced coupling between components
- ~35% reduction in overall codebase complexity
- Better separation between business logic and CLI concerns

## [0.2.1] - 2025-01-29

### Added
- **Zod Schema Validation**: Replaced manual validation with Zod schemas
  - Comprehensive validation for all configuration options
  - Better error messages with specific validation failures
  - Type-safe configuration handling
- **Enhanced CLI Experience**: Integrated Enquirer for better prompts
  - Improved user interaction in init wizard
  - Better visual feedback during operations
- **Utility Functions**: Added lodash-es for common operations
  - Improved code efficiency
  - Reduced custom utility code

### Changed
- **Code Cleanup**: Removed legacy code
  - Deleted deprecated openrouter.ts (492 lines)
  - Removed old init-wizard.ts and init-wizard-new.ts (559 lines)
  - 30% reduction in codebase size (1,117 lines removed)
- **Test Configuration**: Tests now use environment variables
  - No hardcoded API keys in tests
  - Tests skip when OPENROUTER_API_KEY not present
  - Safer CI/CD pipeline

### Fixed
- Fixed 197 ESLint errors
- Resolved all TypeScript strict mode warnings
- Fixed test version expectations

### Technical Improvements
- Implemented Prettier for consistent code formatting
- Added husky for pre-commit hooks
- Improved type safety throughout
- Better error handling in configuration loading

## [0.2.0] - 2025-01-29

### Added
- **Single Model Queries**: New `--model` parameter to query individual models directly
  - Example: `coe --model gpt-4o "Explain quantum computing"`
  - Perfect for quick queries when you don't need a full council
- **Council-Specific MCP Endpoints**: Each configured council now has its own MCP tool endpoint
  - Dynamic endpoint generation: `consult_research_council`, `consult_fast_council`, etc.
  - Maintains backward compatibility with the generic `consult_elders` endpoint
- **Enhanced CLI Help**: Added usage examples to the main help text with clear documentation

### Changed
- Improved validation for option combinations:
  - `--model` cannot be used with `--rounds > 1` (multi-round consensus)
  - `--model` cannot be used with `--single` (synthesis)
  - `--first-n` is ignored with a warning when using `--model`

### Technical Details
- Maintains full backward compatibility
- Clean separation between single model and council modes
- Dynamic MCP tool generation based on configuration

## [0.1.0] - 2025-01-29

### Initial Release
- **Core Features**:
  - Query multiple LLMs simultaneously through OpenRouter
  - Council-based organization of models
  - Multi-round consensus capabilities
  - Synthesis of responses into unified answers
  - Model Context Protocol (MCP) server implementation
  
- **CLI Features**:
  - Interactive initialization wizard (`coe init`)
  - Configuration validation (`coe verify`)
  - File attachment support (`--files`)
  - Multiple output formats (text, JSON)
  - Export conversations to file
  - Temperature control
  - Metadata display (tokens, cost, latency)
  
- **Web Search Integration**:
  - Native web search support for compatible models
  - Plugin-based web search fallback
  - Configurable search parameters
  
- **Configuration**:
  - JSON-based configuration with councils
  - Per-council system prompts and defaults
  - Model-specific system prompts
  - User defaults via `.coerc` file
  
- **Pre-configured Councils**:
  - Elite: Premium models for complex tasks
  - Fast: Quick response models
  - Free: No-cost models
  - Balanced: Mix of performance and cost
  - Creative: Models optimized for creative tasks
  - Research: Models with web search capabilities

[0.3.0]: https://github.com/alexandrosm/elders/releases/tag/v0.3.0
[0.2.1]: https://github.com/alexandrosm/elders/releases/tag/v0.2.1
[0.2.0]: https://github.com/alexandrosm/elders/releases/tag/v0.2.0
[0.1.0]: https://github.com/alexandrosm/elders/releases/tag/v0.1.0