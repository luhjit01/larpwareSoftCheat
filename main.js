const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const https = require('https');
const { machineIdSync } = require('node-machine-id');

const SCREENSHOT_FOLDER = path.join(require('os').homedir(), 'Pictures', 'SJTweaks Screenshots');
const SCREENSHOT_PREFIX = 'Premium3.0';

// Disable GPU caching
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('no-sandbox');

// Force single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Standalone mode - no backend required

// OpenAI API Key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

let mainWindow;

// ============================================================================
// RESTORE POINTS - Admin session cache
// ============================================================================
let cachedRestorePoints = null;
let adminSessionActive = false;
let lastRestorePointsFetch = 0;
const CACHE_DURATION = 60000; // 1 minute cache

// Request admin access once on startup for restore point reading
async function initAdminSession() {
  const { exec } = require('child_process');
  const sudo = require('sudo-prompt');
  const fs = require('fs');
  const os = require('os');
  const pathModule = require('path');
  
  return new Promise((resolve) => {
    const tempFile = pathModule.join(os.tmpdir(), 'sjtweaks-restore-points.json');
    const psCommand = `powershell -NoProfile -Command "Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, @{Name='CreationTime';Expression={$_.ConvertToDateTime($_.CreationTime).ToString('o')}}, RestorePointType | ConvertTo-Json | Out-File -FilePath '${tempFile.replace(/\\/g, '\\\\')}' -Encoding UTF8"`;
    
    sudo.exec(psCommand, { name: 'SJTweaks Premium' }, (error, stdout, stderr) => {
      if (error) {
        console.log('Admin session not established - restore points will require manual approval');
        resolve(false);
        return;
      }
      
      try {
        if (fs.existsSync(tempFile)) {
          const content = fs.readFileSync(tempFile, 'utf8').trim();
          fs.unlinkSync(tempFile);
          
          if (content && content !== '') {
            const cleanContent = content.replace(/^\uFEFF/, '');
            const parsed = JSON.parse(cleanContent);
            cachedRestorePoints = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
            cachedRestorePoints.sort((a, b) => new Date(b.CreationTime) - new Date(a.CreationTime));
          } else {
            cachedRestorePoints = [];
          }
          adminSessionActive = true;
          lastRestorePointsFetch = Date.now();
          console.log('Admin session established, restore points cached:', cachedRestorePoints.length);
          resolve(true);
        } else {
          cachedRestorePoints = [];
          adminSessionActive = true;
          resolve(true);
        }
      } catch (e) {
        console.log('Error parsing restore points:', e.message);
        cachedRestorePoints = [];
        adminSessionActive = true;
        resolve(true);
      }
    });
  });
}

// Refresh restore points cache (called internally after create/restore)
async function refreshRestorePointsCache() {
  const { exec } = require('child_process');
  const sudo = require('sudo-prompt');
  const fs = require('fs');
  const os = require('os');
  const pathModule = require('path');
  
  return new Promise((resolve) => {
    const tempFile = pathModule.join(os.tmpdir(), 'sjtweaks-restore-points.json');
    const psCommand = `powershell -NoProfile -Command "Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, @{Name='CreationTime';Expression={$_.ConvertToDateTime($_.CreationTime).ToString('o')}}, RestorePointType | ConvertTo-Json | Out-File -FilePath '${tempFile.replace(/\\/g, '\\\\')}' -Encoding UTF8"`;
    
    sudo.exec(psCommand, { name: 'SJTweaks Premium' }, (error) => {
      if (error) {
        resolve(false);
        return;
      }
      
      try {
        if (fs.existsSync(tempFile)) {
          const content = fs.readFileSync(tempFile, 'utf8').trim();
          fs.unlinkSync(tempFile);
          
          if (content && content !== '') {
            const cleanContent = content.replace(/^\uFEFF/, '');
            const parsed = JSON.parse(cleanContent);
            cachedRestorePoints = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
            cachedRestorePoints.sort((a, b) => new Date(b.CreationTime) - new Date(a.CreationTime));
          } else {
            cachedRestorePoints = [];
          }
          lastRestorePointsFetch = Date.now();
          resolve(true);
        } else {
          cachedRestorePoints = [];
          resolve(true);
        }
      } catch (e) {
        resolve(false);
      }
    });
  });
}

// License storage
const fs = require('fs');
const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');

function getSavedLicense() {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      const data = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
      return data.key || null;
    }
  } catch (e) {}
  return null;
}

function saveLicenseKey(key) {
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify({ key, savedAt: Date.now() }));
    return true;
  } catch (e) {
    return false;
  }
}

