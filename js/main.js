import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./constants.js?v=12";
import * as audio from "./audio.js?v=22";
import { Game } from "./game.js?v=22";
import { PoseTracker } from "./pose.js?v=15";
import { CONFIG } from "./config.js?v=16";
import { createPostureRecorder } from "./autorecord.js?v=3";
import { isAutoSaveEnabled, saveRecording, setAutoSaveEnabled } from "./recording-storage.js?v=1";

// DOM Elements
const canvas = document.querySelector("#game");
const scoreElement = document.querySelector("#score");
const roundElement = document.querySelector("#round");
const bestScoreElement = document.querySelector("#best-score");
const timeElement = document.querySelector("#time");
const timeProgress = document.querySelector("#time-progress");
const timeTrack = document.querySelector(".time-track");
const livesElement = document.querySelector("#lives");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const postureButton = document.querySelector("#posture-button");
const soundButton = document.querySelector("#sound-button");
const postureStatus = document.querySelector("#posture-status");
const recordingStatus = document.querySelector("#recording-status");
const saveRecordingButton = document.querySelector("#save-recording-button");
const saveEventsButton = document.querySelector("#save-events-button");
const autoSaveToggle = document.querySelector("#auto-save-toggle");
const autoSaveStatus = document.querySelector("#auto-save-status");
const video = document.querySelector("#camera");
const posePreview = document.querySelector("#pose-preview");
const shareScoreButton = document.querySelector("#share-score-button");
const shareScoreStatus = document.querySelector("#share-score-status");
const challengeStatus = document.querySelector("#challenge-status");
const cameraGuide = document.querySelector("#camera-guide");

let recorder = null;
let recordingHasMicrophone = false;
let pendingRecording = null;
let pendingEventLog = null;
let autoSaveEnabled = true;
let recordingStopTimer = 0;
const BEST_SCORE_KEY = "swaybreak-best-score";
let bestScore = 0;
let hasSavedBestScore = false;

try {
  const savedBestScore = localStorage.getItem(BEST_SCORE_KEY);
  if (savedBestScore !== null) {
    const parsedScore = Number(savedBestScore);
    if (Number.isFinite(parsedScore) && parsedScore >= 0) {
      bestScore = parsedScore;
      hasSavedBestScore = true;
    }
  }
} catch (error) {
  console.warn("Could not read the saved best score:", error);
}
if (hasSavedBestScore) bestScoreElement.textContent = String(bestScore);
const challengeScore = Number(new URLSearchParams(window.location.search).get("challenge"));
if (Number.isSafeInteger(challengeScore) && challengeScore > 0) {
  challengeStatus.textContent = `Challenge: beat ${challengeScore} in 90 seconds!`;
  challengeStatus.hidden = false;
}

function saveBestScore(score) {
  const previousBest = bestScore;
  const isNewBest = !hasSavedBestScore || score > previousBest;
  if (isNewBest) {
    bestScore = score;
    hasSavedBestScore = true;
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
    } catch (error) {
      console.warn("Could not save the best score:", error);
    }
    bestScoreElement.textContent = String(bestScore);
  }
  if (isNewBest) return `New personal best: ${score}!`;
  if (score === bestScore) return `You matched your best score of ${bestScore}.`;
  return `You scored ${score}. Your best is ${bestScore}. ${bestScore - score} away.`;
}

