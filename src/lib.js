#!/usr/bin/env node
/**
 * OpenClaw Activity Monitor - Core Library
 * 
 * Shared functions for monitoring:
 * - System performance (CPU, memory, disk)
 * - Git repository status
 * - Agent health checks
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';

const execAsync = promisify(exec);

// Configuration
export const CONFIG = {
  healthCheckInterval: 30000,
  responseTimeout: 60000,
  maxFailures: 3,
  restartCooldown: 10000,
  logFile: '/var/log/openclaw-activity-monitor.log',
  fallbackLogFile: './activity-monitor.log',
  stateFile: './monitor-state.json',
  repos: [
    { name: 'Claudia-Coder', path: '/home/johnny-test/clawd/Claudia-Coder' },
    { name: 'claudiator', path: '/home/johnny-test/clawd/claudiator' },
    { name: 'emergent-terminal', path: '/home/johnny-test/clawd/emergent-terminal' },
    { name: 'ganesha', path: '/home/johnny-test/clawd/ganesha' },
    { name: 'voice-chat', path: '/home/johnny-test/clawd/voice-chat' },
    { name: 'openclaw-activity-monitor', path: '/home/johnny-test/clawd/openclaw-activity-monitor' },
  ],
  thresholds: {
    cpuWarning: 80,
    cpuCritical: 95,
    memoryWarning: 80,
    memoryCritical: 95,
    diskWarning: 85,
    diskCritical: 95,
  },
  agents: [
    { name: 'main', command: 'openclaw agent --agent main' },
  ],
};

// ==================== UTILITIES ====================

export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${Math.round(bytes * 10) / 10} ${units[i]}`;
}

// ==================== PERFORMANCE MONITORING ====================

export async function getSystemPerformance() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  // Calculate CPU usage
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  const cpuUsage = 100 - (totalIdle / totalTick * 100);
  
  // Get disk usage
  let diskUsage = { used: 0, total: 0, percent: 0 };
  try {
    const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$5}'");
    const [total, used, percent] = stdout.trim().split(/\s+/);
    diskUsage = {
      total: parseInt(total),
      used: parseInt(used),
      percent: parseInt(percent),
    };
  } catch {}
  
  const loadAvg = os.loadavg();
  
  let processCount = 0;
  try {
    const { stdout } = await execAsync('ps aux | wc -l');
    processCount = parseInt(stdout.trim()) - 1;
  } catch {}
  
  const uptime = os.uptime();
  
  return {
    timestamp: new Date().toISOString(),
    cpu: {
      usage: Math.round(cpuUsage * 10) / 10,
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      loadAvg: loadAvg.map(l => Math.round(l * 100) / 100),
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: Math.round((usedMem / totalMem) * 1000) / 10,
    },
    disk: diskUsage,
    system: {
      uptime,
      uptimeHuman: formatUptime(uptime),
      processCount,
      platform: os.platform(),
      hostname: os.hostname(),
    },
  };
}

export function checkPerformanceAlerts(perf) {
  const alerts = [];
  
  if (perf.cpu.usage >= CONFIG.thresholds.cpuCritical) {
    alerts.push({ level: 'critical', type: 'cpu', message: `CPU at ${perf.cpu.usage}%` });
  } else if (perf.cpu.usage >= CONFIG.thresholds.cpuWarning) {
    alerts.push({ level: 'warning', type: 'cpu', message: `CPU at ${perf.cpu.usage}%` });
  }
  
  if (perf.memory.percent >= CONFIG.thresholds.memoryCritical) {
    alerts.push({ level: 'critical', type: 'memory', message: `Memory at ${perf.memory.percent}%` });
  } else if (perf.memory.percent >= CONFIG.thresholds.memoryWarning) {
    alerts.push({ level: 'warning', type: 'memory', message: `Memory at ${perf.memory.percent}%` });
  }
  
  if (perf.disk.percent >= CONFIG.thresholds.diskCritical) {
    alerts.push({ level: 'critical', type: 'disk', message: `Disk at ${perf.disk.percent}%` });
  } else if (perf.disk.percent >= CONFIG.thresholds.diskWarning) {
    alerts.push({ level: 'warning', type: 'disk', message: `Disk at ${perf.disk.percent}%` });
  }
  
  return alerts;
}

// ==================== GIT REPOSITORY MONITORING ====================

export async function getRepoStatus(repoConfig) {
  const { name, path: repoPath } = repoConfig;
  
  try {
    await fs.access(repoPath);
  } catch {
    return { name, error: 'Repository not found', path: repoPath };
  }
  
  const result = {
    name,
    path: repoPath,
    timestamp: new Date().toISOString(),
  };
  
  try {
    // Check if it's a git repo
    try {
      await fs.access(`${repoPath}/.git`);
    } catch {
      return { name, error: 'Not a git repository', path: repoPath };
    }
    
    // Get current branch
    const { stdout: branch } = await execAsync(`git -C "${repoPath}" rev-parse --abbrev-ref HEAD 2>/dev/null`);
    result.branch = branch.trim();
    
    // Get latest commit
    const { stdout: commitInfo } = await execAsync(
      `git -C "${repoPath}" log -1 --format="%H|%h|%s|%an|%ar" 2>/dev/null`
    );
    const [hash, shortHash, message, author, relTime] = commitInfo.trim().split('|');
    result.latestCommit = { hash, shortHash, message, author, relTime };
    
    // Get status
    const { stdout: status } = await execAsync(`git -C "${repoPath}" status --porcelain 2>/dev/null`);
    const changes = status.trim().split('\n').filter(Boolean);
    result.uncommittedChanges = changes.length;
    result.changedFiles = changes.slice(0, 10).map(line => ({
      status: line.substring(0, 2).trim(),
      file: line.substring(3),
    }));
    
    // Get ahead/behind
    try {
      const { stdout: tracking } = await execAsync(
        `git -C "${repoPath}" rev-list --left-right --count HEAD...@{u} 2>/dev/null`
      );
      const [ahead, behind] = tracking.trim().split(/\s+/).map(Number);
      result.ahead = ahead || 0;
      result.behind = behind || 0;
    } catch {
      result.ahead = 0;
      result.behind = 0;
      result.noUpstream = true;
    }
    
    // Get recent commits (last 5)
    const { stdout: recentLog } = await execAsync(
      `git -C "${repoPath}" log -5 --format="%h|%s|%an|%ar" 2>/dev/null`
    );
    result.recentCommits = recentLog.trim().split('\n').filter(Boolean).map(line => {
      const [shortHash, message, author, relTime] = line.split('|');
      return { shortHash, message, author, relTime };
    });
    
    // Get remotes
    const { stdout: remotes } = await execAsync(`git -C "${repoPath}" remote -v 2>/dev/null`);
    result.remotes = [...new Set(remotes.trim().split('\n').filter(Boolean).map(line => {
      const [name] = line.split(/\s+/);
      return name;
    }))];
    
  } catch (error) {
    result.error = error.message;
  }
  
  return result;
}

export async function getAllRepoStatuses() {
  return Promise.all(CONFIG.repos.map(getRepoStatus));
}

// ==================== AGENT HEALTH MONITORING ====================

export async function checkGateway() {
  try {
    const { stdout } = await execAsync('openclaw gateway status', { timeout: 10000 });
    return stdout.includes('running') || stdout.includes('Gateway is running');
  } catch {
    return false;
  }
}

export async function startGateway() {
  try {
    await execAsync('openclaw gateway start', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    return await checkGateway();
  } catch {
    return false;
  }
}

export async function checkAgentHealth(agentName) {
  try {
    const { stdout } = await execAsync('openclaw status', { timeout: CONFIG.responseTimeout });
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

export async function restartAgent(agentName) {
  try {
    const gatewayRunning = await checkGateway();
    if (!gatewayRunning) {
      await startGateway();
    }
    
    await execAsync('openclaw gateway restart', { timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));
    return true;
  } catch {
    return false;
  }
}

// ==================== ACTIVITY MONITORING ====================

export async function getSessionActivity() {
  try {
    const { stdout } = await execAsync('openclaw sessions list --json 2>/dev/null || echo "[]"');
    return JSON.parse(stdout || '[]');
  } catch {
    return [];
  }
}

export async function getAgentActivity() {
  const activity = {
    timestamp: new Date().toISOString(),
    sessions: await getSessionActivity(),
  };
  
  try {
    const { stdout } = await execAsync('tail -100 ~/.openclaw/logs/*.log 2>/dev/null | grep -E "\\[INFO\\]|\\[WARN\\]|\\[ERROR\\]" | tail -20');
    activity.recentLogs = stdout.trim().split('\n').filter(Boolean).slice(-20);
  } catch {
    activity.recentLogs = [];
  }
  
  return activity;
}