function createWindow() {
  const savedLicense = getSavedLicense();
  const showLicense = !savedLicense;
  
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1350,
    minHeight: 800,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    icon: path.join(__dirname, 'applogo.png')
  });

  // Load license screen or main app
  if (showLicense) {
    mainWindow.loadFile('index.html');
  } else {
    mainWindow.loadFile('index.html');
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// License IPC handlers
ipcMain.handle('save-license', async (event, key) => {
  return saveLicenseKey(key);
});

ipcMain.handle('load-main-app', async () => {
  if (mainWindow) {
    mainWindow.loadFile('index.html');
  }
  return true;
});

app.whenReady().then(async () => {
  createWindow();
  
  // Request admin access once on startup for restore points
  // This asks ONCE and caches the results
  setTimeout(() => {
    initAdminSession().then(success => {
      if (success && mainWindow) {
        mainWindow.webContents.send('admin-session-ready', true);
      }
    });
  }, 2000); // Wait 2 seconds after window loads before prompting

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    if (windows[0].isMinimized()) windows[0].restore();
    windows[0].focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Window controls
ipcMain.on('minimize-window', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});

ipcMain.on('maximize-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

ipcMain.on('close-window', () => {
  BrowserWindow.getFocusedWindow()?.close();
});

// Get system info
ipcMain.handle('get-system-info', async () => {
  const os = require('os');
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    hostname: os.hostname(),
    uptime: os.uptime()
  };
});

// Get HWID
ipcMain.handle('get-hwid', () => {
  return machineIdSync();
});

// OpenAI Chat
ipcMain.handle('ai-chat', async (event, message) => {
  return new Promise((resolve, reject) => {
    const systemPrompt = `You are **SJ**, a friendly AI assistant for **SJTweaks Premium** - a Windows gaming optimization app.

**Your Style:**
- Keep responses SHORT and SIMPLE (2-4 sentences max unless explaining steps)
- Use **bold** for important things like button names and settings
- Use numbered lists for step-by-step instructions
- Be casual and helpful, like a friend who knows tech
- Never use emojis

**The App Pages (in sidebar):**
- **General/Home** - System health, usage stats, Premium Profile button (free optimization quiz)
- **Zero Delay** - Reduces input lag for your input device
- **FPS Boost** - Increases game performance and frame rates  
- **Ping Optimizer** - Reduces network latency for online games
- **Visual** - App themes (Dark, Light, Transparent, Performance) and accent colors
- **Settings** - Startup options, shortcuts
- **System Restore** - Create/view Windows restore points

**HOW TO USE EACH PAGE:**

**Zero Delay:** Go to Zero Delay, pick **Keyboard + Mouse** or **Controller** tab, press **Apply**

**FPS Boost:** Go to FPS Boost, press **Apply**

**Ping Optimizer:** Go to Ping Optimizer, click your region on the globe, press **Apply**

**Premium Profile:** Go to General page, click **Premium Profile**, answer the quiz

**Quick Answers:**
- Low FPS? → FPS Boost page, press Apply
- Input lag? → Zero Delay page, pick your input, press Apply
- High ping? → Ping Optimizer page, pick region, press Apply
- Full optimization? → General page, click Premium Profile
- Change theme? → Visual page
- Create backup? → General page, click Create Restore Point

Keep responses short and direct. Don't say things like "That's it!" or "at the bottom/top". Just say "press Apply".`;

    const postData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 800,
      temperature: 0.6
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0] && json.choices[0].message) {
            resolve({ success: true, response: json.choices[0].message.content });
          } else if (json.error) {
            resolve({ success: false, error: json.error.message });
          } else {
            resolve({ success: false, error: 'Unexpected response from AI' });
          }
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse AI response' });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: e.message });
    });

    req.write(postData);
    req.end();
  });
});

// Create System Restore Point
ipcMain.handle('create-restore-point', async (event, name) => {
  const { exec } = require('child_process');
  const sudo = require('sudo-prompt');
  const fs = require('fs');
  const os = require('os');
  const pathModule = require('path');
  
  return new Promise((resolve) => {
    const restoreName = name || `SJTweaks Restore - ${new Date().toLocaleString()}`;
    const safeName = restoreName.replace(/'/g, "''");
    const tempFile = pathModule.join(os.tmpdir(), 'sjtweaks-restore-check.txt').replace(/\\/g, '\\\\');
    
    // PowerShell script with proper semicolons
    const psScript = `$before = (Get-ComputerRestorePoint | Measure-Object).Count; try { Checkpoint-Computer -Description '${safeName}' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop; Start-Sleep -Seconds 2; $after = (Get-ComputerRestorePoint | Measure-Object).Count; if ($after -gt $before) { 'SUCCESS' | Out-File -FilePath '${tempFile}' -Encoding UTF8 } else { 'LIMIT' | Out-File -FilePath '${tempFile}' -Encoding UTF8 } } catch { if ($_.Exception.Message -match '1400|frequency') { 'LIMIT' | Out-File -FilePath '${tempFile}' -Encoding UTF8 } else { $_.Exception.Message | Out-File -FilePath '${tempFile}' -Encoding UTF8 } }`;
    
    const psCommand = `powershell -NoProfile -Command "${psScript}"`;
    
    const options = { name: 'SJTweaks Premium' };
    
    sudo.exec(psCommand, options, async (error, stdout, stderr) => {
      if (error) {
        if (error.message && error.message.includes('canceled')) {
          resolve({ success: false, error: 'Admin permission was denied.' });
        } else {
          resolve({ success: false, error: stderr || error.message });
        }
        return;
      }
      
      // Check the result from temp file
      const actualTempFile = pathModule.join(os.tmpdir(), 'sjtweaks-restore-check.txt');
      try {
        if (fs.existsSync(actualTempFile)) {
          const result = fs.readFileSync(actualTempFile, 'utf8').trim().replace(/^\uFEFF/, '');
          fs.unlinkSync(actualTempFile);
          
          if (result === 'SUCCESS') {
            // Refresh the cache so the new restore point shows up
            await refreshRestorePointsCache();
            resolve({ success: true, message: 'Restore point created successfully!' });
          } else if (result === 'LIMIT') {
            resolve({ success: false, error: 'Daily limit reached! Windows only allows one restore point every 24 hours.' });
          } else {
            resolve({ success: false, error: result || 'Failed to create restore point.' });
          }
        } else {
          resolve({ success: false, error: 'Could not verify restore point creation.' });
        }
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    });
  });
});

// Check if can create restore point (24hr limit) - Uses cached data
ipcMain.handle('check-restore-limit', async () => {
  // Use cached restore points if available
  if (cachedRestorePoints !== null && cachedRestorePoints.length > 0) {
    try {
      // Get the most recent restore point
      const lastPoint = cachedRestorePoints[0]; // Already sorted newest first
      const lastCreated = new Date(lastPoint.CreationTime);
      const now = new Date();
      const hoursSince = (now - lastCreated) / (1000 * 60 * 60);
      
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        return { canCreate: false, hoursLeft, lastCreated: lastCreated.toLocaleString() };
      } else {
        return { canCreate: true };
      }
    } catch (e) {
      return { canCreate: true };
    }
  }
  
  // If no cached data, return true (let them try)
  return { canCreate: true };
});

// Get System Restore Points - Uses cached data from startup admin session
ipcMain.handle('get-restore-points', async () => {
  // If we have cached data that's less than 1 minute old, use it
  if (cachedRestorePoints !== null && (Date.now() - lastRestorePointsFetch) < CACHE_DURATION) {
    console.log('Returning cached restore points:', cachedRestorePoints.length);
    return { success: true, points: cachedRestorePoints };
  }
  
  // If admin session was established, refresh the cache silently
  if (adminSessionActive) {
    const refreshed = await refreshRestorePointsCache();
    if (refreshed && cachedRestorePoints !== null) {
      return { success: true, points: cachedRestorePoints };
    }
  }
  
  // Fallback: prompt for admin if no session
  const { exec } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const pathModule = require('path');
  
  return new Promise((resolve) => {
    const tempFile = pathModule.join(os.tmpdir(), 'sjtweaks-restore-points.json');
    const psCommand = `powershell -NoProfile -Command "Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, @{Name='CreationTime';Expression={$_.ConvertToDateTime($_.CreationTime).ToString('o')}}, RestorePointType | ConvertTo-Json | Out-File -FilePath '${tempFile.replace(/\\/g, '\\\\')}' -Encoding UTF8"`;
    
    const sudo = require('sudo-prompt');
    
    sudo.exec(psCommand, { name: 'SJTweaks Premium' }, (error, stdout, stderr) => {
      if (error) {
        if (error.message && error.message.includes('canceled')) {
          resolve({ success: false, error: 'Admin permission denied', points: [] });
        } else {
          resolve({ success: false, error: stderr || error.message, points: [] });
        }
        return;
      }
      
      try {
        if (fs.existsSync(tempFile)) {
          const content = fs.readFileSync(tempFile, 'utf8').trim();
          fs.unlinkSync(tempFile);
          
          if (content && content !== '') {
            const cleanContent = content.replace(/^\uFEFF/, '');
            const parsed = JSON.parse(cleanContent);
            const points = Array.isArray(parsed) ? parsed : [parsed];
            points.sort((a, b) => new Date(b.CreationTime) - new Date(a.CreationTime));
            
            // Cache the results
            cachedRestorePoints = points;
            lastRestorePointsFetch = Date.now();
            adminSessionActive = true;
            
            resolve({ success: true, points });
          } else {
            cachedRestorePoints = [];
            resolve({ success: true, points: [] });
          }
        } else {
          cachedRestorePoints = [];
          resolve({ success: true, points: [] });
        }
      } catch (e) {
        console.log('Error reading restore points:', e.message);
        resolve({ success: true, points: [] });
      }
    });
  });
});

// Restore to a specific restore point
ipcMain.handle('restore-to-point', async (event, sequenceNumber) => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    // Show confirmation dialog first
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Restore'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm System Restore',
      message: 'Are you sure you want to restore to this point?',
      detail: 'Your computer will restart and restore to the selected restore point. Save all work before proceeding.'
    }).then((result) => {
      if (result.response === 1) {
        // User confirmed, initiate restore
        const psCommand = `
          Restore-Computer -RestorePoint ${sequenceNumber} -Confirm:$false
        `;
        
        exec(`powershell -Command "${psCommand}"`, { shell: 'powershell.exe' }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: stderr || error.message });
          } else {
            resolve({ success: true, message: 'System restore initiated. Your computer will restart.' });
          }
        });
      } else {
        resolve({ success: false, cancelled: true });
      }
    });
  });
});

