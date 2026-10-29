import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../js/game.js";
import { CONFIG } from "../js/config.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT, BRICK_CONFIG } from "../js/constants.js";
import { createMockCanvasContext } from "./mocks/browser-env.js";

describe("game.js - Game Engine", () => {
  let mockCanvas;
  let mockAudio;
  let callbacks;
  let game;

  beforeEach(() => {
    mockCanvas = {
      getContext: () => createMockCanvasContext(),
    };
    mockAudio = {
      playPaddleSound: () => {},
      playClutchSaveSound: () => {},
      playWallSound: () => {},
      playBrickSound: () => {},
      playJumpWhooshSound: () => {},
      playSmashSound: () => {},
      playMissSound: () => {},
      playBallReturnSound: () => {},
      playBallCatchSound: () => {},
      playGameEndSound: () => {},
      playUiBlip: () => {},
    };
    callbacks = {
      scoreChanges: [],
      roundTimeChanges: [],
      levelAdvances: [],
      gameOverEvents: [],
      gameRestarts: 0,
      clutchSaves: 0,
      smashes: 0,
    };

    game = new Game({
      canvas: mockCanvas,
      audio: mockAudio,
      onScoreChange: (score) => callbacks.scoreChanges.push(score),
      onRoundTimeChange: (time) => callbacks.roundTimeChanges.push(time),
      onLevelAdvance: (level) => callbacks.levelAdvances.push(level),
      onGameOver: (title, msg, restart) => callbacks.gameOverEvents.push({ title, msg, restart }),
      onGameRestart: () => { callbacks.gameRestarts += 1; },
      onClutchSave: () => { callbacks.clutchSaves += 1; },
      onSmash: () => { callbacks.smashes += 1; },
    });
  });

  describe("initialization", () => {
    it("initializes with default dimensions and state", () => {
      assert.strictEqual(game.width, CANVAS_WIDTH);
      assert.strictEqual(game.height, CANVAS_HEIGHT);
      assert.strictEqual(game.score, 0);
      assert.strictEqual(game.comboStreak, 0);
      assert.strictEqual(game.roundNumber, 1);
      assert.strictEqual(game.gameOver, false);
      assert.strictEqual(game.waitingForPosture, true);
      assert.strictEqual(game.paddle.width, CONFIG.game.basePaddleWidth);
      assert.strictEqual(game.ball.radius, CONFIG.game.ballRadius);
    });
  });

  describe("brick generation & layouts", () => {
    it("generates full rectangular grid on odd rounds", () => {
      game.roundNumber = 1;
      game.resetBricks();
      assert.strictEqual(game.bricks.length, BRICK_CONFIG.columns * BRICK_CONFIG.rows);
      assert.strictEqual(game.bricks.filter((b) => b.visible).length, 45);

      const mysteryCount = game.bricks.filter((b) => b.mystery).length;
      assert.strictEqual(mysteryCount, CONFIG.game.mysteryBrickCount);
    });

    it("generates diamond pattern layout on even rounds", () => {
      game.roundNumber = 2;
      game.resetBricks();
      assert.ok(game.bricks.length < BRICK_CONFIG.columns * BRICK_CONFIG.rows);
      assert.ok(game.bricks.length > 15);
    });
  });

  describe("countdown and ball launch", () => {
    it("positions ball on paddle and starts countdown", () => {
      game.paddle.x = 300;
      game.startCountdown(3, "GET READY");
      assert.strictEqual(game.waitingForPosture, false);
      assert.strictEqual(game.countdown, 3);
      assert.strictEqual(game.countdownLabel, "GET READY");
      assert.strictEqual(game.ball.vx, 0);
      assert.strictEqual(game.ball.vy, 0);
      assert.strictEqual(game.ball.x, game.paddle.x + game.paddle.width / 2);
    });

    it("counts down to zero and launches ball", () => {
      let uiBlipPlayed = 0;
      mockAudio.playUiBlip = () => { uiBlipPlayed += 1; };

      game.startCountdown(1);
      assert.strictEqual(game.countdown, 1);

      // Advance by 1.1s to finish countdown
      game.update(1.1);
      assert.strictEqual(game.countdown, 0);
      assert.notStrictEqual(game.ball.vx, 0);
      assert.notStrictEqual(game.ball.vy, 0);
      assert.ok(uiBlipPlayed >= 1);
    });
  });

  describe("speed progression", () => {
    it("scales ball speed multiplier with bricks cleared", () => {
      assert.strictEqual(game.getSpeedMultiplier(), 1);

      game.bricksCleared = 10;
      assert.ok(Math.abs(game.getSpeedMultiplier() - 1.05) < 1e-4);

      game.bricksCleared = 20;
      assert.ok(Math.abs(game.getSpeedMultiplier() - 1.05 ** 2) < 1e-4);
    });

    it("updates ball velocity dynamically when crossing brick thresholds", () => {
      game.ball.vx = 200;
      game.ball.vy = -300;
      game.speedMultiplier = 1;
      game.bricksCleared = 10;

      game.updateBallSpeedForBrickProgress();
      assert.ok(Math.abs(game.ball.vx - 210) < 1e-3);
      assert.ok(Math.abs(game.ball.vy - -315) < 1e-3);
    });
  });

  describe("paddle controls and movement", () => {
    it("clamps paddle x inside canvas bounds", () => {
      assert.strictEqual(game.clampPaddle(-50), 0);
      assert.strictEqual(game.clampPaddle(CANVAS_WIDTH + 100), CANVAS_WIDTH - game.paddle.width);
      assert.strictEqual(game.clampPaddle(200), 200);
    });

    it("sets target center and arm wing extensions", () => {
      game.setTargetPaddleX(400, 0.5, 0.8);
      assert.strictEqual(game.targetCenterX, 400 + game.basePaddleWidth / 2);
      assert.strictEqual(game.targetLeftExtend, 0.5 * game.maxArmExtension);
      assert.strictEqual(game.targetRightExtend, 0.8 * game.maxArmExtension);

      game.clearTargetPaddleX();
      assert.strictEqual(game.targetCenterX, null);
      assert.strictEqual(game.targetLeftExtend, 0);
      assert.strictEqual(game.targetRightExtend, 0);
    });

    it("smoothly interpolates paddle position and extensions on update", () => {
      game.waitingForPosture = false;
      game.paddle.x = 100;
      game.setTargetPaddleX(500, 1.0, 1.0);

      game.update(0.1);
      assert.ok(game.paddle.x > 100);
      assert.ok(game.paddle.leftExtend > 0);
      assert.ok(game.paddle.rightExtend > 0);
      assert.ok(game.paddle.width > game.basePaddleWidth);
    });

    it("triggers jump arc and particles", () => {
      let whooshPlayed = false;
      mockAudio.playJumpWhooshSound = () => { whooshPlayed = true; };

      game.triggerJump();
      assert.ok(game.jumpTimer > 0);
      assert.strictEqual(whooshPlayed, true);
      assert.ok(game.particles.length > 0);

      game.waitingForPosture = false;
      game.update(0.1);
      assert.ok(game.paddle.jumpOffset > 0);
      assert.ok(game.paddle.y < game.basePaddleY);
    });
  });

  describe("collisions and physics", () => {
    beforeEach(() => {
      game.waitingForPosture = false;
      game.countdown = 0;
      game.resetBricks();
    });

    it("bounces ball off left, right, and top walls", () => {
      let wallSounds = 0;
      mockAudio.playWallSound = () => { wallSounds += 1; };

      // Left wall collision
      game.ball.x = game.ball.radius - 1;
      game.ball.vx = -100;
      game.update(0.01);
      assert.ok(game.ball.vx > 0);

      // Right wall collision
      game.ball.x = game.width - game.ball.radius + 1;
      game.ball.vx = 100;
      game.update(0.01);
      assert.ok(game.ball.vx < 0);

      // Top wall collision
      game.ball.y = game.ball.radius - 1;
      game.ball.vy = -100;
      game.update(0.01);
      assert.ok(game.ball.vy > 0);

      assert.strictEqual(wallSounds, 3);
    });

    it("bounces ball normally on standard paddle collision", () => {
      let paddleSoundPlayed = false;
      mockAudio.playPaddleSound = () => { paddleSoundPlayed = true; };

      game.ball.x = game.paddle.x + game.paddle.width / 2;
      game.ball.y = game.paddle.y - game.ball.radius + 1;
      game.ball.vy = 200;

      game.update(0.01);
      assert.ok(game.ball.vy < 0);
      assert.strictEqual(paddleSoundPlayed, true);
      assert.strictEqual(game.ball.isPowerBall, false);
    });

    it("triggers clutch save when ball hits extended paddle wings", () => {
      let clutchSoundPlayed = false;
      mockAudio.playClutchSaveSound = () => { clutchSoundPlayed = true; };

      game.paddle.leftExtend = 50;
      game.paddle.width = game.basePaddleWidth + 50;
      // Position ball on left wing outside base core
      game.ball.x = game.paddle.x - 2;
      game.ball.y = game.paddle.y - game.ball.radius + 1;
      game.ball.vy = 250;

      const initialScore = game.score;
      game.update(0.01);

      assert.strictEqual(callbacks.clutchSaves, 1);
      assert.strictEqual(clutchSoundPlayed, true);
      assert.strictEqual(game.score, initialScore + CONFIG.game.clutchSaveBonusPoints);
      assert.strictEqual(game.ball.isPowerBall, true);
      assert.ok(game.slowMotionRemaining > 0);
      assert.ok(game.floatingTexts.some((ft) => ft.text.includes("CLUTCH SAVE")));
    });

    it("triggers smash hit when ball hits while jumping", () => {
      let smashSoundPlayed = false;
      mockAudio.playSmashSound = () => { smashSoundPlayed = true; };

      // Simulate jumping paddle
      game.paddle.jumpOffset = 25;
      game.paddle.y = game.basePaddleY - 25;
      game.ball.x = game.paddle.x + game.paddle.width / 2;
      game.ball.y = game.paddle.y - game.ball.radius + 1;
      game.ball.vy = 250;

      const initialScore = game.score;
      game.update(0.01);

      assert.strictEqual(callbacks.smashes, 1);
      assert.strictEqual(smashSoundPlayed, true);
      assert.strictEqual(game.score, initialScore + CONFIG.jump.smashBonusPoints);
      assert.strictEqual(game.ball.isPowerBall, true);
      assert.strictEqual(game.ball.powerHitsRemaining, 3);
      assert.ok(game.floatingTexts.some((ft) => ft.text.includes("SMASH!")));
    });

    it("destroys bricks and increases combo streak on brick collision", () => {
      const targetBrick = game.bricks.find((b) => b.visible && !b.mystery);
      targetBrick.mystery = false;
      game.ball.x = targetBrick.x + targetBrick.width / 2;
      game.ball.y = targetBrick.y + targetBrick.height / 2;
      game.ball.vy = -200;

      const initialScore = game.score;
      game.update(0.01);

      assert.strictEqual(targetBrick.visible, false);
      assert.strictEqual(game.comboStreak, 1);
      assert.strictEqual(game.score, initialScore + CONFIG.game.brickScore);
      assert.ok(game.ball.vy > 0); // Bounced downward
    });

    it("awards combo streak bonus at 3 consecutive brick hits", () => {
      game.comboStreak = 2;
      const targetBrick = game.bricks.find((b) => b.visible && !b.mystery);
      game.ball.x = targetBrick.x + targetBrick.width / 2;
      game.ball.y = targetBrick.y + targetBrick.height / 2;
      game.ball.vy = -200;

      const initialScore = game.score;
      game.update(0.01);

      assert.strictEqual(game.comboStreak, 3);
      const expectedScore = initialScore + CONFIG.game.brickScore + CONFIG.game.comboBonuses[3];
      assert.strictEqual(game.score, expectedScore);
      assert.ok(game.floatingTexts.some((ft) => ft.text.includes("COMBO x3")));
    });

    it("charges power ball when hitting a mystery brick", () => {
      const mysteryBrick = game.bricks.find((b) => b.mystery);
      game.ball.x = mysteryBrick.x + mysteryBrick.width / 2;
      game.ball.y = mysteryBrick.y + mysteryBrick.height / 2;
      game.ball.vy = -200;

      game.update(0.01);
      assert.strictEqual(mysteryBrick.visible, false);
      assert.strictEqual(game.ball.isPowerBall, true);
      assert.strictEqual(game.ball.powerHitsRemaining, CONFIG.game.mysterySmashChargeHits);
      assert.ok(game.floatingTexts.some((ft) => ft.text.includes("SMASH CHARGE!")));
    });

    it("pierces through bricks without bouncing when power ball is active", () => {
      game.ball.isPowerBall = true;
      game.ball.powerHitsRemaining = 2;
      const targetBrick = game.bricks.find((b) => b.visible && !b.mystery);
      game.ball.x = targetBrick.x + targetBrick.width / 2;
      game.ball.y = targetBrick.y + targetBrick.height / 2;
      game.ball.vy = -250;

      game.update(0.01);
      assert.strictEqual(targetBrick.visible, false);
      assert.strictEqual(game.ball.powerHitsRemaining, 1);
      assert.strictEqual(game.ball.isPowerBall, true);
      assert.strictEqual(game.ball.vy, -250); // Did NOT bounce! Penetrated forward!
    });

    it("handles ball drop miss with explosion and return sequence", () => {
      let missSoundPlayed = false;
      mockAudio.playMissSound = () => { missSoundPlayed = true; };

      game.comboStreak = 5;
      game.ball.x = 400;
      game.ball.y = game.height + game.ball.radius + 10; // Dropped below screen

      game.update(0.01);
      assert.strictEqual(game.comboStreak, 0);
      assert.strictEqual(game.ball.isPowerBall, false);
      assert.strictEqual(missSoundPlayed, true);
      assert.ok(game.ballReturn);
      assert.ok(game.explosionEffect);
    });
  });

  describe("level progression and game over", () => {
    beforeEach(() => {
      game.waitingForPosture = false;
      game.countdown = 0;
      game.resetBricks();
    });

    it("advances to next level when all bricks are cleared", () => {
      let gameEndSoundPlayed = false;
      mockAudio.playGameEndSound = () => { gameEndSoundPlayed = true; };

      // Clear every brick
      for (const brick of game.bricks) {
        brick.visible = false;
      }

      game.update(0.01);
      assert.strictEqual(gameEndSoundPlayed, true);
      assert.strictEqual(game.roundNumber, 2);
      assert.strictEqual(callbacks.levelAdvances.length, 1);
      assert.strictEqual(callbacks.levelAdvances[0], 2);
      assert.strictEqual(game.countdown, CONFIG.game.levelTransitionSeconds);
      assert.strictEqual(game.countdownLabel, "LEVEL 2 READY");
    });

    it("ends game when round time runs out", () => {
      game.roundTimeRemaining = 0.5;
      game.update(0.6);

      assert.strictEqual(game.gameOver, true);
      assert.strictEqual(callbacks.gameOverEvents.length, 1);
      assert.strictEqual(callbacks.gameOverEvents[0].title, "Time's up!");
      assert.strictEqual(callbacks.gameOverEvents[0].restart, true);
    });

    it("auto-restarts game after round end display timer expires", () => {
      game.finish("Time's up!", "Score: 100", true);
      assert.strictEqual(game.gameOver, true);
      assert.ok(game.autoRestartTimer > 0);

      // Advance past autoRestartTimer
      game.update(CONFIG.game.roundEndDisplaySeconds + 0.1);
      assert.strictEqual(game.gameOver, false);
      assert.strictEqual(callbacks.gameRestarts, 1);
      assert.strictEqual(game.score, 0);
    });
  });

  describe("rendering and visual helpers", () => {
    it("draws canvas elements without throwing exceptions across states", () => {
      game.waitingForPosture = true;
      assert.doesNotThrow(() => game.draw());

      game.waitingForPosture = false;
      game.startCountdown(2);
      assert.doesNotThrow(() => game.draw());

      game.countdown = 0;
      game.countdownGoTimer = 0.5;
      assert.doesNotThrow(() => game.draw());

      game.ball.isPowerBall = true;
      game.paddle.jumpOffset = 20;
      game.paddle.leftExtend = 30;
      game.paddle.rightExtend = 30;
      game.addFloatingText("TEST", 200, 200);
      assert.doesNotThrow(() => game.draw());
    });

    it("lightens hex colors accurately for 3D brick gradients", () => {
      const original = "#ff0000";
      const lightened = game.lightenColor(original);
      assert.ok(lightened.startsWith("#"));
      assert.notStrictEqual(lightened, original);

      // Falls back safely for non-matching strings
      assert.strictEqual(game.lightenColor("invalid"), "invalid");
    });
  });
});
