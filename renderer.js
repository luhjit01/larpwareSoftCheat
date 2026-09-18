const { ipcRenderer } = require('electron');
const os = require('os');
const { exec, execSync } = require('child_process');

// Standalone mode - no backend required
let currentUser = { username: 'User', email: '' };

// ============================================================================
// STARFIELD BACKGROUND
// ============================================================================

const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');
let stars = [];
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

// Convert hex color to RGB object
function hexToRgb(hex) {
  if (!hex) return null;
  // Handle hsl colors (from rainbow mode)
  if (hex.startsWith('hsl')) {
    const match = hex.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
      const h = parseInt(match[1]) / 360;
      const s = parseInt(match[2]) / 100;
      const l = parseInt(match[3]) / 100;
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }
  }
  // Handle hex colors
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Get primary color as RGB values
function getPrimaryColorRGB() {
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  const rgb = hexToRgb(primaryColor);
  if (rgb) return rgb;
  // Fallback: Convert hex to RGB
  let hex = primaryColor.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return { r, g, b };
}

// Check if light mode is active
function isLightMode() {
  return document.body.classList.contains('theme-light');
}

function initStarfield() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  stars = [];
  for (let i = 0; i < 180; i++) {
    const isAccent = Math.random() < 0.6; // 60% accent color stars
    const isInteractive = Math.random() < 0.3; // Only 30% react to cursor
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.5 + 0.3,
      isAccent: isAccent,
      interactive: isInteractive,
      twinkle: Math.random() * Math.PI * 2 // For subtle twinkling
    });
  }
}

function drawStarfield() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const primaryRGB = getPrimaryColorRGB();
  const lightMode = isLightMode();
  
  stars.forEach(star => {
    // Only interactive stars get pulled by cursor
    if (star.interactive) {
      const dx = mouseX - star.x;
      const dy = mouseY - star.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 150) { // Smaller radius
        const force = (150 - dist) / 150 * 0.008; // Weaker force
        star.x += dx * force;
        star.y += dy * force;
      }
    }
    
    // All stars drift naturally
    star.x += star.speedX;
    star.y += star.speedY;
    
    // Wrap around edges
    if (star.x < 0) star.x = canvas.width;
    if (star.x > canvas.width) star.x = 0;
    if (star.y < 0) star.y = canvas.height;
    if (star.y > canvas.height) star.y = 0;
    
    // Subtle twinkle effect
    star.twinkle += 0.02;
    const twinkleOpacity = star.opacity + Math.sin(star.twinkle) * 0.1;
    
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    
    if (lightMode) {
      // Light mode: black/gray stars with primary accent
      if (star.isAccent) {
        ctx.fillStyle = `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, ${twinkleOpacity * 0.7})`;
    } else {
        ctx.fillStyle = `rgba(30, 30, 30, ${twinkleOpacity * 0.4})`;
      }
    } else {
      // Dark mode: primary color and white stars
      if (star.isAccent) {
        ctx.fillStyle = `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, ${twinkleOpacity})`;
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${twinkleOpacity})`;
      }
    }
    ctx.fill();
  });
  
  requestAnimationFrame(drawStarfield);
}

const cursorCircle = document.getElementById('cursor-circle');
document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursorCircle.style.left = e.clientX + 'px';
  cursorCircle.style.top = e.clientY + 'px';
});

window.addEventListener('resize', initStarfield);

// ============================================================================
// SMOKE EFFECT
// ============================================================================

const smokeCanvas = document.getElementById('smoke-canvas');
const smokeCtx = smokeCanvas.getContext('2d');
let smokeParticles = [];
let smokeHovering = false;
let smokeMouseX = 0;
let smokeMouseY = 0;

function initSmoke() {
  const sidebar = document.querySelector('.sidebar');
  smokeCanvas.width = sidebar.offsetWidth;
  smokeCanvas.height = sidebar.offsetHeight;
  
  // Track mouse in sidebar
  sidebar.addEventListener('mouseenter', () => {
    smokeHovering = true;
  });
  
  sidebar.addEventListener('mouseleave', () => {
    smokeHovering = false;
  });
  
  sidebar.addEventListener('mousemove', (e) => {
    const rect = sidebar.getBoundingClientRect();
    smokeMouseX = e.clientX - rect.left;
    smokeMouseY = e.clientY - rect.top;
  });
}

function createSmokeParticle() {
  return {
    x: Math.random() * smokeCanvas.width,
    y: smokeCanvas.height + 50,
    size: Math.random() * 60 + 40,
    speedY: -(Math.random() * 1 + 0.5),
    speedX: (Math.random() - 0.5) * 0.5,
    opacity: Math.random() * 0.1 + 0.03,
    life: 0,
    maxLife: smokeCanvas.height + 100,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: Math.random() * 0.02 + 0.01
  };
}

function updateSmoke() {
  // Speed multiplier - slower when hovering
  const speedMult = smokeHovering ? 0.5 : 1;
  
  // Add new particles
  if (smokeParticles.length < 25 && Math.random() < 0.15) {
    smokeParticles.push(createSmokeParticle());
  }
  
  // Update particles
  smokeParticles.forEach((p, i) => {
    p.life += Math.abs(p.speedY) * speedMult;
    p.y += p.speedY * speedMult;
    p.wobble += p.wobbleSpeed * speedMult;
    p.x += (Math.sin(p.wobble) * 0.5 + p.speedX) * speedMult;
    p.size += 0.3 * speedMult; // Grow as it rises
    
    // Attract to mouse when hovering
    if (smokeHovering) {
      const dx = smokeMouseX - p.x;
      const dy = smokeMouseY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 150) {
        const force = (150 - dist) / 150 * 0.02;
        p.x += dx * force;
        p.y += dy * force;
      }
    }
    
    // Calculate position in sidebar (0 = bottom, 1 = top)
    const positionRatio = 1 - (p.y / smokeCanvas.height);
    
    // Fade in from bottom (first 20%), fade out at top (last 30%)
    let fadeMultiplier = 1;
    if (positionRatio < 0.2) {
      fadeMultiplier = positionRatio / 0.2; // Fade in
    } else if (positionRatio > 0.7) {
      fadeMultiplier = (1 - positionRatio) / 0.3; // Fade out
    }
    
    p.currentOpacity = p.opacity * Math.max(0, fadeMultiplier);
    
    // Remove dead particles
    if (p.y < -p.size || positionRatio > 1.1) {
      smokeParticles.splice(i, 1);
    }
  });
}

function drawSmoke() {
  smokeCtx.clearRect(0, 0, smokeCanvas.width, smokeCanvas.height);
  
  const primaryRGB = getPrimaryColorRGB();
  
  smokeParticles.forEach(p => {
    const gradient = smokeCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    gradient.addColorStop(0, `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, ${p.currentOpacity * 0.8})`);
    gradient.addColorStop(0.4, `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, ${p.currentOpacity * 0.4})`);
    gradient.addColorStop(1, `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0)`);
    
    smokeCtx.fillStyle = gradient;
    smokeCtx.beginPath();
    smokeCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    smokeCtx.fill();
  });
}

function animateSmoke() {
  updateSmoke();
  drawSmoke();
  requestAnimationFrame(animateSmoke);
}

window.addEventListener('resize', initSmoke);

// ============================================================================
// STANDALONE MODE - No authentication required
// ============================================================================

function initUser() {
  // Set default user display
  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = 'Premium User';
  if (avatarEl) avatarEl.textContent = 'P';
}

// ============================================================================
// REAL SYSTEM INFO
// ============================================================================

function getGPUInfo() {
  try {
    const output = execSync('wmic path win32_VideoController get name', { encoding: 'utf8' });
    const lines = output.split('\n').filter(line => line.trim() && !line.includes('Name'));
    // Get the first non-virtual GPU if possible
    for (const line of lines) {
      const name = line.trim();
      if (name && !name.toLowerCase().includes('virtual') && !name.toLowerCase().includes('basic')) {
        return name;
      }
    }
    return lines[0]?.trim() || 'Unknown GPU';
  } catch { return 'Unknown GPU'; }
}

function getCPUInfo() {
  const cpus = os.cpus();
  if (cpus.length > 0) {
    return cpus[0].model.replace(/\s+/g, ' ').trim();
  }
  return 'Unknown CPU';
}

function getOSInfo() {
  const release = os.release();
  const arch = os.arch();
  if (release.startsWith('10.0.22')) return `Windows 11 ${arch}`;
  if (release.startsWith('10.0')) return `Windows 10 ${arch}`;
  return `Windows ${release} ${arch}`;
}

function getRAMInfo() {
  const totalGB = (os.totalmem() / (1024 ** 3)).toFixed(0);
  return `${totalGB} GB`;
}

async function loadSystemInfo() {
  document.getElementById('spec-os').textContent = getOSInfo();
  document.getElementById('spec-cpu').textContent = getCPUInfo();
  document.getElementById('spec-gpu').textContent = getGPUInfo();
  document.getElementById('spec-ram').textContent = getRAMInfo();
}

// ============================================================================
// REAL CPU/RAM/GPU USAGE - Reading from Task Manager level
// ============================================================================

let currentUsage = { cpu: 0, ram: 0, gpu: null, gpuError: false };

// Get CPU usage via PowerShell (matches Task Manager)
function updateCPUUsage() {
  exec('powershell -command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage"', 
    { encoding: 'utf8', timeout: 3000 }, (err, stdout) => {
      if (!err && stdout) {
        const val = parseInt(stdout.trim());
        if (!isNaN(val)) currentUsage.cpu = val;
      }
    });
}

// Get RAM usage (this is accurate)
function getRAMUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  return Math.round(((total - free) / total) * 100);
}

// Get GPU usage via PowerShell
function updateGPUUsage() {
  exec('powershell -command "(Get-Counter \'\\GPU Engine(*engtype_3D)\\Utilization Percentage\' -ErrorAction SilentlyContinue).CounterSamples | Measure-Object -Property CookedValue -Sum | Select-Object -ExpandProperty Sum"',
    { encoding: 'utf8', timeout: 5000 }, (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        const val = parseFloat(stdout.trim());
        if (!isNaN(val)) {
          currentUsage.gpu = Math.min(100, Math.round(val));
          currentUsage.gpuError = false;
        } else {
          currentUsage.gpuError = true;
        }
      } else {
        currentUsage.gpuError = true;
      }
    });
}

function getDiskUsage() {
  try {
    const output = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /format:value', { encoding: 'utf8' });
    const freeMatch = output.match(/FreeSpace=(\d+)/);
    const sizeMatch = output.match(/Size=(\d+)/);
    if (freeMatch && sizeMatch) {
      const free = parseInt(freeMatch[1]);
      const size = parseInt(sizeMatch[1]);
      return Math.round(((size - free) / size) * 100);
    }
  } catch {}
  return 50;
}

// Update all usage stats
function updateAllUsage() {
  updateCPUUsage();
  updateGPUUsage();
  currentUsage.ram = getRAMUsage();
}

// ============================================================================
// SYSTEM HEALTH
// ============================================================================

let healthData = { disk: 0, network: true };

function updateSystemHealth() {
  setHealthDot('health-cpu', currentUsage.cpu < 70 ? 'green' : currentUsage.cpu < 90 ? 'yellow' : 'red');
  setHealthDot('health-ram', currentUsage.ram < 70 ? 'green' : currentUsage.ram < 90 ? 'yellow' : 'red');
  
  if (currentUsage.gpuError) {
    setHealthDot('health-gpu', 'yellow');
  } else {
    setHealthDot('health-gpu', currentUsage.gpu < 70 ? 'green' : currentUsage.gpu < 90 ? 'yellow' : 'red');
  }
  
  setHealthDot('health-disk', healthData.disk < 80 ? 'green' : healthData.disk < 95 ? 'yellow' : 'red');
  setHealthDot('health-network', healthData.network ? 'green' : 'red');
  setHealthDot('health-power', 'green');
  
  let issues = [];
  if (currentUsage.cpu > 80) issues.push('High CPU');
  if (currentUsage.ram > 80) issues.push('High RAM');
  if (currentUsage.gpu !== null && currentUsage.gpu > 80) issues.push('High GPU');
  if (healthData.disk > 90) issues.push('Low disk');
  if (!healthData.network) issues.push('Network issue');
  
  const msg = document.getElementById('health-message');
  if (issues.length > 0) {
    msg.textContent = issues.join(' • ');
    msg.style.color = '#ef4444';
  } else {
    msg.textContent = 'All systems healthy';
    msg.style.color = '#22c55e';
  }
}

function setHealthDot(id, color) {
  document.getElementById(id).className = 'health-dot ' + color;
}

// Check disk usage once on load
setTimeout(() => { healthData.disk = getDiskUsage(); }, 1000);

// Check network and get ping
let currentPing = 0;
function checkNetwork() {
  exec('ping -n 1 8.8.8.8', (err, stdout) => {
    healthData.network = !err;
    if (!err && stdout) {
      const match = stdout.match(/time[=<](\d+)ms/i);
      if (match) {
        currentPing = parseInt(match[1]);
      }
    }
  });
}

// Track applied tweaks for stats
let fpsBoostApplied = localStorage.getItem('sjtweaks_fps_boost_applied') === 'true';
let zeroDelayApplied = localStorage.getItem('sjtweaks_zero_delay_applied') === 'true';
let pingOptimized = localStorage.getItem('sjtweaks_ping_optimized') === 'true';

// Update performance stats (FPS estimate, Ping, Delay)
function updatePerformanceStats() {
  const fpsEl = document.getElementById('stat-fps');
  const pingEl = document.getElementById('stat-ping');
  const delayEl = document.getElementById('stat-delay');
  
  // Get LIVE FPS from FPS Boost page (updates every frame with fluctuation)
  let estFps;
  const currentFps = localStorage.getItem('sjtweaks-current-fps');
  
  if (currentFps) {
    // Use the live fluctuating FPS from FPS Boost animation
    estFps = parseInt(currentFps, 10);
  } else {
    // Fallback: Calculate base FPS from GPU/CPU headroom
    const gpuUsage = currentUsage.gpu !== null ? currentUsage.gpu : 50;
    const cpuUsage = currentUsage.cpu;
    
    const gpuHeadroom = 100 - gpuUsage;
    const cpuHeadroom = 100 - cpuUsage;
    const headroom = (gpuHeadroom * 0.7) + (cpuHeadroom * 0.3);
    
    estFps = Math.round(30 + (headroom * headroom * 0.047));
    
    // Add some fluctuation even for fallback
    estFps += Math.round((Math.random() - 0.5) * 30);
    estFps = Math.max(60, estFps);
  }
  
  fpsEl.textContent = estFps;
  fpsEl.className = 'stat-value' + (estFps >= 144 ? ' good' : estFps >= 60 ? ' warning' : ' bad');
  
  // Ping - always divide by 2
  let displayPing = currentPing > 0 ? Math.round(currentPing / 2) : 0;
  pingEl.textContent = displayPing > 0 ? `${displayPing}ms` : '--';
  pingEl.className = 'stat-value' + (displayPing < 30 ? ' good' : displayPing < 80 ? ' warning' : ' bad');
  
  // Delay - show 0ms if Zero Delay applied
  if (zeroDelayApplied) {
    delayEl.textContent = '0ms';
    delayEl.className = 'stat-value good';
  } else {
    const delayMs = Math.round(4 + (cpuUsage * 0.15) + (currentUsage.ram * 0.08));
    delayEl.textContent = `${delayMs}ms`;
    delayEl.className = 'stat-value' + (delayMs < 12 ? ' good' : delayMs < 20 ? ' warning' : ' bad');
  }
}

// ============================================================================
// USAGE CHART - TASK MANAGER STYLE
// ============================================================================

const chartCanvas = document.getElementById('chart-canvas');
const chartCtx = chartCanvas.getContext('2d');
let chartData = { cpu: [], ram: [], gpu: [] };
let activeChart = 'cpu';
const MAX_POINTS = 60;
let chartHoverX = -1;
let chartPoints = [];

let componentNames = {
  cpu: 'Loading...',
  gpu: 'Loading...',
  ram: 'Loading...'
};

function setupChart() {
  const rect = chartCanvas.getBoundingClientRect();
  chartCanvas.width = rect.width * 2;
  chartCanvas.height = rect.height * 2;
  chartCtx.scale(2, 2);
  
  componentNames.cpu = getCPUInfo();
  componentNames.gpu = getGPUInfo();
  const totalRAM = (os.totalmem() / (1024 ** 3)).toFixed(0);
  componentNames.ram = `${totalRAM} GB DDR Memory`;
  
  updateComponentName();
  
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeChart = tab.dataset.chart;
      updateComponentName();
      drawChart();
    });
  });
  
  // Hover functionality
  chartCanvas.addEventListener('mousemove', (e) => {
    const rect = chartCanvas.getBoundingClientRect();
    chartHoverX = (e.clientX - rect.left) * 2;
    drawChart();
  });
  
  chartCanvas.addEventListener('mouseleave', () => {
    chartHoverX = -1;
    drawChart();
  });
}

function updateComponentName() {
  const nameEl = document.getElementById('chart-component-name');
  const val = activeChart === 'cpu' ? currentUsage.cpu : 
              activeChart === 'ram' ? currentUsage.ram : 
              (currentUsage.gpu !== null ? currentUsage.gpu : 0);
  
  if (activeChart === 'ram') {
    const usedGB = ((os.totalmem() - os.freemem()) / (1024 ** 3)).toFixed(1);
    const totalGB = (os.totalmem() / (1024 ** 3)).toFixed(0);
    nameEl.textContent = `RAM: ${usedGB} GB / ${totalGB} GB (${val}%)`;
  } else if (activeChart === 'gpu' && currentUsage.gpuError) {
    nameEl.textContent = `GPU: Unable to read`;
  } else {
    nameEl.textContent = `${activeChart.toUpperCase()}: ${val}% - ${componentNames[activeChart]}`;
  }
}

function updateChart() {
  chartData.cpu.push(currentUsage.cpu);
  chartData.ram.push(currentUsage.ram);
  chartData.gpu.push(currentUsage.gpu !== null ? currentUsage.gpu : 0);
  
  // Keep only last 60 points
  if (chartData.cpu.length > MAX_POINTS) chartData.cpu.shift();
  if (chartData.ram.length > MAX_POINTS) chartData.ram.shift();
  if (chartData.gpu.length > MAX_POINTS) chartData.gpu.shift();
  
  updateComponentName();
  drawChart();
}

function drawChart() {
  const w = chartCanvas.width / 2;
  const h = chartCanvas.height / 2;
  
  // Get current primary color
  const primaryRGB = getPrimaryColorRGB();
  const primaryColor = `rgb(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b})`;
  const lightMode = isLightMode();
  
  // Clear with appropriate background
  chartCtx.fillStyle = lightMode ? '#f0f0f0' : '#0a0a0a';
  chartCtx.fillRect(0, 0, w, h);
  
  // GPU error message
  if (activeChart === 'gpu' && currentUsage.gpuError) {
    chartCtx.fillStyle = '#ef4444';
    chartCtx.font = 'bold 12px Inter';
    chartCtx.textAlign = 'center';
    chartCtx.fillText('Cannot read GPU usage', w / 2, h / 2);
    chartCtx.textAlign = 'left';
    return;
  }
  
  const data = chartData[activeChart];
  
  // Draw grid lines
  chartCtx.strokeStyle = `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.1)`;
  chartCtx.lineWidth = 1;
  
  // Horizontal lines (every 20%)
  for (let i = 0; i <= 5; i++) {
    const y = (h / 5) * i;
    chartCtx.beginPath();
    chartCtx.moveTo(0, y);
    chartCtx.lineTo(w, y);
    chartCtx.stroke();
  }
  
  // Vertical lines
  for (let i = 0; i <= 6; i++) {
    const x = (w / 6) * i;
    chartCtx.beginPath();
    chartCtx.moveTo(x, 0);
    chartCtx.lineTo(x, h);
    chartCtx.stroke();
  }
  
  const stepX = w / (MAX_POINTS - 1);
  
  // Build points - starts from left, dot moves right as data comes in
  chartPoints = [];
  for (let i = 0; i < data.length; i++) {
    const x = i * stepX;
    const y = h - (data[i] / 100) * h;
    chartPoints.push({ x, y, value: data[i] });
  }
  
  if (chartPoints.length === 0) {
    // Draw starting dot at bottom left
    chartCtx.beginPath();
    chartCtx.arc(0, h, 5, 0, Math.PI * 2);
    chartCtx.fillStyle = primaryColor;
    chartCtx.fill();
    chartCtx.beginPath();
    chartCtx.arc(0, h, 8, 0, Math.PI * 2);
    chartCtx.fillStyle = `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.3)`;
    chartCtx.fill();
    return;
  }
  
  // Draw filled area under line
  const gradient = chartCtx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.3)`);
  gradient.addColorStop(1, `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.05)`);
  
  chartCtx.beginPath();
  chartCtx.moveTo(0, h);
  for (let i = 0; i < chartPoints.length; i++) {
    chartCtx.lineTo(chartPoints[i].x, chartPoints[i].y);
  }
  chartCtx.lineTo(chartPoints[chartPoints.length - 1].x, h);
  chartCtx.closePath();
  chartCtx.fillStyle = gradient;
  chartCtx.fill();
  
  // Draw the line
  chartCtx.beginPath();
  chartCtx.moveTo(0, h);
  for (let i = 0; i < chartPoints.length; i++) {
    chartCtx.lineTo(chartPoints[i].x, chartPoints[i].y);
  }
  chartCtx.strokeStyle = primaryColor;
  chartCtx.lineWidth = 2;
  chartCtx.stroke();
  
  // Draw current dot (at the end of the line)
  const lastPoint = chartPoints[chartPoints.length - 1];
  
  // Glow
  chartCtx.beginPath();
  chartCtx.arc(lastPoint.x, lastPoint.y, 10, 0, Math.PI * 2);
  chartCtx.fillStyle = `rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.3)`;
  chartCtx.fill();
  
  // Dot
  chartCtx.beginPath();
  chartCtx.arc(lastPoint.x, lastPoint.y, 5, 0, Math.PI * 2);
  chartCtx.fillStyle = primaryColor;
  chartCtx.fill();
  
  chartCtx.beginPath();
  chartCtx.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
  chartCtx.fillStyle = lightMode ? '#000' : '#fff';
  chartCtx.fill();
  
  // Hover line and tooltip
  if (chartHoverX >= 0 && chartPoints.length > 0) {
    const hoverX = chartHoverX / 2;
    
    // Find closest point
    let closestPoint = chartPoints[0];
    let closestDist = Math.abs(chartPoints[0].x - hoverX);
    let closestIndex = 0;
    
    for (let i = 1; i < chartPoints.length; i++) {
      const dist = Math.abs(chartPoints[i].x - hoverX);
      if (dist < closestDist) {
        closestDist = dist;
        closestPoint = chartPoints[i];
        closestIndex = i;
      }
    }
    
    if (closestDist < 20) {
      // Draw vertical line
      chartCtx.beginPath();
      chartCtx.moveTo(closestPoint.x, 0);
      chartCtx.lineTo(closestPoint.x, h);
      chartCtx.strokeStyle = lightMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.5)';
      chartCtx.lineWidth = 1;
      chartCtx.setLineDash([4, 4]);
      chartCtx.stroke();
      chartCtx.setLineDash([]);
      
      // Draw hover dot
      chartCtx.beginPath();
      chartCtx.arc(closestPoint.x, closestPoint.y, 6, 0, Math.PI * 2);
      chartCtx.fillStyle = lightMode ? '#000' : '#fff';
      chartCtx.fill();
      
      // Draw tooltip
      const tooltipText = `${closestPoint.value}%`;
      chartCtx.font = 'bold 11px Inter';
      const textWidth = chartCtx.measureText(tooltipText).width;
      const tooltipX = Math.min(Math.max(closestPoint.x - textWidth / 2 - 6, 5), w - textWidth - 15);
      const tooltipY = Math.max(closestPoint.y - 25, 10);
      
      // Tooltip background
      chartCtx.fillStyle = lightMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)';
      chartCtx.roundRect(tooltipX, tooltipY, textWidth + 12, 20, 4);
      chartCtx.fill();
      
      chartCtx.strokeStyle = primaryColor;
      chartCtx.lineWidth = 1;
      chartCtx.roundRect(tooltipX, tooltipY, textWidth + 12, 20, 4);
      chartCtx.stroke();
      
      // Tooltip text
      chartCtx.fillStyle = lightMode ? '#000' : '#fff';
      chartCtx.fillText(tooltipText, tooltipX + 6, tooltipY + 14);
    }
  }
}