// ============================================================================
// SETTINGS PERSISTENCE
// ============================================================================

const settingsPath = path.join(app.getPath('userData'), 'ping-settings.json');

// Save ping settings
ipcMain.handle('save-ping-settings', async (event, settings) => {
  const fs = require('fs');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (err) {
    console.error('Failed to save settings:', err);
    return { success: false, error: err.message };
  }
});

// Load ping settings
ipcMain.handle('load-ping-settings', async () => {
  const fs = require('fs');
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error('Failed to load settings:', err);
    return {};
  }
});

// ============================================================================
// REAL NETWORK TWEAKS - Registry & System Commands
// ============================================================================

// Map of tweak IDs to actual Windows commands - ONLY PING-RELEVANT TWEAKS
const pingTweakCommands = {
  // ===== CORE LATENCY TWEAKS =====
  nagle: {
    enable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Set-ItemProperty -Path $path -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $path -Name TCPNoDelay -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue }"',
    disable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Remove-ItemProperty -Path $path -Name TcpAckFrequency -Force -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $path -Name TCPNoDelay -Force -ErrorAction SilentlyContinue }"'
  },
  delayedack: {
    enable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Set-ItemProperty -Path $path -Name TcpDelAckTicks -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue }"',
    disable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Remove-ItemProperty -Path $path -Name TcpDelAckTicks -Force -ErrorAction SilentlyContinue }"'
  },
  tcpack: {
    enable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Set-ItemProperty -Path $path -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue }"',
    disable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Remove-ItemProperty -Path $path -Name TcpAckFrequency -Force -ErrorAction SilentlyContinue }"'
  },
  netthrottle: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 10 /f'
  },
  initialrto: {
    enable: 'netsh int tcp set global initialRto=300',
    disable: 'netsh int tcp set global initialRto=3000'
  },
  minrto: {
    enable: 'netsh int tcp set global minrto=20',
    disable: 'netsh int tcp set global minrto=300'
  },

  // ===== NETWORK ADAPTER =====
  intmod: {
    enable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*InterruptModeration\' -RegistryValue 0 -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*InterruptModeration\' -RegistryValue 1 -ErrorAction SilentlyContinue"'
  },
  flowcontrol: {
    enable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*FlowControl\' -RegistryValue 0 -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*FlowControl\' -RegistryValue 3 -ErrorAction SilentlyContinue"'
  },
  lsov2: {
    enable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterLso -IPv4Enabled $false -IPv6Enabled $false -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterLso -IPv4Enabled $true -IPv6Enabled $true -ErrorAction SilentlyContinue"'
  },
  rsc: {
    enable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterRsc -IPv4Enabled $false -IPv6Enabled $false -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterRsc -IPv4Enabled $true -IPv6Enabled $true -ErrorAction SilentlyContinue"'
  },
  packetcoalesce: {
    enable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*PacketCoalescing\' -RegistryValue 0 -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*PacketCoalescing\' -RegistryValue 1 -ErrorAction SilentlyContinue"'
  },
  nicpowersave: {
    enable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterPowerManagement -WakeOnMagicPacket Disabled -WakeOnPattern Disabled -ErrorAction SilentlyContinue; Get-NetAdapter | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*EEE\' -RegistryValue 0 -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter | Set-NetAdapterPowerManagement -WakeOnMagicPacket Enabled -ErrorAction SilentlyContinue"'
  },

  // ===== GAMING PRIORITY =====
  qos: {
    enable: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /t REG_DWORD /d 0 /f',
    disable: 'reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /f 2>nul'
  },
  sysresponsiveness: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 20 /f'
  },
  gamepriority: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v Priority /t REG_DWORD /d 6 /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Scheduling Category" /t REG_SZ /d "High" /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "SFIO Priority" /t REG_SZ /d "High" /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v Priority /t REG_DWORD /d 2 /f'
  },
  udpopt: {
    enable: 'netsh int udp set global uro=enabled 2>nul & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\AFD\\Parameters" /v FastSendDatagramThreshold /t REG_DWORD /d 1500 /f',
    disable: 'netsh int udp set global uro=disabled 2>nul & reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Services\\AFD\\Parameters" /v FastSendDatagramThreshold /f 2>nul'
  },
  netbuffer: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v DisableBandwidthThrottling /t REG_DWORD /d 1 /f & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v DisableLargeMtu /t REG_DWORD /d 0 /f',
    disable: 'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" /v DisableBandwidthThrottling /f 2>nul'
  },

  // ===== TCP/IP STACK =====
  tcptimestamps: {
    enable: 'netsh int tcp set global timestamps=disabled',
    disable: 'netsh int tcp set global timestamps=enabled'
  },
  ecn: {
    enable: 'netsh int tcp set global ecncapability=disabled',
    disable: 'netsh int tcp set global ecncapability=enabled'
  },
  autotune: {
    enable: 'netsh int tcp set global autotuninglevel=disabled',
    disable: 'netsh int tcp set global autotuninglevel=normal'
  },
  scalingheur: {
    enable: 'netsh int tcp set heuristics disabled',
    disable: 'netsh int tcp set heuristics enabled'
  },
  winsock: {
    enable: 'ipconfig /flushdns & netsh winsock reset & netsh int ip reset',
    disable: ''
  },

  // ===== WIFI ONLY =====
  wifiperf: {
    enable: 'powershell -Command "Get-NetAdapter -Physical | Where-Object {$_.MediaType -eq \'802.11\'} | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*PowerSaveMode\' -RegistryValue 0 -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter -Physical | Where-Object {$_.MediaType -eq \'802.11\'} | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*PowerSaveMode\' -RegistryValue 1 -ErrorAction SilentlyContinue"'
  },
  roaming: {
    enable: 'powershell -Command "Get-NetAdapter -Physical | Where-Object {$_.MediaType -eq \'802.11\'} | Set-NetAdapterAdvancedProperty -RegistryKeyword \'RoamAggressiveness\' -RegistryValue 1 -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter -Physical | Where-Object {$_.MediaType -eq \'802.11\'} | Set-NetAdapterAdvancedProperty -RegistryKeyword \'RoamAggressiveness\' -RegistryValue 3 -ErrorAction SilentlyContinue"'
  },
  wifitxpower: {
    enable: 'powershell -Command "Get-NetAdapter -Physical | Where-Object {$_.MediaType -eq \'802.11\'} | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*TransmitPower\' -RegistryValue 5 -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter -Physical | Where-Object {$_.MediaType -eq \'802.11\'} | Set-NetAdapterAdvancedProperty -RegistryKeyword \'*TransmitPower\' -RegistryValue 3 -ErrorAction SilentlyContinue"'
  },
  uapsd: {
    enable: 'powershell -Command "Get-NetAdapter -Physical | Where-Object {$_.MediaType -eq \'802.11\'} | Set-NetAdapterAdvancedProperty -RegistryKeyword \'uAPSDSupport\' -RegistryValue 0 -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Get-NetAdapter -Physical | Where-Object {$_.MediaType -eq \'802.11\'} | Set-NetAdapterAdvancedProperty -RegistryKeyword \'uAPSDSupport\' -RegistryValue 1 -ErrorAction SilentlyContinue"'
  }
};

