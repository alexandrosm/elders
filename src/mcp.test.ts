import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

describe('MCP Server Integration Tests', () => {
  const serverPath = path.join(process.cwd(), 'dist/index.js');

  beforeAll(async () => {
    // Ensure server is built
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    await execAsync('npm run build');
  });

  it('should start MCP server and handle tool listing', async () => {
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    server.stderr.on('data', (data) => {
      error += data.toString();
    });

    // Send list tools request
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };

    server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(error).toContain('Council of Elders MCP server running');
    
    // Parse response
    const lines = output.split('\n').filter(line => line.trim());
    const response = JSON.parse(lines[0]);
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result.tools).toHaveLength(1);
    expect(response.result.tools[0].name).toBe('consult_elders');

    server.kill();
  }, 10000);

  it('should handle consult_elders tool call', async () => {
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let output = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    server.stderr.on('data', () => {
      // Ignore stderr
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send tool call request
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'consult_elders',
        arguments: {
          query: 'What is 2+2? Reply with just the number.',
          models: ['openai/gpt-3.5-turbo'],
          systemPrompt: 'You are a math helper. Be very brief.',
          temperature: 0.1,
          rounds: 1
        }
      }
    };

    server.stdin.write(JSON.stringify(toolCallRequest) + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 5000));

    const lines = output.split('\n').filter(line => line.trim());
    const response = JSON.parse(lines[lines.length - 1]);
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(2);
    expect(response.result.content).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    expect(response.result.content[0].text).toContain('4');

    server.kill();
  }, 30000);

  it('should handle multi-round consensus in MCP', async () => {
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let output = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 500));

    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'consult_elders',
        arguments: {
          query: 'Is the sky blue? Yes or no only.',
          models: ['openai/gpt-3.5-turbo', 'google/gemini-2.0-flash-exp:free'],
          rounds: 2
        }
      }
    };

    server.stdin.write(JSON.stringify(toolCallRequest) + '\n');

    // Wait for response (longer for 2 rounds)
    await new Promise(resolve => setTimeout(resolve, 10000));

    const lines = output.split('\n').filter(line => line.trim());
    const response = JSON.parse(lines[lines.length - 1]);
    
    expect(response.result.content[0].text).toContain('Round 2');
    expect(response.result.content[0].text.toLowerCase()).toMatch(/yes|no/);

    server.kill();
  }, 45000);

  it('should handle errors gracefully in MCP', async () => {
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let output = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Call with invalid tool name
    const invalidRequest = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'invalid_tool',
        arguments: {}
      }
    };

    server.stdin.write(JSON.stringify(invalidRequest) + '\n');

    await new Promise(resolve => setTimeout(resolve, 1000));

    const lines = output.split('\n').filter(line => line.trim());
    const response = JSON.parse(lines[lines.length - 1]);
    
    expect(response.error).toBeDefined();
    expect(response.error.message).toContain('Unknown tool');

    server.kill();
  }, 10000);
});