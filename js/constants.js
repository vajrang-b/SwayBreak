export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 600;

export const PORTRAIT_CANVAS_WIDTH = 600;
export const PORTRAIT_CANVAS_HEIGHT = 960;

export const BRICK_CONFIG = {
  columns: 9,
  rows: 5,
  width: 88,
  height: 24,
  gap: 12,
  top: 62,
};

export const PORTRAIT_BRICK_CONFIG = {
  columns: 6,
  rows: 6,
  width: 86,
  height: 24,
  gap: 10,
  top: 80,
};

export const BRICK_COLORS = [
  "#ff6b8a",
  "#ff9f68",
  "#ffd166",
  "#68d391",
  "#65b9ff",
];

// Face: Nose, Eyes, Ears, Mouth (indices 0..10)
export const FACE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
];

// Torso: Shoulders, Waist, Chest, Hips (indices 11, 12, 23, 24)
export const TORSO_CONNECTIONS = [
  [11, 12], // Left shoulder to Right shoulder
  [11, 23], // Left shoulder to Left hip
  [12, 24], // Right shoulder to Right hip
  [23, 24], // Left hip to Right hip (waistline)
];

// Arms: Shoulders to Elbows to Wrists (indices 11..16)
export const ARM_CONNECTIONS = [
  [11, 13], [13, 15], // Left arm: shoulder -> elbow -> wrist
  [12, 14], [14, 16], // Right arm: shoulder -> elbow -> wrist
];

// Hands & Fingers: Wrists to Thumb, Index, Pinky (indices 15..22)
export const HAND_CONNECTIONS = [
  [15, 17], [15, 19], [15, 21], [17, 19], // Left hand & knuckles
  [16, 18], [16, 20], [16, 22], [18, 20], // Right hand & knuckles
];

// Legs: Hips to Knees to Ankles & Feet (indices 23..32)
export const LEG_CONNECTIONS = [
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], // Left leg & foot
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], // Right leg & foot
];

/**
 * Filter and assemble active connections based on configuration toggles
 */
export function getActiveConnections(skeletonConfig = {}) {
  const connections = [];
  if (skeletonConfig.showFaceMarkers) {
    connections.push(...FACE_CONNECTIONS);
  }
  if (skeletonConfig.showTorso ?? true) {
    connections.push(...TORSO_CONNECTIONS);
  }
  if (skeletonConfig.showArms ?? true) {
    connections.push(...ARM_CONNECTIONS);
  }
  if (skeletonConfig.showHands ?? true) {
    connections.push(...HAND_CONNECTIONS);
  }
  if (skeletonConfig.showLegs ?? true) {
    connections.push(...LEG_CONNECTIONS);
  }
  return connections;
}