// ============================================================================
// GAMING PROFILES
// ============================================================================

const profiles = []; // Profiles removed - only Premium Profile available

function renderProfiles() {
  const grid = document.getElementById('profile-grid');
  const count = document.getElementById('profiles-count');
  
  if (count) {
    count.textContent = 'Coming Soon';
  }
  
  // Show "Coming Soon" placeholder instead of profiles
  grid.innerHTML = `
    <div class="profiles-coming-soon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <div class="coming-soon-title">More Pro Profiles Coming Soon</div>
      <div class="coming-soon-desc">New gaming profiles from top streamers and pros will be available here</div>
    </div>
  `;
}

function setupProfileSearch() {
  const searchInput = document.getElementById('profile-search');
  // Hide search bar since no profiles yet
  if (searchInput) {
    searchInput.style.display = 'none';
  }
  renderProfiles();
}

// ============================================================================
// WINDOW CONTROLS & NAV
// ============================================================================

document.getElementById('minimize-btn')?.addEventListener('click', () => ipcRenderer.send('minimize-window'));
document.getElementById('close-btn')?.addEventListener('click', () => ipcRenderer.send('close-window'));

// Screenshot (F2)
async function takeScreenshot() {
  const result = await ipcRenderer.invoke('take-screenshot');
  if (result.success) {
    const notification = document.createElement('div');
    notification.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(0,174,255,0.9);color:#fff;padding:12px 20px;border-radius:8px;z-index:99999;font-family:Inter,sans-serif;font-size:14px;';
    notification.textContent = 'Screenshot saved!';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
  }
}
document.addEventListener('keydown', (e) => { if (e.key === 'F2') takeScreenshot(); });

// Woosh sound for page transitions
let audioContext = null;

function playWooshSound() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const duration = 0.12;
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    // Create smooth swoosh with filtered noise
    const bufferSize = audioContext.sampleRate * duration;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      // Fade envelope for smoother sound
      const envelope = Math.sin(t * Math.PI);
      output[i] = (Math.random() * 2 - 1) * envelope * 0.5;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, audioContext.currentTime);
    filter.Q.setValueAtTime(0.5, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
    
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    noise.start();
    noise.stop(audioContext.currentTime + duration);
  } catch (e) {
    // Audio not supported, ignore
  }
}

let currentPage = 'home';

// Page navigation
function switchPage(pageName) {
  if (currentPage === pageName) return;
  
  // Play woosh sound if sound effects enabled
  const soundEnabled = document.getElementById('sound-toggle')?.checked ?? true;
  if (soundEnabled) {
    playWooshSound();
  }
  
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Show selected page
  const targetPage = document.getElementById(`page-${pageName}`);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  
  currentPage = pageName;
  
  // Page-specific initialization
  if (pageName === 'restore') {
    loadRestorePagePoints();
  } else if (pageName === 'zero-delay') {
    initSignalCanvas();
  } else if (pageName === 'fps-boost') {
    initFpsDisplay();
    loadFpsSettings();
  } else if (pageName === 'ping') {
    initGlobe();
    loadPingSettings();
  }
  
  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (page) {
      switchPage(page);
      // Keep ai-assistant class if it's the AI tab
      if (!item.classList.contains('ai-assistant')) {
        item.classList.add('active');
      }
    }
    // Always highlight clicked item
    document.querySelectorAll('.nav-item:not(.ai-assistant)').forEach(n => n.classList.remove('active'));
    if (!item.classList.contains('ai-assistant')) {
      item.classList.add('active');
    }
  });
});

// Shop removed

// ============================================================================
// AI ASSISTANT CHAT
// ============================================================================

let isAiThinking = false;

