// Deterministic PRNG (mulberry32) so layout/shuffle tests are reproducible.
export function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    dump: () => Object.fromEntries(data),
  };
}

export const bananaLevel = {
  level_id: 1,
  target_word: "banana",
  syllables: ["ba", "na", "na"],
  syllable_foils: ["be", "no"],
  image: "🍌",
  audio: "lang/english/audios/banana.wav",
  syllable_audio_overrides: { 2: "lang/english/audios/syllables/na_unstressed.wav" },
};
