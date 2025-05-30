# Council of Elders (coe) v0.1

A Model Context Protocol (MCP) server and CLI that queries multiple LLMs through OpenRouter in parallel, with optional consensus rounds where models can revise their answers after seeing peer responses.

## Installation

```bash
npm install -g council-of-elders
```

## Quick Start

1. Initialize configuration:
```bash
coe init
```

2. Ask a question:
```bash
coe "What is the meaning of life?"
```

3. Run multiple consensus rounds:
```bash
coe --rounds 3 "How can we solve climate change?"
```

## Usage

### Commands
- `coe <prompt>` - Query the council with a prompt
- `coe init` - Initialize configuration with interactive wizard
- `coe councils` - List available councils
- `coe verify` - Verify configuration and model availability

### Basic Command
```bash
coe <prompt>
```

### Options
- `-r, --rounds <N>` - Number of consensus rounds (default: from config or 1)
- `-j, --json` - Output as JSON instead of plain text
- `-m, --meta` - Include metadata (tokens, cost, latency)
- `-s, --show-models` - Show model identities (hidden by default to prevent bias)
- `-S, --single` - Synthesize all responses into a single unified answer
- `-t, --temperature <temp>` - Temperature for responses (0-1, default: 0.7)
- `-f, --files <paths...>` - Files to append to the prompt
- `-c, --council <name>` - Use a specific council configuration
- `-n, --first-n <count>` - Only use the first N models to respond (race mode)
- `-e, --export <format>` - Export conversation to file (markdown, json, txt)
- `-w, --web` - Enable web search for all models
- `--web-max-results <N>` - Maximum web search results (default: 5)
- `--web-context <size>` - Web search context size for native search (low, medium, high)

### Examples
```bash
# Simple query
coe "What are the key principles of good software design?"

# Three consensus rounds with metadata
coe --rounds 3 --meta "What is consciousness?"

# JSON output
coe --json "Explain quantum computing"

# Show which models are responding
coe --show-models "What is consciousness?"

# Get a single synthesized answer
coe --single "What are the main causes of climate change?"

# Include files in the prompt
coe --files src/index.ts src/config.ts "Review this code for improvements"

# Multiple files with other options
coe --rounds 2 --json --files src/*.ts "Analyze the architecture of these TypeScript files"

# Use specific councils
coe --council fast "What is the capital of France?"
coe --council elite "Explain the implications of quantum computing on cryptography"
coe --council free "Write a haiku about programming"
coe --council research "What are the latest developments in renewable energy?"

# Race mode - only use first N models to respond
coe --first-n 3 "Quick question: what is 2+2?"
coe --council elite --first-n 2 "What is the meaning of life?"
coe --rounds 2 --first-n 4 "Explain machine learning"

# Export conversations
coe --export markdown "What is the future of AI?"
coe --council elite --rounds 2 --export json --meta "Analyze climate change solutions"
coe --single --export txt "Explain quantum computing"

# Web search - get real-time information
coe --web "What are the latest developments in quantum computing?"
coe --web --web-max-results 10 "Current AI regulations in the EU"
coe --web --web-context high "Who won the latest Nobel prizes?"
coe --council fast --web "What happened in tech news today?"

# List available councils
coe councils

# Verify configuration and model availability
coe verify
coe verify --fix  # Show suggestions for invalid models
coe verify --council elite  # Verify a specific council
```

### Using Defaults for Easier Commands

With properly configured defaults, you can use the tool with minimal typing:

```bash
coe "What is the capital of France?"  # Uses default council

# Elite council has defaults: rounds=2, single=true
coe --council elite "Explain consciousness"  # Automatically 2 rounds + synthesis

# Fast council has defaults: firstN=2, temperature=0.5
coe --council fast "Quick math: 15 * 7"  # Only waits for first 2 responses

# Override defaults when needed
coe --council elite --rounds 1 "Quick analysis needed"  # Override rounds
```

## Configuration

### Configuration Hierarchy

The tool uses a flexible configuration hierarchy:

1. **CLI flags** (highest priority) - Command line options override everything
2. **Council defaults** - Per-council default CLI parameters
3. **Config defaults** - Base configuration in `coe.config.json`

