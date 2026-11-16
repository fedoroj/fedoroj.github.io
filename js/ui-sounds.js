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
    // iOS Safari разблокирует звук, только если внутри жеста прозвучал реальный
    // буфер. Одного resume недостаточно, поэтому играем один тихий сэмпл.
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    source.connect(context.destination);
    source.start();
    source.onended = () => source.disconnect();
    return Promise.resolve(resumed).then(() => context).catch(() => null);
  } catch { return Promise.resolve(null); }
}

// Звук — часть обратной связи интерфейса, а не анимация. Раньше здесь стояла
// проверка prefers-reduced-motion, и на iPhone с включённым «Уменьшением движения»
// звук молчал полностью. Теперь настройка влияет только на декоративный hover.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function playUISound(name, intensity = 1) {
  if (!effects[name] || (name === 'hover' && reducedMotion())) return;
  const requestedAt = performance.now();
  const play = context => {
    if (!context || context.state !== 'running' || performance.now() - requestedAt > 300) return;
    try { effects[name](context, context.currentTime, intensity); } catch { /* Audio is optional. */ }
  };
  if (audioContext?.state === 'running') play(audioContext);
  else unlockUISounds().then(play);
}

// Звук включается любым доверенным касанием или нажатием — в том числе по пустому
// месту и тексту. capture-фаза нужна, чтобы разблокировка шла раньше обработчиков
// элементов: iOS Safari открывает аудио только внутри самого жеста.
// touchstart/pointerdown дают самое раннее срабатывание, touchend/click —
// повторную попытку, если первый жест система не засчитала.
['touchstart', 'pointerdown', 'touchend', 'pointerup', 'click', 'keydown'].forEach(type => {
  document.addEventListener(type, event => { if (event.isTrusted) unlockUISounds(); }, { capture: true, passive: true });
});

// Элементы, у которых есть свой звук, помечают событие флагом uiSoundHandled.
// Всё остальное — текст, пустая область, фон — получает тихий «тап», поэтому
// отклик есть на любом участке страницы. Слушаем именно click: обработчики
// элементов тоже висят на click, поэтому двойных звуков не будет — а на iOS
// click приходит и при тапе по обычному тексту.
const FALLBACK_INTENSITY = 0.35;

document.addEventListener('click', event => {
  if (!event.isTrusted || event.uiSoundHandled) return;
  if (event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  // Поля ввода и выделение текста озвучивать не нужно.
  if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (window.getSelection?.()?.toString()) return;
  playUISound('tap', FALLBACK_INTENSITY);
}, { passive: true });

// Клавиатура: Enter и пробел по любому месту страницы тоже дают отклик.
document.addEventListener('keydown', event => {
  if (!event.isTrusted || event.uiSoundHandled) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target instanceof Element ? event.target : null;
  if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return;
  playUISound('press', FALLBACK_INTENSITY);
}, { passive: true });

export { createNoiseLayer, effects };