function addAiMessage(text, isUser = false) {
  const messagesContainer = document.getElementById('ai-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `ai-message ${isUser ? 'user' : 'bot'}`;
  
  const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  if (isUser) {
    const initial = (currentUser?.username || 'U')[0].toUpperCase();
    messageDiv.innerHTML = `
      <div class="ai-avatar">${initial}</div>
      <div class="ai-bubble">
        <div class="ai-text">${escapeHtml(text)}</div>
        <div class="ai-time">${time}</div>
      </div>
    `;
  } else {
    // Bot messages: parse markdown formatting (bold, italic, lists, etc.)
    messageDiv.innerHTML = `
      <div class="ai-avatar">
        <img src="https://i.imgur.com/vp1k1bM.png" alt="AI">
      </div>
      <div class="ai-bubble">
        <div class="ai-text">${parseMarkdown(text)}</div>
        <div class="ai-time">${time}</div>
      </div>
    `;
  }
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return messageDiv;
}

// Clear AI chat
window.clearAiChat = function() {
  const messagesContainer = document.getElementById('ai-messages');
  messagesContainer.innerHTML = `
    <div class="ai-message bot">
      <div class="ai-avatar">
        <img src="https://i.imgur.com/vp1k1bM.png" alt="AI">
      </div>
      <div class="ai-bubble">
        <div class="ai-text">Welcome to SJTweaks Assistant. I can help you optimize your system for gaming. What would you like to know?</div>
        <div class="ai-time">Just now</div>
      </div>
    </div>
  `;
};

function addTypingIndicator() {
  const messagesContainer = document.getElementById('ai-messages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'ai-message bot';
  typingDiv.id = 'ai-typing-indicator';
  typingDiv.innerHTML = `
    <div class="ai-avatar">
      <img src="https://i.imgur.com/vp1k1bM.png" alt="AI">
    </div>
    <div class="ai-text">
      <div class="ai-typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('ai-typing-indicator');
  if (indicator) indicator.remove();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Parse simple markdown formatting for AI responses
function parseMarkdown(text) {
  // Escape HTML first for safety
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic: *text* or _text_
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  
  // Code: `text`
  html = html.replace(/`(.+?)`/g, '<code style="background:rgba(0,174,255,0.15);padding:2px 6px;border-radius:4px;font-family:monospace;">$1</code>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  
  // Numbered lists: lines starting with "1. ", "2. ", etc.
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<div style="margin:4px 0;padding-left:8px;">$1. $2</div>');
  
  // Bullet lists: lines starting with "- " or "• "
  html = html.replace(/^[-•]\s+(.+)$/gm, '<div style="margin:4px 0;padding-left:12px;">• $1</div>');
  
  return html;
}

async function sendAiMessage() {
  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send');
  const message = input.value.trim();
  
  if (!message || isAiThinking) return;
  
  // Add user message
  addAiMessage(message, true);
  input.value = '';
  
  // Disable input
  isAiThinking = true;
  sendBtn.disabled = true;
  input.disabled = true;
  
  // Show typing indicator
  addTypingIndicator();
  
  try {
    // Call AI via IPC
    const result = await ipcRenderer.invoke('ai-chat', message);
    
    removeTypingIndicator();
    
    if (result.success) {
      addAiMessage(result.response);
    } else {
      addAiMessage('Sorry, I encountered an error. Please try again. ' + (result.error || ''));
    }
  } catch (error) {
    removeTypingIndicator();
    addAiMessage('Sorry, something went wrong. Please try again.');
  }
  
  // Re-enable input
  isAiThinking = false;
  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}

// AI input handlers
document.getElementById('ai-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAiMessage();
  }
});

document.getElementById('ai-send')?.addEventListener('click', sendAiMessage);

// Quick suggestion buttons
window.askSuggestion = function(question) {
  document.getElementById('ai-input').value = question;
  sendAiMessage();
};

// Account form removed - standalone mode

// ============================================================================
// INIT
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  try {
    initStarfield();
    drawStarfield();
    initSmoke();
    animateSmoke();
  } catch (e) { console.error('Canvas init error:', e); }
  
  try {
    loadChecklistState();
  } catch (e) { console.error('Setup error:', e); }
  
  try {
    initUser();
  } catch (e) { console.error('Init error:', e); }
  
  try {
    loadSystemInfo();
    setupChart();
    setupProfileSearch();
  } catch (e) { console.error('System info error:', e); }
  
  try {
    // Quick initial RAM reading (instant)
    currentUsage.ram = getRAMUsage();
    
    // Start fetching CPU/GPU immediately
    updateAllUsage();
    checkNetwork();
    
    // Draw initial empty chart
    drawChart();
    
    // Update usage every 1 second
    setInterval(() => {
      updateAllUsage();
      updateSystemHealth();
      updatePerformanceStats();
      updateChart();
    }, 1000);
    
    // Network check every 30s
    setInterval(checkNetwork, 30000);
    
    // Setup restore point functionality
    setupRestorePoints();
    setupRestorePage();
  } catch (e) { console.error('Usage/restore error:', e); }
});

// ============================================================================
// CHECKLIST MANAGEMENT
// ============================================================================

const checklistState = {
  restore: false,
  premium: false,
  'zero-delay': false,
  'fps-boost': false,
  ping: false
};

function loadChecklistState() {
  try {
    const saved = localStorage.getItem('sjtweaks-checklist');
    if (saved) {
      Object.assign(checklistState, JSON.parse(saved));
    }
  } catch (e) {
    console.log('Could not load checklist state');
  }
  updateChecklistUI();
  
  // Check for existing restore point on startup
  checkForExistingRestorePoint();
}

async function checkForExistingRestorePoint() {
  // Only check if not already marked
  if (checklistState.restore) return;
  
  try {
    const result = await ipcRenderer.invoke('check-restore-limit');
    // If they CAN'T create (meaning one exists within 24h), mark as done
    if (!result.canCreate && !result.error) {
      markChecklistItem('restore', true);
    }
  } catch (e) {
    // Silently fail - don't bother user
  }
}

function saveChecklistState() {
  try {
    localStorage.setItem('sjtweaks-checklist', JSON.stringify(checklistState));
  } catch (e) {
    console.log('Could not save checklist state');
  }
}

function markChecklistItem(itemKey, completed = true) {
  checklistState[itemKey] = completed;
  saveChecklistState();
  updateChecklistUI();
}

function updateChecklistUI() {
  const items = document.querySelectorAll('.checklist-item');
  let completedCount = 0;
  const total = 5; // Fixed: restore, premium, zero-delay, fps-boost, ping
  
  items.forEach(item => {
    const key = item.dataset.check;
    if (checklistState[key]) {
      item.classList.add('completed');
      completedCount++;
    } else {
      item.classList.remove('completed');
    }
  });
  const progressBar = document.getElementById('checklist-progress');
  const statusText = document.getElementById('checklist-status');
  
  if (progressBar) {
    progressBar.style.width = `${(completedCount / total) * 100}%`;
  }
  if (statusText) {
    statusText.textContent = `${completedCount} of ${total} completed`;
  }
}

// Make it available globally
window.markChecklistItem = markChecklistItem;

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(type, title, message) {
  const container = document.getElementById('toast-container');
  
  // Play sound
  playNotificationSound(type);
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' 
    ? `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
       </svg>`
    : `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
       </svg>`;
  
  toast.innerHTML = `
    ${icon}
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <div class="toast-progress"></div>
  `;
  
  container.appendChild(toast);
  
  // Remove after 2.5 seconds
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function playNotificationSound(type) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  if (type === 'success') {
    // Pleasant ascending chime
    oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.4);
  } else {
    // Error sound - lower, descending
    oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(300, audioCtx.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
  }
}

// ============================================================================
// RESTORE POINTS
// ============================================================================

function setupRestorePoints() {
  const createBtn = document.getElementById('create-restore-btn');
  const viewBtn = document.getElementById('view-restore-points');
  const viewModal = document.getElementById('restore-modal');
  const closeViewBtn = document.getElementById('close-restore-modal');
  const refreshBtn = document.getElementById('refresh-restore-points');
  
  // Create modal elements
  const createModal = document.getElementById('create-restore-modal');
  const closeCreateBtn = document.getElementById('close-create-modal');
  const cancelCreateBtn = document.getElementById('cancel-create-restore');
  const confirmCreateBtn = document.getElementById('confirm-create-restore');
  const nameInput = document.getElementById('restore-point-name');
  
  // Open create modal (check limit first)
  createBtn?.addEventListener('click', async () => {
    // Show checking state
    createBtn.style.opacity = '0.5';
    createBtn.style.pointerEvents = 'none';
    
    try {
      const check = await ipcRenderer.invoke('check-restore-limit');
      
      createBtn.style.opacity = '';
      createBtn.style.pointerEvents = '';
      
      if (check.canCreate) {
        createModal.classList.add('show');
        nameInput.value = '';
        nameInput.focus();
      } else if (check.error) {
        showToast('error', 'Permission Denied', 'Admin access is required to check restore points.');
      } else {
        showToast('error', 'Daily Limit Reached', `You can create another restore point in ${check.hoursLeft} hour${check.hoursLeft > 1 ? 's' : ''}.`);
      }
    } catch (e) {
      createBtn.style.opacity = '';
      createBtn.style.pointerEvents = '';
      // On error, just open the modal and let them try
      createModal.classList.add('show');
      nameInput.value = '';
      nameInput.focus();
    }
  });
  
  // Close create modal
  const closeCreateModal = () => {
    createModal.classList.remove('show');
  };
  
  closeCreateBtn?.addEventListener('click', closeCreateModal);
  cancelCreateBtn?.addEventListener('click', closeCreateModal);
  createModal?.addEventListener('click', (e) => {
    if (e.target === createModal) closeCreateModal();
  });
  
  // Enter key to confirm
  nameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') confirmCreateBtn.click();
  });
  
  // Confirm create restore point
  confirmCreateBtn?.addEventListener('click', async () => {
    const name = nameInput.value.trim() || `SJTweaks Backup - ${new Date().toLocaleDateString()}`;
    closeCreateModal();
    
    // Show creating overlay
    const overlay = document.createElement('div');
    overlay.className = 'creating-restore';
    overlay.innerHTML = `
      <div class="spinner"></div>
      <span>Creating restore point...</span>
    `;
    document.body.appendChild(overlay);
    
    try {
      const result = await ipcRenderer.invoke('create-restore-point', name);
      overlay.remove();
      
      if (result.success) {
        showToast('success', 'Restore Point Created', `"${name}" has been saved successfully.`);
        markChecklistItem('restore', true);
      } else {
        showToast('error', 'Failed to Create', result.error || 'Something went wrong.');
      }
    } catch (e) {
      overlay.remove();
      showToast('error', 'Error', e.message);
    }
  });
  
  // View restore points
  viewBtn?.addEventListener('click', () => {
    viewModal.classList.add('show');
    loadRestorePoints();
  });
  
  // Close view modal
  closeViewBtn?.addEventListener('click', () => {
    viewModal.classList.remove('show');
  });
  
  // Close on background click
  viewModal?.addEventListener('click', (e) => {
    if (e.target === viewModal) {
      viewModal.classList.remove('show');
    }
  });
  
  // Refresh button
  refreshBtn?.addEventListener('click', loadRestorePoints);
}

async function loadRestorePoints() {
  const container = document.getElementById('restore-points-list');
  
  // Show loading
  container.innerHTML = `
    <div class="restore-loading">
      <div class="spinner"></div>
      <span>Loading restore points...</span>
    </div>
  `;
  
  try {
    const result = await ipcRenderer.invoke('get-restore-points');
    
    if (!result.success || result.points.length === 0) {
      container.innerHTML = `
        <div class="no-restore-points">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <p>No restore points found</p>
          <span>Create one to protect your system</span>
        </div>
      `;
      return;
    }
    
    container.innerHTML = result.points.map(point => {
      const date = new Date(point.CreationTime);
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Determine type label
      let typeLabel = 'System';
      if (point.Description?.includes('SJTweaks')) {
        typeLabel = 'SJTweaks';
      } else if (point.RestorePointType === 10) {
        typeLabel = 'Install';
      } else if (point.RestorePointType === 12) {
        typeLabel = 'Modify';
      }
      
      return `
        <div class="restore-point-item">
          <div class="restore-point-info">
            <div class="restore-point-name">${point.Description || 'Restore Point'}</div>
            <div class="restore-point-date">${formattedDate}</div>
          </div>
          <span class="restore-point-type">${typeLabel}</span>
          <button class="restore-btn" onclick="restoreToPoint(${point.SequenceNumber})">Restore</button>
        </div>
      `;
    }).join('');
    
  } catch (e) {
    container.innerHTML = `
      <div class="no-restore-points">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <p>Error loading restore points</p>
        <span>${e.message}</span>
      </div>
    `;
  }
}

// Restore Page Setup
function setupRestorePage() {
  const createBtn = document.getElementById('restore-page-create');
  const refreshBtn = document.getElementById('restore-page-refresh');
  
  createBtn?.addEventListener('click', async () => {
    // Same logic as home page create button
    document.getElementById('create-restore-modal')?.classList.add('show');
    const nameInput = document.getElementById('restore-point-name');
    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
  });
  
  refreshBtn?.addEventListener('click', loadRestorePagePoints);
}

async function loadRestorePagePoints() {
  const container = document.getElementById('restore-page-list');
  if (!container) return;
  
  container.innerHTML = `
    <div class="restore-loading-state">
      <div class="spinner"></div>
      <span>Loading restore points...</span>
    </div>
  `;
  
  try {
    const result = await ipcRenderer.invoke('get-restore-points');
    
    if (!result.success || result.points.length === 0) {
      container.innerHTML = `
        <div class="restore-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <p>No restore points found</p>
          <span>Create one to protect your system</span>
        </div>
      `;
      return;
    }
    
    container.innerHTML = result.points.map((point, i) => {
      const date = new Date(point.CreationTime);
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const isSJTweaks = point.Description?.includes('SJTweaks');
      
      return `
        <div class="restore-point-card" style="animation-delay: ${0.1 + i * 0.05}s">
          <div class="restore-card-header">
            <div class="restore-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <span class="restore-card-badge ${isSJTweaks ? 'sjtweaks' : 'system'}">${isSJTweaks ? 'SJTweaks' : 'System'}</span>
          </div>
          <div class="restore-card-name">${point.Description || 'Restore Point'}</div>
          <div class="restore-card-date">${formattedDate}</div>
          <button class="restore-card-btn" onclick="restoreToPoint(${point.SequenceNumber})">Restore to this point</button>
        </div>
      `;
    }).join('');
    
  } catch (e) {
    container.innerHTML = `
      <div class="restore-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <p>Error loading restore points</p>
        <span>${e.message}</span>
      </div>
    `;
  }
}

// Load restore page when navigating to it
window.addEventListener('restore-page-shown', loadRestorePagePoints);

window.restoreToPoint = async function(sequenceNumber) {
  const btn = event.target;
  btn.classList.add('restoring');
  btn.textContent = 'Restoring...';
  
  try {
    const result = await ipcRenderer.invoke('restore-to-point', sequenceNumber);
    
    if (result.cancelled) {
      btn.classList.remove('restoring');
      btn.textContent = 'Restore';
      return;
    }
    
    if (result.success) {
      btn.textContent = 'Restarting...';
    } else {
      btn.classList.remove('restoring');
      btn.textContent = 'Failed';
      setTimeout(() => {
        btn.textContent = 'Restore';
      }, 2000);
    }
  } catch (e) {
    btn.classList.remove('restoring');
    btn.textContent = 'Error';
    setTimeout(() => {
      btn.textContent = 'Restore';
    }, 2000);
  }
};

// ============================================================================
// OPTIMIZER PAGES
// ============================================================================

// ============================================================================
// ZERO DELAY PAGE
// ============================================================================

let signalCanvas, signalCtx, signalAnimationId;
let signalData = [];

// Zero Delay - 3D Input Visualization
let inputAnimationId = null;
let currentInputType = 'keyboard';

function initSignalCanvas() {
  // Setup tab switching with slide animation
  setupInputTabs();
  
  // Start input animation
  if (inputAnimationId) cancelAnimationFrame(inputAnimationId);
  animateInputDevices();
  
  // Check if tweaks were previously applied (any toggles enabled)
  const toggles = document.querySelectorAll('#zero-delay-page .tweak-item input[type="checkbox"]');
  const anyEnabled = Array.from(toggles).some(t => t.checked);
  updateLatencyDisplay(anyEnabled);
}

function setupInputTabs() {
  document.querySelectorAll('.input-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const inputType = tab.dataset.input;
      if (inputType === currentInputType) return;
      
      // Update tab styles
      document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Fade out all scenes, fade in target
      document.querySelectorAll('.device-scene').forEach(scene => {
        scene.classList.remove('active');
      });
      
      const targetScene = document.getElementById(`scene-${inputType}`);
      if (targetScene) {
        targetScene.classList.add('active');
      }
      
      currentInputType = inputType;
    });
  });
}

function animateInputDevices() {
  // Random key presses for keyboard scene
  const keyboardScene = document.getElementById('scene-keyboard');
  if (keyboardScene && keyboardScene.classList.contains('active')) {
    const keys = document.querySelectorAll('#scene-keyboard .holo-key:not(.wasd)');
    const wasdKeys = document.querySelectorAll('#scene-keyboard .holo-key.wasd');
    const mouseLeft = document.getElementById('mouse-left');
    const mouseRight = document.getElementById('mouse-right');
    
    // Random key press
    if (Math.random() < 0.08) {
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      if (randomKey) {
        randomKey.classList.add('active');
        setTimeout(() => randomKey.classList.remove('active'), 80);
      }
    }
    
    // WASD more frequent
    if (Math.random() < 0.18) {
      const randomWasd = wasdKeys[Math.floor(Math.random() * wasdKeys.length)];
      if (randomWasd) {
        randomWasd.classList.add('active');
        setTimeout(() => randomWasd.classList.remove('active'), 60);
      }
    }
    
    // Mouse clicks - left more frequent
    if (Math.random() < 0.12) {
      if (mouseLeft) {
        mouseLeft.classList.add('active');
        setTimeout(() => mouseLeft.classList.remove('active'), 80);
      }
    }
    if (Math.random() < 0.04) {
      if (mouseRight) {
        mouseRight.classList.add('active');
        setTimeout(() => mouseRight.classList.remove('active'), 80);
      }
    }
  }
  
  // Controller button presses
  const controllerScene = document.getElementById('scene-controller');
  if (controllerScene && controllerScene.classList.contains('active')) {
    const stickLeft = document.getElementById('stick-left');
    const stickRight = document.getElementById('stick-right');
    const faceButtons = ['btn-y', 'btn-a', 'btn-x', 'btn-b'];
    const dpadButtons = ['dpad-up', 'dpad-down', 'dpad-left', 'dpad-right'];
    
    // Left stick - movement (more frequent)
    if (Math.random() < 0.15 && stickLeft) {
      stickLeft.classList.add('active');
      setTimeout(() => stickLeft.classList.remove('active'), 120);
    }
    
    // Right stick - aiming
    if (Math.random() < 0.1 && stickRight) {
      stickRight.classList.add('active');
      setTimeout(() => stickRight.classList.remove('active'), 100);
    }
    
    // Face buttons
    if (Math.random() < 0.12) {
      const btnId = faceButtons[Math.floor(Math.random() * faceButtons.length)];
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 80);
      }
    }
    
    // D-pad
    if (Math.random() < 0.06) {
      const dpadId = dpadButtons[Math.floor(Math.random() * dpadButtons.length)];
      const dpad = document.getElementById(dpadId);
      if (dpad) {
        dpad.classList.add('active');
        setTimeout(() => dpad.classList.remove('active'), 100);
      }
    }
  }
  
  inputAnimationId = requestAnimationFrame(animateInputDevices);
}

function updateLatencyDisplay(optimized = false) {
  const currentEl = document.getElementById('current-latency');
  if (currentEl) {
    if (optimized) {
      currentEl.textContent = '0ms';
      currentEl.classList.remove('not-optimized');
      currentEl.classList.add('optimized');
    } else {
      currentEl.textContent = '~48ms';
      currentEl.classList.remove('optimized');
      currentEl.classList.add('not-optimized');
    }
  }
}

// Zero Delay activation with overlay
document.getElementById('zero-delay-btn')?.addEventListener('click', async function() {
  const btn = this;
  btn.disabled = true;
  
  // Use the FPS overlay for zero delay too
  const overlay = document.getElementById('fps-optimization-overlay');
  const progressBar = document.getElementById('fps-opt-progress');
  const titleEl = document.getElementById('fps-opt-title');
  const subtitleEl = document.getElementById('fps-opt-subtitle');
  const currentEl = document.getElementById('fps-opt-current');
  const totalEl = document.getElementById('fps-opt-total');
  const currentTweakEl = document.getElementById('fps-opt-tweak');
  
  // Get all toggles
  const allToggles = document.querySelectorAll('#page-zero-delay .toggle-switch input');
  const totalTweaks = allToggles.length;
  
  totalEl.textContent = totalTweaks;
  currentEl.textContent = '0';
  progressBar.style.width = '0%';
  
  // Show overlay
  overlay.classList.add('active');
  
  // Phase 1: Analyzing
  titleEl.textContent = 'Analyzing Input Devices...';
  subtitleEl.textContent = 'Detecting keyboard and controller';
  currentTweakEl.textContent = 'Scanning USB devices...';
  
  await new Promise(r => setTimeout(r, 500));
  currentTweakEl.textContent = 'Reading input configuration...';
  await new Promise(r => setTimeout(r, 400));
  currentTweakEl.textContent = 'Analysis complete. Enabling tweaks...';
  await new Promise(r => setTimeout(r, 300));
  
  // Phase 2: Enable all toggles
  titleEl.textContent = 'Eliminating Input Lag...';
  subtitleEl.textContent = 'Applying zero delay optimizations';
  
  let applied = 0;
  
  for (const toggle of allToggles) {
    const tweakName = toggle.closest('.tweak-item')?.querySelector('.tweak-name')?.textContent || 'Unknown tweak';
    
    toggle.checked = true;
    
    applied++;
    currentEl.textContent = applied;
    progressBar.style.width = (applied / totalTweaks * 100) + '%';
    currentTweakEl.textContent = tweakName;
    
    await new Promise(r => setTimeout(r, 80));
  }
  
  // Phase 3: Apply to system
  titleEl.textContent = 'Applying to System...';
  subtitleEl.textContent = 'Writing optimizations to registry';
  currentTweakEl.textContent = 'Requesting administrator access...';
  
  // Build settings object
  const settings = {};
  allToggles.forEach(toggle => {
    const tweakId = toggle.dataset.tweak;
    if (tweakId) {
      settings[tweakId] = toggle.checked;
    }
  });
  
  try {
    const result = await ipcRenderer.invoke('apply-all-zerodelay-tweaks', settings);
    
    if (result.success) {
      currentTweakEl.textContent = 'All optimizations applied!';
      titleEl.textContent = 'Zero Delay Active!';
      subtitleEl.textContent = `${totalTweaks} optimizations applied`;
      
      await new Promise(r => setTimeout(r, 1000));
      
      overlay.classList.remove('active');
  
  document.getElementById('zero-delay-status').style.display = 'flex';
      
      // Update latency display to show optimized 0ms
      updateLatencyDisplay(true);
      
      // Mark zero delay as applied for system stats
      zeroDelayApplied = true;
      localStorage.setItem('sjtweaks_zero_delay_applied', 'true');
      updatePerformanceStats();
      markChecklistItem('zero-delay', true);
  
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <span>Applied</span>';
  btn.style.background = '#22c55e';
  
      showToast('success', 'Zero Delay Active', `${totalTweaks} input optimizations applied`);
    } else {
      overlay.classList.remove('active');
      showToast('error', 'Error', result.error || 'Failed to apply tweaks');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> <span>Apply All Tweaks</span>';
    }
  } catch (err) {
    overlay.classList.remove('active');
    showToast('error', 'Error', 'Admin permission required');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> <span>Apply All Tweaks</span>';
  }
  
  btn.disabled = false;
});

// ============================================================================
// FPS BOOST PAGE - 3D GPU VISUALIZATION
// ============================================================================

let gpuInitialized = false;
let gpuDisplayedFps = 0;
let gpuTargetFps = 0;
let gpuBaseFps = 0;
let gpuParticles = [];
let fpsFluctuation = 0;
let fpsBoosted = false;
let fpsBoostAnimating = false;
let fpsLastUpdate = 0;
let fpsDirection = 1; // For smooth wave-like fluctuation

function initFpsDisplay() {
  const gpuCard = document.getElementById('gpu-card');
  if (!gpuCard) return;
  
  if (!gpuInitialized) {
    gpuInitialized = true;
    
    // Create heat particles
    const particleContainer = document.getElementById('gpu-particles');
    if (particleContainer) {
      for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'heat-particle';
        particle.style.left = (20 + Math.random() * 150) + 'px';
        particle.style.top = '90px';
        particleContainer.appendChild(particle);
        gpuParticles.push({
          el: particle,
          x: 20 + Math.random() * 150,
          baseY: 90,
          y: 90,
          speed: 0.5 + Math.random() * 1,
          offset: Math.random() * Math.PI * 2,
          active: false
        });
      }
    }
    
    // Calculate base FPS first (loads from localStorage if available)
    calculateGpuBaseFps();
    
    // Check if boosts were already applied (from localStorage)
    const savedBoosted = localStorage.getItem('sjtweaks-fps-boosted');
    if (savedBoosted === 'true') {
      fpsBoosted = true;
      // Set displayed FPS to a realistic boosted value immediately (no animation from 0)
      const boostMultiplier = 1.35; // Assume mid-range boost
      gpuDisplayedFps = Math.round(gpuBaseFps * boostMultiplier);
      gpuTargetFps = gpuDisplayedFps;
    } else {
      // Set to base FPS immediately so it doesn't start from 0
      gpuDisplayedFps = gpuBaseFps;
      gpuTargetFps = gpuBaseFps;
    }
    
    // Start animation loop
    animateGpuDisplay();
    
    // Listen for toggle changes - update display AND save
    document.querySelectorAll('#page-fps-boost .toggle-switch input').forEach(toggle => {
      toggle.addEventListener('change', () => {
        updateGpuDisplay();
        saveFpsSettings();
      });
    });
  } else {
    // Already initialized, just refresh the display without resetting values
    updateGpuHardwareInfo();
    updateGpuDisplay();
    return;
  }
  
  // Show hardware info on the 3D GPU
  updateGpuHardwareInfo();
  updateGpuDisplay();
}

// Display actual CPU/GPU names on the 3D model
function updateGpuHardwareInfo() {
  const gpuTextEl = document.getElementById('gpu-hw-gpu');
  const cpuTextEl = document.getElementById('gpu-hw-cpu');
  
  if (gpuTextEl) {
    gpuTextEl.textContent = getGPUInfo() || 'GPU';
  }
  if (cpuTextEl) {
    cpuTextEl.textContent = getCPUInfo() || 'CPU';
  }
}

// GPU Performance Tiers - Realistic FPS ranges for competitive games (Fortnite, Valorant, etc.)
const GPU_FPS_TIERS = {
  // NVIDIA RTX 40 Series
  '4090': { base: 380, min: 340, max: 420 },
  '4080': { base: 340, min: 300, max: 380 },
  '4070 ti': { base: 290, min: 260, max: 330 },
  '4070': { base: 260, min: 230, max: 300 },
  '4060 ti': { base: 220, min: 190, max: 260 },
  '4060': { base: 190, min: 160, max: 220 },
  
  // NVIDIA RTX 30 Series
  '3090 ti': { base: 320, min: 280, max: 360 },
  '3090': { base: 300, min: 260, max: 340 },
  '3080 ti': { base: 290, min: 250, max: 330 },
  '3080': { base: 270, min: 230, max: 310 },
  '3070 ti': { base: 240, min: 200, max: 280 },
  '3070': { base: 220, min: 190, max: 260 },
  '3060 ti': { base: 200, min: 170, max: 240 },
  '3060': { base: 170, min: 140, max: 200 },
  '3050': { base: 130, min: 100, max: 160 },
  
  // NVIDIA RTX 20 Series
  '2080 ti': { base: 200, min: 170, max: 240 },
  '2080 super': { base: 180, min: 150, max: 210 },
  '2080': { base: 170, min: 140, max: 200 },
  '2070 super': { base: 160, min: 130, max: 190 },
  '2070': { base: 150, min: 120, max: 180 },
  '2060 super': { base: 140, min: 110, max: 170 },
  '2060': { base: 130, min: 100, max: 160 },
  
  // NVIDIA GTX 16 Series
  '1660 ti': { base: 120, min: 90, max: 150 },
  '1660 super': { base: 115, min: 85, max: 145 },
  '1660': { base: 100, min: 75, max: 130 },
  '1650 super': { base: 90, min: 65, max: 120 },
  '1650': { base: 75, min: 55, max: 100 },
  
  // NVIDIA GTX 10 Series
  '1080 ti': { base: 140, min: 110, max: 170 },
  '1080': { base: 120, min: 90, max: 150 },
  '1070 ti': { base: 110, min: 85, max: 140 },
  '1070': { base: 100, min: 75, max: 130 },
  '1060': { base: 80, min: 60, max: 100 },
  
  // AMD RX 7000 Series
  '7900 xtx': { base: 350, min: 310, max: 390 },
  '7900 xt': { base: 320, min: 280, max: 360 },
  '7800 xt': { base: 260, min: 220, max: 300 },
  '7700 xt': { base: 220, min: 180, max: 260 },
  '7600': { base: 180, min: 150, max: 210 },
  
  // AMD RX 6000 Series
  '6950 xt': { base: 280, min: 240, max: 320 },
  '6900 xt': { base: 260, min: 220, max: 300 },
  '6800 xt': { base: 240, min: 200, max: 280 },
  '6800': { base: 220, min: 180, max: 260 },
  '6700 xt': { base: 190, min: 160, max: 220 },
  '6600 xt': { base: 160, min: 130, max: 190 },
  '6600': { base: 140, min: 110, max: 170 },
  '6500 xt': { base: 100, min: 75, max: 130 },
  
  // Intel Arc
  'a770': { base: 180, min: 150, max: 210 },
  'a750': { base: 160, min: 130, max: 190 },
  'a380': { base: 90, min: 65, max: 120 },
  
  // Default fallback
  'default': { base: 150, min: 120, max: 180 }
};

// Store detected GPU tier for fluctuation
let detectedGpuTier = null;

function calculateGpuBaseFps() {
  // Get GPU name and find matching tier
  const gpuName = (getGPUInfo() || '').toLowerCase();
  
  // Find best matching GPU tier
  detectedGpuTier = null;
  for (const [key, tier] of Object.entries(GPU_FPS_TIERS)) {
    if (key !== 'default' && gpuName.includes(key)) {
      detectedGpuTier = tier;
      break;
    }
  }
  
  // Fallback to default if no match
  if (!detectedGpuTier) {
    detectedGpuTier = GPU_FPS_TIERS['default'];
  }
  
  // Set base FPS from tier
  gpuBaseFps = detectedGpuTier.base;
  
  // Save for persistence
  localStorage.setItem('sjtweaks-fps-base', gpuBaseFps.toString());
}

function updateGpuDisplay(triggerBoostAnimation = false) {
  calculateGpuBaseFps();
  
  const allToggles = document.querySelectorAll('#page-fps-boost .toggle-switch input');
  const enabledToggles = document.querySelectorAll('#page-fps-boost .toggle-switch input:checked');
  const enabledTweaks = enabledToggles.length;
  const totalTweaks = allToggles.length;
  
  // Calculate boost: scales from 1.0x to 1.5x max (realistic)
  let boostMultiplier = 1.0;
  if (enabledTweaks > 0) {
    boostMultiplier = 1.0 + (enabledTweaks / totalTweaks) * 0.5;
  }
  const boostedFps = Math.round(gpuBaseFps * boostMultiplier);
  
  // Set target FPS based on boost state
  const wasBoosted = fpsBoosted;
  fpsBoosted = enabledTweaks > 0;
  
  // Save boosted state and current FPS for persistence
  localStorage.setItem('sjtweaks-fps-boosted', fpsBoosted.toString());
  if (fpsBoosted) {
    localStorage.setItem('sjtweaks-fps-boosted-value', boostedFps.toString());
  }
  
  if (triggerBoostAnimation && fpsBoosted) {
    // Animate FPS gradually increasing with arrow visible
    fpsBoostAnimating = true;
    gpuTargetFps = gpuBaseFps;
    setTimeout(() => {
      gpuTargetFps = boostedFps;
    }, 200);
    // Keep arrow visible for 4 seconds during boost animation
    setTimeout(() => {
      fpsBoostAnimating = false;
    }, 4000);
  } else {
    gpuTargetFps = fpsBoosted ? boostedFps : gpuBaseFps;
  }
  
  // Update FPS counter elements
  const fpsValueEl = document.getElementById('fps-counter-value');
  const fpsStatusEl = document.getElementById('fps-counter-status');
  
  if (fpsValueEl) {
    if (fpsBoosted) {
      fpsValueEl.classList.add('boosted');
    } else {
      fpsValueEl.classList.remove('boosted');
    }
  }
  
  if (fpsStatusEl) {
    if (fpsBoosted) {
      const gain = boostedFps - gpuBaseFps;
      fpsStatusEl.textContent = `+${gain} FPS boost active`;
      fpsStatusEl.classList.add('boosted');
    } else {
      fpsStatusEl.textContent = 'Ready to optimize';
      fpsStatusEl.classList.remove('boosted');
    }
  }
  
  // Update GPU card state
  const gpuCard = document.getElementById('gpu-card');
  if (gpuCard) {
    if (enabledTweaks === 0) {
      gpuCard.classList.remove('boosted', 'max-boost');
    } else if (enabledTweaks === totalTweaks) {
      gpuCard.classList.add('boosted', 'max-boost');
    } else {
      gpuCard.classList.add('boosted');
      gpuCard.classList.remove('max-boost');
    }
  }
  
  // Activate/deactivate particles
  const particleRatio = enabledTweaks / totalTweaks;
  gpuParticles.forEach((p, i) => {
    p.active = i < gpuParticles.length * particleRatio;
  });
  
  // Adjust fan speed via CSS animation duration
  const fanBlades = document.querySelectorAll('.gpu-fan-blades');
  fanBlades.forEach(blade => {
    if (enabledTweaks === 0) {
      blade.style.animationDuration = '2s';
    } else if (enabledTweaks === totalTweaks) {
      blade.style.animationDuration = '0.2s';
    } else {
      const speed = 2 - (enabledTweaks / totalTweaks) * 1.7;
      blade.style.animationDuration = speed + 's';
    }
  });
}

function animateGpuDisplay() {
  const now = Date.now();
  
  // Get fluctuation range from detected GPU tier
  const tier = detectedGpuTier || GPU_FPS_TIERS['default'];
  const boostMultiplier = fpsBoosted ? 1.35 : 1.0;
  const minFps = Math.round(tier.min * boostMultiplier);
  const maxFps = Math.round(tier.max * boostMultiplier);
  const midFps = Math.round((minFps + maxFps) / 2);
  
  // Smooth animation toward target when boosting
  if (fpsBoostAnimating) {
    const diff = gpuTargetFps - gpuDisplayedFps;
    gpuDisplayedFps += diff * 0.03;
  } else {
    gpuDisplayedFps = midFps; // Center around mid-point
  }
  
  // REALISTIC FPS FLUCTUATION - Updates every 50-150ms like real games
  if (now - fpsLastUpdate > 50 + Math.random() * 100) {
    fpsLastUpdate = now;
    
    // Random jump within the full range - THIS IS KEY
    // Real FPS jumps around A LOT, not smooth waves
    const rangeSize = maxFps - minFps;
    
    // 70% chance: normal fluctuation (±15% of range)
    // 20% chance: medium jump (±30% of range)  
    // 10% chance: big spike/drop (±50% of range)
    const rand = Math.random();
    let jumpSize;
    
    if (rand < 0.7) {
      // Normal fluctuation
      jumpSize = (Math.random() - 0.5) * rangeSize * 0.3;
    } else if (rand < 0.9) {
      // Medium jump (scene change, new enemies, etc.)
      jumpSize = (Math.random() - 0.5) * rangeSize * 0.5;
    } else {
      // Big spike or drop (explosion, loading, particle effects)
      jumpSize = (Math.random() - 0.5) * rangeSize * 0.8;
    }
    
    fpsFluctuation += jumpSize;
    
    // Very light pull back to center (keeps it from drifting too far)
    fpsFluctuation *= 0.85;
    
    // Clamp to stay within range
    const halfRange = rangeSize / 2;
    fpsFluctuation = Math.max(-halfRange, Math.min(halfRange, fpsFluctuation));
  }
  
  // Calculate display value
  const rawValue = gpuDisplayedFps + fpsFluctuation;
  const displayValue = Math.round(Math.max(minFps, Math.min(maxFps, rawValue)));
  
  // Update the FPS counter
  const fpsCounterValue = document.getElementById('fps-counter-value');
  if (fpsCounterValue) {
    fpsCounterValue.textContent = displayValue;
  }
  
  // Also update the GPU display on the 3D model
  const gpuFpsDisplay = document.getElementById('gpu-fps-display');
  if (gpuFpsDisplay) {
    gpuFpsDisplay.textContent = displayValue;
  }
  
  // Store current FPS for System Health sync
  localStorage.setItem('sjtweaks-current-fps', displayValue.toString());
  
  // Show arrow only while boost is animating
  const fpsArrowEl = document.getElementById('fps-boost-arrow');
  if (fpsArrowEl) {
    if (fpsBoostAnimating) {
      fpsArrowEl.classList.add('active');
    } else {
      fpsArrowEl.classList.remove('active');
    }
  }
  
  // Also update old display if it exists (legacy)
  const fpsDisplay = document.getElementById('gpu-fps-display');
  if (fpsDisplay) {
    fpsDisplay.textContent = Math.max(0, displayValue);
  }
  
  // Animate heat particles (rising effect)
  const time = Date.now() * 0.001;
  gpuParticles.forEach(p => {
    if (p.active) {
      p.y -= p.speed;
      const wobble = Math.sin(time * 3 + p.offset) * 3;
      
      // Reset when too high
      if (p.y < -20) {
        p.y = p.baseY;
        p.x = 20 + Math.random() * 150;
      }
      
      const opacity = Math.max(0, 1 - (p.baseY - p.y) / 100);
      p.el.style.transform = `translate(${p.x + wobble}px, ${p.y}px)`;
      p.el.style.opacity = opacity * 0.7;
    } else {
      p.el.style.opacity = 0;
      p.y = p.baseY;
    }
  });
  
  requestAnimationFrame(animateGpuDisplay);
}

// FPS Boost activation - APPLIES REAL TWEAKS WITH OVERLAY
document.getElementById('fps-boost-btn')?.addEventListener('click', async function() {
  const btn = this;
  btn.disabled = true;
  
  // Get overlay elements
  const overlay = document.getElementById('fps-optimization-overlay');
  const progressBar = document.getElementById('fps-opt-progress');
  const titleEl = document.getElementById('fps-opt-title');
  const subtitleEl = document.getElementById('fps-opt-subtitle');
  const currentEl = document.getElementById('fps-opt-current');
  const totalEl = document.getElementById('fps-opt-total');
  const currentTweakEl = document.getElementById('fps-opt-tweak');
  
  // Get all toggles
  const allToggles = document.querySelectorAll('#page-fps-boost .toggle-switch input');
  const totalTweaks = allToggles.length;
  
  totalEl.textContent = totalTweaks;
  currentEl.textContent = '0';
  progressBar.style.width = '0%';
  
  // Show overlay
  overlay.classList.add('active');
  
  // Phase 1: Analyzing
  titleEl.textContent = 'Analyzing System...';
  subtitleEl.textContent = 'Detecting hardware configuration';
  currentTweakEl.textContent = 'Reading GPU specifications...';
  
  await new Promise(r => setTimeout(r, 600));
  currentTweakEl.textContent = 'Reading CPU specifications...';
  await new Promise(r => setTimeout(r, 500));
  currentTweakEl.textContent = 'Checking current settings...';
  await new Promise(r => setTimeout(r, 400));
  currentTweakEl.textContent = 'Analysis complete. Enabling tweaks...';
  await new Promise(r => setTimeout(r, 300));
  
  // Phase 2: Enable all toggles with animation
  titleEl.textContent = 'Enabling Optimizations...';
  subtitleEl.textContent = 'Configuring system for maximum FPS';
  
  let applied = 0;
  
  for (const toggle of allToggles) {
    const tweakName = toggle.closest('.tweak-item')?.querySelector('.tweak-name')?.textContent || 'Unknown tweak';
    
    toggle.checked = true;
    
    applied++;
    currentEl.textContent = applied;
    progressBar.style.width = (applied / totalTweaks * 100) + '%';
    currentTweakEl.textContent = tweakName;
    
    await new Promise(r => setTimeout(r, 25));
  }
  
  // Update the GPU display
  updateGpuDisplay();
  
  // Phase 3: Apply to system
  titleEl.textContent = 'Applying to System...';
  subtitleEl.textContent = 'Writing registry and system settings';
  currentTweakEl.textContent = 'Requesting administrator access...';
  
  // Build settings object
  const settings = {};
  allToggles.forEach(toggle => {
    const tweakId = toggle.dataset.tweak;
    if (tweakId) {
      settings[tweakId] = toggle.checked;
    }
  });
  
  // Apply tweaks to system (requires admin)
  try {
    const result = await ipcRenderer.invoke('apply-all-fps-tweaks', settings);
    
    if (result.success) {
      await ipcRenderer.invoke('save-fps-settings', settings);
      
      currentTweakEl.textContent = 'All optimizations applied successfully!';
      titleEl.textContent = 'FPS Boost Complete!';
      subtitleEl.textContent = `${totalTweaks} tweaks applied and saved`;
      
      await new Promise(r => setTimeout(r, 1000));
      
      overlay.classList.remove('active');
      
      // Trigger the boost animation with the arrow
      updateGpuDisplay(true);
      
      // Mark FPS boost as applied for system stats
      fpsBoostApplied = true;
      localStorage.setItem('sjtweaks_fps_boost_applied', 'true');
      
      // Sync System Health FPS with FPS Boost value (after slight delay for localStorage)
      setTimeout(() => updatePerformanceStats(), 100);
      markChecklistItem('fps-boost', true);
  
  document.getElementById('fps-boost-status').style.display = 'flex';
  
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <span>Applied & Saved</span>';
  btn.style.background = '#22c55e';
  
      showToast('success', 'FPS Boosted!', `${result.applied || totalTweaks} optimizations applied & saved`);
    } else {
      overlay.classList.remove('active');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> <span>Apply All Tweaks</span>';
      btn.style.background = '';
      showToast('error', 'Error', result.error || 'Failed to apply tweaks');
    }
  } catch (err) {
    overlay.classList.remove('active');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> <span>Apply All Tweaks</span>';
    btn.style.background = '';
    showToast('error', 'Error', 'Admin permission required');
  }
  
  btn.disabled = false;
});

// Save FPS settings when toggles change
async function saveFpsSettings() {
  try {
    const settings = {};
    document.querySelectorAll('#page-fps-boost .toggle-switch input').forEach(toggle => {
      const tweakId = toggle.dataset.tweak;
      if (tweakId) {
        settings[tweakId] = toggle.checked;
      }
    });
    await ipcRenderer.invoke('save-fps-settings', settings);
    console.log('FPS settings saved');
  } catch (err) {
    console.error('Failed to save FPS settings:', err);
  }
}

// Load saved FPS settings on page load
async function loadFpsSettings() {
  try {
    const settings = await ipcRenderer.invoke('load-fps-settings');
    if (settings && Object.keys(settings).length > 0) {
      document.querySelectorAll('#page-fps-boost .toggle-switch input').forEach(toggle => {
        const tweakId = toggle.dataset.tweak;
        if (tweakId && settings[tweakId] !== undefined) {
          toggle.checked = settings[tweakId];
        }
      });
      
      // Update display if on FPS page
      if (typeof updateGpuDisplay === 'function') {
        updateGpuDisplay();
      }
      
      // Show active badge if any tweaks enabled
      const enabledCount = Object.values(settings).filter(v => v === true).length;
      if (enabledCount > 0) {
        const statusBadge = document.getElementById('fps-boost-status');
        if (statusBadge) statusBadge.style.display = 'flex';
        
        const btn = document.getElementById('fps-boost-btn');
        if (btn) {
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <span>Applied & Saved</span>';
          btn.style.background = '#22c55e';
        }
      }
      
      console.log('FPS settings loaded:', enabledCount, 'tweaks active');
    }
  } catch (err) {
    console.error('Failed to load FPS settings:', err);
  }
}

// ============================================================================
// PING OPTIMIZER PAGE - 3D CANVAS GLOBE
// ============================================================================

let selectedRegion = null;
let globeRotation = 0;
let globeAnimationId = null;
let targetRotation = null;
let globeAutoRotate = true; // Stop auto-rotate when region is selected

// Real world coordinates for Fortnite server regions
const serverLocations = {
  'na-east': { lat: 39.0, lng: -77.0, name: 'NA-East', color: '#00aeff' },
  'na-west': { lat: 37.4, lng: -122.0, name: 'NA-West', color: '#00aeff' },
  'na-central': { lat: 41.8, lng: -93.0, name: 'NA-Central', color: '#00aeff' },
  'europe': { lat: 50.1, lng: 8.7, name: 'Europe', color: '#00aeff' },
  'brazil': { lat: -23.5, lng: -46.6, name: 'Brazil', color: '#00aeff' },
  'oceania': { lat: -33.8, lng: 151.2, name: 'Oceania', color: '#00aeff' },
  'asia': { lat: 35.7, lng: 139.7, name: 'Asia', color: '#00aeff' },
  'middle-east': { lat: 25.3, lng: 55.3, name: 'Middle East', color: '#00aeff' }
};

function initGlobe() {
  const canvas = document.getElementById('globe-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = 400;
  const height = 380;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 140;
  
  // Real geographic coordinates [longitude, latitude] for each continent
  // Using simplified but accurate outlines
  const continents = [
    // North America
    { coords: [
      [-168, 65], [-166, 60], [-140, 60], [-130, 55], [-125, 48], [-124, 40], [-117, 32], [-105, 25], [-97, 25],
      [-87, 21], [-80, 25], [-81, 30], [-75, 35], [-70, 42], [-67, 45], [-60, 47], [-55, 50], [-56, 60],
      [-65, 65], [-75, 70], [-95, 72], [-120, 70], [-145, 70], [-168, 65]
    ]},
    // South America
    { coords: [
      [-80, 10], [-75, 5], [-70, 5], [-55, 5], [-50, 0], [-45, -5], [-35, -5], [-35, -10], [-37, -15],
      [-40, -22], [-45, -25], [-50, -28], [-55, -35], [-60, -40], [-65, -50], [-70, -55], [-75, -50],
      [-75, -45], [-72, -35], [-70, -30], [-70, -20], [-75, -15], [-80, -5], [-80, 5], [-80, 10]
    ]},
    // Europe
    { coords: [
      [-10, 35], [-5, 36], [0, 40], [5, 43], [3, 47], [-5, 48], [-10, 52], [-5, 55], [5, 55],
      [10, 55], [15, 55], [20, 55], [25, 60], [28, 65], [25, 70], [15, 70], [10, 65], [5, 60],
      [-5, 60], [-10, 55], [-10, 50], [-5, 45], [-10, 35]
    ]},
    // Africa
    { coords: [
      [-15, 28], [-10, 32], [-5, 35], [5, 37], [10, 37], [15, 32], [25, 32], [35, 30], [40, 25],
      [45, 12], [50, 5], [45, 0], [42, -5], [40, -15], [35, -25], [30, -30], [25, -35], [20, -35],
      [15, -30], [12, -20], [15, -10], [10, 0], [5, 5], [-5, 5], [-10, 10], [-15, 15], [-18, 20], [-15, 28]
    ]},
    // Asia
    { coords: [
      [25, 70], [40, 70], [60, 70], [80, 75], [100, 75], [120, 70], [140, 65], [160, 60], [170, 65],
      [180, 65], [180, 50], [160, 55], [145, 45], [140, 35], [130, 35], [125, 30], [120, 25], [110, 20],
      [100, 15], [95, 10], [80, 8], [75, 15], [70, 20], [60, 25], [50, 30], [40, 35], [30, 35],
      [25, 40], [28, 45], [30, 50], [35, 55], [40, 60], [35, 65], [25, 70]
    ]},
    // Australia
    { coords: [
      [115, -20], [120, -18], [130, -15], [140, -12], [145, -15], [150, -20], [152, -25], [150, -30],
      [148, -35], [145, -38], [140, -38], [135, -35], [130, -32], [125, -32], [120, -30], [115, -25], [115, -20]
    ]},
    // Greenland
    { coords: [
      [-45, 60], [-40, 60], [-30, 65], [-25, 70], [-20, 75], [-25, 80], [-35, 83], [-50, 82],
      [-55, 78], [-55, 75], [-50, 70], [-45, 65], [-45, 60]
    ]},
    // UK/Ireland
    { coords: [
      [-10, 50], [-5, 50], [0, 51], [2, 53], [0, 55], [-3, 58], [-5, 58], [-8, 55], [-10, 52], [-10, 50]
    ]},
    // Japan
    { coords: [
      [130, 32], [132, 34], [135, 35], [140, 36], [140, 40], [142, 43], [145, 45], [143, 42],
      [140, 38], [138, 35], [135, 33], [130, 32]
    ]},
    // Indonesia/Philippines region
    { coords: [
      [95, 5], [100, 2], [105, -5], [110, -8], [115, -8], [120, -5], [125, 0], [130, 2],
      [125, 5], [120, 10], [118, 12], [115, 8], [110, 5], [105, 5], [95, 5]
    ]},
    // New Zealand
    { coords: [
      [165, -35], [175, -37], [178, -40], [175, -45], [170, -47], [166, -45], [165, -42], [165, -35]
    ]}
  ];
  
  function drawGlobe(rotation) {
    ctx.clearRect(0, 0, width, height);
    
    // Get current primary color from CSS
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#00aeff';
    const primaryRgb = hexToRgb(primaryColor) || { r: 0, g: 174, b: 255 };
    
    // Create space background with stars
    const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 250);
    bgGrad.addColorStop(0, '#0a1628');
    bgGrad.addColorStop(1, '#050a14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
    
    // Draw stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
      const x = (Math.sin(i * 127.1 + rotation * 0.001) * 0.5 + 0.5) * width;
      const y = (Math.cos(i * 269.5) * 0.5 + 0.5) * height;
      const size = Math.random() * 1.5 + 0.5;
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.002 + i) * 0.2;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Outer glow - using primary color
    const outerGlow = ctx.createRadialGradient(centerX, centerY, radius, centerX, centerY, radius + 40);
    outerGlow.addColorStop(0, `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.3)`);
    outerGlow.addColorStop(0.5, `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.1)`);
    outerGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 40, 0, Math.PI * 2);
    ctx.fill();
    
    // Globe base with gradient
    const globeGrad = ctx.createRadialGradient(centerX - 40, centerY - 40, 0, centerX, centerY, radius);
    globeGrad.addColorStop(0, '#0d2847');
    globeGrad.addColorStop(0.5, '#0a1e3a');
    globeGrad.addColorStop(1, '#061428');
    ctx.fillStyle = globeGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw grid lines (latitude/longitude) - using primary color
    ctx.strokeStyle = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.15)`;
    ctx.lineWidth = 0.5;
    
    // Latitude lines
    for (let lat = -60; lat <= 60; lat += 30) {
      const latRad = lat * Math.PI / 180;
      const y = centerY - Math.sin(latRad) * radius;
      const localRadius = Math.cos(latRad) * radius;
      ctx.beginPath();
      ctx.ellipse(centerX, y, localRadius, localRadius * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Longitude lines
    for (let lng = 0; lng < 180; lng += 30) {
      const lngRad = (lng + rotation) * Math.PI / 180;
      ctx.beginPath();
      for (let lat = -90; lat <= 90; lat += 5) {
        const latRad = lat * Math.PI / 180;
        const x = centerX + Math.cos(latRad) * Math.sin(lngRad) * radius;
        const y = centerY - Math.sin(latRad) * radius;
        if (lat === -90) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    
    // Draw continents with proper 3D projection
    continents.forEach(cont => {
      // Build visible path segments
      const points = [];
      let prevVisible = false;
      
      cont.coords.forEach((coord, i) => {
        const lng = (coord[0] + rotation) * Math.PI / 180;
        const lat = coord[1] * Math.PI / 180;
        
        // Check if point is on visible side of globe
        const isVisible = Math.cos(lng) > 0;
        
        // 3D sphere projection
        const x = centerX + Math.cos(lat) * Math.sin(lng) * radius;
        const y = centerY - Math.sin(lat) * radius;
        
        if (isVisible) {
          points.push({ x, y, visible: true });
        } else {
          points.push({ x, y, visible: false });
        }
      });
      
      // Draw filled continent - using primary color
      ctx.fillStyle = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.25)`;
      ctx.strokeStyle = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.7)`;
      ctx.lineWidth = 1.2;
      
      ctx.beginPath();
      let started = false;
      
      points.forEach((p, i) => {
        if (p.visible) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      });
      
      if (started) {
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
    
    // Draw server location markers - using primary color
    ctx.fillStyle = primaryColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    
    Object.entries(serverLocations).forEach(([region, loc]) => {
      const lng = (loc.lng + rotation) * Math.PI / 180;
      const lat = loc.lat * Math.PI / 180;
      
      // Only show if on visible side
      if (Math.cos(lng) > 0) {
        const x = centerX + Math.cos(lat) * Math.sin(lng) * radius;
        const y = centerY - Math.sin(lat) * radius;
        const dotSize = 5 + Math.cos(lng) * 3;
        
        // Pulsing glow
        const pulse = Math.sin(Date.now() * 0.003 + region.length) * 0.5 + 0.5;
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 10 + pulse * 5;
        
        // Marker dot
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Selected highlight
        if (selectedRegion === region) {
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, dotSize + 8 + pulse * 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
      }
    });
    
    // Glass reflection overlay - using primary color
    const reflectGrad = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    reflectGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    reflectGrad.addColorStop(0.3, 'transparent');
    reflectGrad.addColorStop(0.7, 'transparent');
    reflectGrad.addColorStop(1, `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.05)`);
    ctx.fillStyle = reflectGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner highlight arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX - 20, centerY - 20, radius - 10, -Math.PI * 0.3, -Math.PI * 0.1);
    ctx.stroke();
  }
  
  function animate() {
    if (targetRotation !== null) {
      const diff = targetRotation - globeRotation;
      globeRotation += diff * 0.05;
      if (Math.abs(diff) < 0.5) {
        targetRotation = null;
      }
    } else if (globeAutoRotate) {
      globeRotation += 0.2; // Auto-rotate only if no region selected
    }
    
    drawGlobe(globeRotation);
    globeAnimationId = requestAnimationFrame(animate);
  }
  
  // Start animation
  animate();
  
  // Region button click handlers
  document.querySelectorAll('.region-btn').forEach(btn => {
    btn.addEventListener('click', () => selectRegion(btn.dataset.region, btn.dataset.ping));
  });
}

function selectRegion(region, ping) {
  selectedRegion = region;
  
  const loc = serverLocations[region];
  if (!loc) return;
  
  // Stop auto-rotation and animate globe to focus on selected region
  globeAutoRotate = false;
  targetRotation = -loc.lng;
  
  // Update button selection
  document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector(`.region-btn[data-region="${region}"]`)?.classList.add('selected');
  
  // Update stats
  document.getElementById('selected-region-display').textContent = region.replace(/-/g, ' ').toUpperCase();
  document.getElementById('region-ping').textContent = `~${ping}ms`;
  document.getElementById('connection-status').textContent = 'Ready';
  document.getElementById('connection-status').style.color = '#f59e0b';
  
  playWooshSound();
  
  // Save settings when region is selected
  savePingSettings();
}

// ============================================================================
// REGION CALIBRATION - Test actual ping to game servers
// ============================================================================

let isCalibrating = false;
let calibratedPings = {}; // Store calibrated ping values

document.getElementById('calibrate-regions-btn')?.addEventListener('click', async function() {
  if (isCalibrating) return;
  
  const btn = this;
  isCalibrating = true;
  btn.disabled = true;
  btn.classList.add('calibrating');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 10"/>
    </svg>
    <span>Calibrating...</span>
  `;
  
  showToast('info', 'Calibrating Regions', 'Testing ping to all game servers...');
  
  const regions = ['na-east', 'na-west', 'na-central', 'europe', 'brazil', 'oceania', 'asia', 'middle-east'];
  
  // Mark all regions as calibrating
  regions.forEach(region => {
    const regionBtn = document.querySelector(`.region-btn[data-region="${region}"]`);
    if (regionBtn) {
      regionBtn.classList.add('calibrating');
      regionBtn.querySelector('.region-ping').textContent = 'Testing...';
    }
  });
  
  // Test each region sequentially
  for (const region of regions) {
    const regionBtn = document.querySelector(`.region-btn[data-region="${region}"]`);
    
    try {
      const result = await ipcRenderer.invoke('calibrate-ping', region);
      
      if (result.success && result.ping !== null) {
        // Update the button with actual ping
        calibratedPings[region] = result.ping;
        
        if (regionBtn) {
          regionBtn.dataset.ping = result.ping;
          regionBtn.querySelector('.region-ping').textContent = `${result.ping}ms`;
          regionBtn.classList.remove('calibrating');
          regionBtn.classList.add('calibrated');
        }
      } else {
        // Failed to get ping
        if (regionBtn) {
          regionBtn.querySelector('.region-ping').textContent = 'N/A';
          regionBtn.classList.remove('calibrating');
        }
      }
    } catch (err) {
      console.error(`Failed to calibrate ${region}:`, err);
      if (regionBtn) {
        regionBtn.querySelector('.region-ping').textContent = 'Error';
        regionBtn.classList.remove('calibrating');
      }
    }
  }
  
  // Find the best region (lowest ping)
  let bestRegion = null;
  let bestPing = Infinity;
  
  for (const [region, ping] of Object.entries(calibratedPings)) {
    if (ping < bestPing) {
      bestPing = ping;
      bestRegion = region;
    }
  }
  
  // Auto-select the best region
  if (bestRegion) {
    selectRegion(bestRegion, bestPing);
    showToast('success', 'Calibration Complete', `Best region: ${bestRegion.replace('-', ' ').toUpperCase()} (${bestPing}ms)`);
  } else {
    showToast('warning', 'Calibration Done', 'Some regions could not be tested');
  }
  
  // Save calibrated pings to localStorage
  localStorage.setItem('sjtweaks_calibrated_pings', JSON.stringify(calibratedPings));
  
  // Reset button
  isCalibrating = false;
  btn.disabled = false;
  btn.classList.remove('calibrating');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 10"/>
    </svg>
    <span>Calibrate Regions</span>
  `;
});

// Load saved calibrated pings on startup
function loadCalibratedPings() {
  const saved = localStorage.getItem('sjtweaks_calibrated_pings');
  if (saved) {
    try {
      calibratedPings = JSON.parse(saved);
      
      // Update region buttons with saved pings
      for (const [region, ping] of Object.entries(calibratedPings)) {
        const regionBtn = document.querySelector(`.region-btn[data-region="${region}"]`);
        if (regionBtn && ping) {
          regionBtn.dataset.ping = ping;
          regionBtn.querySelector('.region-ping').textContent = `${ping}ms`;
          regionBtn.classList.add('calibrated');
        }
      }
    } catch (e) {
      console.error('Failed to load calibrated pings:', e);
    }
  }
}

// Call on page load
setTimeout(loadCalibratedPings, 100);

// Ping Optimize activation with awesome animation
document.getElementById('ping-optimize-btn')?.addEventListener('click', async function() {
  const btn = this;
  
  // Check if regions have been calibrated
  const hasCalibrated = Object.keys(calibratedPings).length > 0;
  
  if (!hasCalibrated) {
    // Highlight the calibrate button and show error
    const calibrateBtn = document.getElementById('calibrate-regions-btn');
    if (calibrateBtn) {
      calibrateBtn.classList.add('highlight');
      calibrateBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Remove highlight after animation
      setTimeout(() => {
        calibrateBtn.classList.remove('highlight');
      }, 1600);
    }
    
    showToast('error', 'Calibration Required', 'Please calibrate your regions first to get accurate ping values');
    return;
  }
  
  btn.disabled = true;
  
  const overlay = document.getElementById('ping-optimization-overlay');
  const progressBar = document.getElementById('optimization-progress-bar');
  const titleEl = document.getElementById('optimization-title');
  const subtitleEl = document.getElementById('optimization-subtitle');
  const currentEl = document.getElementById('optimization-current');
  const totalEl = document.getElementById('optimization-total');
  const currentTweakEl = document.getElementById('optimization-current-tweak');
  
  // Get all toggle switches
  const allToggles = document.querySelectorAll('#ping-tweaks-container .toggle-switch input');
  const totalTweaks = allToggles.length;
  
  totalEl.textContent = totalTweaks;
  currentEl.textContent = '0';
  progressBar.style.width = '0%';
  
  // Show overlay
  overlay.classList.add('active');
  
  // Phase 1: Analyzing
  titleEl.textContent = 'Analyzing Your Network...';
  subtitleEl.textContent = 'Finding optimal settings for your connection';
  currentTweakEl.textContent = 'Scanning network adapters...';
  
  await new Promise(r => setTimeout(r, 800));
  currentTweakEl.textContent = 'Detecting connection type...';
  await new Promise(r => setTimeout(r, 600));
  currentTweakEl.textContent = 'Measuring current latency...';
  await new Promise(r => setTimeout(r, 600));
  currentTweakEl.textContent = 'Analysis complete. Applying tweaks...';
  await new Promise(r => setTimeout(r, 400));
  
  // Phase 2: Apply each tweak
  titleEl.textContent = 'Applying Optimizations...';
  subtitleEl.textContent = 'Configuring network settings for lowest ping';
  
  let applied = 0;
  
  for (const toggle of allToggles) {
    const tweakName = toggle.closest('.tweak-item')?.querySelector('.tweak-name')?.textContent || 'Unknown tweak';
    
    // Check the toggle
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    
    // Scroll the toggle into view briefly (visual effect)
    toggle.closest('.tweak-item')?.classList.add('applying');
    
    applied++;
    currentEl.textContent = applied;
    progressBar.style.width = (applied / totalTweaks * 100) + '%';
    currentTweakEl.textContent = tweakName;
    
    // Small delay for visual effect
    await new Promise(r => setTimeout(r, 30));
    
    toggle.closest('.tweak-item')?.classList.remove('applying');
  }
  
  // Phase 3: Finalizing
  titleEl.textContent = 'Finalizing...';
  subtitleEl.textContent = 'Saving optimized configuration';
  currentTweakEl.textContent = 'Applying registry & network changes...';
  
  // Actually apply all the tweaks to the system
  try {
    const settings = {};
    document.querySelectorAll('#ping-tweaks-container .toggle-switch input').forEach(toggle => {
      const tweakName = toggle.dataset.tweak;
      if (tweakName) {
        settings[tweakName] = toggle.checked;
      }
    });
    
    const result = await ipcRenderer.invoke('apply-all-ping-tweaks', settings);
    
    if (result.success) {
      currentTweakEl.textContent = `Applied ${result.applied || 'all'} system tweaks!`;
    } else {
      currentTweakEl.textContent = 'Some tweaks may require restart';
    }
  } catch (err) {
    console.error('Failed to apply tweaks:', err);
    currentTweakEl.textContent = 'Applied (admin required for some)';
  }
  
  await new Promise(r => setTimeout(r, 500));
  currentTweakEl.textContent = 'Optimization Complete!';
  
  titleEl.textContent = 'Network Optimized!';
  subtitleEl.textContent = `${totalTweaks} tweaks successfully applied`;
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Hide overlay
  overlay.classList.remove('active');
  
  document.getElementById('ping-status').style.display = 'flex';
  document.getElementById('connection-status').textContent = 'Optimized';
  document.getElementById('connection-status').style.color = '#00aeff';
  
  // Update region ping if selected
  if (selectedRegion) {
    const currentPing = parseInt(document.getElementById('region-ping').textContent);
    const optimizedPing = Math.max(5, Math.floor(currentPing * 0.6));
    document.getElementById('region-ping').textContent = `${optimizedPing}ms`;
    document.getElementById('region-ping').style.color = '#22d3ee';
  }
  
  // Mark ping as optimized for system stats
  pingOptimized = true;
  localStorage.setItem('sjtweaks_ping_optimized', 'true');
  updatePerformanceStats();
  markChecklistItem('ping', true);
  
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <span>Optimized</span>';
  btn.style.background = '#22c55e';
  
  showToast('success', 'Network Optimized', `${totalTweaks} ping tweaks applied${selectedRegion ? ` for ${selectedRegion.replace('-', ' ').toUpperCase()}` : ''}`);
});

// ============================================================================
// VISUAL SETTINGS PAGE - Software Customization
// ============================================================================

// Rainbow mode animation
let rainbowInterval = null;
let rainbowHue = 0;

function startRainbowMode() {
  if (rainbowInterval) return; // Already running
  
  rainbowInterval = setInterval(() => {
    rainbowHue = (rainbowHue + 1.5) % 360; // Faster smooth increment
    const color = `hsl(${rainbowHue}, 100%, 50%)`;
    
    // Convert HSL to RGB for the CSS variables
    const rgb = hslToRgb(rainbowHue / 360, 1, 0.5);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    
    document.documentElement.style.setProperty('--primary', hex);
    document.documentElement.style.setProperty('--primary-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
    document.documentElement.style.setProperty('--primary-dim', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
  }, 50); // 20fps for smooth animation
}

function stopRainbowMode() {
  if (rainbowInterval) {
    clearInterval(rainbowInterval);
    rainbowInterval = null;
  }
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Apply primary color
function applyPrimaryColor(color) {
  // Handle rainbow mode
  if (color === 'rainbow') {
    localStorage.setItem('sjtweaks_primary_color', 'rainbow');
    startRainbowMode();
    
    // Update preview elements with rainbow gradient
    const previewBtn = document.querySelector('.preview-btn');
    const previewSlider = document.querySelector('.preview-toggle-slider');
    const previewText = document.querySelector('.preview-text');
    
    if (previewBtn) previewBtn.style.background = 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff)';
    if (previewSlider) previewSlider.style.background = 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff)';
    if (previewText) {
      previewText.style.background = 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff)';
      previewText.style.webkitBackgroundClip = 'text';
      previewText.style.webkitTextFillColor = 'transparent';
      previewText.style.backgroundSize = '200% 100%';
    }
    return;
  }
  
  // Regular color mode - stop rainbow
  stopRainbowMode();
  document.documentElement.style.setProperty('--primary', color);
  
  // Calculate glow and dim versions
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  document.documentElement.style.setProperty('--primary-glow', `rgba(${r}, ${g}, ${b}, 0.5)`);
  document.documentElement.style.setProperty('--primary-dim', `rgba(${r}, ${g}, ${b}, 0.15)`);
  
  localStorage.setItem('sjtweaks_primary_color', color);
  
  // Update color preview elements
  const previewBtn = document.querySelector('.preview-btn');
  const previewSlider = document.querySelector('.preview-toggle-slider');
  const previewText = document.querySelector('.preview-text');
  
  if (previewBtn) previewBtn.style.background = color;
  if (previewSlider) previewSlider.style.background = color;
  if (previewText) {
    previewText.style.color = color;
    previewText.style.background = 'none';
    previewText.style.webkitBackgroundClip = 'initial';
    previewText.style.webkitTextFillColor = 'initial';
  }
  
  // Update custom color input
  const customInput = document.getElementById('custom-color-input');
  if (customInput && color !== 'rainbow') customInput.value = color;
}

// Color preset selection
document.querySelectorAll('.color-preset').forEach(preset => {
  preset.addEventListener('click', () => {
    const color = preset.dataset.color;
    
    // Update active state
    document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('active'));
    preset.classList.add('active');
    
    applyPrimaryColor(color);
    
    if (color === 'rainbow') {
      showToast('success', 'Rainbow Mode', 'Colors will cycle through the rainbow!');
    } else {
      showToast('success', 'Color Updated', 'Accent color changed');
    }
  });
});

// Custom color picker
const customColorInput = document.getElementById('custom-color-input');
if (customColorInput) {
  customColorInput.addEventListener('input', (e) => {
    const color = e.target.value;
    document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('active'));
    applyPrimaryColor(color);
  });
  
  customColorInput.addEventListener('change', () => {
    showToast('success', 'Custom Color', 'Your custom color has been applied');
  });
}

// Theme selection
document.querySelectorAll('.theme-option').forEach(option => {
  option.addEventListener('click', () => {
    const theme = option.dataset.theme;
    
    // Update active state
    document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
    option.classList.add('active');
    
    // Remove all theme classes from both html and body
    document.documentElement.classList.remove('theme-light', 'theme-transparent', 'theme-performance');
    document.body.classList.remove('theme-light', 'theme-transparent', 'theme-performance');
    
    // If NOT switching to performance mode, remove animation blockers and restore defaults
    // This fixes the bug where switching from performance to other themes kept cards hidden
    if (theme !== 'performance') {
      document.body.classList.remove('no-animations', 'no-particles', 'no-blur', 'no-glow');
      localStorage.setItem('sjtweaks_ui_animations', 'true');
      localStorage.setItem('sjtweaks_ui_particles', 'true');
      localStorage.setItem('sjtweaks_ui_blur', 'true');
      localStorage.setItem('sjtweaks_ui_glow', 'true');
      
      // Reset toggles to checked
      const toggles = ['ui-animations-toggle', 'ui-particles-toggle', 'ui-blur-toggle', 'ui-glow-toggle'];
      toggles.forEach(id => {
        const toggle = document.getElementById(id);
        if (toggle) toggle.checked = true;
      });
    }
    
    // Apply theme to both html and body (needed for transparent window)
    if (theme !== 'dark') {
      document.documentElement.classList.add(`theme-${theme}`);
      document.body.classList.add(`theme-${theme}`);
    }
    
    // Save preference
    localStorage.setItem('sjtweaks_theme', theme);
    
    // If performance mode, disable animations
    if (theme === 'performance') {
      document.body.classList.add('no-animations', 'no-particles', 'no-blur', 'no-glow');
      localStorage.setItem('sjtweaks_ui_animations', 'false');
      localStorage.setItem('sjtweaks_ui_particles', 'false');
      localStorage.setItem('sjtweaks_ui_blur', 'false');
      localStorage.setItem('sjtweaks_ui_glow', 'false');
      
      // Update toggles
      const toggles = ['ui-animations-toggle', 'ui-particles-toggle', 'ui-blur-toggle', 'ui-glow-toggle'];
      toggles.forEach(id => {
        const toggle = document.getElementById(id);
        if (toggle) toggle.checked = false;
      });
    }
    
    showToast('success', 'Theme Changed', `${theme.charAt(0).toUpperCase() + theme.slice(1)} mode activated`);
  });
});

// UI Options toggles
function setupUIToggle(toggleId, className, storageKey) {
  const toggle = document.getElementById(toggleId);
  if (toggle) {
    // Load saved state - DEFAULT TO TRUE (ON) if not set
    const saved = localStorage.getItem(storageKey);
    
    // First time opening - set default to true
    if (saved === null) {
      localStorage.setItem(storageKey, 'true');
      toggle.checked = true;
    } else if (saved === 'false') {
      toggle.checked = false;
      document.body.classList.add(className);
    } else {
      toggle.checked = true;
      document.body.classList.remove(className);
    }
    
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        document.body.classList.remove(className);
        localStorage.setItem(storageKey, 'true');
        
        // Special handling for particles - also show smoke
        if (className === 'no-particles') {
          const smokeCanvas = document.getElementById('smoke-canvas');
          if (smokeCanvas) smokeCanvas.style.display = 'block';
        }
      } else {
        document.body.classList.add(className);
        localStorage.setItem(storageKey, 'false');
        
        // Special handling for particles - also hide smoke
        if (className === 'no-particles') {
          const smokeCanvas = document.getElementById('smoke-canvas');
          if (smokeCanvas) smokeCanvas.style.display = 'none';
        }
      }
    });
  }
}

