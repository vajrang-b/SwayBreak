// Posture Breaker SFX, revised: softer, shorter, one clear sound per event.
// Drop-in replacement: same exported names and signatures as the old file.
//
// Why the old sounds were annoying:
// - 3 layers on almost every hit, all loud (master 0.65 + a hard compressor),
//   with long tails that overlapped during fast play.
// - Brick: a sine bell plus a 2.76x harmonic plus a noise burst up to 7500 Hz.
//   That is the glassy, tinny part.
// - Smash: a sawtooth laser at 0.22 gain. Sawtooth is the harsh part.
// - Brick pitch climbed up to +60% with combo streak, so long rallies
//   got higher and more piercing instead of staying pleasant.
// Fixes here: one main tone per event, master gain 0.35, gentle compressor,
// decays mostly under 0.15s, no sawtooth, no 2.76x harmonic, no loud noise
// bursts, and brick pitch varies only a few percent, never climbs with streak.
// If a sound is still not right, change only the volume or duration in that
// one function. Do not add a third layer back.

export const audioState = {
  enabled: true,
  context: null,
  gainNode: null,
  compressor: null,
  noiseBuffer: null,
  recordingMicGain: null,
};

let recordingMicLevel = 0.6;
let explosionSoundBuffer = null;
let explosionSoundLoadPromise = null;
let fahhSoundBuffer = null;
let fahhSoundLoadPromise = null;

export function isSoundEnabled() {
  return audioState.enabled;
}

export function getAudioContext() {
  return audioState.context;
}

export function setRecordingMicLevel(level) {
  if (!Number.isFinite(level) || level < 0 || level > 1) {
    throw new RangeError("Recording microphone level must be between 0 and 1.");
  }
  recordingMicLevel = level;
  if (audioState.recordingMicGain) {
    const micGain = audioState.recordingMicGain.gain;
    const now = audioState.context.currentTime;
    micGain.cancelScheduledValues(now);
    micGain.value = recordingMicLevel;
  }
}

function duckRecordingMic(atTime = audioState.context?.currentTime) {
  const micGain = audioState.recordingMicGain?.gain;
  if (!micGain || recordingMicLevel === 0 || atTime === undefined) return;
  micGain.cancelScheduledValues(atTime);
  micGain.setTargetAtTime(0.05, atTime, 0.008);
  micGain.setTargetAtTime(recordingMicLevel, atTime + 0.04, 0.05);
}

export function createRecordingAudioStream(microphoneStream = null) {
  const { context, compressor } = audioState;
  if (!context || !compressor || typeof context.createMediaStreamDestination !== "function") {
    return null;
  }
  const destination = context.createMediaStreamDestination();
  compressor.connect(destination);
  const hasLiveMicrophoneTrack = microphoneStream?.getAudioTracks()
    .some((track) => track.readyState === "live");
  const microphoneSource = hasLiveMicrophoneTrack
    ? context.createMediaStreamSource(microphoneStream)
    : null;
  const microphoneGain = microphoneSource ? context.createGain() : null;
  if (microphoneGain) {
    microphoneGain.gain.value = recordingMicLevel;
    microphoneSource.connect(microphoneGain);
    microphoneGain.connect(destination);
    audioState.recordingMicGain = microphoneGain;
  }
  let stopped = false;
  return {
    stream: destination.stream,
    stop() {
      if (stopped) return;
      stopped = true;
      compressor.disconnect(destination);
      microphoneSource?.disconnect();
      microphoneGain?.disconnect();
      if (audioState.recordingMicGain === microphoneGain) {
        audioState.recordingMicGain = null;
      }
      destination.stream.getTracks().forEach((track) => track.stop());
    },
  };
}

export async function resumeAudio() {
  if (audioState.context && audioState.context.state === "suspended") {
    await audioState.context.resume();
  }
}

