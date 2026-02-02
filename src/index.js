#!/usr/bin/env node
/**
 * OpenClaw Activity Monitor - Daemon
 * 
 * Runs as a background service, monitoring:
 * - Agent health and responsiveness
 * - System performance (CPU, memory, disk)
 * - Git repository activity
 */

import fs from 'fs/promises';
import {
  CONFIG,
  formatUptime,
  formatBytes,
  getSystemPerformance,
  checkPerformanceAlerts,
  getAllRepoStatuses,
  checkGateway,
  startGateway,
  checkAgentHealth,
  restartAgent,
  getAgentActivity,
} from './lib.js';

// State tracking
const state = {
  agents: new Map(),
  startTime: Date.now(),
  totalChecks: 0,
  totalRestarts: 0,
  lastCheck: null,
  performance: {
    history: [],
    maxHistory: 100,
  },
  repos: new Map(),
  activity: {
    sessions: [],
    lastUpdate: null,
  },
};

// Logging
async function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, ...data };
  const line = JSON.stringify(entry);
  
  console[level === 'error' ? 'error' : 'log'](`[${timestamp}] [${level.toUpperCase()}] ${message}`, Object.keys(data).length ? data : '');
  
  try {
    await fs.appendFile(CONFIG.logFile, line + '\n');
  } catch {
    try {
      await fs.appendFile(CONFIG.fallbackLogFile, line + '\n');
    } catch {
      // Silent fail
    }
  }
}

function initAgentState(agentName) {
  if (!state.agents.has(agentName)) {
    state.agents.set(agentName, {
      name: agentName,
      consecutiveFailures: 0,
      lastHealthy: null,
      lastCheck: null,
      totalChecks: 0,
      totalFailures: 0,
      lastRestart: null,
    });
  }
  return state.agents.get(agentName);
}

// Main health check
async function runHealthCheck() {
  state.totalChecks++;
  state.lastCheck = new Date().toISOString();
  
  await log('debug', 'Running comprehensive health check', { checkNumber: state.totalChecks });
  
  // 1. System Performance
  const perf = await getSystemPerformance();
  state.performance.history.push(perf);
  if (state.performance.history.length > state.performance.maxHistory) {
    state.performance.history.shift();
  }
  
  const perfAlerts = checkPerformanceAlerts(perf);
  for (const alert of perfAlerts) {
    await log(alert.level === 'critical' ? 'error' : 'warn', alert.message, { type: alert.type });
  }
  
  // 2. Gateway & Agent Health
  const gatewayHealthy = await checkGateway();
  if (!gatewayHealthy) {
    await log('warn', 'Gateway not running, attempting to start...');
    const started = await startGateway();
    if (!started) {
      await log('error', 'Failed to start gateway, will retry next cycle');
    }
  }
  
  for (const agentConfig of CONFIG.agents) {
    const agentState = initAgentState(agentConfig.name);
    agentState.totalChecks++;
    agentState.lastCheck = new Date().toISOString();
    
    const health = await checkAgentHealth(agentConfig.name);
    
    if (health.healthy) {
      agentState.consecutiveFailures = 0;
      agentState.lastHealthy = new Date().toISOString();
    } else {
      agentState.consecutiveFailures++;
      agentState.totalFailures++;
      await log('warn', `Agent ${agentConfig.name} health check failed`, {
        failures: agentState.consecutiveFailures,
        error: health.error,
      });
      
      if (agentState.consecutiveFailures >= CONFIG.maxFailures) {
        const timeSinceLastRestart = agentState.lastRestart 
          ? Date.now() - new Date(agentState.lastRestart).getTime()
          : Infinity;
        
        if (timeSinceLastRestart > CONFIG.restartCooldown) {
          await log('warn', `Restarting agent: ${agentConfig.name}`);
          state.totalRestarts++;
          const restarted = await restartAgent(agentConfig.name);
          agentState.lastRestart = new Date().toISOString();
          agentState.consecutiveFailures = 0;
          if (restarted) {
            await log('info', `Agent ${agentConfig.name} restart completed`);
          }
        }
      }
    }
  }
  
  // 3. Git Repos (every 5 checks)
  if (state.totalChecks % 5 === 1) {
    const repos = await getAllRepoStatuses();
    for (const repo of repos) {
      state.repos.set(repo.name, repo);
    }
  }
  
  // 4. Activity
  const activity = await getAgentActivity();
  state.activity = activity;
  
  // 5. Save state
  await saveState();
}

async function saveState() {
  const stateData = {
    startTime: state.startTime,
    totalChecks: state.totalChecks,
    totalRestarts: state.totalRestarts,
    lastCheck: state.lastCheck,
    agents: Object.fromEntries(state.agents),
    repos: Object.fromEntries(state.repos),
    activity: state.activity,
    performance: {
      latest: state.performance.history[state.performance.history.length - 1],
    },
  };
  
  try {
    await fs.writeFile(CONFIG.stateFile, JSON.stringify(stateData, null, 2));
  } catch {}
}

async function loadState() {
  try {
    const data = await fs.readFile(CONFIG.stateFile, 'utf-8');
    const saved = JSON.parse(data);
    await log('info', 'Found previous state', { 
      previousChecks: saved.totalChecks,
      previousRestarts: saved.totalRestarts,
    });
  } catch {}
}

