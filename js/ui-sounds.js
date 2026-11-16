let audioContext = null;

function createNoiseLayer(context, startTime, frequency, options = {}) {
  const duration = options.duration ?? 0.004;
  const decay = options.decay ?? 20;
  const sampleCount = Math.round(context.sampleRate * duration);
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = (2 * Math.random() - 1) * Math.exp(-index / decay);
  }

  const filter = context.createBiquadFilter();
  filter.type = options.filterType ?? 'bandpass';
  filter.frequency.value = frequency * (1 + (Math.random() - 0.5) * (options.randomization ?? 0.1));
  filter.Q.value = options.filterQ ?? 8;

  const gain = context.createGain();
  gain.gain.value = options.gain ?? 1;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(startTime);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

const effects = {
  press: (context, time, intensity = 1) => {
    createNoiseLayer(context, time, 2800, { duration: 0.005, decay: 30, filterQ: 6, gain: 1.5 * intensity });
  },
  click: (context, time, intensity = 1) => {
    createNoiseLayer(context, time, 4000, { decay: 25, gain: 3 * intensity });
  },
  tap: (context, time, intensity = 1) => {
    createNoiseLayer(context, time, 2800, { duration: 0.005, decay: 30, filterQ: 6, gain: 0.75 * intensity });
    createNoiseLayer(context, time + 0.001, 4000, { decay: 25, gain: 1.5 * intensity });
  },
  hover: (context, time, intensity = 1) => {
    createNoiseLayer(context, time, 2000, { duration: 0.003, decay: 15, filterQ: 4, gain: 0.4 * intensity });
  },
  select: (context, time, intensity = 1) => {
    createNoiseLayer(context, time, 2000, { duration: 0.006, decay: 30, filterQ: 5, gain: 1.2 * intensity });
  },
  toggle: (context, time, intensity = 1) => {
    createNoiseLayer(context, time, 3200, { duration: 0.004, decay: 18, filterQ: 7, gain: 1.8 * intensity });
  },
  tick: (context, time, intensity = 1) => {
    createNoiseLayer(context, time, 220, { duration: 0.018, decay: 55, filterType: 'lowpass', filterQ: 1.2, gain: 1.6 * intensity, randomization: 0.06 });
    createNoiseLayer(context, time, 480, { duration: 0.01, decay: 35, filterType: 'bandpass', filterQ: 2.2, gain: 0.55 * intensity, randomization: 0.08 });
  },
};

// Создание и resume происходят непосредственно внутри пользовательского жеста.
// Пока Safari возобновляет контекст, не планируем короткий звук в прошлом.
export function unlockUISounds() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(null);
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return Promise.resolve(null);
    if (!audioContext || audioContext.state === 'closed') audioContext = new Context();
    const context = audioContext;
    if (context.state === 'running') return Promise.resolve(context);
    // На touch-устройствах pointerdown может прийти до активации аудио.
    // Каждый следующий доверенный жест повторяет resume, даже если предыдущий
    // Promise ещё ожидает разрешения браузера (Android Chrome / iOS Safari).
    const resumed = context.resume();
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    source.connect(context.destination);
    source.start();
    source.onended = () => source.disconnect();
    return Promise.resolve(resumed).then(() => context).catch(() => null);
  } catch { return Promise.resolve(null); }
}

export function playUISound(name, intensity = 1) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !effects[name]) return;
  const requestedAt = performance.now();
  const play = context => {
    if (!context || context.state !== 'running' || performance.now() - requestedAt > 300) return;
    try { effects[name](context, context.currentTime, intensity); } catch { /* Audio is optional. */ }
  };
  if (audioContext?.state === 'running') play(audioContext);
  else unlockUISounds().then(play);
}

// Повторный жест также восстанавливает контекст после блокировки экрана/звонка.
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(type => {
  document.addEventListener(type, event => { if (event.isTrusted) unlockUISounds(); }, { capture: true, passive: true });
});

export { createNoiseLayer, effects };
