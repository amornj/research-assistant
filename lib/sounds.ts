/**
 * Plays a soft glass-chime completion sound using the Web Audio API.
 * Three harmonics (A5, E6, C#7) with a fast attack and smooth decay.
 * Safe to call in all contexts — fails silently if audio unavailable.
 */
export function playCompletionSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const harmonics: [number, number][] = [
      [880, 0.10],   // A5
      [1320, 0.06],  // E6
      [2200, 0.03],  // C#7
    ];
    harmonics.forEach(([freq, volume], i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.035;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch {
    // Audio not available — ignore silently
  }
}
