# OpenClaw Activity Monitor 🔍

Comprehensive monitoring for OpenClaw/Clawdbot AI agents. Monitors agent health, system performance, git repositories, and automatically restarts unresponsive agents.

## Features

- 🤖 **Agent Health**: Continuous monitoring with auto-restart on failure
- 🖥️ **System Performance**: CPU, memory, disk usage with configurable alerts
- 📁 **Git Repos**: Track commits, branches, uncommitted changes, sync status
- 📊 **Activity Tracking**: Session monitoring across all agents
- 🔄 **Auto-Recovery**: Restarts agents after consecutive failures
- ⚡ **CLI**: Quick status checks without running the daemon

## Quick Start

```bash
# Install dependencies
npm install

# Quick status check (no daemon)
npm run status

# Run daemon
npm start

# Run tests
npm test
```

## CLI Commands

```bash
# Overview of everything
node src/cli.js status

# Detailed repository status
node src/cli.js repos

# System performance details
node src/cli.js perf

# Full status as JSON (for scripting)
node src/cli.js json
```

### Example Output

```
📊 OpenClaw Activity Monitor - Quick Status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🖥️  SYSTEM PERFORMANCE
   CPU:     14.3% (8 cores)
   Load:    1.78, 1.96, 1.77
   Memory:  43% (3.3 GB / 7.8 GB)
   Disk:    34%
   Uptime:  6h 34m

🤖 AGENT STATUS
   Gateway: ✅ Running
   Main:    ✅ Healthy

📁 REPOSITORIES
   ✅ Claudia-Coder             main       ✅ [↑1]
      └─ 8397e7f: test: Add speech recognition utility tests
         by Agent K (75 minutes ago)
   ✅ ganesha                   main       ✅
      └─ 61ae047: fix: Auto-enable puppeteer MCP
         by Bill Griffith (10 days ago)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Install as System Service

```bash
# Install as systemd service (requires sudo)
sudo npm run install-service
```

After installation:
```bash
# Check status
sudo systemctl status openclaw-activity-monitor

# View logs
sudo journalctl -u openclaw-activity-monitor -f

# Restart
sudo systemctl restart openclaw-activity-monitor
```

## Configuration

Edit `src/lib.js` CONFIG object:

### Health Checks
| Option | Default | Description |
|--------|---------|-------------|
| `healthCheckInterval` | 30000 | How often to check health (ms) |
| `responseTimeout` | 60000 | Max wait for agent response (ms) |
| `maxFailures` | 3 | Consecutive failures before restart |
| `restartCooldown` | 10000 | Minimum time between restarts (ms) |

### Performance Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| CPU | 80% | 95% |
| Memory | 80% | 95% |
| Disk | 85% | 95% |

### Monitored Repos
Add/remove repos in `CONFIG.repos`:
```javascript
repos: [
  { name: 'my-project', path: '/path/to/repo' },
]
```

## How It Works

1. **Health Check Loop** (every 30s):
   - Verify OpenClaw gateway is running
   - Check agent responsiveness
   - Collect system metrics
   - Track git repository states

2. **Auto-Recovery**:
   - Count consecutive health check failures
   - After 3 failures, restart the gateway/agent
   - Cooldown prevents restart loops

3. **Alerting**:
   - Log warnings/errors for performance thresholds
   - Track all restarts and failures

## Log Files

- Primary: `/var/log/openclaw-activity-monitor.log`
- Fallback: `./activity-monitor.log`
- State: `./monitor-state.json`

## API Usage

Import functions directly:

```javascript
import { 
  getSystemPerformance,
  getAllRepoStatuses,
  checkGateway,
  checkAgentHealth,
} from './src/lib.js';

// Get system metrics
const perf = await getSystemPerformance();
console.log(`CPU: ${perf.cpu.usage}%`);

// Check all repos
const repos = await getAllRepoStatuses();
for (const repo of repos) {
  console.log(`${repo.name}: ${repo.uncommittedChanges} changes`);
}
```

## License

MIT

## Contributing

Issues and PRs welcome at https://github.com/G-TechSD/OpenClaw-Activity-Monitor