// Apply a single tweak - queued, doesn't prompt (changes saved, applied on "Apply All")
ipcMain.handle('apply-ping-tweak', async (event, { tweakId, enabled }) => {
  // Individual toggles just save state - actual apply happens with "Apply All Tweaks"
  console.log(`Tweak ${tweakId} toggled: ${enabled ? 'ON' : 'OFF'} (will apply with Apply All)`);
  return { success: true, queued: true };
});

// Apply all enabled tweaks at once with ONE admin prompt
ipcMain.handle('apply-all-ping-tweaks', async (event, settings) => {
  const { exec } = require('child_process');
  const sudo = require('sudo-prompt');
  
  // Build a combined command for all enabled tweaks
  let commands = [];
  
  for (const [tweakId, enabled] of Object.entries(settings)) {
    if (tweakId === 'selectedRegion') continue;
    
    const tweak = pingTweakCommands[tweakId];
    if (tweak) {
      const cmd = enabled ? tweak.enable : tweak.disable;
      if (cmd) commands.push(cmd);
    }
  }
  
  if (commands.length === 0) {
    return { success: true, message: 'No tweaks to apply' };
  }
  
  // Combine all commands - ONE admin prompt for everything
  const fullCommand = commands.join(' & ');
  
  return new Promise((resolve) => {
    const options = { name: 'SJTweaks Premium' };
    
    sudo.exec(fullCommand, options, (error, stdout, stderr) => {
      if (error) {
        console.error('Apply all tweaks error:', error.message);
        resolve({ success: false, error: error.message });
      } else {
        console.log('All ping tweaks applied successfully');
        resolve({ success: true, applied: commands.length });
      }
    });
  });
});