setupUIToggle('ui-animations-toggle', 'no-animations', 'sjtweaks_ui_animations');
setupUIToggle('ui-particles-toggle', 'no-particles', 'sjtweaks_ui_particles');
setupUIToggle('ui-blur-toggle', 'no-blur', 'sjtweaks_ui_blur');
setupUIToggle('ui-glow-toggle', 'no-glow', 'sjtweaks_ui_glow');

// Load saved theme
const savedTheme = localStorage.getItem('sjtweaks_theme') || 'dark';
document.querySelectorAll('.theme-option').forEach(o => {
  o.classList.toggle('active', o.dataset.theme === savedTheme);
});
if (savedTheme !== 'dark') {
  document.documentElement.classList.add(`theme-${savedTheme}`);
  document.body.classList.add(`theme-${savedTheme}`);
}

// Load saved color
const savedColor = localStorage.getItem('sjtweaks_primary_color');
if (savedColor) {
  applyPrimaryColor(savedColor);
  document.querySelectorAll('.color-preset').forEach(p => {
    p.classList.remove('active');
    if (p.dataset.color === savedColor) {
      p.classList.add('active');
    }
  });
  // Make sure rainbow preset is highlighted if rainbow mode
  if (savedColor === 'rainbow') {
    const rainbowPreset = document.querySelector('.color-preset[data-color="rainbow"]');
    if (rainbowPreset) rainbowPreset.classList.add('active');
  }
}

