// --- 配置 ---
const config = {
  duration: parseInt(localStorage.getItem('pom-duration') || '180'),      // 分钟
  silenceMinutes: parseInt(localStorage.getItem('pom-silence') || '3'),   // 静音检测分钟
  threshold: parseInt(localStorage.getItem('pom-threshold') || '10'),     // 声音阈值 (0-100)
};

// --- 状态 ---
let totalSeconds = config.duration * 60;
let remainingSeconds = totalSeconds;
let timerInterval = null;
let isRunning = false;
let audioContext = null;
let analyser = null;
let micStream = null;
let silenceStart = null;
let puddingCount = 0;
let puddingInterval = null;

// --- DOM ---
const hoursEl = document.getElementById('hours');
const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
const startBtn = document.getElementById('start-btn');
const micStatus = document.getElementById('mic-status');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const completeOverlay = document.getElementById('complete-overlay');
const completeBtn = document.getElementById('complete-btn');
const durationInput = document.getElementById('duration-input');
const silenceInput = document.getElementById('silence-input');
const thresholdInput = document.getElementById('threshold-input');
const thresholdValue = document.getElementById('threshold-value');
const settingsSave = document.getElementById('settings-save');
const settingsCancel = document.getElementById('settings-cancel');
const puddingContainer = document.getElementById('pudding-container');

// --- 倒计时显示 ---
function updateDisplay() {
  const h = Math.floor(remainingSeconds / 3600);
  const m = Math.floor((remainingSeconds % 3600) / 60);
  const s = remainingSeconds % 60;
  hoursEl.textContent = String(h).padStart(2, '0');
  minutesEl.textContent = String(m).padStart(2, '0');
  secondsEl.textContent = String(s).padStart(2, '0');
}

// --- 倒计时逻辑 ---
function startTimer() {
  if (isRunning) {
    stopTimer();
    return;
  }

  isRunning = true;
  startBtn.textContent = '停止';
  startBtn.classList.add('running');
  silenceStart = null;
  puddingCount = 0;
  puddingContainer.innerHTML = '';

  startMicrophone();
  startPuddingSpawner();

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateDisplay();
    checkMicSilence();

    if (remainingSeconds <= 0) {
      onComplete();
    }
  }, 1000);
}

function stopTimer() {
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  startBtn.textContent = '开始专注';
  startBtn.classList.remove('running');
  micStatus.textContent = '';
  micStatus.className = '';
  stopMicrophone();
  stopPuddingSpawner();
  remainingSeconds = totalSeconds;
  updateDisplay();
  puddingContainer.innerHTML = '';
}

function pauseTimer() {
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  stopPuddingSpawner();
  pauseOverlay.classList.remove('hidden');
}

function resumeTimer() {
  pauseOverlay.classList.add('hidden');
  isRunning = true;
  silenceStart = null;

  startPuddingSpawner();

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateDisplay();
    checkMicSilence();

    if (remainingSeconds <= 0) {
      onComplete();
    }
  }, 1000);
}

function onComplete() {
  clearInterval(timerInterval);
  timerInterval = null;
  isRunning = false;
  stopMicrophone();
  stopPuddingSpawner();
  startBtn.textContent = '开始专注';
  startBtn.classList.remove('running');
  micStatus.textContent = '';
  micStatus.className = '';
  completeOverlay.classList.remove('hidden');

  // 完成时撒满布丁狗
  for (let i = 0; i < 30; i++) {
    setTimeout(() => spawnPudding(), i * 100);
  }
}

// --- 麦克风 ---
async function startMicrophone() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(micStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    micStatus.textContent = '🎤 麦克风已开启';
    micStatus.className = 'mic-active';
  } catch (err) {
    micStatus.textContent = '麦克风未授权（静音检测不可用）';
    micStatus.className = '';
  }
}

function stopMicrophone() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
    analyser = null;
  }
}

function getCurrentVolume() {
  if (!analyser) return 100; // 没有麦克风时不触发静音
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return sum / data.length;
}

function checkMicSilence() {
  if (!isRunning || !analyser) return;

  const volume = getCurrentVolume();
  const threshold = config.threshold;

  if (volume < threshold) {
    if (!silenceStart) {
      silenceStart = Date.now();
    }
    const silentMs = Date.now() - silenceStart;
    const silentMin = silentMs / 60000;
    const remaining = Math.ceil(config.silenceMinutes - silentMin);

    if (silentMin >= config.silenceMinutes) {
      silenceStart = null;
      pauseTimer();
    } else {
      micStatus.textContent = `🔇 安静中... 还有 ${remaining} 分钟将暂停`;
      micStatus.className = '';
    }
  } else {
    silenceStart = null;
    micStatus.textContent = '🎤 麦克风已开启';
    micStatus.className = 'mic-active';
  }
}

