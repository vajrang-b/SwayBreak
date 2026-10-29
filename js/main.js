import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./constants.js?v=12";
import * as audio from "./audio.js?v=15";
import { Game } from "./game.js?v=15";
import { PoseTracker } from "./pose.js?v=13";
import { CONFIG } from "./config.js?v=15";
import { createPostureRecorder } from "./autorecord.js?v=3";

// DOM Elements
const canvas = document.querySelector("#game");
const scoreElement = document.querySelector("#score");
const timeElement = document.querySelector("#time");
const livesElement = document.querySelector("#lives");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const postureButton = document.querySelector("#posture-button");
const soundButton = document.querySelector("#sound-button");
const postureStatus = document.querySelector("#posture-status");
const recordingStatus = document.querySelector("#recording-status");
const video = document.querySelector("#camera");
const posePreview = document.querySelector("#pose-preview");

let recorder = null;
let recordingHasMicrophone = false;

function startRecording(microphoneStream = null) {
  if (!recorder) return;
  try {
    recordingHasMicrophone = microphoneStream?.getAudioTracks()
      .some((track) => track.readyState === "live") || false;
    recorder.start(microphoneStream);
  } catch (error) {
    console.error("Could not start game recording:", error);
    recordingStatus.textContent = `Recording unavailable: ${error.message}`;
  }
}

function stopRecording() {
  if (recorder?.isRecording()) {
    recorder.stop();
    recordingStatus.textContent = "Saving your game and webcam recording…";
  }
}

try {
  recorder = createPostureRecorder({
    gameCanvas: canvas,
    webcamCanvas: posePreview,
    createAudioRecording: audio.createRecordingAudioStream,
    onEvent: (type) => {
      if (type === "START") {
        recordingStatus.textContent = recordingHasMicrophone
          ? "Recording portrait video with game, camera, skeleton, game sound and microphone; saved locally when the round ends."
          : "Recording portrait video with game, camera, skeleton and game sound; microphone unavailable. Saved locally when the round ends.";
      }
    },
    onFile: () => {
      recordingStatus.textContent = "Recording downloaded to your device.";
    },
    onError: (error) => {
      console.error("Game recording failed:", error);
      recordingStatus.textContent = `Recording failed: ${error.message}`;
    },
  });
} catch (error) {
  console.error("Could not initialize game recording:", error);
  recordingStatus.textContent = `Recording unavailable: ${error.message}`;
}

// Initialize Game (mouse & keyboard controls disabled; posture-only)
const game = new Game({
  canvas,
  audio,
  onScoreChange: (score) => {
    scoreElement.textContent = String(score);
  },
  onRoundTimeChange: (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(seconds % 60).padStart(2, "0");
    timeElement.textContent = `${minutes}:${remainingSeconds}`;
  },
  onGameOver: (title, message, autoRestart = false) => {
    overlayTitle.textContent = title;
    overlayMessage.textContent = autoRestart ? message : `${message} Click to play again.`;
    overlay.hidden = false;
    stopRecording();
  },
  onGameRestart: () => {
    overlay.hidden = true;
    if (poseTracker.isEnabled()) startRecording();
  },
  onClutchSave: () => recorder?.markEvent("CLUTCH_SAVE"),
  onSmash: () => recorder?.markEvent("SMASH"),
});

// Initialize Pose Tracker
const poseTracker = new PoseTracker({
  video,
  posePreview,
  postureStatus,
  postureButton,
  canvasWidth: CANVAS_WIDTH,
  getPaddle: () => game.paddle,
  setTargetPaddleX: (x, leftRatio, rightRatio) => game.setTargetPaddleX(x, leftRatio, rightRatio),
  clearTargetPaddleX: () => game.clearTargetPaddleX(),
  onPostureEnabled: (microphoneStream) => {
    startRecording(microphoneStream);
    game.startCountdown(CONFIG.game?.countdownSeconds ?? 3);
  },
  onJumpTriggered: () => {
    game.triggerJump();
  },
});

function updateSoundButtonUI(enabled) {
  soundButton.textContent = enabled ? "Sound: On" : "Sound: Off";
  soundButton.setAttribute("aria-label", enabled ? "Mute sound" : "Enable sound");
  soundButton.setAttribute("aria-pressed", String(enabled));
}

updateSoundButtonUI(audio.isSoundEnabled());

// Sound toggle
soundButton.addEventListener("click", async () => {
  const context = audio.getAudioContext();
  if (!context) {
    if (!audio.ensureAudio(game.gameOver)) {
      soundButton.textContent = "Audio unavailable";
      soundButton.setAttribute("aria-label", "Audio is unavailable in this browser");
      return;
    }
    await audio.resumeAudio();
    audio.setSoundEnabled(true, game.gameOver);
    updateSoundButtonUI(true);
    audio.playUiBlip(660);
    audio.playAirySound({ duration: 0.18, volume: 0.03, frequency: 1500 });
    return;
  }

  const enabled = !audio.isSoundEnabled();
  audio.setSoundEnabled(enabled, game.gameOver);
  updateSoundButtonUI(enabled);
  if (enabled) {
    if (context.state === "suspended") {
      await audio.resumeAudio();
    }
    audio.playUiBlip(660);
    audio.playAirySound({ duration: 0.18, volume: 0.03, frequency: 1500 });
  }
});

// Posture control toggle
postureButton.addEventListener("click", () => {
  audio.ensureAudio(game.gameOver);
  if (poseTracker.isEnabled()) {
    stopRecording();
    poseTracker.disable();
  } else {
    void poseTracker.enable();
  }
});

// Canvas and overlay restart clicks (no paddle steering)
function handleRestartAttempt() {
  audio.ensureAudio(game.gameOver);
  if (game.gameOver) {
    game.startAgain();
  }
}

canvas.addEventListener("pointerdown", handleRestartAttempt);
overlay.addEventListener("click", handleRestartAttempt);

window.addEventListener("pointerdown", () => audio.ensureAudio(game.gameOver), { passive: true });
window.addEventListener("touchstart", () => audio.ensureAudio(game.gameOver), { passive: true });

// Prevent scroll on arrow keys or space; restart on space if game over; jump on ArrowUp / Space
window.addEventListener("keydown", (event) => {
  audio.ensureAudio(game.gameOver);
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "w", "W", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (["ArrowUp", "w", "W"].includes(event.key) && !game.gameOver) {
    game.triggerJump();
  }
  if (event.key === " " && game.gameOver) {
    game.startAgain();
  } else if (event.key === " " && !game.gameOver) {
    game.triggerJump();
  }
});

// Preload pose detector model in background
poseTracker.preloadModel();

// Auto-start posture control if camera permission is already granted
if (navigator.permissions?.query) {
  navigator.permissions.query({ name: "camera" }).then((status) => {
    if (status.state === "granted") {
      void poseTracker.enable();
    }
  }).catch(() => {});
}

// Animation frame loop
let lastFrameTime = 0;
function frame(now) {
  const delta = Math.min((now - lastFrameTime) / 1000 || 0, 0.03);
  lastFrameTime = now;
  poseTracker.update(now, game.paddle.width);
  game.update(delta);
  game.draw();
  requestAnimationFrame(frame);
}

// Initial setup
game.resetBricks();
game.startCountdown(CONFIG.game?.countdownSeconds ?? 3);
requestAnimationFrame(frame);
postureStatus.textContent = "Click 'Enable posture control' to steer with your body and jump to smash.";