// ============================================================================
// PING CALIBRATION - Test actual ping to game servers
// ============================================================================

const PING_SERVERS = {
  'na-east': 'ping-nae.ds.on.epicgames.com',
  'na-west': 'ping-naw.ds.on.epicgames.com',
  'na-central': 'ping-nac.ds.on.epicgames.com',
  'europe': 'ping-eu.ds.on.epicgames.com',
  'brazil': 'ping-br.ds.on.epicgames.com',
  'oceania': 'ping-oce.ds.on.epicgames.com',
  'asia': 'ping-asia.ds.on.epicgames.com',
  'middle-east': 'ping-me.ds.on.epicgames.com'
};

ipcMain.handle('calibrate-ping', async (event, region) => {
  const { exec } = require('child_process');
  const server = PING_SERVERS[region];
  
  if (!server) {
    return { success: false, region, ping: null, error: 'Unknown region' };
  }
  
  return new Promise((resolve) => {
    // Run 4 pings and get the average
    exec(`ping -n 4 ${server}`, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.log(`Ping to ${region} failed:`, error.message);
        resolve({ success: false, region, ping: null, error: error.message });
        return;
      }
      
      // Parse the ping output to get average
      // Windows ping output: "Average = 25ms"
      const avgMatch = stdout.match(/Average\s*=\s*(\d+)ms/i);
      const minMatch = stdout.match(/Minimum\s*=\s*(\d+)ms/i);
      
      let pingValue = null;
      if (avgMatch) {
        pingValue = parseInt(avgMatch[1], 10);
      } else if (minMatch) {
        pingValue = parseInt(minMatch[1], 10);
      }
      
      if (pingValue !== null) {
        console.log(`Ping to ${region}: ${pingValue}ms`);
        resolve({ success: true, region, ping: pingValue });
      } else {
        // Try to extract any ms value
        const anyMsMatch = stdout.match(/time[=<](\d+)ms/i);
        if (anyMsMatch) {
          pingValue = parseInt(anyMsMatch[1], 10);
          console.log(`Ping to ${region}: ${pingValue}ms (from reply)`);
          resolve({ success: true, region, ping: pingValue });
        } else {
          console.log(`Could not parse ping for ${region}`);
          resolve({ success: false, region, ping: null, error: 'Could not parse ping' });
        }
      }
    });
  });
});

// ============================================================================
// FPS BOOST TWEAKS - Real Windows Performance Optimizations
// ============================================================================

