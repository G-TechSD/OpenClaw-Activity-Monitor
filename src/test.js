#!/usr/bin/env node
/**
 * Test suite for OpenClaw Activity Monitor
 */

import { 
  checkGateway, 
  checkAgentHealth, 
  getSystemPerformance,
  getAllRepoStatuses,
  CONFIG,
  formatBytes,
  formatUptime,
} from './lib.js';

async function runTests() {
  console.log('🧪 Running Activity Monitor Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: System Performance
  console.log('Test 1: System Performance...');
  try {
    const perf = await getSystemPerformance();
    console.log(`  CPU: ${perf.cpu.usage}% (${perf.cpu.cores} cores)`);
    console.log(`  Memory: ${perf.memory.percent}%`);
    console.log(`  Disk: ${perf.disk.percent}%`);
    console.log(`  Load: ${perf.cpu.loadAvg.join(', ')}`);
    console.log(`  ✅ Performance check passed`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  // Test 2: Gateway check
  console.log('\nTest 2: Gateway check...');
  try {
    const result = await checkGateway();
    console.log(`  Result: ${result ? '✅ Gateway running' : '⚠️ Gateway not running'}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  // Test 3: Agent health check
  console.log('\nTest 3: Agent health check...');
  try {
    const result = await checkAgentHealth('main');
    console.log(`  Result: ${result.healthy ? '✅ Healthy' : '⚠️ Unhealthy'}`);
    if (result.error) console.log(`  Error: ${result.error}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  // Test 4: Git repo status
  console.log('\nTest 4: Git repository status...');
  try {
    const repos = await getAllRepoStatuses();
    console.log(`  Found ${repos.length} configured repos:`);
    for (const repo of repos) {
      if (repo.error) {
        console.log(`    ⚠️ ${repo.name}: ${repo.error}`);
      } else {
        console.log(`    ✅ ${repo.name} [${repo.branch}] - ${repo.uncommittedChanges} uncommitted`);
      }
    }
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  // Test 5: Utility functions
  console.log('\nTest 5: Utility functions...');
  try {
    const bytes = formatBytes(1073741824);
    if (bytes !== '1 GB') throw new Error(`formatBytes failed: ${bytes}`);
    const uptime = formatUptime(3661);
    if (uptime !== '1h 1m') throw new Error(`formatUptime failed: ${uptime}`);
    console.log(`  formatBytes(1GB): ${bytes}`);
    console.log(`  formatUptime(3661): ${uptime}`);
    console.log('  ✅ Utility functions passed');
    passed++;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    failed++;
  }
  
  // Test 6: Config validation
  console.log('\nTest 6: Config validation...');
  try {
    if (CONFIG.healthCheckInterval < 5000) throw new Error('Health check interval too short');
    if (CONFIG.responseTimeout < 10000) throw new Error('Response timeout too short');
    if (CONFIG.maxFailures < 1) throw new Error('Max failures must be at least 1');
    if (CONFIG.repos.length === 0) throw new Error('No repos configured');
    console.log(`  Health interval: ${CONFIG.healthCheckInterval}ms`);
    console.log(`  Response timeout: ${CONFIG.responseTimeout}ms`);
    console.log(`  Max failures: ${CONFIG.maxFailures}`);
    console.log(`  Repos configured: ${CONFIG.repos.length}`);
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