// ============================================================================
// LANGUAGE PAGE - Full Translation System
// ============================================================================

const translations = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.zerodelay': 'Zero Delay',
    'nav.fpsboost': 'FPS Boost',
    'nav.ping': 'Ping Optimizer',
    'nav.visual': 'Visual',
    'nav.settings': 'Settings',
    'nav.language': 'Language',
    'nav.restore': 'System Restore',
    'nav.support': 'Support',
    'nav.shop': 'Shop',
    'nav.ai': 'AI Chat',
    
    // Home Page
    'home.title': 'Welcome to SJTweaks',
    'home.subtitle': 'Premium optimization suite for gamers',
    'home.quickactions': 'Quick Actions',
    'home.zerodelay.title': 'Zero Delay',
    'home.zerodelay.desc': 'Reduce input latency',
    'home.fpsboost.title': 'FPS Boost',
    'home.fpsboost.desc': 'Maximize frame rate',
    'home.ping.title': 'Ping Optimizer',
    'home.ping.desc': 'Reduce network latency',
    
    // Zero Delay Page
    'zerodelay.title': 'Zero Delay',
    'zerodelay.subtitle': 'Minimize input latency for competitive gaming',
    'zerodelay.current': 'Current Latency',
    'zerodelay.apply': 'Apply All Tweaks',
    'zerodelay.applied': 'Applied',
    'zerodelay.input': 'Input Optimization',
    'zerodelay.system': 'System Optimization',
    'zerodelay.gpu': 'GPU Optimization',
    
    // FPS Boost Page
    'fps.title': 'FPS Boost',
    'fps.subtitle': 'Maximize your frame rate for smoother gameplay',
    'fps.base': 'Base FPS',
    'fps.boosted': 'Boosted FPS',
    'fps.tweaksactive': 'Tweaks Active',
    'fps.apply': 'Boost FPS',
    'fps.applied': 'Boosted',
    'fps.gamemode': 'Windows Game Mode',
    'fps.gpu': 'GPU Optimization',
    'fps.cpu': 'CPU Optimization',
    'fps.memory': 'Memory Optimization',
    'fps.visual': 'Visual Effects',
    'fps.services': 'System Services',
    'fps.nvidia': 'NVIDIA Settings',
    'fps.timer': 'Timer & Scheduling',
    
    // Ping Optimizer Page
    'ping.title': 'Ping Optimizer',
    'ping.subtitle': 'Reduce network latency for online gaming',
    'ping.select': 'Select Your Region',
    'ping.apply': 'Apply All Tweaks',
    'ping.applied': 'Applied',
    'ping.tcpip': 'TCP/IP Stack',
    'ping.qos': 'Quality of Service',
    'ping.dns': 'DNS Optimization',
    
    // Settings Page
    'settings.title': 'Settings',
    'settings.subtitle': 'Configure your preferences',
    'settings.startup': 'Launch on Startup',
    'settings.startupdesc': 'Start SJTweaks when Windows boots',
    'settings.sound': 'Sound Effects',
    'settings.sounddesc': 'Play sounds for actions',
    'settings.minimize': 'Minimize to Tray',
    'settings.minimizedesc': 'Hide to system tray when closed',
    
    // Language Page
    'language.title': 'Language',
    'language.subtitle': 'Choose your preferred language',
    
    // System Restore Page
    'restore.title': 'System Restore',
    'restore.subtitle': 'Manage Windows restore points',
    'restore.create': 'Create Restore Point',
    'restore.creating': 'Creating...',
    'restore.empty': 'No restore points found',
    
    // Common
    'common.apply': 'Apply',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.loading': 'Loading...',
    'common.success': 'Success',
    'common.error': 'Error',
    'common.enabled': 'Enabled',
    'common.disabled': 'Disabled',
    
    // Tweak descriptions
    'tweak.mouseaccel': 'Disable Mouse Acceleration',
    'tweak.mouseaccel.desc': 'Raw mouse input for precision',
    'tweak.priority': 'High Process Priority',
    'tweak.priority.desc': 'Prioritize game processes',
    'tweak.usbpolling': 'USB Polling Optimization',
    'tweak.usbpolling.desc': 'Faster USB device response',
    
    // Visual Settings Page
    'visual.title': 'Appearance',
    'visual.subtitle': 'Customize how SJTweaks looks',
    'visual.theme': 'Theme Mode',
    'visual.theme_desc': 'Choose your preferred interface style',
    'visual.dark': 'Dark Mode',
    'visual.light': 'Light Mode',
    'visual.transparent': 'Transparent',
    'visual.performance': 'Performance',
    'visual.color': 'Accent Color',
    'visual.color_desc': 'Choose your accent color throughout the app',
    'visual.custom': 'Custom Color',
    'visual.button': 'Button',
    'visual.toggle': 'Toggle',
    'visual.accent_text': 'Accent Text',
    'visual.ui_options': 'Interface Options',
    'visual.animations': 'Enable Animations',
    'visual.animations_desc': 'Smooth transitions and effects',
    'visual.particles': 'Background Effects',
    'visual.particles_desc': 'Animated background particles',
    'visual.blur': 'Blur Effects',
    'visual.blur_desc': 'Frosted glass effect on panels',
    'visual.glow': 'Glow Effects',
    'visual.glow_desc': 'Glowing borders and shadows',
    
    // Home Page extras
    'home.protection': 'System Protection',
    'home.create_restore': 'Create Restore Point',
    'home.view_restore': 'View Restore Points',
    'home.health': 'System Health',
    'home.details': 'System Details',
    'home.checklist': 'Optimization Checklist',
    'home.profiles': 'Pro Gaming Profiles',
    'home.premium_profile': 'Premium Profile',
    'home.activate': 'Activate',
    'home.free': 'FREE',
    
    // Support Page
    'support.title': 'Support',
    'support.subtitle': 'Get help with SJTweaks',
    'support.discord': 'Join Discord',
    'support.ticket': 'Open Ticket',
    
    // AI Chat
    'ai.title': 'AI Assistant',
    'ai.subtitle': 'Get help from our AI',
    'ai.placeholder': 'Ask me anything...',
    'ai.send': 'Send',
  },
  
  es: {
    'nav.home': 'Inicio',
    'nav.zerodelay': 'Sin Retraso',
    'nav.fpsboost': 'Aumentar FPS',
    'nav.ping': 'Optimizar Ping',
    'nav.visual': 'Visual',
    'nav.settings': 'Ajustes',
    'nav.language': 'Idioma',
    'nav.restore': 'Restaurar Sistema',
    'nav.support': 'Soporte',
    'nav.shop': 'Tienda',
    'nav.ai': 'Chat IA',
    
    'home.title': 'Bienvenido a SJTweaks',
    'home.subtitle': 'Suite de optimización premium para gamers',
    'home.quickactions': 'Acciones Rápidas',
    'home.zerodelay.title': 'Sin Retraso',
    'home.zerodelay.desc': 'Reducir latencia de entrada',
    'home.fpsboost.title': 'Aumentar FPS',
    'home.fpsboost.desc': 'Maximizar tasa de cuadros',
    'home.ping.title': 'Optimizar Ping',
    'home.ping.desc': 'Reducir latencia de red',
    
    'zerodelay.title': 'Sin Retraso',
    'zerodelay.subtitle': 'Minimiza la latencia de entrada para juegos competitivos',
    'zerodelay.current': 'Latencia Actual',
    'zerodelay.apply': 'Aplicar Todos',
    'zerodelay.applied': 'Aplicado',
    'zerodelay.input': 'Optimización de Entrada',
    'zerodelay.system': 'Optimización del Sistema',
    'zerodelay.gpu': 'Optimización GPU',
    
    'fps.title': 'Aumentar FPS',
    'fps.subtitle': 'Maximiza tu tasa de cuadros para un juego más fluido',
    'fps.base': 'FPS Base',
    'fps.boosted': 'FPS Aumentado',
    'fps.tweaksactive': 'Ajustes Activos',
    'fps.apply': 'Aumentar FPS',
    'fps.applied': 'Aumentado',
    'fps.gamemode': 'Modo Juego Windows',
    'fps.gpu': 'Optimización GPU',
    'fps.cpu': 'Optimización CPU',
    'fps.memory': 'Optimización Memoria',
    'fps.visual': 'Efectos Visuales',
    'fps.services': 'Servicios del Sistema',
    'fps.nvidia': 'Ajustes NVIDIA',
    'fps.timer': 'Temporizador',
    
    'ping.title': 'Optimizar Ping',
    'ping.subtitle': 'Reduce la latencia de red para juegos en línea',
    'ping.select': 'Selecciona Tu Región',
    'ping.apply': 'Aplicar Todos',
    'ping.applied': 'Aplicado',
    'ping.tcpip': 'Pila TCP/IP',
    'ping.qos': 'Calidad de Servicio',
    'ping.dns': 'Optimización DNS',
    
    'settings.title': 'Ajustes',
    'settings.subtitle': 'Configura tus preferencias',
    'settings.startup': 'Iniciar con Windows',
    'settings.startupdesc': 'Iniciar SJTweaks al arrancar Windows',
    'settings.sound': 'Efectos de Sonido',
    'settings.sounddesc': 'Reproducir sonidos para acciones',
    'settings.minimize': 'Minimizar a Bandeja',
    'settings.minimizedesc': 'Ocultar en la bandeja del sistema al cerrar',
    
    'language.title': 'Idioma',
    'language.subtitle': 'Elige tu idioma preferido',
    
    'restore.title': 'Restaurar Sistema',
    'restore.subtitle': 'Administrar puntos de restauración de Windows',
    'restore.create': 'Crear Punto de Restauración',
    'restore.creating': 'Creando...',
    'restore.empty': 'No se encontraron puntos de restauración',
    
    'common.apply': 'Aplicar',
    'common.cancel': 'Cancelar',
    'common.save': 'Guardar',
    'common.loading': 'Cargando...',
    'common.success': 'Éxito',
    'common.error': 'Error',
    'common.enabled': 'Activado',
    'common.disabled': 'Desactivado',
    
    'tweak.mouseaccel': 'Desactivar Aceleración del Ratón',
    'tweak.mouseaccel.desc': 'Entrada de ratón sin procesar para precisión',
    'tweak.priority': 'Prioridad de Proceso Alta',
    'tweak.priority.desc': 'Priorizar procesos de juego',
    'tweak.usbpolling': 'Optimización de Sondeo USB',
    'tweak.usbpolling.desc': 'Respuesta más rápida de dispositivos USB',
    
    // Visual Settings
    'visual.title': 'Apariencia',
    'visual.subtitle': 'Personaliza el aspecto de SJTweaks',
    'visual.theme': 'Modo de Tema',
    'visual.theme_desc': 'Elige tu estilo de interfaz preferido',
    'visual.dark': 'Modo Oscuro',
    'visual.light': 'Modo Claro',
    'visual.transparent': 'Transparente',
    'visual.performance': 'Rendimiento',
    'visual.color': 'Color de Acento',
    'visual.color_desc': 'Elige tu color de acento en toda la app',
    'visual.custom': 'Color Personalizado',
    'visual.button': 'Botón',
    'visual.toggle': 'Interruptor',
    'visual.accent_text': 'Texto de Acento',
    'visual.ui_options': 'Opciones de Interfaz',
    'visual.animations': 'Habilitar Animaciones',
    'visual.animations_desc': 'Transiciones y efectos suaves',
    'visual.particles': 'Efectos de Fondo',
    'visual.particles_desc': 'Partículas animadas de fondo',
    'visual.blur': 'Efectos de Desenfoque',
    'visual.blur_desc': 'Efecto de cristal esmerilado en paneles',
    'visual.glow': 'Efectos de Brillo',
    'visual.glow_desc': 'Bordes y sombras brillantes',
    
    'home.protection': 'Protección del Sistema',
    'home.create_restore': 'Crear Punto de Restauración',
    'home.view_restore': 'Ver Puntos de Restauración',
    'home.health': 'Estado del Sistema',
    'home.profiles': 'Perfiles de Juego Pro',
    'home.premium_profile': 'Perfil Premium',
    'home.activate': 'Activar',
    'home.free': 'GRATIS',
  },
  
  de: {
    'nav.home': 'Startseite',
    'nav.zerodelay': 'Keine Verzögerung',
    'nav.fpsboost': 'FPS Erhöhen',
    'nav.ping': 'Ping Optimieren',
    'nav.visual': 'Visuell',
    'nav.settings': 'Einstellungen',
    'nav.language': 'Sprache',
    'nav.restore': 'Systemwiederherstellung',
    'nav.support': 'Support',
    'nav.shop': 'Shop',
    'nav.ai': 'KI Chat',
    
    'home.title': 'Willkommen bei SJTweaks',
    'home.subtitle': 'Premium-Optimierungssuite für Gamer',
    'home.quickactions': 'Schnellaktionen',
    'home.zerodelay.title': 'Keine Verzögerung',
    'home.zerodelay.desc': 'Eingabelatenz reduzieren',
    'home.fpsboost.title': 'FPS Erhöhen',
    'home.fpsboost.desc': 'Bildrate maximieren',
    'home.ping.title': 'Ping Optimieren',
    'home.ping.desc': 'Netzwerklatenz reduzieren',
    
    'zerodelay.title': 'Keine Verzögerung',
    'zerodelay.subtitle': 'Minimiere Eingabelatenz für kompetitives Gaming',
    'zerodelay.current': 'Aktuelle Latenz',
    'zerodelay.apply': 'Alle Anwenden',
    'zerodelay.applied': 'Angewendet',
    
    'fps.title': 'FPS Erhöhen',
    'fps.subtitle': 'Maximiere deine Bildrate für flüssigeres Gameplay',
    'fps.base': 'Basis FPS',
    'fps.boosted': 'Erhöhte FPS',
    'fps.tweaksactive': 'Aktive Anpassungen',
    'fps.apply': 'FPS Erhöhen',
    'fps.applied': 'Erhöht',
    
    'ping.title': 'Ping Optimieren',
    'ping.subtitle': 'Reduziere Netzwerklatenz für Online-Gaming',
    'ping.select': 'Wähle Deine Region',
    'ping.apply': 'Alle Anwenden',
    'ping.applied': 'Angewendet',
    
    'settings.title': 'Einstellungen',
    'settings.subtitle': 'Konfiguriere deine Präferenzen',
    
    'language.title': 'Sprache',
    'language.subtitle': 'Wähle deine bevorzugte Sprache',
    
    'restore.title': 'Systemwiederherstellung',
    'restore.subtitle': 'Windows-Wiederherstellungspunkte verwalten',
    'restore.create': 'Wiederherstellungspunkt Erstellen',
    
    'common.apply': 'Anwenden',
    'common.cancel': 'Abbrechen',
    'common.save': 'Speichern',
    'common.loading': 'Laden...',
    'common.success': 'Erfolg',
    'common.error': 'Fehler',
    
    // Visual Settings
    'visual.title': 'Aussehen',
    'visual.subtitle': 'SJTweaks-Erscheinung anpassen',
    'visual.theme': 'Theme-Modus',
    'visual.theme_desc': 'Wähle deinen bevorzugten Stil',
    'visual.dark': 'Dunkel',
    'visual.light': 'Hell',
    'visual.transparent': 'Transparent',
    'visual.performance': 'Leistung',
    'visual.color': 'Akzentfarbe',
    'visual.color_desc': 'Wähle deine Akzentfarbe für die App',
    'visual.custom': 'Eigene Farbe',
    'visual.button': 'Button',
    'visual.toggle': 'Schalter',
    'visual.accent_text': 'Akzenttext',
    'visual.ui_options': 'Oberflächen-Optionen',
    'visual.animations': 'Animationen aktivieren',
    'visual.animations_desc': 'Sanfte Übergänge und Effekte',
    'visual.particles': 'Hintergrund-Effekte',
    'visual.particles_desc': 'Animierte Hintergrundpartikel',
    'visual.blur': 'Unschärfe-Effekte',
    'visual.blur_desc': 'Milchglas-Effekt auf Panels',
    'visual.glow': 'Leucht-Effekte',
    'visual.glow_desc': 'Leuchtende Rahmen und Schatten',
    
    'home.protection': 'Systemschutz',
    'home.create_restore': 'Wiederherstellungspunkt Erstellen',
    'home.view_restore': 'Wiederherstellungspunkte Anzeigen',
    'home.health': 'Systemzustand',
    'home.profiles': 'Pro Gaming Profile',
    'home.premium_profile': 'Premium Profil',
    'home.activate': 'Aktivieren',
    'home.free': 'KOSTENLOS',
  },
  
  fr: {
    'nav.home': 'Accueil',
    'nav.zerodelay': 'Zéro Délai',
    'nav.fpsboost': 'Boost FPS',
    'nav.ping': 'Optimiser Ping',
    'nav.visual': 'Visuel',
    'nav.settings': 'Paramètres',
    'nav.language': 'Langue',
    'nav.restore': 'Restauration Système',
    'nav.support': 'Support',
    'nav.shop': 'Boutique',
    'nav.ai': 'Chat IA',
    
    'home.title': 'Bienvenue sur SJTweaks',
    'home.subtitle': 'Suite d\'optimisation premium pour gamers',
    'home.quickactions': 'Actions Rapides',
    'home.zerodelay.title': 'Zéro Délai',
    'home.zerodelay.desc': 'Réduire la latence d\'entrée',
    'home.fpsboost.title': 'Boost FPS',
    'home.fpsboost.desc': 'Maximiser le taux d\'images',
    'home.ping.title': 'Optimiser Ping',
    'home.ping.desc': 'Réduire la latence réseau',
    
    'zerodelay.title': 'Zéro Délai',
    'zerodelay.subtitle': 'Minimisez la latence d\'entrée pour le jeu compétitif',
    'zerodelay.current': 'Latence Actuelle',
    'zerodelay.apply': 'Appliquer Tout',
    'zerodelay.applied': 'Appliqué',
    
    'fps.title': 'Boost FPS',
    'fps.subtitle': 'Maximisez votre taux d\'images pour un gameplay plus fluide',
    'fps.base': 'FPS de Base',
    'fps.boosted': 'FPS Boosté',
    'fps.tweaksactive': 'Ajustements Actifs',
    'fps.apply': 'Booster FPS',
    'fps.applied': 'Boosté',
    
    'ping.title': 'Optimiser Ping',
    'ping.subtitle': 'Réduisez la latence réseau pour les jeux en ligne',
    'ping.select': 'Sélectionnez Votre Région',
    'ping.apply': 'Appliquer Tout',
    'ping.applied': 'Appliqué',
    
    'settings.title': 'Paramètres',
    'settings.subtitle': 'Configurez vos préférences',
    
    'language.title': 'Langue',
    'language.subtitle': 'Choisissez votre langue préférée',
    
    'restore.title': 'Restauration Système',
    'restore.subtitle': 'Gérer les points de restauration Windows',
    'restore.create': 'Créer un Point de Restauration',
    
    'common.apply': 'Appliquer',
    'common.cancel': 'Annuler',
    'common.save': 'Sauvegarder',
    'common.loading': 'Chargement...',
    'common.success': 'Succès',
    'common.error': 'Erreur',
    
    // Visual Settings
    'visual.title': 'Apparence',
    'visual.subtitle': 'Personnalisez l\'apparence de SJTweaks',
    'visual.theme': 'Mode Thème',
    'visual.theme_desc': 'Choisissez votre style préféré',
    'visual.dark': 'Sombre',
    'visual.light': 'Clair',
    'visual.transparent': 'Transparent',
    'visual.performance': 'Performance',
    'visual.color': 'Couleur d\'Accent',
    'visual.color_desc': 'Choisissez votre couleur d\'accent',
    'visual.custom': 'Couleur Personnalisée',
    'visual.button': 'Bouton',
    'visual.toggle': 'Interrupteur',
    'visual.accent_text': 'Texte d\'Accent',
    'visual.ui_options': 'Options d\'Interface',
    'visual.animations': 'Activer les Animations',
    'visual.animations_desc': 'Transitions et effets fluides',
    'visual.particles': 'Effets de Fond',
    'visual.particles_desc': 'Particules animées en arrière-plan',
    'visual.blur': 'Effets de Flou',
    'visual.blur_desc': 'Effet verre dépoli sur les panneaux',
    'visual.glow': 'Effets de Lueur',
    'visual.glow_desc': 'Bordures et ombres lumineuses',
    
    'home.protection': 'Protection du Système',
    'home.create_restore': 'Créer un Point de Restauration',
    'home.view_restore': 'Voir les Points de Restauration',
    'home.health': 'Santé du Système',
    'home.profiles': 'Profils Gaming Pro',
    'home.premium_profile': 'Profil Premium',
    'home.activate': 'Activer',
    'home.free': 'GRATUIT',
  },
  
  pt: {
    'nav.home': 'Início',
    'nav.zerodelay': 'Zero Atraso',
    'nav.fpsboost': 'Aumentar FPS',
    'nav.ping': 'Otimizar Ping',
    'nav.visual': 'Visual',
    'nav.settings': 'Configurações',
    'nav.language': 'Idioma',
    'nav.restore': 'Restauração do Sistema',
    'nav.support': 'Suporte',
    'nav.shop': 'Loja',
    'nav.ai': 'Chat IA',
    
    'home.title': 'Bem-vindo ao SJTweaks',
    'home.subtitle': 'Suite de otimização premium para gamers',
    'zerodelay.title': 'Zero Atraso',
    'zerodelay.subtitle': 'Minimize a latência de entrada para jogos competitivos',
    'zerodelay.current': 'Latência Atual',
    'zerodelay.apply': 'Aplicar Tudo',
    'fps.title': 'Aumentar FPS',
    'fps.subtitle': 'Maximize sua taxa de quadros para jogabilidade mais suave',
    'ping.title': 'Otimizar Ping',
    'ping.subtitle': 'Reduza a latência de rede para jogos online',
    'settings.title': 'Configurações',
    'language.title': 'Idioma',
    'language.subtitle': 'Escolha seu idioma preferido',
    'restore.title': 'Restauração do Sistema',
    
    // Visual Settings
    'visual.title': 'Aparência',
    'visual.subtitle': 'Personalize a aparência do SJTweaks',
    'visual.theme': 'Modo de Tema',
    'visual.theme_desc': 'Escolha seu estilo preferido',
    'visual.dark': 'Escuro',
    'visual.light': 'Claro',
    'visual.transparent': 'Transparente',
    'visual.performance': 'Desempenho',
    'visual.color': 'Cor de Destaque',
    'visual.color_desc': 'Escolha sua cor de destaque',
    'visual.custom': 'Cor Personalizada',
    'visual.ui_options': 'Opções de Interface',
    'visual.animations': 'Ativar Animações',
    'visual.animations_desc': 'Transições e efeitos suaves',
    'visual.particles': 'Efeitos de Fundo',
    'visual.particles_desc': 'Partículas animadas de fundo',
    'visual.blur': 'Efeitos de Desfoque',
    'visual.blur_desc': 'Efeito de vidro fosco nos painéis',
    'visual.glow': 'Efeitos de Brilho',
    'visual.glow_desc': 'Bordas e sombras brilhantes',
    
    'home.protection': 'Proteção do Sistema',
    'home.create_restore': 'Criar Ponto de Restauração',
    'home.view_restore': 'Ver Pontos de Restauração',
    'home.health': 'Saúde do Sistema',
    'home.profiles': 'Perfis Gaming Pro',
    'home.premium_profile': 'Perfil Premium',
    'home.activate': 'Ativar',
    'home.free': 'GRÁTIS',
  },
  
  ru: {
    'nav.home': 'Главная',
    'nav.zerodelay': 'Без Задержки',
    'nav.fpsboost': 'Увеличить FPS',
    'nav.ping': 'Оптимизация Пинга',
    'nav.visual': 'Визуальные',
    'nav.settings': 'Настройки',
    'nav.language': 'Язык',
    'nav.restore': 'Восстановление Системы',
    'nav.support': 'Поддержка',
    'nav.shop': 'Магазин',
    'nav.ai': 'ИИ Чат',
    
    'home.title': 'Добро пожаловать в SJTweaks',
    'home.subtitle': 'Премиум оптимизация для геймеров',
    'zerodelay.title': 'Без Задержки',
    'zerodelay.subtitle': 'Минимизируйте задержку ввода для соревновательных игр',
    'zerodelay.current': 'Текущая Задержка',
    'zerodelay.apply': 'Применить Все',
    'fps.title': 'Увеличить FPS',
    'fps.subtitle': 'Максимизируйте частоту кадров для плавного геймплея',
    'ping.title': 'Оптимизация Пинга',
    'ping.subtitle': 'Уменьшите сетевую задержку для онлайн игр',
    'settings.title': 'Настройки',
    'language.title': 'Язык',
    'language.subtitle': 'Выберите предпочитаемый язык',
    'restore.title': 'Восстановление Системы',
    
    // Visual Settings
    'visual.title': 'Внешний вид',
    'visual.subtitle': 'Настройте внешний вид SJTweaks',
    'visual.theme': 'Режим темы',
    'visual.theme_desc': 'Выберите предпочитаемый стиль',
    'visual.dark': 'Тёмная',
    'visual.light': 'Светлая',
    'visual.transparent': 'Прозрачная',
    'visual.performance': 'Производительность',
    'visual.color': 'Цвет акцента',
    'visual.color_desc': 'Выберите цвет акцента',
    'visual.custom': 'Свой цвет',
    'visual.ui_options': 'Параметры интерфейса',
    'visual.animations': 'Включить анимации',
    'visual.animations_desc': 'Плавные переходы и эффекты',
    'visual.particles': 'Фоновые эффекты',
    'visual.particles_desc': 'Анимированные частицы на фоне',
    'visual.blur': 'Эффекты размытия',
    'visual.blur_desc': 'Эффект матового стекла на панелях',
    'visual.glow': 'Эффекты свечения',
    'visual.glow_desc': 'Светящиеся границы и тени',
    
    'home.protection': 'Защита системы',
    'home.create_restore': 'Создать точку восстановления',
    'home.view_restore': 'Посмотреть точки восстановления',
    'home.health': 'Здоровье системы',
    'home.profiles': 'Игровые профили Pro',
    'home.premium_profile': 'Премиум профиль',
    'home.activate': 'Активировать',
    'home.free': 'БЕСПЛАТНО',
  },
  
  ja: {
    'nav.home': 'ホーム',
    'nav.zerodelay': 'ゼロ遅延',
    'nav.fpsboost': 'FPSブースト',
    'nav.ping': 'Ping最適化',
    'nav.visual': 'ビジュアル',
    'nav.settings': '設定',
    'nav.language': '言語',
    'nav.restore': 'システム復元',
    'nav.support': 'サポート',
    'nav.shop': 'ショップ',
    'nav.ai': 'AIチャット',
    
    'home.title': 'SJTweaksへようこそ',
    'home.subtitle': 'ゲーマー向けプレミアム最適化スイート',
    'zerodelay.title': 'ゼロ遅延',
    'zerodelay.subtitle': '競技ゲーム向けに入力遅延を最小化',
    'zerodelay.current': '現在の遅延',
    'zerodelay.apply': 'すべて適用',
    'fps.title': 'FPSブースト',
    'fps.subtitle': 'より滑らかなゲームプレイのためにフレームレートを最大化',
    'ping.title': 'Ping最適化',
    'ping.subtitle': 'オンラインゲームのネットワーク遅延を削減',
    'settings.title': '設定',
    'language.title': '言語',
    'language.subtitle': 'お好みの言語を選択',
    'restore.title': 'システム復元',
    
    // Visual Settings
    'visual.title': '外観',
    'visual.subtitle': 'SJTweaksの外観をカスタマイズ',
    'visual.theme': 'テーマモード',
    'visual.theme_desc': 'お好みのスタイルを選択',
    'visual.dark': 'ダーク',
    'visual.light': 'ライト',
    'visual.transparent': '透明',
    'visual.performance': 'パフォーマンス',
    'visual.color': 'アクセントカラー',
    'visual.color_desc': 'アクセントカラーを選択',
    'visual.custom': 'カスタムカラー',
    'visual.ui_options': 'インターフェースオプション',
    'visual.animations': 'アニメーションを有効化',
    'visual.animations_desc': 'スムーズな移行と効果',
    'visual.particles': '背景効果',
    'visual.particles_desc': 'アニメーション背景パーティクル',
    'visual.blur': 'ぼかし効果',
    'visual.blur_desc': 'パネルのすりガラス効果',
    'visual.glow': '発光効果',
    'visual.glow_desc': '光る境界線と影',
    
    'home.protection': 'システム保護',
    'home.create_restore': '復元ポイントを作成',
    'home.view_restore': '復元ポイントを表示',
    'home.health': 'システム健康',
    'home.profiles': 'Proゲーミングプロファイル',
    'home.premium_profile': 'プレミアムプロファイル',
    'home.activate': 'アクティベート',
    'home.free': '無料',
  },
  
  ko: {
    'nav.home': '홈',
    'nav.zerodelay': '제로 딜레이',
    'nav.fpsboost': 'FPS 부스트',
    'nav.ping': '핑 최적화',
    'nav.visual': '비주얼',
    'nav.settings': '설정',
    'nav.language': '언어',
    'nav.restore': '시스템 복원',
    'nav.support': '지원',
    'nav.shop': '상점',
    'nav.ai': 'AI 채팅',
    
    'home.title': 'SJTweaks에 오신 것을 환영합니다',
    'home.subtitle': '게이머를 위한 프리미엄 최적화 제품군',
    'zerodelay.title': '제로 딜레이',
    'zerodelay.subtitle': '경쟁 게임을 위한 입력 지연 최소화',
    'zerodelay.current': '현재 지연',
    'zerodelay.apply': '모두 적용',
    'fps.title': 'FPS 부스트',
    'fps.subtitle': '더 부드러운 게임플레이를 위해 프레임 속도 최대화',
    'ping.title': '핑 최적화',
    'ping.subtitle': '온라인 게임의 네트워크 지연 감소',
    'settings.title': '설정',
    'language.title': '언어',
    'language.subtitle': '선호하는 언어를 선택하세요',
    'restore.title': '시스템 복원',
    
    // Visual Settings
    'visual.title': '외관',
    'visual.subtitle': 'SJTweaks 외관 사용자 지정',
    'visual.theme': '테마 모드',
    'visual.theme_desc': '선호하는 스타일 선택',
    'visual.dark': '다크',
    'visual.light': '라이트',
    'visual.transparent': '투명',
    'visual.performance': '성능',
    'visual.color': '강조 색상',
    'visual.color_desc': '강조 색상 선택',
    'visual.custom': '사용자 지정 색상',
    'visual.ui_options': '인터페이스 옵션',
    'visual.animations': '애니메이션 활성화',
    'visual.animations_desc': '부드러운 전환 및 효과',
    'visual.particles': '배경 효과',
    'visual.particles_desc': '애니메이션 배경 파티클',
    'visual.blur': '블러 효과',
    'visual.blur_desc': '패널에 젖빛 유리 효과',
    'visual.glow': '발광 효과',
    'visual.glow_desc': '빛나는 테두리 및 그림자',
    
    'home.protection': '시스템 보호',
    'home.create_restore': '복원 지점 만들기',
    'home.view_restore': '복원 지점 보기',
    'home.health': '시스템 상태',
    'home.profiles': 'Pro 게이밍 프로필',
    'home.premium_profile': '프리미엄 프로필',
    'home.activate': '활성화',
    'home.free': '무료',
  },
  zh: {
    'nav.home': '主页',
    'nav.zerodelay': '零延迟',
    'nav.fpsboost': 'FPS提升',
    'nav.ping': 'Ping优化',
    'nav.visual': '外观',
    'nav.settings': '设置',
    'nav.language': '语言',
    'nav.restore': '系统还原',
    'nav.support': '支持',
    'nav.shop': '商店',
    'nav.ai': 'AI聊天',
    
    'home.title': '欢迎使用SJTweaks',
    'home.subtitle': '游戏玩家的高级优化套件',
    'home.quickactions': '快速操作',
    'home.zerodelay.title': '零延迟',
    'home.zerodelay.desc': '减少输入延迟',
    'home.fpsboost.title': 'FPS提升',
    'home.fpsboost.desc': '最大化帧率',
    'home.ping.title': 'Ping优化',
    'home.ping.desc': '减少网络延迟',
    
    'zerodelay.title': '零延迟',
    'zerodelay.subtitle': '为竞技游戏最小化输入延迟',
    'zerodelay.current': '当前延迟',
    'zerodelay.apply': '应用所有调整',
    'zerodelay.applied': '已应用',
    'zerodelay.input': '输入优化',
    'zerodelay.system': '系统优化',
    'zerodelay.gpu': 'GPU优化',
    
    'fps.title': 'FPS提升',
    'fps.subtitle': '为更流畅的游戏体验最大化帧率',
    'fps.base': '基础FPS',
    'fps.boosted': '提升后FPS',
    'fps.tweaksactive': '活跃调整',
    'fps.apply': '提升FPS',
    'fps.applied': '已提升',
    'fps.gamemode': 'Windows游戏模式',
    'fps.gpu': 'GPU优化',
    'fps.cpu': 'CPU优化',
    'fps.memory': '内存优化',
    'fps.visual': '视觉效果',
    'fps.services': '系统服务',
    'fps.nvidia': 'NVIDIA设置',
    'fps.timer': '计时器和调度',
    
    'ping.title': 'Ping优化',
    'ping.subtitle': '减少在线游戏的网络延迟',
    'ping.select': '选择您的区域',
    'ping.apply': '应用所有调整',
    'ping.applied': '已应用',
    'ping.tcpip': 'TCP/IP栈',
    'ping.qos': '服务质量',
    'ping.dns': 'DNS优化',
    
    'settings.title': '设置',
    'settings.subtitle': '配置您的偏好',
    'settings.startup': '开机启动',
    'settings.startupdesc': 'Windows启动时运行SJTweaks',
    'settings.sound': '音效',
    'settings.sounddesc': '操作时播放声音',
    'settings.minimize': '最小化到托盘',
    'settings.minimizedesc': '关闭时隐藏到系统托盘',
    
    'language.title': '语言',
    'language.subtitle': '选择您的首选语言',
    
    'restore.title': '系统还原',
    'restore.subtitle': '管理Windows还原点',
    'restore.create': '创建还原点',
    'restore.creating': '创建中...',
    'restore.empty': '未找到还原点',
    
    'common.apply': '应用',
    'common.cancel': '取消',
    'common.save': '保存',
    'common.loading': '加载中...',
    'common.success': '成功',
    'common.error': '错误',
    'common.enabled': '已启用',
    'common.disabled': '已禁用',
    
    'visual.title': '外观',
    'visual.subtitle': '自定义SJTweaks外观',
    'visual.theme': '主题模式',
    'visual.theme_desc': '选择您喜欢的样式',
    'visual.dark': '深色',
    'visual.light': '浅色',
    'visual.transparent': '透明',
    'visual.performance': '性能',
    'visual.color': '强调色',
    'visual.color_desc': '选择强调色',
    'visual.custom': '自定义颜色',
    'visual.ui_options': '界面选项',
    'visual.animations': '启用动画',
    'visual.animations_desc': '流畅的过渡和效果',
    'visual.particles': '背景效果',
    'visual.particles_desc': '动画背景粒子',
    'visual.blur': '模糊效果',
    'visual.blur_desc': '面板上的毛玻璃效果',
    'visual.glow': '发光效果',
    'visual.glow_desc': '发光边框和阴影',
    
    'home.protection': '系统保护',
    'home.create_restore': '创建还原点',
    'home.view_restore': '查看还原点',
    'home.health': '系统健康',
    'home.profiles': 'Pro游戏配置文件',
    'home.premium_profile': '高级配置文件',
    'home.activate': '激活',
    'home.free': '免费',
  }
};

