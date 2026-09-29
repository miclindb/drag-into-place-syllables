// Audio: recorded clips are loaded with XHR and played through Web Audio.
// Media elements and the Fetch API both fail on the container's file://
// WebView, while XHR (status 0) plus decodeAudioData works. When a clip
// can't be loaded or decoded, speech synthesis is the fallback.
//
// Preloading only fetches bytes until the first user gesture has created the
// AudioContext; decoding needs a context, and creating one earlier is refused
// by autoplay policy.

let audioContext = null;
const bytesCache = new Map();
const bufferCache = new Map();
const channels = { word: null, syllable: null };
const tokens = { word: 0, syllable: 0 };

function getContext() {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ||= new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

/** Resume audio inside a user gesture (browsers block audio until then). */
export function unlockAudio() {
  getContext();
}

export function loadBinary(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 0) resolve(xhr.response);
      else reject(new Error(`loadBinary ${url} → ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error(`loadBinary XHR error: ${url}`));
    xhr.send();
  });
}

// Callback form keeps older Safari/WebView (no promise return) working.
function decode(context, data) {
  return new Promise((resolve, reject) => {
    const maybePromise = context.decodeAudioData(data, resolve, reject);
    maybePromise?.then?.(resolve, reject);
  });
}

function loadBytes(path) {
  if (!bytesCache.has(path)) {
    bytesCache.set(path, loadBinary(`./${path}`).catch(() => null));
  }
  return bytesCache.get(path);
}

function loadBuffer(path, context = getContext()) {
  if (!context) return Promise.resolve(null);
  if (!bufferCache.has(path)) {
    bufferCache.set(path, (async () => {
      try {
        const data = await loadBytes(path);
        if (!data || !data.byteLength) return null;
        return await decode(context, data);
      } catch {
        return null;
      }
    })());
  }
  return bufferCache.get(path);
}

/** Settles once every clip has loaded or failed; a missing clip never blocks the rest. */
export function preloadAudio(paths) {
  return Promise.allSettled(paths.map((path) => (audioContext ? loadBuffer(path, audioContext) : loadBytes(path))));
}

/* ---------------- Speech synthesis fallback ---------------- */

const voicesReady = new Promise((resolve) => {
  if (!("speechSynthesis" in globalThis)) {
    resolve([]);
    return;
  }
  const available = speechSynthesis.getVoices();
  if (available.length) {
    resolve(available);
    return;
  }
  speechSynthesis.addEventListener("voiceschanged", () => resolve(speechSynthesis.getVoices()), { once: true });
  setTimeout(() => resolve(speechSynthesis.getVoices()), 1000);
});

function englishVoice() {
  const voices = globalThis.speechSynthesis?.getVoices() || [];
  const preferredNames = ["Samantha", "Ava", "Karen", "Daniel", "Google US English", "Microsoft Aria"];
  return voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")
    && preferredNames.some((name) => voice.name.includes(name)))
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us"))
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("en-"));
}

async function speakEnglish(text, { rate = .84, pitch = 1.04, onEnded } = {}) {
  if (!("speechSynthesis" in globalThis)) {
    onEnded?.();
    return;
  }
  await voicesReady;
  speechSynthesis.cancel();
  speechSynthesis.resume();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = .95;
  const voice = englishVoice();
  if (voice) utterance.voice = voice;
  if (onEnded) {
    utterance.onend = onEnded;
    utterance.onerror = onEnded;
  }
  speechSynthesis.speak(utterance);
}

/* ---------------- Playback ---------------- */

function stopChannel(name) {
  const source = channels[name];
  if (!source) return;
  source.onended = null; // A replaced clip must not report "ended" to its caller.
  try {
    source.stop();
  } catch {
    // Already stopped.
  }
  channels[name] = null;
}

// One clip per channel at a time: replaying a word interrupts that word but
// not a syllable, and vice versa. `onEnded` lets callers sequence audio.
async function playClip(channel, path, fallbackText, speechOptions, onEnded) {
  const context = getContext(); // Synchronously, so a user gesture can resume it.
  stopChannel(channel);
  tokens[channel] += 1;
  const token = tokens[channel];
  const buffer = path ? await loadBuffer(path) : null;
  if (token !== tokens[channel]) return; // Superseded while loading.
  if (!buffer || !context) {
    speakEnglish(fallbackText, { ...speechOptions, onEnded });
    return;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    if (channels[channel] === source) channels[channel] = null;
    onEnded?.();
  };
  channels[channel] = source;
  source.start(0);
}

export function playWord(level, onEnded) {
  return playClip("word", level.audio, level.target_word, { rate: .82, pitch: 1.02 }, onEnded);
}

export function playSyllable(path, syllable, onEnded) {
  return playClip("syllable", path, syllable, { rate: .78, pitch: 1.06 }, onEnded);
}

export function playTone(kind) {
  const context = getContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = kind === "good" ? 660 : 180;
  oscillator.type = kind === "good" ? "sine" : "sawtooth";
  gain.gain.setValueAtTime(0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + .18);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + .18);
}
