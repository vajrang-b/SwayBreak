import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BRICK_CONFIG,
  BRICK_COLORS,
  FACE_CONNECTIONS,
  TORSO_CONNECTIONS,
  ARM_CONNECTIONS,
  HAND_CONNECTIONS,
  LEG_CONNECTIONS,
  getActiveConnections,
} from "../js/constants.js";

describe("constants.js", () => {
  it("defines standard canvas dimensions", () => {
    assert.strictEqual(CANVAS_WIDTH, 960);
    assert.strictEqual(CANVAS_HEIGHT, 600);
  });

  it("defines brick configuration accurately", () => {
    assert.strictEqual(BRICK_CONFIG.columns, 9);
    assert.strictEqual(BRICK_CONFIG.rows, 5);
    assert.strictEqual(BRICK_CONFIG.width, 88);
    assert.strictEqual(BRICK_CONFIG.height, 24);
    assert.strictEqual(BRICK_CONFIG.gap, 12);
    assert.strictEqual(BRICK_CONFIG.top, 62);
  });

  it("defines brick colors with matching row count", () => {
    assert.strictEqual(BRICK_COLORS.length, BRICK_CONFIG.rows);
    assert.deepStrictEqual(BRICK_COLORS, [
      "#ff6b8a",
      "#ff9f68",
      "#ffd166",
      "#68d391",
      "#65b9ff",
    ]);
  });

  it("defines anatomical connection sets for skeleton tracking", () => {
    assert.ok(FACE_CONNECTIONS.length > 0);
    assert.ok(TORSO_CONNECTIONS.length > 0);
    assert.ok(ARM_CONNECTIONS.length > 0);
    assert.ok(HAND_CONNECTIONS.length > 0);
    assert.ok(LEG_CONNECTIONS.length > 0);

    // Torso connections should include shoulder and hip landmarks (11, 12, 23, 24)
    assert.deepStrictEqual(TORSO_CONNECTIONS, [
      [11, 12],
      [11, 23],
      [12, 24],
      [23, 24],
    ]);
  });

  describe("getActiveConnections", () => {
    it("returns default connections when no config is passed", () => {
      const active = getActiveConnections({});
      const expectedLength =
        TORSO_CONNECTIONS.length +
        ARM_CONNECTIONS.length +
        HAND_CONNECTIONS.length +
        LEG_CONNECTIONS.length;
      assert.strictEqual(active.length, expectedLength);
      // Face markers should be off by default
      assert.ok(!active.some((conn) => conn[0] === 0 && conn[1] === 1));
    });

    it("includes face connections when showFaceMarkers is true", () => {
      const active = getActiveConnections({ showFaceMarkers: true });
      const expectedLength =
        FACE_CONNECTIONS.length +
        TORSO_CONNECTIONS.length +
        ARM_CONNECTIONS.length +
        HAND_CONNECTIONS.length +
        LEG_CONNECTIONS.length;
      assert.strictEqual(active.length, expectedLength);
      assert.ok(active.some((conn) => conn[0] === 0 && conn[1] === 1));
    });

    it("excludes torso connections when showTorso is false", () => {
      const active = getActiveConnections({ showTorso: false });
      assert.ok(!active.some((conn) => conn[0] === 11 && conn[1] === 12));
    });

    it("excludes arms when showArms is false", () => {
      const active = getActiveConnections({ showArms: false });
      assert.ok(!active.some((conn) => conn[0] === 11 && conn[1] === 13));
    });

    it("excludes hands when showHands is false", () => {
      const active = getActiveConnections({ showHands: false });
      assert.ok(!active.some((conn) => conn[0] === 15 && conn[1] === 17));
    });

    it("excludes legs when showLegs is false", () => {
      const active = getActiveConnections({ showLegs: false });
      assert.ok(!active.some((conn) => conn[0] === 23 && conn[1] === 25));
    });

    it("returns empty array when all sections are disabled", () => {
      const active = getActiveConnections({
        showFaceMarkers: false,
        showTorso: false,
        showArms: false,
        showHands: false,
        showLegs: false,
      });
      assert.strictEqual(active.length, 0);
    });
  });
});