const fpsTweakCommands = {
  // ===== WINDOWS GAME MODE =====
  gamedvr: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v AppCaptureEnabled /t REG_DWORD /d 0 /f & reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v AppCaptureEnabled /t REG_DWORD /d 1 /f'
  },
  gamebar: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\GameBar" /v UseNexusForGameBarEnabled /t REG_DWORD /d 0 /f & reg add "HKCU\\SOFTWARE\\Microsoft\\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\GameBar" /v UseNexusForGameBarEnabled /t REG_DWORD /d 1 /f'
  },
  gamemode: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 1 /f & reg add "HKCU\\SOFTWARE\\Microsoft\\GameBar" /v AllowAutoGameMode /t REG_DWORD /d 1 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 0 /f'
  },
  captures: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v AudioCaptureEnabled /t REG_DWORD /d 0 /f & reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v HistoricalCaptureEnabled /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v AudioCaptureEnabled /t REG_DWORD /d 1 /f'
  },

  // ===== GPU OPTIMIZATIONS =====
  powerplan: {
    enable: 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c & powercfg /setacvalueindex scheme_current sub_processor PERFBOOSTMODE 2 & powercfg /setactive scheme_current',
    disable: 'powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e'
  },
  vsync: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\DirectX\\UserGpuPreferences" /v DirectXUserGlobalSettings /t REG_SZ /d "SwapEffectUpgradeEnable=1;VRROptimizeEnable=1;" /f',
    disable: 'reg delete "HKCU\\SOFTWARE\\Microsoft\\DirectX\\UserGpuPreferences" /v DirectXUserGlobalSettings /f 2>nul'
  },
  gpusched: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 1 /f'
  },
  shadercache: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v TdrDelay /t REG_DWORD /d 60 /f & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v TdrDdiDelay /t REG_DWORD /d 60 /f',
    disable: 'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v TdrDelay /f 2>nul'
  },
  dwm: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 0 /f & reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\DWM" /v AlwaysHibernateThumbnails /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 1 /f'
  },

  // ===== CPU OPTIMIZATIONS =====
  cputhrottle: {
    enable: 'powercfg /setacvalueindex scheme_current sub_processor PROCTHROTTLEMIN 100 & powercfg /setacvalueindex scheme_current sub_processor PROCTHROTTLEMAX 100 & powercfg /setactive scheme_current',
    disable: 'powercfg /setacvalueindex scheme_current sub_processor PROCTHROTTLEMIN 5 & powercfg /setactive scheme_current'
  },
  priority: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v Priority /t REG_DWORD /d 6 /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 20 /f'
  },
  bgapps: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 1 /f & reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search" /v BackgroundAppGlobalToggle /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 0 /f'
  },
  superfetch: {
    enable: 'sc config "SysMain" start=disabled & net stop "SysMain" 2>nul',
    disable: 'sc config "SysMain" start=auto & net start "SysMain" 2>nul'
  },

  // ===== MEMORY OPTIMIZATIONS =====
  standby: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v ClearPageFileAtShutdown /t REG_DWORD /d 0 /f & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v LargeSystemCache /t REG_DWORD /d 0 /f',
    disable: 'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v ClearPageFileAtShutdown /f 2>nul'
  },
  syscache: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v IoPageLockLimit /t REG_DWORD /d 0xFFFFFFFF /f & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v SecondLevelDataCache /t REG_DWORD /d 0x400 /f',
    disable: 'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v IoPageLockLimit /f 2>nul'
  },
  memcompress: {
    enable: 'powershell -Command "Disable-MMAgent -MemoryCompression -ErrorAction SilentlyContinue"',
    disable: 'powershell -Command "Enable-MMAgent -MemoryCompression -ErrorAction SilentlyContinue"'
  },
  pagingexec: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 0 /f'
  },

  // ===== VISUAL EFFECTS =====
  animations: {
    enable: 'reg add "HKCU\\Control Panel\\Desktop" /v UserPreferencesMask /t REG_BINARY /d 9012038010000000 /f & reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f',
    disable: 'reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 1 /f'
  },
  transparency: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v EnableTransparency /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v EnableTransparency /t REG_DWORD /d 1 /f'
  },
  shadows: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 0 /f'
  },
  visualfx: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f & reg add "HKCU\\Control Panel\\Desktop" /v DragFullWindows /t REG_SZ /d 0 /f & reg add "HKCU\\Control Panel\\Desktop" /v FontSmoothing /t REG_SZ /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 0 /f'
  },

  // ===== SYSTEM SERVICES =====
  wsearch: {
    enable: 'sc config "WSearch" start=disabled & net stop "WSearch" 2>nul',
    disable: 'sc config "WSearch" start=delayed-auto & net start "WSearch" 2>nul'
  },
  tips: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 0 /f & reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SoftLandingEnabled /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 1 /f'
  },
  telemetry: {
    enable: 'sc config "DiagTrack" start=disabled & net stop "DiagTrack" 2>nul & sc config "dmwappushservice" start=disabled & net stop "dmwappushservice" 2>nul & reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f',
    disable: 'sc config "DiagTrack" start=auto & reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 3 /f'
  },
  cortana: {
    enable: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" /v AllowCortana /t REG_DWORD /d 0 /f & reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search" /v CortanaConsent /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" /v AllowCortana /t REG_DWORD /d 1 /f'
  },

  // ===== NVIDIA OPTIMIZATIONS =====
  prerendered: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PlatformSupportMiracast /t REG_DWORD /d 0 /f & reg add "HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak" /v Gestalt /t REG_DWORD /d 1 /f',
    disable: 'reg delete "HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak" /v Gestalt /f 2>nul'
  },
  threaded: {
    enable: 'reg add "HKLM\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak" /v ThreadedOptimization /t REG_DWORD /d 1 /f',
    disable: 'reg delete "HKLM\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak" /v ThreadedOptimization /f 2>nul'
  },
  nvpower: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power" /v HibernateEnabled /t REG_DWORD /d 0 /f & powercfg -h off',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power" /v HibernateEnabled /t REG_DWORD /d 1 /f'
  },
  lowlatency: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Latency Sensitive" /t REG_SZ /d "True" /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Latency Sensitive" /t REG_SZ /d "False" /f'
  },

  // ===== TIMER & SCHEDULING =====
  hrtimer: {
    enable: 'bcdedit /set useplatformtick yes & bcdedit /set disabledynamictick yes',
    disable: 'bcdedit /deletevalue useplatformtick & bcdedit /deletevalue disabledynamictick 2>nul'
  },
  hpet: {
    enable: 'bcdedit /set useplatformclock no',
    disable: 'bcdedit /deletevalue useplatformclock 2>nul'
  },
  coreparking: {
    enable: 'powercfg -setacvalueindex scheme_current sub_processor CPMINCORES 100 & powercfg -setactive scheme_current',
    disable: 'powercfg -setacvalueindex scheme_current sub_processor CPMINCORES 0 & powercfg -setactive scheme_current'
  },
  dynamictick: {
    enable: 'bcdedit /set disabledynamictick yes',
    disable: 'bcdedit /deletevalue disabledynamictick 2>nul'
  },

  // ===== INPUT LATENCY =====
  mouseaccel: {
    enable: 'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f & reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f & reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f',
    disable: 'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 1 /f & reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 6 /f & reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 10 /f'
  },
  usbpolling: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 0x14 /f & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" /v KeyboardDataQueueSize /t REG_DWORD /d 0x14 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 0x64 /f'
  },
  filterkeys: {
    enable: 'reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v Flags /t REG_SZ /d 122 /f & reg add "HKCU\\Control Panel\\Accessibility\\StickyKeys" /v Flags /t REG_SZ /d 506 /f & reg add "HKCU\\Control Panel\\Accessibility\\ToggleKeys" /v Flags /t REG_SZ /d 58 /f',
    disable: 'reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v Flags /t REG_SZ /d 126 /f'
  },
  pointerprecision: {
    enable: 'reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 10 /f & powershell -Command "Set-ItemProperty -Path \'HKCU:\\Control Panel\\Mouse\' -Name MouseSpeed -Value 0"',
    disable: 'reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 10 /f'
  },

  // ===== PROCESS OPTIMIZATION =====
  searchindex: {
    enable: 'sc config "WSearch" start=disabled & net stop "WSearch" 2>nul',
    disable: 'sc config "WSearch" start=delayed-auto & net start "WSearch" 2>nul'
  },
  wintips: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 0 /f & reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SystemPaneSuggestionsEnabled /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 1 /f'
  },
  faststart: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f & powercfg -h off',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" /v HiberbootEnabled /t REG_DWORD /d 1 /f'
  },
  errorreport: {
    enable: 'sc config "WerSvc" start=disabled & net stop "WerSvc" 2>nul & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting" /v Disabled /t REG_DWORD /d 1 /f',
    disable: 'sc config "WerSvc" start=manual & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting" /v Disabled /t REG_DWORD /d 0 /f'
  },

  // ===== ADVANCED GPU =====
  nvtelemetry: {
    enable: 'sc config "NvTelemetryContainer" start=disabled & net stop "NvTelemetryContainer" 2>nul & schtasks /change /tn "NvTmRep_CrashReport" /disable 2>nul & schtasks /change /tn "NvTmMon_CrashReport" /disable 2>nul',
    disable: 'sc config "NvTelemetryContainer" start=auto & net start "NvTelemetryContainer" 2>nul'
  },
  mpo: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm" /v OverlayTestMode /t REG_DWORD /d 5 /f',
    disable: 'reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm" /v OverlayTestMode /f 2>nul'
  },
  fullscreenopt: {
    enable: 'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 2 /f & reg add "HKCU\\System\\GameConfigStore" /v GameDVR_HonorUserFSEBehaviorMode /t REG_DWORD /d 1 /f & reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehavior /t REG_DWORD /d 2 /f',
    disable: 'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 0 /f'
  },
  gpupriority: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v Priority /t REG_DWORD /d 6 /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Scheduling Category" /t REG_SZ /d High /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 2 /f'
  },
  vrr: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\DirectX\\UserGpuPreferences" /v DirectXUserGlobalSettings /t REG_SZ /d "VRROptimizeEnable=0;" /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\DirectX\\UserGpuPreferences" /v DirectXUserGlobalSettings /t REG_SZ /d "VRROptimizeEnable=1;" /f'
  },

  // ===== NETWORK GAMING =====
  netthrottle: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 10 /f'
  },
  nagle: {
    enable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Set-ItemProperty -Path $path -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $path -Name TCPNoDelay -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue }"',
    disable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Remove-ItemProperty -Path $path -Name TcpAckFrequency -Force -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $path -Name TCPNoDelay -Force -ErrorAction SilentlyContinue }"'
  },
  qos: {
    enable: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /t REG_DWORD /d 0 /f & netsh int tcp set global autotuninglevel=normal',
    disable: 'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /t REG_DWORD /d 80 /f'
  },
  mtu: {
    enable: 'netsh interface ipv4 set subinterface "Ethernet" mtu=1500 store=persistent 2>nul & netsh interface ipv4 set subinterface "Wi-Fi" mtu=1500 store=persistent 2>nul',
    disable: 'netsh interface ipv4 set subinterface "Ethernet" mtu=1400 store=persistent 2>nul'
  }
};

