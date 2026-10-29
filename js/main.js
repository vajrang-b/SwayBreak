import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./constants.js?v=13";
import * as audio from "./audio.js?v=22";
import { Game } from "./game.js?v=24";
import { PoseTracker } from "./pose.js?v=17";
import { CONFIG } from "./config.js?v=17";
import { createPostureRecorder } from "./autorecord.js?v=4";
import { isAutoSaveEnabled, saveRecording, setAutoSaveEnabled } from "./recording-storage.js?v=1";
import { downloadBlob } from "./download.js?v=1";

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
const arModeToggle = document.querySelector("#ar-mode-toggle");
const fullscreenButton = document.querySelector("#fullscreen-button");
const floatingFullscreenBtn = document.querySelector("#floating-fullscreen-btn");
const gameWrap = document.querySelector(".game-wrap");
const shareScoreButton = document.querySelector("#share-score-button");
const shareScoreStatus = document.querySelector("#share-score-status");
const challengeStatus = document.querySelector("#challenge-status");
const cameraGuide = document.querySelector("#camera-guide");

let userExitedFullscreen = false;

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
  if (score <= 0) {
    return hasSavedBestScore
      ? `No points this round. Your best is ${bestScore}.`
      : "Score points to set your first personal best.";
  }
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
    recordingStatus.textContent = "Round complete. Finalizing recording…";
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

function detectOrientation() {
  if (typeof window === "undefined" || !window.innerWidth || !window.innerHeight) return "landscape";
  const isMobileOrNarrow = window.innerWidth <= 850 || /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || "");
  return (isMobileOrNarrow && window.innerHeight > window.innerWidth) ? "portrait" : "landscape";
}

