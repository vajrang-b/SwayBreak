import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { getActiveConnections } from "./constants.js?v=12";
import { CONFIG } from "./config.js?v=17";

export class PoseTracker {
  constructor({
    video,
    posePreview,
    postureStatus,
    postureButton,
    canvasWidth,
    getPaddle,
    setTargetPaddleX,
    clearTargetPaddleX,
    onPostureEnabled,
    onPostureDisabled,
    onJumpTriggered,
  }) {
    this.video = video;
    this.posePreview = posePreview;
    this.previewCtx = posePreview.getContext("2d");
    this.postureStatus = postureStatus;
    this.postureButton = postureButton;
    this.canvasWidth = canvasWidth;
    this.getPaddle = getPaddle;
    this.setTargetPaddleX = setTargetPaddleX;
    this.clearTargetPaddleX = clearTargetPaddleX;
    this.onPostureEnabled = onPostureEnabled;
    this.onPostureDisabled = onPostureDisabled;
    this.onJumpTriggered = onJumpTriggered;

    this.poseLandmarker = null;
    this.cameraStream = null;
    this.microphoneStream = null;
    this.postureEnabled = false;
    this.poseBackend = "CPU";
    this.lastTrackedTorsoX = null;
    this.lastTorsoY = null;
    this.lastTorsoTime = 0;
    this.torsoYBaseline = null;
    this.lastJumpTime = 0;
    this.jumpVisualTimer = 0;
    this.currentUpwardPixels = 0;
    this.jumpGrounded = true;
    this.elevatedTimer = 0;
    this.lastLandmarks = null;
    this.lastPoseTime = 0;
    this.poseModelLoadingPromise = null;
    this.leftExtensionRatio = 0;
    this.rightExtensionRatio = 0;
    this.droppedFrames = 0;
  }

  isEnabled() {
    return this.postureEnabled;
  }

  syncCanvasDimensions() {
    if (!this.video || !this.video.videoWidth || !this.video.videoHeight) return;
    const vWidth = this.video.videoWidth;
    const vHeight = this.video.videoHeight;
    const baseWidth = 240;
    const targetHeight = Math.round(baseWidth * (vHeight / vWidth));
    if (this.posePreview.width !== baseWidth || this.posePreview.height !== targetHeight) {
      this.posePreview.width = baseWidth;
      this.posePreview.height = targetHeight;
    }
  }