export function ensureAudio(isGameOver = false) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  if (!audioState.context) {
    audioState.context = new AudioContextClass();
    audioState.gainNode = audioState.context.createGain();

    // Gentle compressor: just tames peaks, no punch effect.
    const compressor = audioState.context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-20, audioState.context.currentTime);
    compressor.knee.setValueAtTime(18, audioState.context.currentTime);
    compressor.ratio.setValueAtTime(4, audioState.context.currentTime);
    compressor.attack.setValueAtTime(0.005, audioState.context.currentTime);
    compressor.release.setValueAtTime(0.25, audioState.context.currentTime);
    audioState.gainNode.connect(compressor);
    compressor.connect(audioState.context.destination);
    audioState.compressor = compressor;

    const noiseBuffer = audioState.context.createBuffer(
      1,
      Math.floor(audioState.context.sampleRate * 0.4),
      audioState.context.sampleRate,
    );
    const noise = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noise.length; index += 1) {
      noise[index] = Math.random() * 2 - 1;
    }
    audioState.noiseBuffer = noiseBuffer;
    audioState.gainNode.gain.value = audioState.enabled ? 0.35 : 0;
  }

  if (!explosionSoundLoadPromise) {
    explosionSoundLoadPromise = fetch(new URL("../sounds/explosion-form-roblox-real.mp3", import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((audioData) => audioState.context.decodeAudioData(audioData))
      .then((buffer) => {
        explosionSoundBuffer = buffer;
        return buffer;
      })
      .catch((error) => {
        console.warn("Could not load the explosion sound; using the synthesized fallback.", error);
        return null;
      });
  }

  if (!fahhSoundLoadPromise) {
    fahhSoundLoadPromise = fetch(new URL("../sounds/fahhh_KcgAXfs.mp3", import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((audioData) => audioState.context.decodeAudioData(audioData))
      .then((buffer) => {
        fahhSoundBuffer = buffer;
        return buffer;
      })
      .catch((error) => {
        console.warn("Could not load the smash vocal sound.", error);
        return null;
      });
  }

  if (audioState.context.state === "suspended") {
    void audioState.context.resume();
  }
  return true;
}

export function createPanner(context, pan = 0) {
  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-0.7, Math.min(0.7, pan)), context.currentTime);
    return panner;
  }
  return null;
}

// One soft tone. type: 'triangle' is warm, 'sine' is round.
// freqEnd below freq gives a natural falling pop/thock.
function playTone({ type = "triangle", frequency = 440, frequencyEnd = null, duration = 0.12, volume = 0.12, pan = 0, delay = 0 } = {}) {
  if (!audioState.enabled || !ensureAudio()) return;
  const context = audioState.context;
  const now = context.currentTime + delay;
  duckRecordingMic(now);
  const osc = context.createOscillator();
  const gain = context.createGain();
  const panner = createPanner(context, pan);
  const outNode = panner || audioState.gainNode;
  if (panner) panner.connect(audioState.gainNode);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (frequencyEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequencyEnd), now + duration);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(outNode);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

// Quiet noise, kept for compatibility. Callers now pass very low volumes.
// The old default-style bursts (0.06-0.10) are gone from every event below.
export function playAirySound({ duration = 0.12, volume = 0.015, frequency = 900, pan = 0 } = {}) {
  if (!audioState.enabled || !ensureAudio() || !audioState.noiseBuffer) return;
  const context = audioState.context;
  const now = context.currentTime;
  duckRecordingMic(now);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const panner = createPanner(context, pan);
  const outNode = panner || audioState.gainNode;
  if (panner) panner.connect(audioState.gainNode);
  source.buffer = audioState.noiseBuffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(frequency, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(120, frequency * 0.5), now + duration);
  filter.Q.value = 0.8;
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(outNode);
  source.start(now);
  source.stop(now + duration);
}

// Throttle fast, repeated sounds so a rally does not become a buzz.
const lastPlay = {};
function throttle(key, minMs = 35) {
  const now = performance.now();
  if (lastPlay[key] && now - lastPlay[key] < minMs) return false;
  lastPlay[key] = now;
  return true;
}

export function playPaddleSound(ball, paddle) {
  if (!throttle("paddle")) return;
  const hitPosition = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
  const pan = Math.max(-0.7, Math.min(0.7, hitPosition));
  // Single warm thock: triangle falling 180 -> 90 Hz. No sub-bass layer, no click.
  playTone({ type: "triangle", frequency: 180, frequencyEnd: 90, duration: 0.09, volume: 0.18, pan });
}