function getStatus() {
  const uptime = Date.now() - state.startTime;
  const agents = {};
  
  for (const [name, agentState] of state.agents) {
    agents[name] = {
      healthy: agentState.consecutiveFailures === 0,
      lastHealthy: agentState.lastHealthy,
      consecutiveFailures: agentState.consecutiveFailures,
      totalChecks: agentState.totalChecks,
      totalFailures: agentState.totalFailures,
      lastRestart: agentState.lastRestart,
    };
  }
  
  const latestPerf = state.performance.history[state.performance.history.length - 1];
  
  return {
    monitor: {
      uptime: Math.round(uptime / 1000),
      uptimeHuman: formatUptime(uptime / 1000),
      totalChecks: state.totalChecks,
      totalRestarts: state.totalRestarts,
      lastCheck: state.lastCheck,
    },
    agents,
    performance: latestPerf ? {
      cpu: `${latestPerf.cpu.usage}%`,
      memory: `${latestPerf.memory.percent}% (${formatBytes(latestPerf.memory.used)} / ${formatBytes(latestPerf.memory.total)})`,
      disk: `${latestPerf.disk.percent}%`,
      load: latestPerf.cpu.loadAvg.join(', '),
      systemUptime: latestPerf.system.uptimeHuman,
    } : null,
    repos: Object.fromEntries([...state.repos].map(([name, repo]) => [
      name,
      repo.error ? { error: repo.error } : {
        branch: repo.branch,
        latestCommit: repo.latestCommit?.message?.substring(0, 50),
        uncommittedChanges: repo.uncommittedChanges,
        ahead: repo.ahead,
        behind: repo.behind,
      }
    ])),
    activity: {
      sessionCount: state.activity.sessions?.length || 0,
      lastUpdate: state.activity.lastUpdate,
    },
  };
}

function getDetailedReport() {
  const status = getStatus();
  const repos = [...state.repos.values()];
  
  let report = '📊 **OpenClaw Activity Monitor Report**\n\n';
  
  // Performance
  report += '🖥️ **System Performance**\n';
  if (status.performance) {
    report += `  CPU: ${status.performance.cpu} | Load: ${status.performance.load}\n`;
    report += `  Memory: ${status.performance.memory}\n`;
    report += `  Disk: ${status.performance.disk}\n`;
    report += `  System Uptime: ${status.performance.systemUptime}\n`;
  }
  report += '\n';
  
  // Agent Health
  report += '🤖 **Agent Health**\n';
  for (const [name, agent] of Object.entries(status.agents)) {
    const icon = agent.healthy ? '✅' : '❌';
    report += `  ${icon} ${name}: ${agent.healthy ? 'Healthy' : `${agent.consecutiveFailures} failures`}\n`;
    if (agent.lastRestart) report += `    Last restart: ${agent.lastRestart}\n`;
  }
  report += '\n';
  
  // Git Repos
  report += '📁 **Repository Status**\n';
  for (const repo of repos) {
    if (repo.error) {
      report += `  ❌ ${repo.name}: ${repo.error}\n`;
      continue;
    }
    const changes = repo.uncommittedChanges > 0 ? ` (${repo.uncommittedChanges} uncommitted)` : '';
    const sync = repo.ahead || repo.behind ? ` ↑${repo.ahead} ↓${repo.behind}` : '';
    report += `  📦 ${repo.name} [${repo.branch}]${changes}${sync}\n`;
    if (repo.latestCommit) {
      report += `    └─ ${repo.latestCommit.shortHash}: ${repo.latestCommit.message?.substring(0, 40)}... (${repo.latestCommit.relTime})\n`;
    }
  }
  report += '\n';
  
  // Monitor Stats
  report += '📈 **Monitor Stats**\n';
  report += `  Running for: ${status.monitor.uptimeHuman}\n`;
  report += `  Health checks: ${status.monitor.totalChecks}\n`;
  report += `  Agent restarts: ${status.monitor.totalRestarts}\n`;
  
  return report;
}

// Main
async function main() {
  await log('info', '🔍 OpenClaw Activity Monitor starting...', {
    healthCheckInterval: CONFIG.healthCheckInterval,
    responseTimeout: CONFIG.responseTimeout,
    maxFailures: CONFIG.maxFailures,
    reposMonitored: CONFIG.repos.length,
  });
  
  await loadState();
  
  // Initial health check
  await runHealthCheck();
  
  // Log initial status
  console.log('\n' + getDetailedReport());
  
  // Schedule periodic checks
  setInterval(runHealthCheck, CONFIG.healthCheckInterval);
  
  // Handle shutdown
  process.on('SIGTERM', async () => {
    await log('info', 'Received SIGTERM, shutting down...');
    await saveState();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await log('info', 'Received SIGINT, shutting down...');
    await saveState();
    process.exit(0);
  });
  
  await log('info', '✅ Activity Monitor running', { 
    pid: process.pid,
    checkInterval: `${CONFIG.healthCheckInterval / 1000}s`,
  });
}

// Exports
export { getStatus, getDetailedReport };

// Run if executed directly
main().catch(async (error) => {
  await log('error', 'Fatal error', { error: error.message, stack: error.stack });
  process.exit(1);
});
