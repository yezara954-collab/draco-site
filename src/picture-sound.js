import { picture, SOUND_ENABLED, SOUND_VOLUME } from './config.js';

export function makeImpactSound() {
  const settings = picture.sound;
  let enabled = SOUND_ENABLED;
  let context, master, noise;
  let voices = 0;
  let closed = false;

  function unlock() {
    if (closed || !enabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = document.hidden ? 0 : SOUND_VOLUME;
        master.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * settings.noiseTime[1]), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (context.state !== 'running') void context.resume().catch(() => {});
    } catch {
      // 浏览器拒绝音频时仍可正常播放画面。
    }
  }

  function sync() {
    if (master) master.gain.setValueAtTime(enabled && !document.hidden ? SOUND_VOLUME : 0, context.currentTime);
  }

  const random = ([a, b]) => a + (b - a) * Math.random();

  function play() {
    if (!enabled || document.hidden || context?.state !== 'running' || voices >= settings.voices) return;
    voices++;
    const now = context.currentTime;
    const volume = random([.6, 1]);
    const burst = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const length = random(settings.noiseTime);
    burst.buffer = noise;
    filter.type = 'highpass';
    filter.frequency.value = settings.highpass;
    envelope.gain.setValueAtTime(.72 * volume, now);
    envelope.gain.exponentialRampToValueAtTime(.001, now + length);
    burst.connect(filter).connect(envelope).connect(master);
    burst.start(now, 0, length);
    const count = Math.random() < .5 ? 2 : 3;
    const toneLength = random(settings.toneTime);
    for (let i = 0; i < count; i++) {
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.frequency.value = random(settings.pitch);
      gain.gain.setValueAtTime(.11 * volume / count, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + toneLength);
      tone.connect(gain).connect(master);
      tone.start(now);
      tone.stop(now + toneLength);
      tone.onended = () => {
        tone.disconnect();
        gain.disconnect();
        if (i === 0) voices--;
      };
    }
    burst.onended = () => { burst.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }

  return {
    unlock, play, sync,
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; sync(); if (enabled) unlock(); },
    destroy() { closed = true; if (context) void context.close().catch(() => {}); },
  };
}