export function playClutchSaveSound(pan = 0) {
  // Warm two-note chord, triangle, no high sine ding.
  // C5 + G5 together feel like a reward, not an alarm.
  playTone({ type: "triangle", frequency: 523.25, duration: 0.28, volume: 0.13, pan });
  playTone({ type: "triangle", frequency: 783.99, duration: 0.28, volume: 0.10, pan });
}

export function playWallSound(pan = 0) {
  if (!throttle("wall", 50)) return;
  // Soft tap, not a 540 Hz sine ping.
  playTone({ type: "sine", frequency: 300, frequencyEnd: 200, duration: 0.06, volume: 0.07, pan });
}

export function playBrickSound(brick, comboStreak = 0, canvasWidth = 960) {
  if (!throttle("brick", 30)) return;
  // Pentatonic row pitches, kept in a pleasant range.
  const rowPitches = [659.25, 587.33, 523.25, 440, 392];
  const basePitch = rowPitches[brick.row] || 523.25;
  // Small random variation only, so every brick is slightly different
  // but the sound never climbs with streak. Streak is shown visually instead.
  const pitch = basePitch * (0.97 + Math.random() * 0.06);
  const pan = ((brick.x + brick.width / 2) / canvasWidth) * 1.2 - 0.6;
  // One short pop. No harmonic, no glass noise burst.
  playTone({ type: "triangle", frequency: pitch, frequencyEnd: pitch * 0.7, duration: 0.12, volume: 0.13, pan });
}

export function playJumpWhooshSound() {
  // Soft air only, no loud sine sweep.
  playAirySound({ duration: 0.15, volume: 0.03, frequency: 1200 });
}

export function playSmashSound(pan = 0) {
  // Deep thump only. The old sawtooth laser is removed, it was the harsh part.
  playTone({ type: "sine", frequency: 160, frequencyEnd: 45, duration: 0.18, volume: 0.28, pan });
  playAirySound({ duration: 0.12, volume: 0.02, frequency: 1800, pan });
  playFahhSound(pan);
}

export function playFahhSound(pan = 0) {
  if (!audioState.enabled || !ensureAudio() || !fahhSoundBuffer) return;
  duckRecordingMic();
  const source = audioState.context.createBufferSource();
  const volume = audioState.context.createGain();
  const panner = createPanner(audioState.context, pan);
  source.buffer = fahhSoundBuffer;
  volume.gain.value = 0.35;
  source.connect(volume);
  volume.connect(panner || audioState.gainNode);
  if (panner) panner.connect(audioState.gainNode);
  source.start();
}

export function playMissSound() {
  if (!audioState.enabled || !ensureAudio()) return;
  if (explosionSoundBuffer) {
    duckRecordingMic();
    const source = audioState.context.createBufferSource();
    const volume = audioState.context.createGain();
    source.buffer = explosionSoundBuffer;
    volume.gain.value = 0.48;
    source.connect(volume);
    volume.connect(audioState.gainNode);
    source.start();
    return;
  }

  // Use a synthesized blast until the supplied sound file is ready.
  playTone({ type: "sine", frequency: 150, frequencyEnd: 38, duration: 0.32, volume: 0.32 });
  playTone({ type: "triangle", frequency: 92, frequencyEnd: 45, duration: 0.22, volume: 0.18 });
  playAirySound({ duration: 0.24, volume: 0.045, frequency: 520 });
}

export function playBallReturnSound() {
  playTone({ type: "sine", frequency: 260, frequencyEnd: 720, duration: 0.32, volume: 0.13 });
  playAirySound({ duration: 0.28, volume: 0.035, frequency: 850 });
}

export function playBallCatchSound() {
  playTone({ type: "triangle", frequency: 440, frequencyEnd: 660, duration: 0.13, volume: 0.11 });
}

export function playGameEndSound() {
  // Slower, warmer arpeggio. Same notes, triangle, more space between them.
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, idx) => {
    playTone({ type: "triangle", frequency: freq, duration: 0.35, volume: 0.11, delay: idx * 0.14 });
  });
}

export function playUiBlip(frequency = 520) {
  playTone({ type: "triangle", frequency, duration: 0.08, volume: 0.08 });
}

export function setSoundEnabled(enabled, isGameOver = false) {
  audioState.enabled = enabled;
  if (audioState.gainNode) {
    audioState.gainNode.gain.value = enabled ? 0.35 : 0;
  }
}
