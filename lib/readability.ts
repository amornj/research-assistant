function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  // Remove trailing e
  word = word.replace(/e$/, '');
  const matches = word.match(/[aeiouy]+/g);
  return matches ? matches.length : 1;
}

export function fleschKincaid(text: string): { score: number; label: string; color: string } {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);

  if (words.length < 5 || sentences.length === 0) {
    return { score: 60, label: 'Standard', color: '#f59e0b' };
  }

  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const score = 206.835
    - 1.015 * (words.length / sentences.length)
    - 84.6 * (syllables / words.length);

  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  let label: string;
  let color: string;
  if (clamped >= 90) { label = 'Very Easy'; color = '#22c55e'; }
  else if (clamped >= 70) { label = 'Easy'; color = '#22c55e'; }
  else if (clamped >= 60) { label = 'Standard'; color = '#f59e0b'; }
  else if (clamped >= 50) { label = 'Fairly Difficult'; color = '#f59e0b'; }
  else if (clamped >= 30) { label = 'Difficult'; color = '#ef4444'; }
  else { label = 'Very Difficult'; color = '#ef4444'; }

  return { score: clamped, label, color };
}
