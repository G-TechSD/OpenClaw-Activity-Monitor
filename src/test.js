#!/usr/bin/env node
/**
 * Test suite for OpenClaw Activity Monitor
 */

import { checkGateway, checkAgentHealth, getStatus, CONFIG } from './index.js';

async function runTests() {
  console.log('🧪 Running Activity Monitor Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Gateway check
  console.log('Test 1: Gateway check...');
  try {
    const result = await checkGateway();
    console.log(`  Result: ${result ? '✅ Gateway running' : '⚠️ Gateway not running'}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  // Test 2: Agent health check
  console.log('\nTest 2: Agent health check...');
  try {
    const result = await checkAgentHealth('main');
    console.log(`  Result: ${result.healthy ? '✅ Healthy' : '⚠️ Unhealthy'}`);
    if (result.error) console.log(`  Error: ${result.error}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  // Test 3: Status report
  console.log('\nTest 3: Status report...');
  try {
    const status = getStatus();
    console.log(`  Uptime: ${status.uptimeHuman}`);
    console.log(`  Total checks: ${status.totalChecks}`);
    console.log(`  Total restarts: ${status.totalRestarts}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  // Test 4: Config validation
  console.log('\nTest 4: Config validation...');
  try {
    if (CONFIG.healthCheckInterval < 5000) throw new Error('Health check interval too short');
    if (CONFIG.responseTimeout < 10000) throw new Error('Response timeout too short');
    if (CONFIG.maxFailures < 1) throw new Error('Max failures must be at least 1');
    console.log('  ✅ Config valid');
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