  drawPreview(landmarks = null) {
    this.syncCanvasDimensions();
    const width = this.posePreview.width;
    const height = this.posePreview.height;
    const skelCfg = CONFIG.skeleton;

    // Draw camera video feed if available
    if (this.video && this.video.readyState >= 2 && !this.video.paused) {
      this.previewCtx.save();
      // Mirror horizontally to match intuitive webcam mirror
      this.previewCtx.translate(width, 0);
      this.previewCtx.scale(-1, 1);
      this.previewCtx.drawImage(this.video, 0, 0, width, height);
      this.previewCtx.restore();

      // Subtle translucent dark layer so skeleton lines and dots are vibrant
      const overlayAlpha = skelCfg.cameraOverlayAlpha ?? 0.25;
      this.previewCtx.fillStyle = `rgba(8, 11, 18, ${overlayAlpha})`;
      this.previewCtx.fillRect(0, 0, width, height);
    } else {
      this.previewCtx.fillStyle = "#080b12";
      this.previewCtx.fillRect(0, 0, width, height);
    }

    if (!landmarks) return;

    // Active connections respecting CONFIG
    const connections = getActiveConnections(skelCfg);
    const minVis = skelCfg.minVisibility ?? 0.05;

    this.previewCtx.strokeStyle = skelCfg.lineColor || "#5ce1b8";
    this.previewCtx.lineWidth = skelCfg.lineWidth || 3;
    this.previewCtx.lineCap = "round";

    for (const [startIndex, endIndex] of connections) {
      const start = landmarks[startIndex];
      const end = landmarks[endIndex];
      if (!start || !end) continue;
      if (
        (start.visibility !== undefined && start.visibility < minVis) ||
        (end.visibility !== undefined && end.visibility < minVis)
      ) {
        continue;
      }

      this.previewCtx.beginPath();
      this.previewCtx.moveTo((1 - start.x) * width, start.y * height);
      this.previewCtx.lineTo((1 - end.x) * width, end.y * height);
      this.previewCtx.stroke();
    }

    // Joint dots respecting CONFIG
    if (skelCfg.showJointDots) {
      this.previewCtx.fillStyle = skelCfg.dotColor || "#ffffff";
      const startIdx = skelCfg.showFaceMarkers ? 0 : 11;
      const dotRadius = skelCfg.dotRadius || 3;

      for (let i = startIdx; i < landmarks.length; i++) {
        if (!skelCfg.showLegs && i >= 25) continue;
        const point = landmarks[i];
        if (!point || (point.visibility !== undefined && point.visibility < minVis)) continue;
        this.previewCtx.beginPath();
        this.previewCtx.arc((1 - point.x) * width, point.y * height, dotRadius, 0, Math.PI * 2);
        this.previewCtx.fill();
      }
    }

    // Glowing highlights on extended arm endpoints
    if (CONFIG.armExtension.enabled) {
      const wingCol = CONFIG.armExtension.wingColor || "#5ce1b8";
      const glowBlur = CONFIG.armExtension.glowIntensity || 10;

      if (this.leftExtensionRatio > 0.35 && landmarks[15]) {
        this.previewCtx.save();
        this.previewCtx.strokeStyle = wingCol;
        this.previewCtx.lineWidth = 3;
        this.previewCtx.shadowColor = wingCol;
        this.previewCtx.shadowBlur = glowBlur;
        this.previewCtx.beginPath();
        this.previewCtx.arc((1 - landmarks[15].x) * width, landmarks[15].y * height, 7, 0, Math.PI * 2);
        this.previewCtx.stroke();
        this.previewCtx.restore();
      }
      if (this.rightExtensionRatio > 0.35 && landmarks[16]) {
        this.previewCtx.save();
        this.previewCtx.strokeStyle = wingCol;
        this.previewCtx.lineWidth = 3;
        this.previewCtx.shadowColor = wingCol;
        this.previewCtx.shadowBlur = glowBlur;
        this.previewCtx.beginPath();
        this.previewCtx.arc((1 - landmarks[16].x) * width, landmarks[16].y * height, 7, 0, Math.PI * 2);
        this.previewCtx.stroke();
        this.previewCtx.restore();
      }
    }

    // Show real-time jump pixel tracker & trigger banner
    if (CONFIG.jump?.enabled && this.postureEnabled) {
      const minPixels = CONFIG.jump?.minJumpPixels ?? 35;
      const currentPx = Math.round(this.currentUpwardPixels || 0);

      this.previewCtx.save();
      if (this.jumpVisualTimer > 0) {
        this.jumpVisualTimer -= 0.035;
        this.previewCtx.font = "900 13px system-ui, sans-serif";
        this.previewCtx.textAlign = "center";
        this.previewCtx.fillStyle = "#ffdd44";
        this.previewCtx.shadowColor = "#ffdd44";
        this.previewCtx.shadowBlur = 10;
        this.previewCtx.fillText(`⚡ JUMP! (${currentPx}px)`, width / 2, 22);
      } else {
        // Subtle real-time pixel counter in corner so user can see calibration
        this.previewCtx.font = "600 11px system-ui, sans-serif";
        this.previewCtx.textAlign = "right";
        this.previewCtx.fillStyle = currentPx > minPixels * 0.7 ? "#5ce1b8" : "rgba(200, 208, 232, 0.75)";
        this.previewCtx.fillText(`▲ ${currentPx} / ${minPixels}px`, width - 8, 18);
      }
      this.previewCtx.restore();
    }
  }