try {
  autoSaveEnabled = isAutoSaveEnabled();
  autoSaveToggle.checked = autoSaveEnabled;
} catch (error) {
  autoSaveStatus.textContent = `Auto-save preference unavailable: ${error.message}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function startRecording(microphoneStream = null) {
  if (!recorder) return;
  clearTimeout(recordingStopTimer);
  recordingStopTimer = 0;
  try {
    recordingHasMicrophone = microphoneStream?.getAudioTracks()
      .some((track) => track.readyState === "live") || false;
    recorder.start(microphoneStream);
  } catch (error) {
    console.error("Could not start game recording:", error);
    recordingStatus.textContent = `Recording unavailable: ${error.message}`;
  }
}

function stopRecording(delayMs = 0) {
  clearTimeout(recordingStopTimer);
  recordingStopTimer = 0;
  if (delayMs > 0 && recorder?.isRecording()) {
    recordingStatus.textContent = "Round complete. Capturing the win moment…";
    recordingStopTimer = setTimeout(() => {
      recordingStopTimer = 0;
      stopRecording();
    }, delayMs);
    return;
  }
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
    autoDownload: false,
    onEvent: (type) => {
      if (type === "START") {
        pendingRecording = null;
        pendingEventLog = null;
        recordingStatus.hidden = false;
        saveRecordingButton.hidden = true;
        saveEventsButton.hidden = true;
        recordingStatus.textContent = recordingHasMicrophone
          ? "Recording portrait video with game, camera, skeleton, game sound and microphone. Tap Save video when recording finishes."
          : "Recording portrait video with game, camera, skeleton and game sound. Microphone unavailable. Tap Save video when recording finishes.";
      }
    },
    onFile: async (blob, events, filename) => {
      pendingRecording = new File([blob], filename, { type: blob.type });
      pendingEventLog = events.length > 0
        ? new Blob(
          [JSON.stringify({ recording: filename, events }, null, 2)],
          { type: "application/json" },
        )
        : null;
      recordingStatus.hidden = false;
      saveRecordingButton.hidden = false;
      saveEventsButton.hidden = !pendingEventLog;
      recordingStatus.textContent = autoSaveEnabled
        ? "Recording ready. Saving to this device’s recordings library…"
        : "Recording ready. Auto-save is off; tap Save video to keep it.";
      if (autoSaveEnabled) {
        try {
          await saveRecording({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: filename,
            blob,
            events,
            createdAt: new Date().toISOString(),
          });
          recordingStatus.textContent = "Recording saved in My recordings. You can also download or share it now.";
        } catch (error) {
          console.error("Could not save recording locally:", error);
          recordingStatus.textContent = `Could not auto-save recording: ${error.message}. Tap Save video to keep it.`;
        }
      }
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

autoSaveToggle.addEventListener("change", () => {
  try {
    autoSaveEnabled = autoSaveToggle.checked;
    setAutoSaveEnabled(autoSaveEnabled);
    autoSaveStatus.textContent = autoSaveEnabled
      ? "New recordings will be saved in My recordings on this device."
      : "New recordings will not be kept in the local library.";
  } catch (error) {
    autoSaveToggle.checked = autoSaveEnabled;
    autoSaveStatus.textContent = `Could not save auto-save preference: ${error.message}`;
  }
});

saveRecordingButton.addEventListener("click", async () => {
  if (!pendingRecording) return;
  try {
    if (typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [pendingRecording] })) {
      await navigator.share({
        files: [pendingRecording],
        title: pendingRecording.name,
      });
      recordingStatus.textContent = "Choose Save Video or another destination in the share menu.";
    } else {
      downloadBlob(pendingRecording, pendingRecording.name);
      recordingStatus.textContent = "Save requested. Check your browser downloads.";
    }
  } catch (error) {
    if (error.name === "AbortError") {
      recordingStatus.textContent = "Save canceled. Tap Save video when you’re ready.";
      return;
    }
    console.error("Could not save game recording:", error);
    recordingStatus.textContent = `Could not save recording: ${error.message}`;
  }
});

saveEventsButton.addEventListener("click", () => {
  if (!pendingEventLog || !pendingRecording) return;
  const filename = pendingRecording.name.replace(/\.(mp4|webm)$/i, ".events.json");
  downloadBlob(pendingEventLog, filename);
  recordingStatus.textContent = "Event markers saved. Check your browser downloads.";
});

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
    const roundDuration = CONFIG.game?.roundDurationSeconds ?? 90;
    const timePercent = Math.max(0, Math.min(100, (seconds / roundDuration) * 100));
    timeProgress.style.width = `${timePercent}%`;
    timeProgress.classList.toggle("low-time", seconds <= 20);
    timeTrack.setAttribute("aria-valuenow", String(seconds));
  },
  onLevelAdvance: (level) => {
    roundElement.textContent = String(level);
  },
  onGameOver: (title, message, autoRestart = false) => {
    const scoreMessage = saveBestScore(game.score);
    overlayTitle.textContent = title;
    overlayMessage.textContent = `${scoreMessage} ${autoRestart ? message : "Choose Play again to start another round."}`;
    shareScoreStatus.textContent = "";
    shareScoreButton.hidden = false;
    overlay.hidden = false;
    if (poseTracker.isEnabled()) postureButton.textContent = "Play again";
    stopRecording(1500);
  },
  onGameRestart: () => {
    overlay.hidden = true;
    shareScoreButton.hidden = true;
    roundElement.textContent = String(game.roundNumber);
    postureButton.textContent = poseTracker.isEnabled() ? "Stop playing" : "Start playing";
    if (poseTracker.isEnabled()) startRecording(poseTracker.microphoneStream);
  },
  onClutchSave: () => recorder?.markEvent("CLUTCH_SAVE"),
  onSmash: () => recorder?.markEvent("SMASH"),
});

shareScoreButton.addEventListener("click", async () => {
  const challengeUrl = new URL(window.location.href);
  challengeUrl.searchParams.set("challenge", String(game.score));
  const text = `Beat my score of ${game.score} in 90 seconds on SwayBreak!`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "SwayBreak challenge", text, url: challengeUrl.href });
      shareScoreStatus.textContent = "Challenge shared.";
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text} ${challengeUrl.href}`);
      shareScoreStatus.textContent = "Challenge link copied.";
    } else {
      shareScoreStatus.textContent = `${text} ${challengeUrl.href}`;
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Could not share score:", error);
    shareScoreStatus.textContent = `Could not share score: ${error.message}`;
  }
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
    cameraGuide.hidden = true;
    postureButton.textContent = game.gameOver ? "Play again" : "Stop playing";
    postureButton.classList.remove("awaiting-start");
    postureStatus.hidden = true;
    postureStatus.textContent = "Lean to move. Reach out to widen your paddle; jump to smash.";
    if (game.gameOver) {
      game.startAgain();
    } else {
      startRecording(microphoneStream);
      game.startCountdown(CONFIG.game?.countdownSeconds ?? 3);
    }
  },
  onPostureDisabled: () => {
    cameraGuide.hidden = false;
    postureButton.textContent = "Start playing";
    postureButton.classList.add("awaiting-start");
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
  if (game.gameOver && poseTracker.isEnabled()) {
    game.startAgain();
    return;
  }
  postureStatus.hidden = false;
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
  if (game.gameOver && poseTracker.isEnabled()) {
    game.startAgain();
  }
}

canvas.addEventListener("pointerdown", handleRestartAttempt);
overlay.addEventListener("click", (event) => {
  if (event.target === overlay) handleRestartAttempt();
});

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
  if (event.key === " " && game.gameOver && poseTracker.isEnabled()) {
    game.startAgain();
  } else if (event.key === " " && !game.gameOver) {
    game.triggerJump();
  }
});

// Preload pose detector model in background
poseTracker.preloadModel();

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
requestAnimationFrame(frame);
postureStatus.textContent = "Enable posture control and allow camera access to start; microphone access is optional.";
postureButton.classList.add("awaiting-start");