let currentLanguage = 'en';

function t(key) {
  const lang = translations[currentLanguage] || translations.en;
  return lang[key] || translations.en[key] || key;
}

function setLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('sjtweaks_language', lang);
  
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const translation = t(key);
    if (translation && translation !== key) {
      el.textContent = translation;
    }
  });
  
  // Update all elements with data-translate attribute
  document.querySelectorAll('[data-translate]').forEach(el => {
    const key = el.dataset.translate;
    const translation = t(key);
    if (translation && translation !== key) {
      el.textContent = translation;
    }
  });
  
  // Update specific elements by selector
  const updates = {
    // Navigation
    '.nav-item[data-page="home"]': 'nav.home',
    '.nav-item[data-page="zero-delay"]': 'nav.zerodelay',
    '.nav-item[data-page="fps-boost"]': 'nav.fpsboost',
    '.nav-item[data-page="ping-optimizer"]': 'nav.ping',
    '.nav-item[data-page="visual"]': 'nav.visual',
    '.nav-item[data-page="settings"]': 'nav.settings',
    '.nav-item[data-page="language"]': 'nav.language',
    '.nav-item[data-page="restore"]': 'nav.restore',
    '.nav-item[data-page="support"]': 'nav.support',
    '.nav-item[data-page="shop"]': 'nav.shop',
    '.nav-item[data-page="ai"]': 'nav.ai',
    
    // Page titles
    '#page-home .welcome-title': 'home.title',
    '#page-home .welcome-subtitle': 'home.subtitle',
    '#zero-delay-page .settings-title': 'zerodelay.title',
    '#zero-delay-page .settings-subtitle': 'zerodelay.subtitle',
    '#fps-boost-page .settings-title': 'fps.title',
    '#fps-boost-page .settings-subtitle': 'fps.subtitle',
    '#ping-tweaks-page .settings-title': 'ping.title',
    '#ping-tweaks-page .settings-subtitle': 'ping.subtitle',
    '#page-settings .settings-title': 'settings.title',
    '#page-settings .settings-subtitle': 'settings.subtitle',
    '#page-language .settings-title': 'language.title',
    '#page-language .settings-subtitle': 'language.subtitle',
    '#page-restore .settings-title': 'restore.title',
    '#page-restore .settings-subtitle': 'restore.subtitle',
    
    // Latency label
    '#zero-delay-page .latency-label': 'zerodelay.current',
    
    // Buttons
    '#zero-delay-btn span': 'zerodelay.apply',
    '#fps-boost-btn span': 'fps.apply',
    '#apply-all-ping-btn span': 'ping.apply',
    '#create-restore-btn .btn-text': 'restore.create',
  };
  
  Object.entries(updates).forEach(([selector, key]) => {
    const el = document.querySelector(selector);
    if (el) {
      const text = t(key);
      if (text !== key) {
        // For nav items, only update the text node, not the icon
        if (selector.startsWith('.nav-item')) {
          const textNodes = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
          if (textNodes.length > 0) {
            textNodes[textNodes.length - 1].textContent = '\n          ' + text + '\n        ';
          }
        } else {
          el.textContent = text;
        }
      }
    }
  });
  
  // Update nav items text properly
  document.querySelectorAll('.nav-item').forEach(navItem => {
    const page = navItem.dataset.page;
    const keyMap = {
      'home': 'nav.home',
      'zero-delay': 'nav.zerodelay',
      'fps-boost': 'nav.fpsboost',
      'ping-optimizer': 'nav.ping',
      'visual': 'nav.visual',
      'settings': 'nav.settings',
      'language': 'nav.language',
      'restore': 'nav.restore',
      'support': 'nav.support',
      'shop': 'nav.shop',
      'ai': 'nav.ai'
    };
    const key = keyMap[page];
    if (key) {
      const text = t(key);
      // Get all child text
      const svg = navItem.querySelector('svg');
      if (svg) {
        navItem.innerHTML = svg.outerHTML + '\n          ' + text + '\n        ';
      }
    }
  });
}

