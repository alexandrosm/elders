# Changelog

All notable changes to Council of Elders (COE) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/alexandrosm/elders/releases/tag/v0.2.0
[0.1.0]: https://github.com/alexandrosm/elders/releases/tag/v0.1.0