  selectNearestPose(poses) {
    if (!poses || poses.length === 0) return null;
    const candidates = poses
      .map(landmarks => {
        if (!landmarks || landmarks.length === 0) return null;
        // 11=left shoulder, 12=right shoulder, 23=left hip, 24=right hip, 0=nose
        const torsoPoints = [landmarks[11], landmarks[12], landmarks[23], landmarks[24]]
          .filter(p => p && (p.visibility === undefined || p.visibility >= 0.15));

        let torsoX;
        let torsoY;
        if (torsoPoints.length >= 2) {
          torsoX = torsoPoints.reduce((sum, p) => sum + p.x, 0) / torsoPoints.length;
          torsoY = torsoPoints.reduce((sum, p) => sum + p.y, 0) / torsoPoints.length;
        } else if (landmarks[11] || landmarks[12]) {
          const p = landmarks[11] || landmarks[12];
          torsoX = p.x;
          torsoY = p.y;
        } else if (landmarks[0]) {
          torsoX = landmarks[0].x;
          torsoY = landmarks[0].y;
        } else {
          return null;
        }

        const visible = landmarks.filter(p => p && (p.visibility === undefined || p.visibility >= 0.15));
        const xs = visible.map(p => p.x);
        const ys = visible.map(p => p.y);
        const area = xs.length > 0 && ys.length > 0
          ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
          : 0;
        const distance = this.lastTrackedTorsoX === null
          ? 0
          : Math.abs(torsoX - this.lastTrackedTorsoX);
        return { landmarks, torsoX, torsoY, area, distance };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (this.lastTrackedTorsoX !== null && Math.abs(a.distance - b.distance) > 0.05) {
          return a.distance - b.distance;
        }
        return b.area - a.area;
      });
    return candidates[0] ?? null;
  }

  setCanvasWidth(width) {
    if (typeof width === "number" && width > 0) {
      this.canvasWidth = width;
    }
  }

