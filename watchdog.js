require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const { checkInterval, rpcProxyPort, rpcPoolPort, rpcWebServerPort } = require('./config');

// Initialize Telegram bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const chatIds = process.env.TELEGRAM_CHAT_IDS.split(',');

// Watchdog endpoints to monitor
const endpoints = [
  {
    name: 'stage.mainnet.rpc.buidlguidl.com (pre-proxy)',
    url: `https://stage.mainnet.rpc.buidlguidl.com/watchdog`,
    timeout: 10000 // 10 seconds
  },
  {
    name: 'RPC Proxy Service',
    url: `https://${process.env.RPC_HOST}:${rpcProxyPort}/watchdog`,
    timeout: 10000 // 10 seconds
  },
  {
    name: 'RPC Pool Service',
    url: `https://${process.env.RPC_HOST}:${rpcPoolPort}/watchdog`,
    timeout: 10000 // 10 seconds
  },
  {
    name: 'RPC Web Server Service',
    url: `https://${process.env.RPC_HOST}:${rpcWebServerPort}/watchdog`,
    timeout: 10000 // 10 seconds
  },
];

// Store last known status to avoid spam
const lastStatus = new Map();

async function checkEndpoint(endpoint) {
  return new Promise((resolve) => {
    const url = new URL(endpoint.url);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      timeout: endpoint.timeout,
      rejectUnauthorized: false // For self-signed certificates
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok === true) {
            resolve({ success: true, data: response });
          } else {
            resolve({ success: false, error: `Invalid response: ${data}` });
          }
        } catch (error) {
          resolve({ success: false, error: `Invalid JSON response: ${data}` });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.end();
  });
}

async function sendTelegramAlert(message) {
  for (const chatId of chatIds) {
    try {
      await bot.sendMessage(chatId.trim(), message);
      console.log(`Alert sent to chat ID: ${chatId}`);
    } catch (error) {
      console.error(`Failed to send message to chat ID ${chatId}:`, error.message);
    }
  }
}

async function monitorEndpoint(endpoint) {
  console.log(`Checking ${endpoint.name} at ${endpoint.url}`);
  
  const result = await checkEndpoint(endpoint);
  const currentStatus = result.success;
  const lastKnownStatus = lastStatus.get(endpoint.name);
  
  if (currentStatus) {
    console.log(`✅ ${endpoint.name} is healthy`);
    
    // If it was down before and now it's up, send recovery alert
    if (lastKnownStatus === false) {
      const message = `\n------------------------------------------\n🟢 RECOVERY: ${endpoint.name} is back online!\nURL: ${endpoint.url}`;
      await sendTelegramAlert(message);
    }
  } else {
    console.log(`❌ ${endpoint.name} is down: ${result.error}`);
    
    // If it was up before and now it's down, send alert
    if (lastKnownStatus !== false) {
      const message = `\n------------------------------------------\n🔴 ALERT: ${endpoint.name} is down!\nURL: ${endpoint.url}\nError: ${result.error}\nTime: ${new Date().toISOString()}`;
      await sendTelegramAlert(message);
    }
  }
  
  lastStatus.set(endpoint.name, currentStatus);
}

async function runWatchdog() {
  console.log('Starting watchdog monitoring...');
  
  for (const endpoint of endpoints) {
    await monitorEndpoint(endpoint);
  }
  
  console.log('Watchdog check completed\n');
}

// Run initial check
runWatchdog();

// Schedule periodic checks every n minutes
setInterval(runWatchdog, checkInterval);

console.log(`Watchdog service started. Monitoring ${endpoints.length} endpoint(s) every ${checkInterval / 1000 / 60} minutes.`);
