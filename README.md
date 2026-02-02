# OpenClaw Activity Monitor 🔍

A watchdog service that ensures OpenClaw/Clawdbot AI agents are always responsive. Monitors agent health, automatically restarts unresponsive agents, and logs all activity.

## Features

- 🔄 **Auto-restart**: Automatically restarts agents that become unresponsive
- 📊 **Health monitoring**: Continuous health checks every 30 seconds
- 📝 **Logging**: Full activity logging with timestamps
- 🛡️ **Failure threshold**: Configurable consecutive failures before restart
- ⏱️ **Cooldown protection**: Prevents restart loops
- 🔧 **Systemd integration**: Run as a system service

## Quick Start

```bash
# Install dependencies
npm install

# Run directly
npm start

# Run in development mode (auto-reload)
npm run dev

# Run tests
npm test
```

## Install as System Service

```bash
# Install as systemd service (requires sudo)
sudo npm run install-service

# Or manually
sudo node scripts/install-systemd.js
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

Edit `src/index.js` CONFIG object:

| Option | Default | Description |
|--------|---------|-------------|
| `healthCheckInterval` | 30000 | How often to check health (ms) |
| `responseTimeout` | 60000 | Max wait for agent response (ms) |
| `maxFailures` | 3 | Consecutive failures before restart |
| `restartCooldown` | 10000 | Minimum time between restarts (ms) |

## How It Works

1. **Gateway Check**: Verifies OpenClaw gateway is running
2. **Agent Health**: Sends test messages to verify agent responsiveness
3. **Failure Tracking**: Counts consecutive failures per agent
4. **Auto-Restart**: Restarts agents after `maxFailures` consecutive failures
5. **Cooldown**: Waits between restart attempts to prevent loops

## Log Files

- Primary: `/var/log/openclaw-activity-monitor.log`
- Fallback: `./activity-monitor.log` (if no `/var/log` access)

## API

When run as a module:

```javascript
import { checkGateway, checkAgentHealth, restartAgent, getStatus } from './src/index.js';

// Check gateway status
const isRunning = await checkGateway();

// Check specific agent health
const health = await checkAgentHealth('main');

// Get full status report
const status = getStatus();
```

## License

MIT

## Contributing

Issues and PRs welcome at https://github.com/G-TechSD/OpenClaw-Activity-Monitor