  update(now, paddleWidth) {
    if (!this.postureEnabled || this.video.readyState < 2 || this.video.paused || this.video.ended) {
      return;
    }

    const throttleMs = CONFIG.tracking?.inferenceThrottleMs ?? 70;
    if (this.poseLandmarker && now - this.lastPoseTime >= throttleMs) {
      this.lastPoseTime = now;

      try {
        const result = this.poseLandmarker.detectForVideo(this.video, now);
        const poses = result?.landmarks ?? result?.poseLandmarks ?? [];
        const trackedPose = this.selectNearestPose(poses);

        if (trackedPose) {
          this.droppedFrames = 0;
          const { landmarks, torsoX, torsoY } = trackedPose;
          this.lastTrackedTorsoX = torsoX;
          this.lastLandmarks = landmarks;

          // Detect jump mechanics (requires body to move up by minJumpPixels)
          if (CONFIG.jump?.enabled && torsoY !== undefined) {
            const refHeight = CONFIG.jump?.referenceCameraHeight ?? 480;
            const minPixels = CONFIG.jump?.minJumpPixels ?? 50;
            const cooldown = CONFIG.jump?.cooldownMs ?? 600;
            const timeoutSec = CONFIG.jump?.hangTimeTimeoutSec ?? 0.85;
            const dt = (this.lastTorsoTime > 0 && now > this.lastTorsoTime)
              ? (now - this.lastTorsoTime) / 1000
              : 0.07;

            if (this.torsoYBaseline === null) {
              this.torsoYBaseline = torsoY;
            }

            // Upward movement in pixels from resting baseline
            const upwardPixels = (this.torsoYBaseline - torsoY) * refHeight;
            this.currentUpwardPixels = Math.max(0, upwardPixels);

            // Upward velocity (pixels / sec)
            const upwardVelocityPx = (this.lastTorsoY !== null && dt > 0.01)
              ? ((this.lastTorsoY - torsoY) * refHeight) / dt
              : 0;

            // Handle ground state & camera angle adjustments
            if (upwardPixels < 14) {
              // Player is grounded / resting near baseline
              this.jumpGrounded = true;
              this.elevatedTimer = 0;
              if (upwardPixels < -8) {
                // Player moved lower (e.g. crouching before a jump or laptop lid tilted back):
                // adapt steadily so natural countermovement jump squats do not collapse the baseline
                this.torsoYBaseline = this.torsoYBaseline * 0.94 + torsoY * 0.06;
              } else {
                // Normal resting baseline adaptation
                this.torsoYBaseline = this.torsoYBaseline * 0.97 + torsoY * 0.03;
              }
            } else {
              // Player is elevated above baseline
              this.elevatedTimer += dt;
              // Human jump hang time is physically < 0.65s.
              // If elevated for longer, laptop lid tilted or posture changed permanently:
              if (this.elevatedTimer >= timeoutSec) {
                this.torsoYBaseline = torsoY; // Auto-recalibrate to new standing level
                this.elevatedTimer = 0;
                this.jumpGrounded = true;
                this.currentUpwardPixels = 0;
              }
            }

            // Must be grounded, off cooldown, exceed pixel threshold, and have upward velocity
            if (
              this.jumpGrounded &&
              now - this.lastJumpTime >= cooldown &&
              upwardPixels >= minPixels &&
              upwardVelocityPx > 35
            ) {
              this.jumpGrounded = false; // Must land on the ground before jumping again!
              this.lastJumpTime = now;
              this.jumpVisualTimer = 0.55;
              this.onJumpTriggered?.();
            }

            this.lastTorsoY = torsoY;
            this.lastTorsoTime = now;
          }

          // Detect arm extensions if enabled in CONFIG
          let leftExt = 0;
          let rightExt = 0;

          if (CONFIG.armExtension.enabled && landmarks[11] && landmarks[12]) {
            const shoulderDist = Math.max(0.08, Math.hypot(landmarks[11].x - landmarks[12].x, landmarks[11].y - landmarks[12].y));
            const thresh = CONFIG.armExtension.reachThreshold ?? 0.35;

            // Left arm (player's left = camera right, higher x in selfie)
            const leftPoint = (landmarks[15] && (landmarks[15].visibility === undefined || landmarks[15].visibility >= 0.05))
              ? landmarks[15]
              : ((landmarks[13] && (landmarks[13].visibility === undefined || landmarks[13].visibility >= 0.05)) ? landmarks[13] : null);

            if (leftPoint) {
              const leftReach = (leftPoint.x - landmarks[11].x) / shoulderDist;
              leftExt = Math.max(0, Math.min(1, (leftReach - thresh) / 0.60));
            }

            // Right arm (player's right = camera left, lower x in selfie)
            const rightPoint = (landmarks[16] && (landmarks[16].visibility === undefined || landmarks[16].visibility >= 0.05))
              ? landmarks[16]
              : ((landmarks[14] && (landmarks[14].visibility === undefined || landmarks[14].visibility >= 0.05)) ? landmarks[14] : null);

            if (rightPoint) {
              const rightReach = (landmarks[12].x - rightPoint.x) / shoulderDist;
              rightExt = Math.max(0, Math.min(1, (rightReach - thresh) / 0.60));
            }
          }

          this.leftExtensionRatio = leftExt;
          this.rightExtensionRatio = rightExt;

          const mirroredX = 1 - torsoX;
          const leanSpan = CONFIG.tracking?.leanSensitivity ?? 0.36;
          const minBound = 0.5 - leanSpan / 2;
          const movementRange = Math.max(0, Math.min(1, (mirroredX - minBound) / leanSpan));
          const targetX = movementRange * (this.canvasWidth - paddleWidth);
          this.setTargetPaddleX(targetX, leftExt, rightExt);

          const hasShoulders = Boolean(landmarks[11] && landmarks[12]);
          if (!hasShoulders) {
            const closeMsg = "Stand back so your shoulders show in camera";
            if (this.postureStatus.textContent !== closeMsg) {
              this.postureStatus.textContent = closeMsg;
            }
            this.postureStatus.hidden = false;
          } else {
            this.postureStatus.hidden = true;
          }
        } else {
          this.droppedFrames += 1;
          const maxDropped = CONFIG.tracking?.droppedFramesDebounce ?? 8;
          if (this.droppedFrames >= maxDropped) {
            this.lastLandmarks = null;
            this.leftExtensionRatio = 0;
            this.rightExtensionRatio = 0;
            const noPersonMsg = "No person detected — keep shoulders in view.";
            if (this.postureStatus.textContent !== noPersonMsg) {
              this.postureStatus.textContent = noPersonMsg;
            }
            this.postureStatus.hidden = false;
          }
        }
      } catch (err) {
        console.warn("Pose detection dropped frame:", err);
      }
    }

    this.drawPreview(this.lastLandmarks);
  }

