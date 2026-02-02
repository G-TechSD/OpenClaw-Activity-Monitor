#!/usr/bin/env node
/**
 * Install OpenClaw Activity Monitor as a systemd service
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const serviceContent = `[Unit]
Description=OpenClaw Activity Monitor - Watchdog for AI agents
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${process.env.USER || 'root'}
WorkingDirectory=${projectRoot}
ExecStart=/usr/bin/node ${projectRoot}/src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;

const servicePath = '/etc/systemd/system/openclaw-activity-monitor.service';

try {
  console.log('📦 Installing OpenClaw Activity Monitor as systemd service...\n');
  
  // Write service file
  fs.writeFileSync(servicePath, serviceContent);
  console.log(`✅ Created ${servicePath}`);
  
  // Reload systemd
  execSync('systemctl daemon-reload');
  console.log('✅ Reloaded systemd daemon');
  
  // Enable service
  execSync('systemctl enable openclaw-activity-monitor');
  console.log('✅ Enabled service to start on boot');
  
  // Start service
  execSync('systemctl start openclaw-activity-monitor');
  console.log('✅ Started service');
  
  // Show status
  console.log('\n📊 Service Status:');
  console.log(execSync('systemctl status openclaw-activity-monitor --no-pager').toString());
  
  console.log('\n🎉 Installation complete!');
  console.log('\nUseful commands:');
  console.log('  sudo systemctl status openclaw-activity-monitor');
  console.log('  sudo systemctl restart openclaw-activity-monitor');
  console.log('  sudo journalctl -u openclaw-activity-monitor -f');
  
} catch (error) {
  console.error('❌ Installation failed:', error.message);
  console.error('\nMake sure you run this with sudo:');
  console.error('  sudo node scripts/install-systemd.js');
  process.exit(1);
}
