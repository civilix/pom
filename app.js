// --- 配置 ---
const config = {
  duration: parseInt(localStorage.getItem('pom-duration') || '180'),
  silenceMinutes: parseInt(localStorage.getItem('pom-silence') || '3'),
  threshold: parseInt(localStorage.getItem('pom-threshold') || '10'),
};

// --- 状态 ---
let totalSeconds = config.duration * 60;
let remainingSeconds = totalSeconds;
let timerInterval = null;
let isRunning = false;
let isPaused = false;
let audioContext = null;
let analyser = null;
let micStream = null;
let silenceStart = null;
let puddings = []; // 存活的布丁狗 { el, x, y, vx, vy, size, angle, rotSpeed }
let animFrameId = null;
let puddingSpawnTimer = null;

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
const resetBtn = document.getElementById('reset-btn');
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
  isRunning = true;
  isPaused = false;
  startBtn.textContent = '暂停';
  startBtn.classList.add('running');
  resetBtn.classList.add('hidden');
  silenceStart = null;
  clearPuddings();

  startMicrophone();
  spawnPudding();
  startPuddingSpawner();
  startBouncingAnimation();

  runCountdown();
}

function runCountdown() {
  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateDisplay();
    checkMicSilence();

    if (remainingSeconds <= 0) {
      onComplete();
    }
  }, 1000);
}

function manualPause() {
  isRunning = false;
  isPaused = true;
  clearInterval(timerInterval);
  timerInterval = null;
  stopPuddingSpawner();
  stopBouncingAnimation();
  startBtn.textContent = '继续';
  startBtn.classList.remove('running');
  startBtn.classList.add('paused');
  resetBtn.classList.remove('hidden');
}

function manualResume() {
  isRunning = true;
  isPaused = false;
  silenceStart = null;
  startBtn.textContent = '暂停';
  startBtn.classList.remove('paused');
  startBtn.classList.add('running');
  resetBtn.classList.add('hidden');
  startPuddingSpawner();
  startBouncingAnimation();
  runCountdown();
}

function stopTimer() {
  isRunning = false;
  isPaused = false;
  clearInterval(timerInterval);
  timerInterval = null;
  startBtn.textContent = '开始专注';
  startBtn.classList.remove('running');
  startBtn.classList.remove('paused');
  resetBtn.classList.add('hidden');
  micStatus.textContent = '';
  micStatus.className = '';
  stopMicrophone();
  stopPuddingSpawner();
  stopBouncingAnimation();
  remainingSeconds = totalSeconds;
  updateDisplay();
  clearPuddings();
}

function pauseTimer() {
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  stopPuddingSpawner();
  stopBouncingAnimation();
  pauseOverlay.classList.remove('hidden');
}

function resumeTimer() {
  pauseOverlay.classList.add('hidden');
  isRunning = true;
  isPaused = false;
  silenceStart = null;
  startBtn.textContent = '暂停';
  startBtn.classList.add('running');
  startBtn.classList.remove('paused');

  startPuddingSpawner();
  startBouncingAnimation();
  runCountdown();
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

  // 完成时大量追加布丁狗
  for (let i = 0; i < 40; i++) {
    setTimeout(() => spawnPudding(), i * 80);
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
  if (!analyser) return 100;
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

// --- 布丁狗弹跳系统 ---
function spawnPudding() {
  const size = 40 + Math.random() * 40; // 40-80px
  const el = document.createElement('div');
  el.className = 'pudding';
  el.style.width = size + 'px';
  el.style.height = size + 'px';

  const img = document.createElement('img');
  img.src = 'pom1.svg';
  img.alt = '布丁狗';
  el.appendChild(img);

  const W = window.innerWidth;
  const H = window.innerHeight;

  // 随机速度，方向随机
  const speed = 0.8 + Math.random() * 1.2;
  const angle = Math.random() * Math.PI * 2;

  const pud = {
    el,
    x: Math.random() * (W - size),
    y: Math.random() * (H - size),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size,
    angle: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 2, // -1 ~ 1 度/帧
  };

  puddings.push(pud);
  puddingContainer.appendChild(el);
}

function clearPuddings() {
  puddings = [];
  puddingContainer.innerHTML = '';
}

function startBouncingAnimation() {
  stopBouncingAnimation();

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  function frame() {
    const w = W();
    const h = H();

    for (const p of puddings) {
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.rotSpeed;

      // 边界反弹
      if (p.x <= 0) { p.x = 0; p.vx = Math.abs(p.vx); }
      if (p.x + p.size >= w) { p.x = w - p.size; p.vx = -Math.abs(p.vx); }
      if (p.y <= 0) { p.y = 0; p.vy = Math.abs(p.vy); }
      if (p.y + p.size >= h) { p.y = h - p.size; p.vy = -Math.abs(p.vy); }

      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)`;
    }

    animFrameId = requestAnimationFrame(frame);
  }

  animFrameId = requestAnimationFrame(frame);
}

function stopBouncingAnimation() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function startPuddingSpawner() {
  stopPuddingSpawner();

  const tick = () => {
    if (!isRunning) return;

    spawnPudding();

    // 每分钟加一个布丁狗
    puddingSpawnTimer = setTimeout(tick, 60000);
  };

  // 首次延迟一分钟（第一个已经在 startTimer 里生成了）
  puddingSpawnTimer = setTimeout(tick, 60000);
}

function stopPuddingSpawner() {
  if (puddingSpawnTimer) {
    clearTimeout(puddingSpawnTimer);
    puddingSpawnTimer = null;
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
startBtn.addEventListener('click', () => {
  if (isRunning) {
    manualPause();
  } else if (isPaused) {
    manualResume();
  } else {
    startTimer();
  }
});
resumeBtn.addEventListener('click', resumeTimer);
resetBtn.addEventListener('click', stopTimer);
completeBtn.addEventListener('click', () => {
  completeOverlay.classList.add('hidden');
  stopBouncingAnimation();
  clearPuddings();
  remainingSeconds = totalSeconds;
  updateDisplay();
});

// --- 初始化 ---
totalSeconds = config.duration * 60;
remainingSeconds = totalSeconds;
updateDisplay();

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// 防止手机息屏
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