  async getPoseLandmarker() {
    if (this.poseLandmarker) return this.poseLandmarker;
    if (this.poseModelLoadingPromise) return this.poseModelLoadingPromise;

    this.poseModelLoadingPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
      );
      const modelAssetPath = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

      // Attempt hardware GPU acceleration first for smooth 60 FPS performance
      try {
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        this.poseBackend = "GPU";
        return this.poseLandmarker;
      } catch (gpuErr) {
        console.warn("GPU delegate unavailable, falling back to CPU:", gpuErr);
      }

      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      this.poseBackend = "CPU";
      return this.poseLandmarker;
    })().catch((error) => {
      this.poseModelLoadingPromise = null;
      throw error;
    });

    return this.poseModelLoadingPromise;
  }

  preloadModel() {
    this.getPoseLandmarker().catch(err => console.warn("Model background preload:", err));
  }

  async enable() {
    this.postureButton.disabled = true;
    this.postureButton.textContent = "Starting…";
    this.postureStatus.textContent = "Starting camera and pose detection…";
    try {
      if (!window.isSecureContext) {
        throw new Error(
          "Camera access requires HTTPS or localhost. If opening from another device, serve over HTTPS.",
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not provide camera access. Try Chrome, Edge, or Firefox.");
      }

      try {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
      } catch (constraintErr) {
        console.warn("Retrying camera with generic constraints:", constraintErr);
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }

      this.video.srcObject = this.cameraStream;
      await this.video.play();

      try {
        this.microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (error) {
        console.warn("Microphone unavailable; recording without microphone audio:", error);
        this.microphoneStream = null;
      }

      if (this.video.videoWidth && this.video.videoHeight) {
        const aspect = this.video.videoHeight / this.video.videoWidth;
        this.posePreview.width = 240;
        this.posePreview.height = Math.round(240 * aspect);
      }

      if (!this.poseLandmarker) {
        this.postureStatus.textContent = "Loading AI pose detector (CPU mode)…";
        await this.getPoseLandmarker();
      }

      this.posePreview.hidden = false;
      this.drawPreview();
      this.postureEnabled = true;
      const paddle = this.getPaddle();
      this.setTargetPaddleX(paddle.x);
      this.postureButton.textContent = "Stop playing";
      this.postureStatus.textContent = "Tracking body (CPU mode) — lean left or right to steer.";
      this.onPostureEnabled?.(this.microphoneStream);
    } catch (error) {
      console.error("Could not start posture control:", error);
      this.poseLandmarker?.close();
      this.poseLandmarker = null;
      this.cameraStream?.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
      this.microphoneStream?.getTracks().forEach(track => track.stop());
      this.microphoneStream = null;
      this.video.srcObject = null;
      this.lastLandmarks = null;
      this.posePreview.hidden = true;
      this.drawPreview();
      this.postureButton.textContent = "Start playing";
      this.onPostureDisabled?.();

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        this.postureStatus.innerHTML = `<strong>Camera blocked by browser.</strong> Click the lock or camera icon in your address bar (🔒 / 📷) &gt; set Camera to <strong>Allow</strong> &gt; click button again.`;
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        this.postureStatus.textContent = "Camera in use: Another app or tab is using your webcam. Close it and try again.";
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        this.postureStatus.textContent = "No camera detected on this device. A camera is required for posture control.";
      } else {
        this.postureStatus.textContent = `Could not start camera: ${error.message}`;
      }
    } finally {
      this.postureButton.disabled = false;
    }
  }

  disable() {
    this.postureEnabled = false;
    this.lastTrackedTorsoX = null;
    this.lastLandmarks = null;
    this.leftExtensionRatio = 0;
    this.rightExtensionRatio = 0;
    this.clearTargetPaddleX();
    this.cameraStream?.getTracks().forEach(track => track.stop());
    this.cameraStream = null;
    this.microphoneStream?.getTracks().forEach(track => track.stop());
    this.microphoneStream = null;
    this.video.srcObject = null;
    this.posePreview.hidden = true;
    this.drawPreview();
    this.postureButton.textContent = "Start playing";
    this.postureStatus.textContent = "Posture control is off.";
    this.onPostureDisabled?.();
  }
}