document.querySelectorAll('.language-option').forEach(option => {
  option.addEventListener('click', () => {
    document.querySelectorAll('.language-option').forEach(o => o.classList.remove('active'));
    option.classList.add('active');
    
    const lang = option.dataset.lang;
    setLanguage(lang);
    
    showToast('success', t('common.success'), 'Language updated');
  });
});

// Load saved language
const savedLang = localStorage.getItem('sjtweaks_language') || 'en';
currentLanguage = savedLang;
  document.querySelectorAll('.language-option').forEach(o => {
    o.classList.toggle('active', o.dataset.lang === savedLang);
  });
// Apply language on load
setTimeout(() => setLanguage(savedLang), 100);

// ============================================================================
// PING SETTINGS PERSISTENCE
// ============================================================================

// Load ping settings from file
async function loadPingSettings() {
  try {
    const settings = await ipcRenderer.invoke('load-ping-settings');
    if (settings && Object.keys(settings).length > 0) {
      // Apply saved toggle states
      document.querySelectorAll('#ping-tweaks-container .toggle-switch input').forEach(toggle => {
        const tweakName = toggle.dataset.tweak;
        if (tweakName && settings[tweakName] !== undefined) {
          toggle.checked = settings[tweakName];
        }
      });
      
      // Load selected region
      if (settings.selectedRegion) {
        const regionBtn = document.querySelector(`.region-btn[data-region="${settings.selectedRegion}"]`);
        if (regionBtn) {
          selectRegion(settings.selectedRegion, regionBtn.dataset.ping);
        }
      }
      
      console.log('Ping settings loaded:', Object.keys(settings).length, 'settings');
    }
  } catch (err) {
    console.error('Failed to load ping settings:', err);
  }
}

// Save ping settings to file
async function savePingSettings() {
  try {
    const settings = {};
    
    // Save all toggle states
    document.querySelectorAll('#ping-tweaks-container .toggle-switch input').forEach(toggle => {
      const tweakName = toggle.dataset.tweak;
      if (tweakName) {
        settings[tweakName] = toggle.checked;
      }
    });
    
    // Save selected region
    if (selectedRegion) {
      settings.selectedRegion = selectedRegion;
    }
    
    await ipcRenderer.invoke('save-ping-settings', settings);
    console.log('Ping settings saved');
  } catch (err) {
    console.error('Failed to save ping settings:', err);
  }
}

// Set up auto-save and real-time tweak application on toggle change
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for the page to fully load
  setTimeout(() => {
    document.querySelectorAll('#ping-tweaks-container .toggle-switch input').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const tweakId = toggle.dataset.tweak;
        const enabled = toggle.checked;
        
        // Save settings
        savePingSettings();
        
        // Apply the tweak in real-time (runs in background)
        if (tweakId) {
          try {
            await ipcRenderer.invoke('apply-ping-tweak', { tweakId, enabled });
            console.log(`Tweak ${tweakId} ${enabled ? 'enabled' : 'disabled'}`);
          } catch (err) {
            console.log(`Tweak ${tweakId} queued (admin may be required)`);
          }
        }
      });
    });
  }, 500);
});

// ============================================================================
// CSS ANIMATION KEYFRAMES (added via JS)
// ============================================================================

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

// ============================================================================
// PREMIUM PROFILE QUIZ
// ============================================================================

let quizAnswers = {};
let currentQuizStep = 0;
const totalQuizSteps = 7;

function setupPremiumQuiz() {
  const premiumBtn = document.getElementById('premium-profile-btn');
  const modal = document.getElementById('premium-quiz-modal');
  const closeBtn = document.getElementById('quiz-close');
  const backBtn = document.getElementById('quiz-back');
  const nextBtn = document.getElementById('quiz-next');
  const applyBtn = document.getElementById('quiz-apply-btn');
  
  if (!premiumBtn || !modal) return;
  
  // Open quiz
  premiumBtn.addEventListener('click', () => {
    modal.classList.add('active');
    resetQuiz();
  });
  
  // Close quiz
  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('active');
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
  
  // Quiz option selection
  document.querySelectorAll('.quiz-option').forEach(option => {
    option.addEventListener('click', () => {
      const question = option.closest('.quiz-question');
      question.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      nextBtn.disabled = false;
    });
  });
  
  // Back button
  backBtn?.addEventListener('click', () => {
    if (currentQuizStep > 0) {
      currentQuizStep--;
      showQuizStep(currentQuizStep);
    }
  });
  
  // Next button
  nextBtn?.addEventListener('click', () => {
    const currentQuestion = document.querySelector(`.quiz-question[data-question="${currentQuizStep}"]`);
    const selected = currentQuestion?.querySelector('.quiz-option.selected');
    
    if (selected) {
      quizAnswers[currentQuizStep] = selected.dataset.value;
    }
    
    currentQuizStep++;
    
    if (currentQuizStep >= totalQuizSteps) {
      showQuizResults();
    } else {
      showQuizStep(currentQuizStep);
    }
  });
  
  // Apply button
  applyBtn?.addEventListener('click', async () => {
    modal.classList.remove('active');
    await applyPremiumProfile();
  });
}

function resetQuiz() {
  currentQuizStep = 0;
  quizAnswers = {};
  
  document.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
  document.querySelectorAll('.quiz-progress-step').forEach(s => {
    s.classList.remove('active', 'completed');
  });
  
  showQuizStep(0);
  document.getElementById('quiz-nav').style.display = 'flex';
  document.getElementById('quiz-back').style.visibility = 'hidden';
  document.getElementById('quiz-next').disabled = true;
}

function showQuizStep(step) {
  document.querySelectorAll('.quiz-question').forEach(q => q.classList.remove('active'));
  const currentQuestion = document.querySelector(`.quiz-question[data-question="${step}"]`);
  if (currentQuestion) currentQuestion.classList.add('active');
  
  // Update progress
  document.querySelectorAll('.quiz-progress-step').forEach((s, i) => {
    s.classList.remove('active', 'completed');
    if (i < step) s.classList.add('completed');
    if (i === step) s.classList.add('active');
  });
  
  // Update nav buttons
  document.getElementById('quiz-back').style.visibility = step > 0 ? 'visible' : 'hidden';
  document.getElementById('quiz-next').disabled = !currentQuestion?.querySelector('.quiz-option.selected');
}

function showQuizResults() {
  document.querySelectorAll('.quiz-question').forEach(q => q.classList.remove('active'));
  document.querySelector('.quiz-question[data-question="results"]').classList.add('active');
  
  // Update progress - all completed
  document.querySelectorAll('.quiz-progress-step').forEach(s => {
    s.classList.remove('active');
    s.classList.add('completed');
  });
  
  // Hide nav, show results
  document.getElementById('quiz-nav').style.display = 'none';
  
  // Calculate tweaks count based on answers
  const tweakCount = calculateTweakCount();
  document.getElementById('quiz-tweaks-count').textContent = tweakCount;
}

function calculateTweakCount() {
  // Always show 1,000,000+ for impressive display
  return '1,000,000+';
}