// ============================================================================
// ZERO DELAY TWEAK COMMANDS
// ============================================================================
const zeroDelayTweakCommands = {
  // ===== INPUT OPTIMIZATION =====
  mouseaccel: {
    enable: 'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f & reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f & reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f',
    disable: 'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 1 /f'
  },
  usbpolling: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 0x14 /f & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" /v KeyboardDataQueueSize /t REG_DWORD /d 0x14 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 0x64 /f'
  },
  keybuffer: {
    enable: 'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardDelay /t REG_SZ /d 0 /f & reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardSpeed /t REG_SZ /d 31 /f',
    disable: 'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardDelay /t REG_SZ /d 1 /f & reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardSpeed /t REG_SZ /d 20 /f'
  },
  filterkeys: {
    enable: 'reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v Flags /t REG_SZ /d 122 /f & reg add "HKCU\\Control Panel\\Accessibility\\StickyKeys" /v Flags /t REG_SZ /d 506 /f & reg add "HKCU\\Control Panel\\Accessibility\\ToggleKeys" /v Flags /t REG_SZ /d 58 /f',
    disable: 'reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v Flags /t REG_SZ /d 126 /f'
  },

  // ===== SYSTEM LATENCY =====
  hpet: {
    enable: 'bcdedit /set useplatformclock no 2>nul',
    disable: 'bcdedit /deletevalue useplatformclock 2>nul'
  },
  dynamictick: {
    enable: 'bcdedit /set disabledynamictick yes 2>nul',
    disable: 'bcdedit /deletevalue disabledynamictick 2>nul'
  },
  timerres: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 0 /f'
  },
  coreparking: {
    enable: 'powercfg -setacvalueindex scheme_current sub_processor CPMINCORES 100 & powercfg -setactive scheme_current',
    disable: 'powercfg -setacvalueindex scheme_current sub_processor CPMINCORES 0 & powercfg -setactive scheme_current'
  },
  msimode: {
    enable: 'powershell -Command "Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -like \'*USB*\' -or $_.Name -like \'*HID*\' } | ForEach-Object { Write-Host $_.Name }"',
    disable: 'echo MSI mode unchanged'
  },

  // ===== GPU INPUT LAG =====
  fso: {
    enable: 'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 2 /f & reg add "HKCU\\System\\GameConfigStore" /v GameDVR_HonorUserFSEBehaviorMode /t REG_DWORD /d 1 /f',
    disable: 'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 0 /f'
  },
  hwsched: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 1 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f'
  },
  prerender: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm" /v ForceEffectMode /t REG_DWORD /d 1 /f & reg add "HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak" /v Gestalt /t REG_DWORD /d 1 /f',
    disable: 'reg delete "HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak" /v Gestalt /f 2>nul'
  },
  mpo: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm" /v OverlayTestMode /t REG_DWORD /d 5 /f',
    disable: 'reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm" /v OverlayTestMode /f 2>nul'
  },
  lowlatency: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Latency Sensitive" /t REG_SZ /d "True" /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Latency Sensitive" /t REG_SZ /d "False" /f'
  },

  // ===== PROCESS PRIORITY =====
  gamepriority: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v Priority /t REG_DWORD /d 6 /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v Priority /t REG_DWORD /d 2 /f'
  },
  powerthrottle: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 0 /f'
  },
  affinity: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 20 /f'
  },
  bgappsdelay: {
    enable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 1 /f',
    disable: 'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 0 /f'
  },

  // ===== NETWORK LATENCY =====
  nagledelay: {
    enable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Set-ItemProperty -Path $path -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $path -Name TCPNoDelay -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue }"',
    disable: 'powershell -Command "Get-NetAdapter | ForEach-Object { $path = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; Remove-ItemProperty -Path $path -Name TcpAckFrequency -Force -ErrorAction SilentlyContinue }"'
  },
  netthrottledelay: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 10 /f'
  },
  tcpack: {
    enable: 'netsh int tcp set global autotuninglevel=normal & netsh int tcp set heuristics disabled',
    disable: 'netsh int tcp set global autotuninglevel=default'
  },

  // ===== WINDOWS SCHEDULER =====
  spectre: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverride /t REG_DWORD /d 3 /f & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverrideMask /t REG_DWORD /d 3 /f',
    disable: 'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverride /f 2>nul'
  },
  mmcss: {
    enable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f & reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Scheduling Category" /t REG_SZ /d "High" /f',
    disable: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 20 /f'
  },
  quantum: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 0x26 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 0x02 /f'
  },
  dpcwatchdog: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v DpcWatchdogPeriod /t REG_DWORD /d 0 /f',
    disable: 'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v DpcWatchdogPeriod /f 2>nul'
  },

  // ===== MEMORY & CACHE =====
  prefetch: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters" /v EnablePrefetcher /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters" /v EnablePrefetcher /t REG_DWORD /d 3 /f'
  },
  lsyscache: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v LargeSystemCache /t REG_DWORD /d 0 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v LargeSystemCache /t REG_DWORD /d 1 /f'
  },
  nonpaged: {
    enable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v NonPagedPoolSize /t REG_DWORD /d 0 /f & reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f',
    disable: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 0 /f'
  }
};

