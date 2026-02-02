#!/usr/bin/env node
/**
 * CLI for OpenClaw Activity Monitor
 * Quick status checks without running the full daemon
 */

import { 
  getSystemPerformance,
  getAllRepoStatuses,
  checkGateway,
  checkAgentHealth,
  formatBytes,
  CONFIG,
} from './lib.js';

async function showStatus() {
  console.log('📊 OpenClaw Activity Monitor - Quick Status\n');
  console.log('━'.repeat(50));
  
  // System Performance
  console.log('\n🖥️  SYSTEM PERFORMANCE');
  const perf = await getSystemPerformance();
  console.log(`   CPU:     ${perf.cpu.usage}% (${perf.cpu.cores} cores)`);
  console.log(`   Load:    ${perf.cpu.loadAvg.join(', ')}`);
  console.log(`   Memory:  ${perf.memory.percent}% (${formatBytes(perf.memory.used)} / ${formatBytes(perf.memory.total)})`);
  console.log(`   Disk:    ${perf.disk.percent}%`);
  console.log(`   Uptime:  ${perf.system.uptimeHuman}`);
  
  // Gateway Status
  console.log('\n🤖 AGENT STATUS');
  const gatewayRunning = await checkGateway();
  console.log(`   Gateway: ${gatewayRunning ? '✅ Running' : '❌ Not Running'}`);
  
  if (gatewayRunning) {
    const health = await checkAgentHealth('main');
    console.log(`   Main:    ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
  }
  
  // Git Repos
  console.log('\n📁 REPOSITORIES');
  const repos = await getAllRepoStatuses();
  for (const repo of repos) {
    if (repo.error) {
      console.log(`   ❌ ${repo.name}: ${repo.error}`);
      continue;
    }
    
    const changes = repo.uncommittedChanges > 0 ? `⚠️ ${repo.uncommittedChanges} uncommitted` : '✅';
    const sync = [];
    if (repo.ahead > 0) sync.push(`↑${repo.ahead}`);
    if (repo.behind > 0) sync.push(`↓${repo.behind}`);
    const syncStr = sync.length ? ` [${sync.join(' ')}]` : '';
    
    console.log(`   ${changes === '✅' ? '✅' : '📝'} ${repo.name.padEnd(25)} ${repo.branch.padEnd(10)} ${changes}${syncStr}`);
    
    if (repo.latestCommit) {
      console.log(`      └─ ${repo.latestCommit.shortHash}: ${repo.latestCommit.message?.substring(0, 45)}...`);
      console.log(`         by ${repo.latestCommit.author} (${repo.latestCommit.relTime})`);
    }
  }
  
  console.log('\n' + '━'.repeat(50));
}

async function showRepos() {
  console.log('📁 Repository Status\n');
  
  const repos = await getAllRepoStatuses();
  for (const repo of repos) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📦 ${repo.name}`);
    console.log(`   Path: ${repo.path}`);
    
    if (repo.error) {
      console.log(`   ❌ Error: ${repo.error}`);
      continue;
    }
    
    console.log(`   Branch: ${repo.branch}`);
    console.log(`   Remotes: ${repo.remotes?.join(', ') || 'none'}`);
    
    if (repo.ahead || repo.behind) {
      console.log(`   Sync: ↑${repo.ahead} ahead, ↓${repo.behind} behind`);
    }
    
    if (repo.uncommittedChanges > 0) {
      console.log(`   ⚠️  ${repo.uncommittedChanges} uncommitted changes:`);
      for (const file of repo.changedFiles.slice(0, 5)) {
        console.log(`      ${file.status} ${file.file}`);
      }
      if (repo.changedFiles.length > 5) {
        console.log(`      ... and ${repo.changedFiles.length - 5} more`);
      }
    } else {
      console.log(`   ✅ Working tree clean`);
    }
    
    console.log(`   Recent commits:`);
    for (const commit of repo.recentCommits?.slice(0, 3) || []) {
      console.log(`      ${commit.shortHash} ${commit.message?.substring(0, 40)}...`);
      console.log(`           by ${commit.author} (${commit.relTime})`);
    }
  }
}

async function showPerf() {
  console.log('🖥️  System Performance\n');
  
  const perf = await getSystemPerformance();
  
  console.log('CPU');
  console.log(`  Model:    ${perf.cpu.model}`);
  console.log(`  Cores:    ${perf.cpu.cores}`);
  console.log(`  Usage:    ${perf.cpu.usage}%`);
  console.log(`  Load Avg: ${perf.cpu.loadAvg.join(', ')}`);
  
  console.log('\nMemory');
  console.log(`  Total:    ${formatBytes(perf.memory.total)}`);
  console.log(`  Used:     ${formatBytes(perf.memory.used)} (${perf.memory.percent}%)`);
  console.log(`  Free:     ${formatBytes(perf.memory.free)}`);
  
  console.log('\nDisk');
  console.log(`  Total:    ${formatBytes(perf.disk.total)}`);
  console.log(`  Used:     ${formatBytes(perf.disk.used)} (${perf.disk.percent}%)`);
  
  console.log('\nSystem');
  console.log(`  Hostname: ${perf.system.hostname}`);
  console.log(`  Platform: ${perf.system.platform}`);
  console.log(`  Uptime:   ${perf.system.uptimeHuman}`);
  console.log(`  Processes: ${perf.system.processCount}`);
}

async function showJson() {
  const [perf, repos, gateway] = await Promise.all([
    getSystemPerformance(),
    getAllRepoStatuses(),
    checkGateway(),
  ]);
  
  let agentHealth = null;
  if (gateway) {
    agentHealth = await checkAgentHealth('main');
  }
  
  const output = {
    timestamp: new Date().toISOString(),
    performance: perf,
    gateway: { running: gateway },
    agent: agentHealth,
    repos,
  };
  
  console.log(JSON.stringify(output, null, 2));
}

// Main CLI
const command = process.argv[2];

switch (command) {
  case 'status':
  case undefined:
    showStatus().catch(console.error);
    break;
  case 'repos':
    showRepos().catch(console.error);
    break;
  case 'perf':
  case 'performance':
    showPerf().catch(console.error);
    break;
  case 'json':
    showJson().catch(console.error);
    break;
  case 'help':
    console.log('OpenClaw Activity Monitor CLI\n');
    console.log('Usage: node src/cli.js [command]\n');
    console.log('Commands:');
    console.log('  status      Quick overview (default)');
    console.log('  repos       Detailed repository status');
    console.log('  perf        System performance details');
    console.log('  json        Full status as JSON');
    console.log('  help        Show this help');
    break;
  default:
    console.log(`Unknown command: ${command}`);
    console.log('Run "node src/cli.js help" for usage');
    process.exit(1);
}
