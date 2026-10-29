import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PoseTracker } from "../js/pose.js";
import { CONFIG } from "../js/config.js";
import { createMockElement, createMockCanvasContext, createMockMediaStream } from "./mocks/browser-env.js";

describe("pose.js - PoseTracker", () => {
  let mockVideo;
  let mockPosePreview;
  let mockPostureStatus;
  let mockPostureButton;
  let paddleTargetState;
  let jumpTriggeredCount;
  let enabledTriggered;
  let disabledTriggered;
  let tracker;

  beforeEach(() => {
    mockVideo = createMockElement("video");
    mockVideo.videoWidth = 640;
    mockVideo.videoHeight = 480;
    mockVideo.readyState = 4;
    mockVideo.paused = false;

    mockPosePreview = createMockElement("canvas");
    mockPosePreview.width = 240;
    mockPosePreview.height = 180;
    mockPosePreview.getContext = () => createMockCanvasContext();

    mockPostureStatus = createMockElement("div");
    mockPostureButton = createMockElement("button");

    paddleTargetState = { x: 0, left: 0, right: 0 };
    jumpTriggeredCount = 0;
    enabledTriggered = false;
    disabledTriggered = false;

    tracker = new PoseTracker({
      video: mockVideo,
      posePreview: mockPosePreview,
      postureStatus: mockPostureStatus,
      postureButton: mockPostureButton,
      canvasWidth: 960,
      getPaddle: () => ({ x: 420, width: 120 }),
      setTargetPaddleX: (x, left = 0, right = 0) => {
        paddleTargetState = { x, left, right };
      },
      clearTargetPaddleX: () => {
        paddleTargetState = null;
      },
      onPostureEnabled: () => {
        enabledTriggered = true;
      },
      onPostureDisabled: () => {
        disabledTriggered = true;
      },
      onJumpTriggered: () => {
        jumpTriggeredCount += 1;
      },
    });
  });

  describe("initialization", () => {
    it("initializes with posture disabled and default states", () => {
      assert.strictEqual(tracker.isEnabled(), false);
      assert.strictEqual(tracker.poseBackend, "CPU");
      assert.strictEqual(tracker.droppedFrames, 0);
      assert.strictEqual(tracker.lastTrackedTorsoX, null);
    });
  });

  describe("syncCanvasDimensions", () => {
    it("updates canvas dimensions according to video aspect ratio", () => {
      mockVideo.videoWidth = 1280;
      mockVideo.videoHeight = 720;
      mockPosePreview.width = 0;
      mockPosePreview.height = 0;

      tracker.syncCanvasDimensions();
      assert.strictEqual(mockPosePreview.width, 240);
      assert.strictEqual(mockPosePreview.height, 135);
    });

    it("does nothing when video dimensions are not available", () => {
      mockVideo.videoWidth = 0;
      mockVideo.videoHeight = 0;
      mockPosePreview.width = 240;
      mockPosePreview.height = 180;

      tracker.syncCanvasDimensions();
      assert.strictEqual(mockPosePreview.width, 240);
      assert.strictEqual(mockPosePreview.height, 180);
    });
  });

  describe("selectNearestPose", () => {
    it("returns null for empty or null pose collections", () => {
      assert.strictEqual(tracker.selectNearestPose(null), null);
      assert.strictEqual(tracker.selectNearestPose([]), null);
      assert.strictEqual(tracker.selectNearestPose([[]]), null);
    });

    it("computes torso centroid from shoulders and hips", () => {
      const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
      landmarks[11] = { x: 0.4, y: 0.3, visibility: 0.9 }; // Left shoulder
      landmarks[12] = { x: 0.6, y: 0.3, visibility: 0.9 }; // Right shoulder
      landmarks[23] = { x: 0.45, y: 0.6, visibility: 0.9 }; // Left hip
      landmarks[24] = { x: 0.55, y: 0.6, visibility: 0.9 }; // Right hip

      const candidate = tracker.selectNearestPose([landmarks]);
      assert.ok(candidate);
      assert.strictEqual(candidate.torsoX, 0.5);
      assert.ok(Math.abs(candidate.torsoY - 0.45) < 1e-4);
    });

    it("selects candidate closest to previous tracked torso position", () => {
      tracker.lastTrackedTorsoX = 0.8;

      const poseFar = Array.from({ length: 33 }, () => ({ x: 0.2, y: 0.4, visibility: 0.9 }));
      const poseNear = Array.from({ length: 33 }, () => ({ x: 0.75, y: 0.4, visibility: 0.9 }));

      const selected = tracker.selectNearestPose([poseFar, poseNear]);
      assert.ok(selected);
      assert.strictEqual(selected.torsoX, 0.75);
    });

    it("falls back to nose landmark when shoulders and hips are missing", () => {
      const landmarks = Array.from({ length: 33 }, () => null);
      landmarks[0] = { x: 0.35, y: 0.25, visibility: 0.9 };

      const selected = tracker.selectNearestPose([landmarks]);
      assert.ok(selected);
      assert.strictEqual(selected.torsoX, 0.35);
      assert.strictEqual(selected.torsoY, 0.25);
    });
  });

  describe("update loop and pose tracking mechanics", () => {
    beforeEach(() => {
      tracker.postureEnabled = true;
    });

    it("skips processing when posture is disabled", () => {
      tracker.postureEnabled = false;
      tracker.update(100, 120);
      assert.strictEqual(paddleTargetState.x, 0);
    });

    it("respects inferenceThrottleMs", () => {
      let detectCalled = 0;
      tracker.poseLandmarker = {
        detectForVideo: () => {
          detectCalled += 1;
          return { landmarks: [] };
        },
      };

      tracker.update(1000, 120);
      assert.strictEqual(detectCalled, 1);

      // Call immediately within throttle (< 70ms)
      tracker.update(1020, 120);
      assert.strictEqual(detectCalled, 1);

      // Call after throttle window elapsed
      tracker.update(1080, 120);
      assert.strictEqual(detectCalled, 2);
    });

    it("tracks body lean and maps position to target paddle x", () => {
      const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
      // Lean left in camera (torsoX = 0.2) -> mirroredX = 0.8 -> paddle moves right
      landmarks[11] = { x: 0.15, y: 0.3, visibility: 0.9 };
      landmarks[12] = { x: 0.25, y: 0.3, visibility: 0.9 };
      landmarks[23] = { x: 0.15, y: 0.6, visibility: 0.9 };
      landmarks[24] = { x: 0.25, y: 0.6, visibility: 0.9 };

      tracker.poseLandmarker = {
        detectForVideo: () => ({ landmarks: [landmarks] }),
      };

      tracker.update(1000, 120);
      assert.ok(paddleTargetState);
      assert.ok(paddleTargetState.x > 400); // Shifted right
      assert.strictEqual(tracker.droppedFrames, 0);
    });

    it("computes arm reach extensions when arms are spread wide", () => {
      const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
      landmarks[11] = { x: 0.4, y: 0.3, visibility: 0.9 }; // Left shoulder
      landmarks[12] = { x: 0.6, y: 0.3, visibility: 0.9 }; // Right shoulder
      landmarks[23] = { x: 0.45, y: 0.6, visibility: 0.9 };
      landmarks[24] = { x: 0.55, y: 0.6, visibility: 0.9 };

      // Left wrist extended outward (higher x in selfie: 0.8)
      landmarks[15] = { x: 0.8, y: 0.3, visibility: 0.9 };
      // Right wrist extended outward (lower x in selfie: 0.2)
      landmarks[16] = { x: 0.2, y: 0.3, visibility: 0.9 };

      tracker.poseLandmarker = {
        detectForVideo: () => ({ landmarks: [landmarks] }),
      };

      tracker.update(1000, 120);
      assert.ok(tracker.leftExtensionRatio > 0.35);
      assert.ok(tracker.rightExtensionRatio > 0.35);
      assert.ok(paddleTargetState.left > 0);
      assert.ok(paddleTargetState.right > 0);
    });

    it("detects jumps based on upward pixel displacement and velocity", () => {
      const createPoseAtY = (y) => {
        const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y, visibility: 0.9 }));
        lm[11] = { x: 0.45, y, visibility: 0.9 };
        lm[12] = { x: 0.55, y, visibility: 0.9 };
        lm[23] = { x: 0.45, y: y + 0.2, visibility: 0.9 };
        lm[24] = { x: 0.55, y: y + 0.2, visibility: 0.9 };
        return lm;
      };

      let currentPose = createPoseAtY(0.5); // Resting baseline
      tracker.poseLandmarker = {
        detectForVideo: () => ({ landmarks: [currentPose] }),
      };

      // Frame 1: Establish resting baseline at y = 0.5
      tracker.update(1000, 120);
      assert.strictEqual(jumpTriggeredCount, 0);

      // Frame 2: Body jumps up to y = 0.35 (displacement = (0.5 - 0.35)*480 = 72px >= 50px threshold)
      currentPose = createPoseAtY(0.35);
      tracker.update(1080, 120);

      assert.strictEqual(jumpTriggeredCount, 1);
      assert.strictEqual(tracker.jumpGrounded, false);

      // While airborne, cannot trigger another jump until landing
      tracker.update(1160, 120);
      assert.strictEqual(jumpTriggeredCount, 1);
    });

    it("re-calibrates baseline after prolonged hang time", () => {
      const createPoseAtY = (y) => {
        const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y, visibility: 0.9 }));
        lm[11] = { x: 0.45, y, visibility: 0.9 };
        lm[12] = { x: 0.55, y, visibility: 0.9 };
        lm[23] = { x: 0.45, y: y + 0.2, visibility: 0.9 };
        lm[24] = { x: 0.55, y: y + 0.2, visibility: 0.9 };
        return lm;
      };

      let currentPose = createPoseAtY(0.5);
      tracker.poseLandmarker = {
        detectForVideo: () => ({ landmarks: [currentPose] }),
      };

      tracker.update(1000, 120); // Baseline established at 0.5

      // Move elevated to 0.4
      currentPose = createPoseAtY(0.4);
      tracker.update(1100, 120);

      // Stay elevated for > hangTimeTimeoutSec (0.85s = 850ms)
      tracker.update(2100, 120);

      // Baseline should have auto-recalibrated to the new standing level (~0.5)
      assert.ok(Math.abs(tracker.torsoYBaseline - 0.5) < 0.05);
      assert.strictEqual(tracker.jumpGrounded, true);
    });

    it("warns about no person detected after debounce threshold", () => {
      tracker.poseLandmarker = {
        detectForVideo: () => ({ landmarks: [] }),
      };

      const maxDropped = CONFIG.tracking?.droppedFramesDebounce ?? 4;
      for (let i = 0; i < maxDropped; i++) {
        tracker.update(1000 + i * 80, 120);
      }

      assert.strictEqual(tracker.droppedFrames, maxDropped);
      assert.strictEqual(tracker.lastLandmarks, null);
      assert.ok(mockPostureStatus.textContent.includes("No person detected"));
      assert.strictEqual(mockPostureStatus.hidden, false);
    });
  });

  describe("drawPreview", () => {
    it("draws skeleton landmarks and joint dots without errors", () => {
      const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
      assert.doesNotThrow(() => tracker.drawPreview(landmarks));
      assert.doesNotThrow(() => tracker.drawPreview(null));
    });
  });

  describe("enable and disable lifecycle", () => {
    it("enables posture tracking and initializes camera streams", async () => {
      await tracker.enable();
      assert.strictEqual(tracker.isEnabled(), true);
      assert.strictEqual(enabledTriggered, true);
      assert.strictEqual(mockPostureButton.textContent, "Stop playing");
    });

    it("disables posture tracking and cleans up tracks", async () => {
      await tracker.enable();
      tracker.disable();
      assert.strictEqual(tracker.isEnabled(), false);
      assert.strictEqual(disabledTriggered, true);
      assert.strictEqual(mockPostureButton.textContent, "Start playing");
      assert.strictEqual(paddleTargetState, null);
    });

    it("handles camera permission errors gracefully", async () => {
      const originalGUM = navigator.mediaDevices.getUserMedia;
      navigator.mediaDevices.getUserMedia = async () => {
        const err = new Error("Permission denied");
        err.name = "NotAllowedError";
        throw err;
      };

      try {
        await tracker.enable();
        assert.strictEqual(tracker.isEnabled(), false);
        assert.ok(mockPostureStatus.innerHTML.includes("Camera blocked by browser"));
      } finally {
        navigator.mediaDevices.getUserMedia = originalGUM;
      }
    });

    it("handles camera in use errors gracefully", async () => {
      const originalGUM = navigator.mediaDevices.getUserMedia;
      navigator.mediaDevices.getUserMedia = async () => {
        const err = new Error("Camera busy");
        err.name = "NotReadableError";
        throw err;
      };

      try {
        await tracker.enable();
        assert.strictEqual(tracker.isEnabled(), false);
        assert.ok(mockPostureStatus.textContent.includes("Camera in use"));
      } finally {
        navigator.mediaDevices.getUserMedia = originalGUM;
      }
    });
  });
});