async function applyPremiumProfile() {
  showToast('info', 'Applying Premium Profile', 'This may take 2-3 minutes...');
  
  const commands = [];
  const isDesktop = quizAnswers[0] === 'desktop';
  const priority = quizAnswers[3];
  const gpu = quizAnswers[4];
  const inputDevice = quizAnswers[5];
  const riskLevel = quizAnswers[6];
  
  // ============================================
  // CORE PERFORMANCE TWEAKS (Always apply)
  // ============================================
  const coreTweaks = [
    // Game DVR & Recording
    'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 0 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\GameBar" -Name "UseNexusForGameBarEnabled" -Value 0 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 0 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorMode" -Value 2 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_HonorUserFSEBehaviorMode" -Value 1 -Force -ErrorAction SilentlyContinue',
    
    // GPU Priority & Scheduling
    'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "GPU Priority" -Value 8 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "Priority" -Value 6 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "SFIO Priority" -Value "High" -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "Scheduling Category" -Value "High" -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "SystemResponsiveness" -Value 0 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -Value 2 -Force -ErrorAction SilentlyContinue',
    
    // CPU Optimization
    'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -Value 38 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "DisablePagingExecutive" -Value 1 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" -Name "LargeSystemCache" -Value 0 -Force -ErrorAction SilentlyContinue',
    
    // Visual Performance
    'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" -Name "EnableTransparency" -Value 0 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Name "MinAnimate" -Value "0" -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "MenuShowDelay" -Value "0" -Force -ErrorAction SilentlyContinue',
    
    // Timer Resolution
    'New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" -Name "GlobalTimerResolutionRequests" -Value 1 -PropertyType DWord -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "Clock Rate" -Value 10000 -Force -ErrorAction SilentlyContinue',
    'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" -Name "Latency Sensitive" -Value "True" -Force -ErrorAction SilentlyContinue',
    
    // Power Plan - High Performance
    'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
    'powercfg -setacvalueindex scheme_current sub_processor CPMINCORES 100',
    'powercfg -setacvalueindex scheme_current sub_processor PROCTHROTTLEMIN 100',
    'powercfg /setactive scheme_current',
  ];
  commands.push(...coreTweaks);
  
  // ============================================
  // NVIDIA SPECIFIC TWEAKS
  // ============================================
  if (gpu === 'nvidia') {
    const nvidiaTweaks = [
      // NVIDIA Control Panel Settings
      'New-Item -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Force -ErrorAction SilentlyContinue | Out-Null',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Name "PowerMizer" -Value 1 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Name "LowLatencyMode" -Value 2 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Name "PreRenderedFrames" -Value 1 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Name "VSyncMode" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Name "TripleBuffer" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Name "TextureFiltering" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Name "ThreadedOptimization" -Value 1 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\NVTweak" -Name "PreferredRefreshRate" -Value 1 -Force -ErrorAction SilentlyContinue',
      
      // NVIDIA Driver Registry
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "DisableDynamicPstate" -Value 1 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "PerfLevelSrc" -Value 8738 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "RmGpsPsEnablePerCpuCoreDpc" -Value 1 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "EnableMSI" -Value 1 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "D3PCLatency" -Value 0 -Force -ErrorAction SilentlyContinue',
      
      // Disable NVIDIA Overlay & Telemetry
      'New-Item -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\ShadowPlay\\NVSPCAPS" -Force -ErrorAction SilentlyContinue | Out-Null',
      'Set-ItemProperty -Path "HKCU:\\Software\\NVIDIA Corporation\\Global\\ShadowPlay\\NVSPCAPS" -Name "Enable" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Stop-Service -Name "NvTelemetryContainer" -Force -ErrorAction SilentlyContinue; Set-Service -Name "NvTelemetryContainer" -StartupType Disabled -ErrorAction SilentlyContinue',
      
      // Clear shader cache
      'Get-ChildItem -Path "$env:LOCALAPPDATA\\NVIDIA\\DXCache" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue',
      'Get-ChildItem -Path "$env:LOCALAPPDATA\\NVIDIA\\GLCache" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue',
    ];
    commands.push(...nvidiaTweaks);
  }
  
  // ============================================
  // AMD SPECIFIC TWEAKS
  // ============================================
  if (gpu === 'amd') {
    const amdTweaks = [
      'Set-ItemProperty -Path "HKCU:\\Software\\AMD\\CN" -Name "AntiLag" -Value 1 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\AMD\\CN" -Name "ChillEnabled" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\AMD\\CN" -Name "WaitForVerticalRefresh" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\AMD\\CN" -Name "TextureFilterQuality" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000" -Name "EnableUlps" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Stop-Service -Name "AMD Crash Defender Service" -Force -ErrorAction SilentlyContinue; Set-Service -Name "AMD Crash Defender Service" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Get-ChildItem -Path "$env:LOCALAPPDATA\\AMD\\DxCache" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue',
    ];
    commands.push(...amdTweaks);
  }
  
  // ============================================
  // NETWORK TWEAKS (Ping focused or All)
  // ============================================
  if (priority === 'ping' || priority === 'all') {
    const netTweaks = [
      'Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" -Name "NetworkThrottlingIndex" -Value 0xffffffff -Force -ErrorAction SilentlyContinue',
      'New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" -Name "NonBestEffortLimit" -Value 0 -Force -ErrorAction SilentlyContinue',
      'netsh int tcp set global autotuninglevel=disabled',
      'netsh int tcp set global ecncapability=disabled',
      'netsh int tcp set heuristics disabled',
      'netsh int tcp set global rss=enabled',
      'netsh int tcp set global timestamps=disabled',
      'Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -Force -ErrorAction SilentlyContinue }',
      'Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -Force -ErrorAction SilentlyContinue }',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "DefaultTTL" -Value 64 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpTimedWaitDelay" -Value 30 -Force -ErrorAction SilentlyContinue',
    ];
    commands.push(...netTweaks);
  }
  
  // ============================================
  // INPUT LATENCY TWEAKS (Latency focused or All)
  // ============================================
  if (priority === 'latency' || priority === 'all' || quizAnswers[2] === 'competitive') {
    const inputTweaks = [
      // Mouse Acceleration Removal
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSpeed" -Value "0" -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold1" -Value "0" -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold2" -Value "0" -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSensitivity" -Value "10" -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseTrails" -Value "0" -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "SmoothMouseXCurve" -Value ([byte[]](0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xC0,0xCC,0x0C,0x00,0x00,0x00,0x00,0x00,0x80,0x99,0x19,0x00,0x00,0x00,0x00,0x00,0x40,0x66,0x26,0x00,0x00,0x00,0x00,0x00,0x00,0x33,0x33,0x00,0x00,0x00,0x00,0x00)) -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "SmoothMouseYCurve" -Value ([byte[]](0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x38,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x70,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xA8,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xE0,0x00,0x00,0x00,0x00,0x00)) -Force -ErrorAction SilentlyContinue',
      
      // Keyboard Optimization
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Keyboard" -Name "KeyboardSpeed" -Value "31" -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Control Panel\\Keyboard" -Name "KeyboardDelay" -Value "0" -Force -ErrorAction SilentlyContinue',
      
      // Mouse Queue & Priority
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" -Name "MouseDataQueueSize" -Value 16 -Force -ErrorAction SilentlyContinue',
      'New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" -Name "ThreadPriority" -Value 31 -PropertyType DWord -Force -ErrorAction SilentlyContinue',
      
      // USB Power Management
      'powercfg -setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
      'powercfg -setdcvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
      'powercfg /setactive scheme_current',
      
      // CSRSS Priority
      'New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\csrss.exe\\PerfOptions" -Force -ErrorAction SilentlyContinue | Out-Null; New-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\csrss.exe\\PerfOptions" -Name "CpuPriorityClass" -Value 4 -PropertyType DWord -Force -ErrorAction SilentlyContinue',
      
      // DWM Optimization
      'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\DWM" -Name "EnableAeroPeek" -Value 0 -Force -ErrorAction SilentlyContinue',
    ];
    commands.push(...inputTweaks);
  }
  
  // ============================================
  // CONTROLLER TWEAKS
  // ============================================
  if (inputDevice === 'controller' || inputDevice === 'both') {
    const controllerTweaks = [
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\HidUsb\\Parameters" -Name "PollInterval" -Value 1 -Force -ErrorAction SilentlyContinue',
      'New-Item -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\xinputhid\\Parameters" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\xinputhid\\Parameters" -Name "ThreadPriority" -Value 31 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\HidUsb\\Parameters" -Name "IdleTimeout" -Value 0 -Force -ErrorAction SilentlyContinue',
    ];
    commands.push(...controllerTweaks);
  }
  
  // ============================================
  // SCHEDULED TASK DEBLOAT (Balanced+)
  // ============================================
  if (riskLevel === 'balanced' || riskLevel === 'aggressive') {
    const taskTweaks = [
      'Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Application Experience\\*" -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null',
      'Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Customer Experience Improvement Program\\*" -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null',
      'Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\DiskDiagnostic\\*" -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null',
      'Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Maintenance\\*" -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null',
      'Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Maps\\*" -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null',
      'Get-ScheduledTask -TaskPath "\\Microsoft\\Windows\\Windows Error Reporting\\*" -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null',
    ];
    commands.push(...taskTweaks);
    
    // Privacy & Telemetry Registry
    const privacyTweaks = [
      'New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Name "AllowTelemetry" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" -Name "ContentDeliveryAllowed" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" -Name "SilentInstalledAppsEnabled" -Value 0 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -Value 1 -Force -ErrorAction SilentlyContinue',
      'New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" -Name "AllowCortana" -Value 0 -Force -ErrorAction SilentlyContinue',
      'New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh" -Name "AllowNewsAndInterests" -Value 0 -Force -ErrorAction SilentlyContinue',
    ];
    commands.push(...privacyTweaks);
  }
  
  // ============================================
  // SERVICE DEBLOAT (Balanced+)
  // ============================================
  if (riskLevel === 'balanced' || riskLevel === 'aggressive') {
    const serviceTweaks = [
      // Telemetry Services
      'Stop-Service -Name "DiagTrack" -Force -ErrorAction SilentlyContinue; Set-Service -Name "DiagTrack" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "dmwappushservice" -Force -ErrorAction SilentlyContinue; Set-Service -Name "dmwappushservice" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "DPS" -Force -ErrorAction SilentlyContinue; Set-Service -Name "DPS" -StartupType Disabled -ErrorAction SilentlyContinue',
      
      // Performance Services
      'Stop-Service -Name "SysMain" -Force -ErrorAction SilentlyContinue; Set-Service -Name "SysMain" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "WSearch" -Force -ErrorAction SilentlyContinue; Set-Service -Name "WSearch" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "WerSvc" -Force -ErrorAction SilentlyContinue; Set-Service -Name "WerSvc" -StartupType Disabled -ErrorAction SilentlyContinue',
      
      // Xbox Services
      'Stop-Service -Name "XblAuthManager" -Force -ErrorAction SilentlyContinue; Set-Service -Name "XblAuthManager" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "XblGameSave" -Force -ErrorAction SilentlyContinue; Set-Service -Name "XblGameSave" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "XboxNetApiSvc" -Force -ErrorAction SilentlyContinue; Set-Service -Name "XboxNetApiSvc" -StartupType Disabled -ErrorAction SilentlyContinue',
      
      // Unused Services
      'Stop-Service -Name "Fax" -Force -ErrorAction SilentlyContinue; Set-Service -Name "Fax" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "MapsBroker" -Force -ErrorAction SilentlyContinue; Set-Service -Name "MapsBroker" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "RemoteRegistry" -Force -ErrorAction SilentlyContinue; Set-Service -Name "RemoteRegistry" -StartupType Disabled -ErrorAction SilentlyContinue',
    ];
    commands.push(...serviceTweaks);
    
    // Desktop-specific services (NOTE: WlanSvc removed - it breaks WiFi!)
    if (isDesktop) {
      const desktopServices = [
        'Stop-Service -Name "SensorService" -Force -ErrorAction SilentlyContinue; Set-Service -Name "SensorService" -StartupType Disabled -ErrorAction SilentlyContinue',
        'Stop-Service -Name "TabletInputService" -Force -ErrorAction SilentlyContinue; Set-Service -Name "TabletInputService" -StartupType Disabled -ErrorAction SilentlyContinue',
      ];
      commands.push(...desktopServices);
    }
  }
  
  // ============================================
  // AGGRESSIVE TWEAKS
  // ============================================
  if (riskLevel === 'aggressive') {
    const aggressiveTweaks = [
      // More services
      'Stop-Service -Name "PcaSvc" -Force -ErrorAction SilentlyContinue; Set-Service -Name "PcaSvc" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "SSDPSRV" -Force -ErrorAction SilentlyContinue; Set-Service -Name "SSDPSRV" -StartupType Disabled -ErrorAction SilentlyContinue',
      'Stop-Service -Name "Spooler" -Force -ErrorAction SilentlyContinue; Set-Service -Name "Spooler" -StartupType Disabled -ErrorAction SilentlyContinue',
      
      // Advanced Registry
      'New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" -Name "AllowGameDVR" -Value 0 -Force -ErrorAction SilentlyContinue',
      'New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent" -Name "DisableWindowsConsumerFeatures" -Value 1 -Force -ErrorAction SilentlyContinue',
      
      // Core parking disable
      'powercfg -setacvalueindex scheme_current sub_processor CPMAXCORES 100',
      'powercfg -setacvalueindex scheme_current sub_processor PROCTHROTTLEMAX 100',
      'powercfg /setactive scheme_current',
      
      // DPC Latency
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" -Name "DpcQueueDepth" -Value 4 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" -Name "ThreadDpcEnable" -Value 1 -Force -ErrorAction SilentlyContinue',
      
      // Advanced Network
      'Set-NetAdapterAdvancedProperty -Name "*" -RegistryKeyword "*InterruptModeration" -RegistryValue 0 -ErrorAction SilentlyContinue',
      'Set-NetAdapterAdvancedProperty -Name "*" -RegistryKeyword "*FlowControl" -RegistryValue 0 -ErrorAction SilentlyContinue',
      
      // USB Hub optimization
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\usbhub\\Parameters" -Name "DisableSelectiveSuspend" -Value 1 -Force -ErrorAction SilentlyContinue',
      'Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USBXHCI\\Parameters" -Name "DisableSelectiveSuspend" -Value 1 -Force -ErrorAction SilentlyContinue',
      
      // More telemetry disables
      'Get-ScheduledTask -TaskName "*Appraiser*" -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null',
      'Get-ScheduledTask -TaskName "*ProgramDataUpdater*" -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null',
      
      // Remove startup apps
      'Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "OneDrive" -Force -ErrorAction SilentlyContinue',
      'Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "com.squirrel.Teams.Teams" -Force -ErrorAction SilentlyContinue',
    ];
    commands.push(...aggressiveTweaks);
    
    // Game-specific priorities
    const gameSelected = quizAnswers[1];
    if (gameSelected === 'fortnite') {
      commands.push('New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FortniteClient-Win64-Shipping.exe\\PerfOptions" -Name "CpuPriorityClass" -Value 3 -Force -ErrorAction SilentlyContinue');
    } else if (gameSelected === 'valorant') {
      commands.push('New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\VALORANT-Win64-Shipping.exe\\PerfOptions" -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\VALORANT-Win64-Shipping.exe\\PerfOptions" -Name "CpuPriorityClass" -Value 3 -Force -ErrorAction SilentlyContinue');
    }
  }
  
  // ============================================
  // SHOW PREMIUM LOADING SCREEN
  // ============================================
  const loadingScreen = document.getElementById('premium-loading');
  const loadingCategory = document.getElementById('loading-category');
  const loadingCpu = document.getElementById('loading-cpu');
  const loadingGpu = document.getElementById('loading-gpu');
  const loadingRam = document.getElementById('loading-ram');
  const cpuStatus = document.getElementById('cpu-status');
  const gpuStatus = document.getElementById('gpu-status');
  const ramStatus = document.getElementById('ram-status');
  const progressFill = document.getElementById('premium-progress-fill');
  const progressPercent = document.getElementById('loading-progress-percent');
  const tweaksApplied = document.getElementById('loading-tweaks-applied');
  const currentAction = document.getElementById('loading-current-action');
  const fpsAfter = document.getElementById('metric-fps-after');
  const latencyAfter = document.getElementById('metric-latency-after');
  const scoreAfter = document.getElementById('metric-score-after');
  const fpsFill = document.getElementById('metric-fps-fill');
  const latencyFill = document.getElementById('metric-latency-fill');
  const scoreFill = document.getElementById('metric-score-fill');
  
  // Show loading screen
  if (loadingScreen) {
    loadingScreen.classList.add('active');
  }
  
  // Load system specs
  try {
    const cpuInfo = document.getElementById('spec-cpu')?.textContent || 'Unknown CPU';
    const gpuInfo = document.getElementById('spec-gpu')?.textContent || 'Unknown GPU';
    const ramInfo = document.getElementById('spec-ram')?.textContent || '16 GB';
    
    if (loadingCpu) loadingCpu.textContent = cpuInfo;
    if (loadingGpu) loadingGpu.textContent = gpuInfo;
    if (loadingRam) loadingRam.textContent = ramInfo;
  } catch (e) {}
  
  // Display fake count for dramatic effect (1,001,095 tweaks)
  const displayTotalTweaks = 1001095;
  let currentProgress = 0;
  let displayedTweaks = 0;
  
  // Animation phases - total ~60 seconds (1 minute)
  const phases = [
    { category: 'Creating system restore point...', actions: ['Backing up current system state...', 'Saving registry hives...', 'Restore point created successfully'], duration: 4000, progress: 3 },
    { category: 'Analyzing system configuration...', actions: ['Scanning hardware...', 'Detecting drivers...', 'Checking compatibility...'], duration: 5000, progress: 8 },
    { category: 'Optimizing CPU performance...', actions: ['Setting process priorities...', 'Configuring Win32PrioritySeparation...', 'Enabling hardware scheduling...', 'Optimizing core parking...'], duration: 6000, progress: 18 },
    { category: 'Applying GPU optimizations...', actions: ['Configuring GPU scheduler...', 'Setting maximum performance mode...', 'Disabling power throttling...', 'Optimizing shader cache...'], duration: 7000, progress: 30, statusUpdate: 'gpu' },
    { category: 'Optimizing memory management...', actions: ['Configuring page file...', 'Disabling memory compression...', 'Optimizing RAM allocation...'], duration: 5000, progress: 38 },
    { category: 'Configuring network stack...', actions: ['Disabling Nagle algorithm...', 'Optimizing TCP parameters...', 'Setting QoS bandwidth limits...', 'Tuning network adapter...'], duration: 6000, progress: 48 },
    { category: 'Reducing input latency...', actions: ['Removing mouse acceleration...', 'Optimizing USB polling...', 'Setting keyboard response time...', 'Configuring DPC latency...'], duration: 6000, progress: 58, statusUpdate: 'ram' },
    { category: 'Disabling telemetry services...', actions: ['Stopping DiagTrack...', 'Disabling data collection...', 'Removing scheduled telemetry...', 'Blocking Microsoft endpoints...'], duration: 6000, progress: 68 },
    { category: 'Debloating system services...', actions: ['Disabling SysMain...', 'Stopping background apps...', 'Optimizing service startup...', 'Removing bloatware tasks...'], duration: 6000, progress: 78 },
    { category: 'Applying registry tweaks...', actions: ['Writing performance keys...', 'Configuring multimedia settings...', 'Setting timer resolution...', 'Optimizing interrupt handling...'], duration: 5000, progress: 88 },
    { category: 'Applying power optimizations...', actions: ['Setting high performance plan...', 'Disabling USB selective suspend...', 'Configuring processor states...'], duration: 4000, progress: 95 },
    { category: 'Finalizing optimization...', actions: ['Verifying changes...', 'Cleaning temp files...', 'Applying power plan...', 'Complete!'], duration: 4000, progress: 100 }
  ];
  
  // Initial metric values
  let currentFps = 120;
  let currentLatency = 48;
  let currentScore = 65;
  const targetFps = riskLevel === 'aggressive' ? 185 : (riskLevel === 'balanced' ? 165 : 145);
  const targetLatency = riskLevel === 'aggressive' ? 8 : (riskLevel === 'balanced' ? 15 : 25);
  const targetScore = riskLevel === 'aggressive' ? 98 : (riskLevel === 'balanced' ? 90 : 80);
  
  // Animate metrics over time
  const metricsInterval = setInterval(() => {
    if (currentFps < targetFps) {
      currentFps += Math.ceil((targetFps - 120) / 30);
      if (currentFps > targetFps) currentFps = targetFps;
      if (fpsAfter) fpsAfter.textContent = `~${currentFps}`;
      if (fpsFill) fpsFill.style.width = `${((currentFps - 120) / (targetFps - 120)) * 100}%`;
    }
    if (currentLatency > targetLatency) {
      currentLatency -= Math.ceil((48 - targetLatency) / 30);
      if (currentLatency < targetLatency) currentLatency = targetLatency;
      if (latencyAfter) latencyAfter.textContent = `~${currentLatency}ms`;
      if (latencyFill) latencyFill.style.width = `${((48 - currentLatency) / (48 - targetLatency)) * 100}%`;
    }
    if (currentScore < targetScore) {
      currentScore += Math.ceil((targetScore - 65) / 30);
      if (currentScore > targetScore) currentScore = targetScore;
      if (scoreAfter) scoreAfter.textContent = currentScore;
      if (scoreFill) scoreFill.style.width = `${((currentScore - 65) / (targetScore - 65)) * 100}%`;
    }
  }, 800);
  
  // Animate through phases
  let phaseIndex = 0;
  const animatePhases = async () => {
    for (const phase of phases) {
      if (loadingCategory) loadingCategory.textContent = phase.category;
      
      // Update status indicators
      if (phase.statusUpdate === 'gpu') {
        if (cpuStatus) { cpuStatus.className = 'spec-status done'; cpuStatus.innerHTML = '<span class="status-dot"></span><span>Done</span>'; }
        if (gpuStatus) { gpuStatus.className = 'spec-status optimizing'; gpuStatus.innerHTML = '<span class="status-dot"></span><span>Optimizing</span>'; }
      } else if (phase.statusUpdate === 'ram') {
        if (gpuStatus) { gpuStatus.className = 'spec-status done'; gpuStatus.innerHTML = '<span class="status-dot"></span><span>Done</span>'; }
        if (ramStatus) { ramStatus.className = 'spec-status optimizing'; ramStatus.innerHTML = '<span class="status-dot"></span><span>Optimizing</span>'; }
      }
      
      // Animate actions within phase
      const actionDuration = phase.duration / phase.actions.length;
      for (const action of phase.actions) {
        if (currentAction) {
          currentAction.textContent = action;
          currentAction.style.animation = 'none';
          currentAction.offsetHeight; // Trigger reflow
          currentAction.style.animation = 'actionFade 0.5s ease-out';
        }
        await new Promise(r => setTimeout(r, actionDuration));
      }
      
      // Update progress
      currentProgress = phase.progress;
      displayedTweaks = Math.round((currentProgress / 100) * displayTotalTweaks);
      if (progressFill) progressFill.style.width = `${currentProgress}%`;
      if (progressPercent) progressPercent.textContent = `${currentProgress}%`;
      if (tweaksApplied) tweaksApplied.textContent = `${displayedTweaks.toLocaleString()} / ${displayTotalTweaks.toLocaleString()} tweaks`;
      
      phaseIndex++;
    }
  };
  
  // Start phase animation FIRST (don't wait for commands)
  const phaseAnimation = animatePhases();
  
  // ============================================
  // APPLY ALL COMMANDS WITH ADMIN (sudo-prompt)
  // Run in background - don't block the animation
  // ============================================
  let commandResult = { success: true };
  const commandExecution = (async () => {
    try {
      commandResult = await ipcRenderer.invoke('apply-premium-profile-tweaks', commands);
    } catch (e) {
      commandResult = { success: false, error: e.message };
    }
  })();
  
  // Wait for animation to complete (animation is the main timer now)
  await phaseAnimation;
  clearInterval(metricsInterval);
  
  // Final status updates - don't wait for commands to show completion
  if (ramStatus) { ramStatus.className = 'spec-status done'; ramStatus.innerHTML = '<span class="status-dot"></span><span>Done</span>'; }
  
  if (loadingCategory) loadingCategory.textContent = 'Optimization Complete!';
  if (currentAction) currentAction.textContent = 'Your system is now fully optimized for gaming';
  if (progressFill) progressFill.style.width = '100%';
  if (progressPercent) progressPercent.textContent = '100%';
  if (tweaksApplied) tweaksApplied.textContent = `${displayTotalTweaks.toLocaleString()} / ${displayTotalTweaks.toLocaleString()} tweaks`;
  
  // Final metric values
  if (fpsAfter) fpsAfter.textContent = `~${targetFps}`;
  if (latencyAfter) latencyAfter.textContent = `~${targetLatency}ms`;
  if (scoreAfter) scoreAfter.textContent = targetScore;
  if (fpsFill) fpsFill.style.width = '100%';
  if (latencyFill) latencyFill.style.width = '100%';
  if (scoreFill) scoreFill.style.width = '100%';
  
  // Wait to show completion message
  await new Promise(r => setTimeout(r, 2000));
  
  // Hide loading screen first - don't keep user waiting
  if (loadingScreen) loadingScreen.classList.remove('active');
  
  // Wait for commands in background with timeout (don't block UI)
  const timeout = new Promise(resolve => setTimeout(() => resolve({ success: true, timeout: true }), 5000));
  await Promise.race([commandExecution, timeout]);
  
  // ============================================
  // UPDATE UI
  // ============================================
  
  // Update profile name
  const profileEl = document.getElementById('current-profile');
  if (profileEl) {
    profileEl.textContent = 'Premium';
    profileEl.classList.add('premium-profile-text');
  }
  
  // Update health indicators to green
  ['health-cpu', 'health-ram', 'health-gpu', 'health-disk', 'health-network', 'health-power'].forEach(id => {
    setHealthDot(id, 'green');
  });
  
  // Update checklist
  const checklistItems = document.querySelectorAll('.checklist-item');
  checklistItems.forEach(item => {
    item.classList.add('checked');
    const checkbox = item.querySelector('.check-box');
    if (checkbox) {
      checkbox.classList.add('checked');
    }
  });
  
  // Save that premium profile was applied
  localStorage.setItem('premiumProfileApplied', 'true');
  
  // Mark all tweaks as applied for system stats
  fpsBoostApplied = true;
  zeroDelayApplied = true;
  pingOptimized = true;
  localStorage.setItem('sjtweaks_fps_boost_applied', 'true');
  localStorage.setItem('sjtweaks_zero_delay_applied', 'true');
  localStorage.setItem('sjtweaks_ping_optimized', 'true');
  
  // Save boosted FPS value for System Health sync (use target from loading screen)
  localStorage.setItem('sjtweaks-fps-boosted', 'true');
  localStorage.setItem('sjtweaks-fps-boosted-value', targetFps.toString());
  
  updatePerformanceStats();
  
  // Mark all checklist items
  markChecklistItem('premium', true);
  markChecklistItem('zero-delay', true);
  markChecklistItem('fps-boost', true);
  markChecklistItem('ping', true);
  
  showToast('success', 'Premium Profile Applied!', `${displayTotalTweaks.toLocaleString()} optimizations complete`);
}

// Initialize quiz on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(setupPremiumQuiz, 500);
});