### `.env`
```env
OPENROUTER_API_KEY=sk-or-...
```

### `coe.config.json`

You can define multiple named councils with different models and settings:

```json
{
  "defaultCouncil": "balanced",
  "councils": {
    "elite": {
      "models": [
        "openai/gpt-4-turbo",
        "anthropic/claude-3.5-sonnet",
        "deepseek/deepseek-r1",
        "x-ai/grok-2"
      ],
      "system": "You are a distinguished member of the Elite Council. Provide thorough, expert analysis.",
      "synthesizer": "google/gemini-2.5-pro-preview",
      "rounds": 2,
      "defaults": {
        "rounds": 2,
        "single": true,
        "temperature": 0.8
      }
    },
    "fast": {
      "models": [
        "openai/gpt-4o-mini",
        "anthropic/claude-3-haiku",
        "mistralai/mistral-small"
      ],
      "system": "You are a member of the Fast Response Council. Provide quick, accurate answers.",
      "rounds": 1
    },
    "free": {
      "models": [
        "google/gemini-2.0-flash-exp:free",
        "deepseek/deepseek-r1:free",
        "meta-llama/llama-3.1-8b-instruct:free"
      ],
      "system": "You are a member of the Council. Provide helpful guidance.",
      "synthesizer": "google/gemini-2.0-flash-exp:free"
    }
  }
}
```

For backward compatibility, you can also use a flat structure without councils:

```json
{
  "models": ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
  "system": "You are a respected member of the Council of Elders.",
  "synthesizer": "openai/gpt-4o-mini",
  "rounds": 1
}
```

### Per-Model System Prompts
```json
{
  "models": [
    "grok-3",
    {
      "model": "claude-opus-4",
      "system": "You are a philosophical elder focusing on ethical implications."
    }
  ]
}
```

## Model Anonymity

By default, model identities are hidden and responses are attributed to "Elder Alpha", "Elder Beta", etc. This prevents reader bias based on model reputation. Use `--show-models` to reveal actual model names.

## Synthesis Mode

The `--single` flag enables synthesis mode, where all elder responses are combined into a single, unified answer. A designated synthesizer model reads all perspectives and provides a comprehensive response without mentioning the council or multiple sources. This is useful when you want a definitive answer rather than multiple viewpoints.

## Web Search

The `--web` flag enables real-time web search capabilities for all models, allowing them to access current information beyond their training data. This feature is powered by OpenRouter's web search integration.

### How it Works
- **Plugin-based search**: By default, uses the web plugin which adds search results to the model's context
- **Native search**: Some models support native web search with `--web-context` option
- **Citations**: Web sources are automatically extracted and displayed with responses

### Configuration
You can configure web search defaults in your council config:
```json
{
  "councils": {
    "research": {
      "models": ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
      "webSearch": {
        "enabled": true,
        "maxResults": 10
      },
      "defaults": {
        "web": true,
        "webMaxResults": 10
      }
    }
  }
}
```

### Pricing
Web search uses additional OpenRouter credits:
- Plugin-based search: $4 per 1000 results (default 5 results = $0.02 per query)
- Native search: Varies by model and context size (see OpenRouter docs)

## How Consensus Rounds Work

1. **Round 1**: All models receive the original prompt and respond independently
2. **Round 2+**: Each model sees its own previous response plus all peer responses, then can revise its answer
3. Models that error in earlier rounds are skipped in subsequent rounds

## MCP Integration

The package includes an MCP server that can be used with Claude Desktop or other MCP-compatible clients.

Add to your Claude Desktop configuration:
```json
{
  "mcpServers": {
    "council-of-elders": {
      "command": "node",
      "args": ["/path/to/council-of-elders/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Tool: `consult_elders`

Parameters:
- `query` (required): The question to ask
- `models`: Array of model IDs (optional)
- `systemPrompt`: Custom system prompt (optional)
- `temperature`: 0-1 (optional, default: 0.7)
- `rounds`: Number of consensus rounds (optional, default: 1)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in dev mode
npm run dev
```

## Exit Codes

- `0`: At least one model responded successfully
- `1`: All models failed or invalid arguments

## License

MIT