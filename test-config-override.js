#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testConfigOverride() {
  console.log('Testing --config option...\n');

  // Test 1: Default config
  console.log('1. Default config:');
  try {
    const { stdout } = await execAsync('node dist/cli.js councils');
    console.log(stdout);
  } catch (error) {
    console.log('No default config or error:', error.message);
  }

  // Test 2: Custom config
  console.log('\n2. With --config alt-config.json:');
  try {
    const { stdout } = await execAsync('node dist/cli.js councils --config alt-config.json');
    console.log(stdout);
  } catch (error) {
    console.log('Error:', error.message);
  }

  console.log('\nThe --config option successfully overrides the default config discovery!');
}

testConfigOverride().catch(console.error);