try {
  recorder = createPostureRecorder({
    gameCanvas: canvas,
    videoElement: video,
    webcamCanvas: posePreview,
    getARMode: () => game.arMode,
    getOrientation: () => game.orientation,
    createAudioRecording: audio.createRecordingAudioStream,
    autoDownload: false,
    onEvent: (type) => {
      if (type === "START") {
        pendingRecording = null;
        pendingEventLog = null;
        recordingStatus.hidden = false;
        saveRecordingButton.hidden = true;
        saveEventsButton.hidden = true;
        const orientLabel = (game?.orientation === "portrait") ? "portrait" : "landscape";
        recordingStatus.textContent = recordingHasMicrophone
          ? `🔴 REC (${orientLabel}) · Mic on`
          : `🔴 REC (${orientLabel})`;
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
        ? "Recording saved to My recordings."
        : "Recording ready. Tap Save video to keep it.";
      if (autoSaveEnabled) {
        try {
          await saveRecording({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: filename,
            blob,
            events,
            createdAt: new Date().toISOString(),
          });
          recordingStatus.textContent = "Saved to My recordings.";
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
  orientation: detectOrientation(),
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
    const stats = game.getWorkoutStats?.() ?? null;
    const scoreMessage = saveBestScore(game.score);
    overlayTitle.textContent = title === "Time's up!" ? "Workout Set Complete!" : title;
    if (stats) {
      overlayMessage.innerHTML = `
        <div class="overlay-score-badge">${scoreMessage}</div>
        <div class="workout-metrics-grid">
          <div class="metric-pill">
            <span class="metric-icon">⚡</span>
            <span class="metric-val">${stats.jumps}</span>
            <span class="metric-label">Jumps</span>
          </div>
          <div class="metric-pill">
            <span class="metric-icon">🎯</span>
            <span class="metric-val">${stats.clutchSaves}</span>
            <span class="metric-label">Clutch</span>
          </div>
          <div class="metric-pill">
            <span class="metric-icon">🔥</span>
            <span class="metric-val">${stats.calories}</span>
            <span class="metric-label">kcal</span>
          </div>
          <div class="metric-pill">
            <span class="metric-icon">🧱</span>
            <span class="metric-val">${stats.bricks}</span>
            <span class="metric-label">Bricks</span>
          </div>
        </div>
        <p class="overlay-countdown-hint">${autoRestart ? message : "Tap Play again for another set."}</p>
      `;
    } else {
      overlayMessage.textContent = `${scoreMessage} ${autoRestart ? message : "Choose Play again to start another round."}`;
    }
    shareScoreStatus.textContent = "";
    shareScoreButton.hidden = game.score <= 0;
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

function setARMode(enabled) {
  const active = Boolean(enabled && poseTracker.isEnabled());
  arModeToggle.checked = active;
  game.setARMode(active);
  gameWrap.classList.toggle("ar-mode", active);
  video.hidden = true;
  posePreview.hidden = !poseTracker.isEnabled();
}

export function isFullscreenActive() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    document.body?.classList?.contains("is-fullscreen")
  );
}

export function syncFullscreenUI(active = isFullscreenActive()) {
  document.body?.classList?.toggle("is-fullscreen", active);
  if (fullscreenButton) {
    fullscreenButton.setAttribute("aria-pressed", String(active));
    const label = fullscreenButton.querySelector(".fs-label") || fullscreenButton;
    label.textContent = active ? "✕ Exit full screen" : "⛶ Full screen";
  }
  if (floatingFullscreenBtn) {
    floatingFullscreenBtn.setAttribute("aria-label", active ? "Exit full screen" : "Toggle full screen");
    floatingFullscreenBtn.setAttribute("title", active ? "Exit full screen (F or Esc)" : "Toggle full screen (F)");
  }
}

export async function enterFullscreen() {
  userExitedFullscreen = false;
  const root = document.documentElement;
  try {
    if (root?.requestFullscreen) {
      await root.requestFullscreen();
    } else if (root?.webkitRequestFullscreen) {
      await root.webkitRequestFullscreen();
    } else if (root?.mozRequestFullScreen) {
      await root.mozRequestFullScreen();
    } else if (root?.msRequestFullscreen) {
      await root.msRequestFullscreen();
    } else {
      document.body?.classList?.add("is-fullscreen");
      syncFullscreenUI(true);
    }
  } catch (error) {
    console.warn("Fullscreen request not granted, falling back to CSS full-window mode:", error);
    document.body?.classList?.add("is-fullscreen");
    syncFullscreenUI(true);
  }
}

export async function exitFullscreen() {
  userExitedFullscreen = true;
  try {
    if (document.exitFullscreen && document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
      await document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen && document.mozFullScreenElement) {
      await document.mozCancelFullScreen();
    } else if (document.msExitFullscreen && document.msFullscreenElement) {
      await document.msExitFullscreen();
    }
  } catch (error) {
    console.warn("Exit fullscreen error:", error);
  } finally {
    document.body?.classList?.remove("is-fullscreen");
    syncFullscreenUI(false);
  }
}

export async function toggleFullscreen() {
  if (isFullscreenActive()) {
    await exitFullscreen();
  } else {
    await enterFullscreen();
  }
}

fullscreenButton?.addEventListener("click", () => {
  void toggleFullscreen();
});

floatingFullscreenBtn?.addEventListener("click", () => {
  void toggleFullscreen();
});

document.addEventListener?.("fullscreenchange", () => syncFullscreenUI());
document.addEventListener?.("webkitfullscreenchange", () => syncFullscreenUI());
document.addEventListener?.("mozfullscreenchange", () => syncFullscreenUI());
document.addEventListener?.("MSFullscreenChange", () => syncFullscreenUI());

arModeToggle.addEventListener("change", () => {
  setARMode(arModeToggle.checked);
  if (arModeToggle.checked && !userExitedFullscreen && !isFullscreenActive()) {
    void enterFullscreen();
  }
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
  canvasWidth: game.width,
  getPaddle: () => game.paddle,
  setTargetPaddleX: (x, leftRatio, rightRatio) => game.setTargetPaddleX(x, leftRatio, rightRatio),
  clearTargetPaddleX: () => game.clearTargetPaddleX(),
  onPostureEnabled: (microphoneStream) => {
    cameraGuide.hidden = true;
    arModeToggle.disabled = false;
    setARMode(true);
    postureButton.textContent = game.gameOver ? "Play again" : "Stop playing";
    postureButton.classList.remove("awaiting-start");
    postureStatus.hidden = true;
    postureStatus.textContent = "Lean to move. Reach out to widen your paddle; jump to smash.";
    if (game.gameOver) {
      game.startAgain({ resetLevel: true });
    } else {
      startRecording(microphoneStream);
      game.startCountdown(CONFIG.game?.countdownSeconds ?? 3);
    }
  },
  onPostureDisabled: () => {
    arModeToggle.disabled = true;
    setARMode(false);
    cameraGuide.hidden = false;
    postureButton.textContent = "Start playing";
    postureButton.classList.add("awaiting-start");
    overlay.hidden = true;
    shareScoreButton.hidden = true;
    roundElement.textContent = "1";
    game.stopPlaying();
  },
  onJumpTriggered: () => {
    game.triggerJump();
  },
});

export function syncOrientation() {
  const currentOrientation = detectOrientation();
  const isPortrait = currentOrientation === "portrait";
  document.body?.classList?.toggle("is-portrait", isPortrait);
  game.setOrientation(currentOrientation);
  poseTracker.setCanvasWidth(game.width);
}

window.addEventListener("resize", () => syncOrientation());
window.addEventListener("orientationchange", () => syncOrientation());
syncOrientation();

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
    game.startAgain({ resetLevel: true });
    return;
  }
  postureStatus.hidden = false;
  if (poseTracker.isEnabled()) {
    stopRecording();
    poseTracker.disable();
    game.stopPlaying();
  } else {
    if (!userExitedFullscreen && !isFullscreenActive()) {
      void enterFullscreen();
    }
    void poseTracker.enable();
  }
});

// Canvas and overlay restart clicks (no paddle steering)
function handleRestartAttempt() {
  audio.ensureAudio(game.gameOver);
  if (game.gameOver && poseTracker.isEnabled()) {
    game.startAgain({ resetLevel: true });
  }
}

canvas.addEventListener("pointerdown", handleRestartAttempt);
overlay.addEventListener("click", (event) => {
  if (event.target === overlay) handleRestartAttempt();
});
overlay.querySelector(".overlay-card")?.addEventListener("pointerdown", () => {
  // Pause automatic restart countdown so player has time to review workout and share
  game.autoRestartTimer = 0;
});

window.addEventListener("pointerdown", () => audio.ensureAudio(game.gameOver), { passive: true });
window.addEventListener("touchstart", () => audio.ensureAudio(game.gameOver), { passive: true });

// Keyboard controls & shortcuts:
// - F: Toggle fullscreen
// - Esc: Exit fullscreen (in fallback mode)
// - ArrowUp / Space / W: Jump smash
window.addEventListener("keydown", (event) => {
  audio.ensureAudio(game.gameOver);
  if ((event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const targetTag = event.target?.tagName?.toLowerCase();
    if (targetTag !== "input" && targetTag !== "textarea") {
      event.preventDefault();
      void toggleFullscreen();
      return;
    }
  }
  if (event.key === "Escape" && document.body?.classList?.contains("is-fullscreen")) {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      void exitFullscreen();
      return;
    }
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "w", "W", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (["ArrowUp", "w", "W"].includes(event.key) && !game.gameOver) {
    game.triggerJump();
  }
  if (event.key === " " && game.gameOver && poseTracker.isEnabled()) {
    game.startAgain({ resetLevel: true });
  } else if (event.key === " " && !game.gameOver) {
    game.triggerJump();
  }
});

// Preload pose detector model in background
poseTracker.preloadModel();

// Animation frame loop
let lastFrameTime = 0;
function frame(now) {
  if (!lastFrameTime) lastFrameTime = now;
  const rawDelta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  // Bound delta to max 100ms (10 FPS) to prevent tab-switch tunneling,
  // but NEVER clamp 30ms-100ms frames to 30ms (which caused 2x-3x slow motion when camera was active!)
  const delta = Math.min(Math.max(rawDelta, 0), 0.1);

  poseTracker.update(now, game.paddle.width);

  // Substep physics when delta > 25ms to maintain identical real-world speed and collision precision
  const maxSubStep = 0.025;
  let remaining = delta;
  while (remaining > 0) {
    const step = Math.min(remaining, maxSubStep);
    game.update(step);
    remaining -= step;
  }

  game.draw();
  requestAnimationFrame(frame);
}

// Initial setup
game.resetBricks();
requestAnimationFrame(frame);
postureStatus.textContent = "Enable posture control and allow camera access to start; microphone access is optional.";
postureButton.classList.add("awaiting-start");
