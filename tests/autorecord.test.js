import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPostureRecorder } from "../js/autorecord.js";
import { createMockCanvasContext, createMockMediaStream } from "./mocks/browser-env.js";

describe("autorecord.js", () => {
  let mockGameCanvas;
  let mockWebcamCanvas;

  beforeEach(() => {
    mockGameCanvas = {
      width: 960,
      height: 600,
      getContext: () => createMockCanvasContext(),
      captureStream: () => createMockMediaStream(),
    };
    mockWebcamCanvas = {
      width: 240,
      height: 180,
      getContext: () => createMockCanvasContext(),
    };
  });

  describe("options validation", () => {
    it("throws when gameCanvas is missing", () => {
      assert.throws(
        () => createPostureRecorder({}),
        { message: /gameCanvas is required/ },
      );
    });

    it("throws when MediaRecorder is unavailable", () => {
      const originalMR = window.MediaRecorder;
      window.MediaRecorder = undefined;
      try {
        assert.throws(
          () => createPostureRecorder({ gameCanvas: mockGameCanvas }),
          { message: /MediaRecorder is not supported/ },
        );
      } finally {
        window.MediaRecorder = originalMR;
      }
    });

    it("throws when captureStream is unavailable", () => {
      const originalCaptureStream = HTMLCanvasElement.prototype.captureStream;
      delete HTMLCanvasElement.prototype.captureStream;
      try {
        assert.throws(
          () => createPostureRecorder({ gameCanvas: mockGameCanvas }),
          { message: /Canvas recording is not supported/ },
        );
      } finally {
        HTMLCanvasElement.prototype.captureStream = originalCaptureStream;
      }
    });
  });

  describe("recording lifecycle", () => {
    it("starts, records events, and stops cleanly", () => {
      const eventsEmitted = [];
      let fileOutput = null;

      const recorder = createPostureRecorder({
        gameCanvas: mockGameCanvas,
        webcamCanvas: mockWebcamCanvas,
        autoDownload: false,
        onEvent: (type, at) => {
          eventsEmitted.push({ type, at });
        },
        onFile: (blob, events, filename) => {
          fileOutput = { blob, events, filename };
        },
      });

      assert.strictEqual(recorder.isRecording(), false);

      recorder.start();
      assert.strictEqual(recorder.isRecording(), true);
      assert.strictEqual(eventsEmitted.length, 1);
      assert.strictEqual(eventsEmitted[0].type, "START");

      recorder.markEvent("CLUTCH_SAVE");
      recorder.markEvent("SMASH");
      assert.strictEqual(eventsEmitted.length, 3);
      assert.strictEqual(eventsEmitted[1].type, "CLUTCH_SAVE");
      assert.strictEqual(eventsEmitted[2].type, "SMASH");

      recorder.stop();
      assert.strictEqual(recorder.isRecording(), false);
      assert.ok(fileOutput);
      assert.ok(fileOutput.blob);
      assert.strictEqual(fileOutput.events.length, 2);
      assert.strictEqual(fileOutput.events[0].type, "CLUTCH_SAVE");
      assert.strictEqual(fileOutput.events[1].type, "SMASH");
      assert.ok(fileOutput.filename.startsWith("posture-breaker-"));
      assert.strictEqual(eventsEmitted[eventsEmitted.length - 1].type, "STOP");
    });

    it("does not start a second recording if already recording", () => {
      const eventsEmitted = [];
      const recorder = createPostureRecorder({
        gameCanvas: mockGameCanvas,
        autoDownload: false,
        onEvent: (type) => eventsEmitted.push(type),
      });

      recorder.start();
      recorder.start(); // duplicate call
      assert.strictEqual(eventsEmitted.filter((e) => e === "START").length, 1);
      recorder.stop();
    });

    it("ignores markEvent when recording is inactive", () => {
      const eventsEmitted = [];
      const recorder = createPostureRecorder({
        gameCanvas: mockGameCanvas,
        autoDownload: false,
        onEvent: (type) => eventsEmitted.push(type),
      });

      recorder.markEvent("BEFORE_START");
      assert.strictEqual(eventsEmitted.length, 0);

      recorder.start();
      recorder.markEvent("DURING_RECORDING");
      recorder.stop();
      recorder.markEvent("AFTER_STOP");

      assert.strictEqual(eventsEmitted.includes("BEFORE_START"), false);
      assert.strictEqual(eventsEmitted.includes("DURING_RECORDING"), true);
      assert.strictEqual(eventsEmitted.includes("AFTER_STOP"), false);
    });

    it("handles audio tracks from createAudioRecording option", () => {
      let audioStreamStopped = false;
      const audioTrack = {
        kind: "audio",
        stop() { audioStreamStopped = true; },
      };

      const recorder = createPostureRecorder({
        gameCanvas: mockGameCanvas,
        autoDownload: false,
        createAudioRecording: () => ({
          stream: { getAudioTracks: () => [audioTrack] },
          stop: () => { audioStreamStopped = true; },
        }),
      });

      recorder.start();
      assert.strictEqual(recorder.isRecording(), true);
      recorder.stop();
      assert.strictEqual(audioStreamStopped, true);
    });

    it("matches canvas dimensions in portrait orientation", () => {
      const portraitCanvas = {
        width: 600,
        height: 960,
        getContext: () => createMockCanvasContext(),
        captureStream: () => createMockMediaStream(),
      };
      const recorder = createPostureRecorder({
        gameCanvas: portraitCanvas,
        autoDownload: false,
      });

      recorder.start();
      assert.strictEqual(recorder.isRecording(), true);
      recorder.stop();
      assert.strictEqual(recorder.isRecording(), false);
    });

    it("supports AR mode compositing with video element", () => {
      let drawCalls = 0;
      const mockCtx = {
        fillStyle: "",
        fillRect: () => {},
        drawImage: () => { drawCalls += 1; },
        save: () => {},
        restore: () => {},
        translate: () => {},
        scale: () => {},
      };
      const mockCanvas = {
        width: 960,
        height: 600,
        getContext: () => mockCtx,
        captureStream: () => createMockMediaStream(),
      };
      const mockVideo = {
        videoWidth: 640,
        videoHeight: 480,
        readyState: 4,
      };

      const recorder = createPostureRecorder({
        gameCanvas: mockCanvas,
        videoElement: mockVideo,
        getARMode: () => true,
        autoDownload: false,
      });

      recorder.start();
      assert.strictEqual(recorder.isRecording(), true);
      recorder.stop();
      assert.strictEqual(recorder.isRecording(), false);
    });

    it("supports AR mode compositing with webcam skeleton canvas", () => {
      const drawnImages = [];
      const mockCtx = {
        fillStyle: "",
        fillRect: () => {},
        drawImage: (src, ...args) => { drawnImages.push({ src, args }); },
        save: () => {},
        restore: () => {},
      };
      const mockCanvas = {
        width: 960,
        height: 600,
        getContext: () => mockCtx,
        captureStream: () => createMockMediaStream(),
      };
      const mockWebcamCanvas = {
        width: 240,
        height: 180,
      };

      const recorder = createPostureRecorder({
        gameCanvas: mockCanvas,
        webcamCanvas: mockWebcamCanvas,
        getARMode: () => true,
        autoDownload: false,
      });

      recorder.start();
      assert.strictEqual(recorder.isRecording(), true);
      recorder.stop();
      assert.strictEqual(recorder.isRecording(), false);
    });

    it("positions picture-in-picture in the bottom-left corner in non-AR mode", () => {
      const drawnImages = [];
      const mockCtx = {
        fillStyle: "",
        fillRect: () => {},
        drawImage: (src, x, y, w, h) => { drawnImages.push({ src, x, y, w, h }); },
        save: () => {},
        restore: () => {},
      };
      const mockCanvas = {
        width: 960,
        height: 600,
        getContext: () => mockCtx,
        captureStream: () => createMockMediaStream(),
      };
      const mockWebcamCanvas = {
        width: 240,
        height: 180,
      };

      const recorder = createPostureRecorder({
        gameCanvas: mockCanvas,
        webcamCanvas: mockWebcamCanvas,
        getARMode: () => false,
        autoDownload: false,
      });

      recorder.start();
      assert.strictEqual(recorder.isRecording(), true);
      recorder.stop();
      assert.strictEqual(recorder.isRecording(), false);
    });
  });
});

