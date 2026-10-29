import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";

describe("config.js", () => {
  it("contains all expected top-level configuration sections", () => {
    assert.ok(CONFIG.skeleton, "Missing skeleton section");
    assert.ok(CONFIG.armExtension, "Missing armExtension section");
    assert.ok(CONFIG.jump, "Missing jump section");
    assert.ok(CONFIG.game, "Missing game section");
    assert.ok(CONFIG.tracking, "Missing tracking section");
  });

  describe("skeleton config", () => {
    it("has valid visual and visibility thresholds", () => {
      assert.strictEqual(typeof CONFIG.skeleton.showFaceMarkers, "boolean");
      assert.strictEqual(typeof CONFIG.skeleton.showTorso, "boolean");
      assert.strictEqual(typeof CONFIG.skeleton.showArms, "boolean");
      assert.strictEqual(typeof CONFIG.skeleton.showHands, "boolean");
      assert.strictEqual(typeof CONFIG.skeleton.showLegs, "boolean");
      assert.strictEqual(typeof CONFIG.skeleton.showJointDots, "boolean");
      assert.ok(CONFIG.skeleton.minVisibility >= 0 && CONFIG.skeleton.minVisibility <= 1);
      assert.ok(CONFIG.skeleton.lineWidth > 0);
      assert.ok(CONFIG.skeleton.dotRadius > 0);
      assert.ok(CONFIG.skeleton.cameraOverlayAlpha >= 0 && CONFIG.skeleton.cameraOverlayAlpha <= 1);
    });
  });

  describe("armExtension config", () => {
    it("has valid reach threshold and extension limit", () => {
      assert.strictEqual(typeof CONFIG.armExtension.enabled, "boolean");
      assert.ok(CONFIG.armExtension.maxExtensionPerSide > 0);
      assert.ok(CONFIG.armExtension.reachThreshold > 0 && CONFIG.armExtension.reachThreshold < 1);
      assert.strictEqual(typeof CONFIG.armExtension.wingColor, "string");
      assert.ok(CONFIG.armExtension.glowIntensity >= 0);
    });
  });

  describe("jump config", () => {
    it("has valid jump mechanics settings", () => {
      assert.strictEqual(typeof CONFIG.jump.enabled, "boolean");
      assert.ok(CONFIG.jump.minJumpPixels > 0);
      assert.ok(CONFIG.jump.referenceCameraHeight > 0);
      assert.ok(CONFIG.jump.cooldownMs > 0);
      assert.ok(CONFIG.jump.hangTimeTimeoutSec > 0);
      assert.ok(CONFIG.jump.maxJumpOffset > 0);
      assert.ok(CONFIG.jump.jumpDurationSec > 0);
      assert.ok(CONFIG.jump.smashSpeedMultiplier > 1);
      assert.ok(CONFIG.jump.smashBonusPoints > 0);
    });
  });

  describe("game config", () => {
    it("has valid round, paddle, ball, and score rules", () => {
      assert.strictEqual(CONFIG.game.countdownSeconds, 3);
      assert.strictEqual(CONFIG.game.levelTransitionSeconds, 5);
      assert.strictEqual(CONFIG.game.roundDurationSeconds, 90);
      assert.strictEqual(CONFIG.game.clutchSaveBonusPoints, 10);
      assert.strictEqual(CONFIG.game.brickScore, 10);
      assert.deepStrictEqual(CONFIG.game.comboBonuses, {
        3: 10,
        5: 25,
        10: 50,
      });
      assert.ok(CONFIG.game.speedIncreaseEveryBricks > 0);
      assert.ok(CONFIG.game.speedIncreaseMultiplier > 1);
      assert.ok(CONFIG.game.basePaddleWidth > 0);
      assert.ok(CONFIG.game.paddleHeight > 0);
      assert.ok(CONFIG.game.ballRadius > 0);
      assert.ok(CONFIG.game.ballSpeedX > 0);
      assert.ok(CONFIG.game.ballSpeedY < 0);
    });
  });

  describe("tracking config", () => {
    it("has valid throttle and debounce values", () => {
      assert.ok(CONFIG.tracking.inferenceThrottleMs >= 10);
      assert.ok(CONFIG.tracking.droppedFramesDebounce >= 1);
    });
  });
});