// --- 布丁狗 ---
const PUDDING_EMOJIS = ['🍮'];
// 布丁狗 SVG（简笔画风格）
function createPuddingSVG() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', '48');
  svg.setAttribute('height', '48');
  svg.innerHTML = `
    <!-- 帽子/贝雷帽 -->
    <ellipse cx="50" cy="30" rx="32" ry="12" fill="#8B4513"/>
    <!-- 头 -->
    <circle cx="50" cy="48" r="28" fill="#FFD966"/>
    <!-- 耳朵 -->
    <ellipse cx="28" cy="34" rx="8" ry="12" fill="#8B4513" transform="rotate(-15 28 34)"/>
    <ellipse cx="72" cy="34" rx="8" ry="12" fill="#8B4513" transform="rotate(15 72 34)"/>
    <!-- 眼睛 -->
    <circle cx="40" cy="48" r="3" fill="#333"/>
    <circle cx="60" cy="48" r="3" fill="#333"/>
    <!-- 鼻子 -->
    <ellipse cx="50" cy="55" rx="4" ry="3" fill="#8B4513"/>
    <!-- 嘴巴 -->
    <path d="M44 60 Q50 66 56 60" stroke="#8B4513" stroke-width="1.5" fill="none"/>
    <!-- 腮红 -->
    <ellipse cx="34" cy="56" rx="5" ry="3" fill="rgba(255,150,150,0.5)"/>
    <ellipse cx="66" cy="56" rx="5" ry="3" fill="rgba(255,150,150,0.5)"/>
  `;
  return svg;
}

function spawnPudding() {
  const el = document.createElement('div');
  el.className = 'pudding';

  el.appendChild(createPuddingSVG());

  const scale = 0.6 + Math.random() * 1.2;
  el.style.setProperty('--scale', scale);
  el.style.left = Math.random() * 92 + '%';
  el.style.animationDuration = (8 + Math.random() * 12) + 's';
  el.style.animationDelay = (-Math.random() * 5) + 's';
  el.style.opacity = 0.6 + Math.random() * 0.4;

  puddingContainer.appendChild(el);

  el.addEventListener('animationend', () => el.remove());
}

function startPuddingSpawner() {
  stopPuddingSpawner();

  const tick = () => {
    if (!isRunning) return;
    // 进度 0->1，越接近完成越多布丁狗
    const progress = 1 - remainingSeconds / totalSeconds;
    // 生成频率：开始时很少，结束时很密集
    const baseInterval = 8000; // 最初间隔8秒
    const minInterval = 300;   // 最密集间隔0.3秒
    const interval = baseInterval - (baseInterval - minInterval) * Math.pow(progress, 2);

    // 接近结束时一次生成多个
    const count = progress > 0.8 ? Math.ceil((progress - 0.8) * 15) : 1;
    for (let i = 0; i < count; i++) {
      spawnPudding();
    }

    puddingInterval = setTimeout(tick, interval);
  };

  tick();
}

function stopPuddingSpawner() {
  if (puddingInterval) {
    clearTimeout(puddingInterval);
    puddingInterval = null;
  }
}

// --- 设置 ---
settingsBtn.addEventListener('click', () => {
  durationInput.value = config.duration;
  silenceInput.value = config.silenceMinutes;
  thresholdInput.value = config.threshold;
  thresholdValue.textContent = config.threshold;
  settingsPanel.classList.remove('hidden');
});

thresholdInput.addEventListener('input', () => {
  thresholdValue.textContent = thresholdInput.value;
});

settingsSave.addEventListener('click', () => {
  config.duration = Math.max(1, parseInt(durationInput.value) || 180);
  config.silenceMinutes = Math.max(1, parseInt(silenceInput.value) || 3);
  config.threshold = parseInt(thresholdInput.value) || 10;

  localStorage.setItem('pom-duration', config.duration);
  localStorage.setItem('pom-silence', config.silenceMinutes);
  localStorage.setItem('pom-threshold', config.threshold);

  if (!isRunning) {
    totalSeconds = config.duration * 60;
    remainingSeconds = totalSeconds;
    updateDisplay();
  }

  settingsPanel.classList.add('hidden');
});

settingsCancel.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

// --- 按钮事件 ---
startBtn.addEventListener('click', startTimer);
resumeBtn.addEventListener('click', resumeTimer);
completeBtn.addEventListener('click', () => {
  completeOverlay.classList.add('hidden');
  remainingSeconds = totalSeconds;
  updateDisplay();
  puddingContainer.innerHTML = '';
});

// --- 初始化 ---
totalSeconds = config.duration * 60;
remainingSeconds = totalSeconds;
updateDisplay();

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// 防止手机息屏（如果支持）
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      await navigator.wakeLock.request('screen');
    }
  } catch (e) {
    // 忽略
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isRunning) {
    requestWakeLock();
  }
});
