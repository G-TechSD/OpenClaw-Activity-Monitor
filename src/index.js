#!/usr/bin/env node
/**
 * OpenClaw Activity Monitor
 * 
 * Watchdog service that ensures OpenClaw/Clawdbot agents are always responsive.
 * Monitors agent health, restarts unresponsive agents, and logs all activity.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  // How often to check agent health (ms)
  healthCheckInterval: 30000, // 30 seconds
  
  // Max time to wait for agent response before considering it dead (ms)
  responseTimeout: 60000, // 60 seconds
  
  // How many consecutive failures before restart
  maxFailures: 3,
  
  // Cooldown between restart attempts (ms)
  restartCooldown: 10000, // 10 seconds
  
  // Log file location
  logFile: '/var/log/openclaw-activity-monitor.log',
  
  // Fallback log if no write access to /var/log
  fallbackLogFile: './activity-monitor.log',
  
  // Agents to monitor
  agents: [
    { name: 'main', command: 'openclaw agent --agent main' },
  ],
  
  // Gateway check
  gatewayEndpoint: 'http://localhost:3456/health',
};

// State tracking
const state = {
  agents: new Map(),
  startTime: Date.now(),
  totalChecks: 0,
  totalRestarts: 0,
  lastCheck: null,
};

// Logging
async function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, ...data };
  const line = JSON.stringify(entry);
  
  console[level === 'error' ? 'error' : 'log'](`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
  
  try {
    await fs.appendFile(CONFIG.logFile, line + '\n');
  } catch {
    try {
      await fs.appendFile(CONFIG.fallbackLogFile, line + '\n');
    } catch (e) {
      // Silent fail on log write
    }
  }
}

// Check if OpenClaw gateway is running
async function checkGateway() {
  try {
    const { stdout } = await execAsync('openclaw gateway status', { timeout: 10000 });
    return stdout.includes('running') || stdout.includes('Gateway is running');
  } catch {
    return false;
  }
}

// Start OpenClaw gateway
async function startGateway() {
  try {
    await log('info', 'Starting OpenClaw gateway...');
    await execAsync('openclaw gateway start', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000)); // Wait for startup
    return await checkGateway();
  } catch (error) {
    await log('error', 'Failed to start gateway', { error: error.message });
    return false;
  }
}

// Check agent responsiveness by sending a test message
async function checkAgentHealth(agentName) {
  try {
    // Use openclaw status to check agent health
    const { stdout } = await execAsync('openclaw status', { timeout: CONFIG.responseTimeout });
    
    // Parse status output
    const isHealthy = stdout.includes('Gateway') && !stdout.includes('not running');
    
    return {
      healthy: isHealthy,
      responseTime: Date.now(),
      details: stdout.substring(0, 200),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      responseTime: null,
    };
  }
}

// Restart an agent
async function restartAgent(agentName) {
  await log('warn', `Restarting agent: ${agentName}`);
  state.totalRestarts++;
  
  try {
    // First ensure gateway is running
    const gatewayRunning = await checkGateway();
    if (!gatewayRunning) {
      await startGateway();
    }
    
    // Restart the gateway (which manages agents)
    await execAsync('openclaw gateway restart', { timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000)); // Wait for restart
    
    await log('info', `Agent ${agentName} restart completed`);
    return true;
  } catch (error) {
    await log('error', `Failed to restart agent ${agentName}`, { error: error.message });
    return false;
  }
}

// Initialize agent state
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

// Main health check loop
async function runHealthCheck() {
  state.totalChecks++;
  state.lastCheck = new Date().toISOString();
  
  await log('debug', 'Running health check', { checkNumber: state.totalChecks });
  
  // Check gateway first
  const gatewayHealthy = await checkGateway();
  if (!gatewayHealthy) {
    await log('warn', 'Gateway not running, attempting to start...');
    const started = await startGateway();
    if (!started) {
      await log('error', 'Failed to start gateway, will retry next cycle');
      return;
    }
  }
  
  // Check each configured agent
  for (const agentConfig of CONFIG.agents) {
    const agentState = initAgentState(agentConfig.name);
    agentState.totalChecks++;
    agentState.lastCheck = new Date().toISOString();
    
    const health = await checkAgentHealth(agentConfig.name);
    
    if (health.healthy) {
      agentState.consecutiveFailures = 0;
      agentState.lastHealthy = new Date().toISOString();
      await log('debug', `Agent ${agentConfig.name} is healthy`);
    } else {
      agentState.consecutiveFailures++;
      agentState.totalFailures++;
      await log('warn', `Agent ${agentConfig.name} health check failed`, {
        failures: agentState.consecutiveFailures,
        error: health.error,
      });
      
      // Check if we need to restart
      if (agentState.consecutiveFailures >= CONFIG.maxFailures) {
        // Check cooldown
        const timeSinceLastRestart = agentState.lastRestart 
          ? Date.now() - new Date(agentState.lastRestart).getTime()
          : Infinity;
        
        if (timeSinceLastRestart > CONFIG.restartCooldown) {
          await restartAgent(agentConfig.name);
          agentState.lastRestart = new Date().toISOString();
          agentState.consecutiveFailures = 0;
        } else {
          await log('info', `Skipping restart (cooldown), will retry in ${Math.round((CONFIG.restartCooldown - timeSinceLastRestart) / 1000)}s`);
        }
      }
    }
  }
}

// Generate status report
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
  
  return {
    uptime: Math.round(uptime / 1000),
    uptimeHuman: `${Math.floor(uptime / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m`,
    totalChecks: state.totalChecks,
    totalRestarts: state.totalRestarts,
    lastCheck: state.lastCheck,
    agents,
  };
}

// Main entry point
async function main() {
  await log('info', '🔍 OpenClaw Activity Monitor starting...', {
    healthCheckInterval: CONFIG.healthCheckInterval,
    responseTimeout: CONFIG.responseTimeout,
    maxFailures: CONFIG.maxFailures,
  });
  
  // Initial health check
  await runHealthCheck();
  
  // Schedule periodic checks
  setInterval(runHealthCheck, CONFIG.healthCheckInterval);
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await log('info', 'Received SIGTERM, shutting down...');
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await log('info', 'Received SIGINT, shutting down...');
    process.exit(0);
  });
  
  await log('info', '✅ Activity Monitor running', { 
    pid: process.pid,
    checkInterval: `${CONFIG.healthCheckInterval / 1000}s`,
  });
}

// Export for testing
export { checkGateway, checkAgentHealth, restartAgent, getStatus, CONFIG };

// Run if executed directly
main().catch(async (error) => {
  await log('error', 'Fatal error', { error: error.message, stack: error.stack });
  process.exit(1);
});
