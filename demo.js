#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Council of Elders - Demo Script\n');
console.log('This demo shows the different features of the coe CLI.\n');

// Helper to run commands
async function runCommand(command, args = []) {
  console.log(`\n> coe ${args.join(' ')}`);
  console.log('─'.repeat(60));
  
  return new Promise((resolve) => {
    const proc = spawn('node', [path.join(__dirname, 'dist/cli.js'), ...args], {
      stdio: 'inherit',
      env: { ...process.env }
    });
    
    proc.on('close', (code) => {
      console.log('─'.repeat(60));
      resolve(code);
    });
  });
}

async function main() {
  console.log('1. Showing help:');
  await runCommand('coe', ['--help']);
  
  console.log('\n2. Showing version:');
  await runCommand('coe', ['--version']);
  
  console.log('\n3. Demo requires configuration. Please run:');
  console.log('   coe init');
  console.log('\nThen you can run:');
  console.log('   coe "What is the meaning of life?"');
  console.log('   coe --rounds 2 "Should AI have rights?"');
  console.log('   coe --json --meta "Hello"');
  console.log('\nFor integration tests with real API calls, set OPENROUTER_API_KEY and run:');
  console.log('   npm test src/openrouter.test.ts');
}

main().catch(console.error);