// Zero Delay Settings path
const zeroDelaySettingsPath = path.join(app.getPath('userData'), 'zerodelay-settings.json');

// Apply all Zero Delay tweaks at once
ipcMain.handle('apply-all-zerodelay-tweaks', async (event, settings) => {
  const sudo = require('sudo-prompt');
  
  let commands = [];
  
  for (const [tweakId, enabled] of Object.entries(settings)) {
    const tweak = zeroDelayTweakCommands[tweakId];
    if (tweak) {
      const cmd = enabled ? tweak.enable : tweak.disable;
      if (cmd) commands.push(cmd);
    }
  }
  
  if (commands.length === 0) {
    return { success: true, message: 'No tweaks to apply' };
  }
  
  const fullCommand = commands.join(' & ');
  
  return new Promise((resolve) => {
    sudo.exec(fullCommand, { name: 'SJTweaks Zero Delay' }, (error) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true, applied: Object.keys(settings).length });
      }
    });
  });
});

// FPS Settings path
const fpsSettingsPath = path.join(app.getPath('userData'), 'fps-settings.json');

// Save FPS settings
ipcMain.handle('save-fps-settings', async (event, settings) => {
  const fs = require('fs');
  try {
    fs.writeFileSync(fpsSettingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (err) {
    console.error('Failed to save FPS settings:', err);
    return { success: false, error: err.message };
  }
});

// Load FPS settings
ipcMain.handle('load-fps-settings', async () => {
  const fs = require('fs');
  try {
    if (fs.existsSync(fpsSettingsPath)) {
      const data = fs.readFileSync(fpsSettingsPath, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error('Failed to load FPS settings:', err);
    return {};
  }
});

// Apply all FPS tweaks at once
ipcMain.handle('apply-all-fps-tweaks', async (event, settings) => {
  const sudo = require('sudo-prompt');
  
  let commands = [];
  
  for (const [tweakId, enabled] of Object.entries(settings)) {
    const tweak = fpsTweakCommands[tweakId];
    if (tweak) {
      const cmd = enabled ? tweak.enable : tweak.disable;
      if (cmd) commands.push(cmd);
    }
  }
  
  if (commands.length === 0) {
    return { success: true, message: 'No tweaks to apply' };
  }
  
  const fullCommand = commands.join(' & ');
  
  return new Promise((resolve) => {
    sudo.exec(fullCommand, { name: 'SJTweaks Premium' }, (error, stdout, stderr) => {
      if (error) {
        console.error('FPS tweaks error:', error.message);
        resolve({ success: false, error: error.message });
      } else {
        console.log('All FPS tweaks applied successfully');
        resolve({ success: true, applied: commands.length });
      }
    });
  });
});

// Apply Premium Profile tweaks (comprehensive optimization)
ipcMain.handle('apply-premium-profile-tweaks', async (event, commands) => {
  const sudo = require('sudo-prompt');
  
  if (!commands || commands.length === 0) {
    return { success: true, message: 'No tweaks to apply' };
  }
  
  // Join with semicolon for PowerShell
  const fullCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${commands.join('; ')}"`;
  
  return new Promise((resolve) => {
    sudo.exec(fullCommand, { name: 'SJTweaks Premium' }, (error, stdout, stderr) => {
      if (error) {
        console.error('Premium profile error:', error.message);
        // Check if user cancelled
        if (error.message && error.message.includes('canceled')) {
          resolve({ success: false, error: 'User cancelled admin prompt' });
        } else {
          resolve({ success: false, error: error.message });
        }
      } else {
        console.log('Premium profile applied successfully');
        resolve({ success: true, applied: commands.length });
      }
    });
  });
});

// Screenshot functionality
async function takeScreenshot(win) {
    if (!win) return { success: false, error: 'No window' };
    try {
        if (!fs.existsSync(SCREENSHOT_FOLDER)) {
            fs.mkdirSync(SCREENSHOT_FOLDER, { recursive: true });
        }
        const image = await win.webContents.capturePage();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${SCREENSHOT_PREFIX}_${timestamp}.png`;
        const filepath = path.join(SCREENSHOT_FOLDER, filename);
        fs.writeFileSync(filepath, image.toPNG());
        return { success: true, path: filepath };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

ipcMain.handle('take-screenshot', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return await takeScreenshot(win);
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
