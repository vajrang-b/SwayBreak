import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  audioState,
  isSoundEnabled,
  setSoundEnabled,
  setRecordingMicLevel,
  createRecordingAudioStream,
  ensureAudio,
  resumeAudio,
  createPanner,
  playPaddleSound,
  playClutchSaveSound,
  playWallSound,
  playBrickSound,
  playJumpWhooshSound,
  playSmashSound,
  playMissSound,
  playBallReturnSound,
  playBallCatchSound,
  playGameEndSound,
  playUiBlip,
} from "../js/audio.js";
import { createMockMediaStream, createMockTrack } from "./mocks/browser-env.js";

describe("audio.js", () => {
  beforeEach(() => {
    setSoundEnabled(true);
    ensureAudio();
  });

  describe("sound enabled state", () => {
    it("reports whether sound is enabled", () => {
      setSoundEnabled(true);
      assert.strictEqual(isSoundEnabled(), true);
      setSoundEnabled(false);
      assert.strictEqual(isSoundEnabled(), false);
      assert.strictEqual(audioState.gainNode.gain.value, 0);
      setSoundEnabled(true);
      assert.strictEqual(audioState.gainNode.gain.value, 0.35);
    });
  });

  describe("setRecordingMicLevel", () => {
    it("accepts valid levels between 0 and 1", () => {
      setRecordingMicLevel(0);
      setRecordingMicLevel(0.6);
      setRecordingMicLevel(1);
    });

    it("rejects invalid or out-of-range values", () => {
      assert.throws(() => setRecordingMicLevel(-0.1), RangeError);
      assert.throws(() => setRecordingMicLevel(1.1), RangeError);
      assert.throws(() => setRecordingMicLevel(NaN), RangeError);
      assert.throws(() => setRecordingMicLevel(Infinity), RangeError);
    });
  });

  describe("ensureAudio & resumeAudio", () => {
    it("initializes AudioContext, compressor, and noise buffer", () => {
      const initialized = ensureAudio();
      assert.strictEqual(initialized, true);
      assert.ok(audioState.context);
      assert.ok(audioState.compressor);
      assert.ok(audioState.noiseBuffer);
    });

    it("resumes context when suspended", async () => {
      audioState.context.state = "suspended";
      await resumeAudio();
      assert.strictEqual(audioState.context.state, "running");
    });
  });

  describe("createPanner", () => {
    it("clamps pan between -0.7 and 0.7", () => {
      const panner1 = createPanner(audioState.context, -1.0);
      assert.strictEqual(panner1.pan.value, -0.7);

      const panner2 = createPanner(audioState.context, 1.0);
      assert.strictEqual(panner2.pan.value, 0.7);

      const panner3 = createPanner(audioState.context, 0.25);
      assert.strictEqual(panner3.pan.value, 0.25);
    });
  });

  describe("createRecordingAudioStream", () => {
    it("creates an audio recording stream with microphone connection and cleanup", () => {
      const micTrack = createMockTrack("audio");
      const micStream = createMockMediaStream([micTrack]);

      const recordingStream = createRecordingAudioStream(micStream);
      assert.ok(recordingStream);
      assert.ok(recordingStream.stream);
      assert.strictEqual(typeof recordingStream.stop, "function");

      recordingStream.stop();
      assert.strictEqual(audioState.recordingMicGain, null);
    });

    it("creates an audio recording stream without microphone when none is provided", () => {
      const recordingStream = createRecordingAudioStream(null);
      assert.ok(recordingStream);
      recordingStream.stop();
    });
  });

  describe("game sound effects playback", () => {
    it("plays paddle sound with relative ball hit position", () => {
      const ball = { x: 500 };
      const paddle = { x: 450, width: 120 };
      assert.doesNotThrow(() => playPaddleSound(ball, paddle));
    });

    it("plays clutch save sound without error", () => {
      assert.doesNotThrow(() => playClutchSaveSound(0.5));
    });

    it("plays wall bounce sound", () => {
      assert.doesNotThrow(() => playWallSound(-0.5));
    });

    it("plays brick sound across each row index", () => {
      for (let row = 0; row < 5; row++) {
        const brick = { row, x: 100 * row, width: 88 };
        assert.doesNotThrow(() => playBrickSound(brick, 1, 960));
      }
    });

    it("plays jump whoosh sound", () => {
      assert.doesNotThrow(() => playJumpWhooshSound());
    });

    it("plays smash sound", () => {
      assert.doesNotThrow(() => playSmashSound(0));
    });

    it("plays miss sound and fallbacks", () => {
      assert.doesNotThrow(() => playMissSound());
    });

    it("plays ball return and catch sounds", () => {
      assert.doesNotThrow(() => playBallReturnSound());
      assert.doesNotThrow(() => playBallCatchSound());
    });

    it("plays game end victory arpeggio", () => {
      assert.doesNotThrow(() => playGameEndSound());
    });

    it("plays UI blip tones", () => {
      assert.doesNotThrow(() => playUiBlip(520));
      assert.doesNotThrow(() => playUiBlip(880));
    });

    it("does not play sounds when audio is disabled", () => {
      setSoundEnabled(false);
      assert.doesNotThrow(() => playUiBlip(520));
      assert.doesNotThrow(() => playMissSound());
    });
  });
});
