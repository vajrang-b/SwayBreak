/**
 * Master Game & Skeleton Configuration
 * -------------------------------------------------------------
 * All feature toggles, visual styles, and gameplay mechanics
 * are configured here so that updates will preserve your settings.
 */
export const CONFIG = {
  // Skeleton & Camera Preview Settings
  skeleton: {
    // Feature Toggles: Which parts of the skeleton to display
    showFaceMarkers: false,   // Face dots & lines (nose, eyes, mouth, ears)
    showTorso: true,          // Torso box (shoulders to hips, waistline)
    showArms: true,           // Shoulder-to-elbow, elbow-to-wrist
    showHands: true,          // Hand/finger lines (wrist to thumb, index, pinky)
    showLegs: true,           // Hips to knees, knees to feet
    showJointDots: true,      // Draw dots at body joints

    // Confidence / Visibility Filter
    // 0.05 ensures torso (hips) and hands still draw even when near camera or sitting down
    minVisibility: 0.05,

    // Visual Styling
    lineColor: "#5ce1b8",     // Neon teal/green skeleton line color
    lineWidth: 3,             // Skeleton line thickness
    dotColor: "#ffffff",      // White joint dot color
    dotRadius: 3,             // Joint dot radius
    cameraOverlayAlpha: 0.25, // Translucent tint over camera to make skeleton glow
  },

  // Arm Extension Mechanics (Dynamic Paddle Widening)
  armExtension: {
    enabled: true,            // Widen paddle on the side arms are extended
    maxExtensionPerSide: 75,  // Max pixels each side expands (up to +150px total)
    reachThreshold: 0.35,     // Sensitivity for triggering extension
    wingColor: "#5ce1b8",     // Glowing neon color for extended paddle wings
    glowIntensity: 12,        // Shadow blur for wing glow
  },

  // Jump & Smash Mechanics (Plyometric Cardio Boost)
  jump: {
    enabled: true,            // User jumps to move paddle upward
    minJumpPixels: 50,        // Body must move UP by at least this many pixels to count as a jump (increase if small movement triggers it)
    referenceCameraHeight: 480, // Standard reference height for pixel scaling (scales cleanly across webcams)
    cooldownMs: 600,          // Debounce to prevent repeated triggers from one jump
    hangTimeTimeoutSec: 0.85, // If elevated longer than this, auto-recalibrate baseline (fixes lid tilt)
    maxJumpOffset: 65,        // Max pixels the paddle rises on jump
    jumpDurationSec: 0.42,    // Duration of paddle jump arc in seconds
    smashSpeedMultiplier: 1.35, // Speed multiplier on jump hit (smash)
    smashBonusPoints: 30,     // Extra bonus score for smash hit
  },

  // Game Mechanics
  game: {
    countdownSeconds: 3,      // 3-second ready countdown on start & restart
    roundDurationSeconds: 90,
    roundEndDisplaySeconds: 3,
    clutchSaveBonusPoints: 10,
    clutchSaveChargeHits: 1,
    clutchSaveSlowMotionSeconds: 0.3,
    mysteryBrickCount: 3,
    mysterySmashChargeHits: 3,
    basePaddleWidth: 120,     // Default paddle width
    paddleHeight: 14,
    ballRadius: 9,
    ballSpeedX: 230,
    ballSpeedY: -300,
  },

  // Tracking & Performance
  tracking: {
    inferenceThrottleMs: 70,  // Interval between ML frames (~14 FPS) to save battery
    droppedFramesDebounce: 4, // Consecutive misses before warning "No person detected"
  },
};
