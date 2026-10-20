// PackStation sounds (moved out of PackTime.tsx so the Pack Cam countdown can
// use them too): one shared AudioContext, warmed up on every touch.
let audioCtx: AudioContext | null = null;

// iOS Safari: AudioContext must be created/resumed from a user gesture.
// resume() is async — by the time beep() plays, context may still be suspended.
// Fix: warm it up on every touch so it's always "running" when beep() fires.
if (typeof window !== 'undefined') {
  const warmAudio = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  };
  document.addEventListener('touchstart', warmAudio, { passive: true });
  document.addEventListener('click', warmAudio);
}

export async function beep(freq: number, dur: number, type: OscillatorType = 'square') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state !== 'running') await audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = type; o.frequency.value = freq; g.gain.value = 0.3;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start(audioCtx.currentTime); o.stop(audioCtx.currentTime + dur);
  } catch {}
}
export function beepOk() { beep(880, 0.12); setTimeout(() => beep(1100, 0.12), 100); }
export function beepErr() { beep(300, 0.3, 'sawtooth'); setTimeout(() => beep(200, 0.4, 'sawtooth'), 200); }
