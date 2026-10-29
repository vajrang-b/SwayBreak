import { CANVAS_WIDTH, CANVAS_HEIGHT, BRICK_CONFIG, BRICK_COLORS } from "./constants.js?v=12";
import { CONFIG } from "./config.js?v=15";

export class Game {
  constructor({
    canvas,
    audio,
    onScoreChange,
    onRoundTimeChange,
    onGameOver,
    onGameRestart,
    onClutchSave,
    onSmash,
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.audio = audio;
    this.onScoreChange = onScoreChange;
    this.onRoundTimeChange = onRoundTimeChange;
    this.onGameOver = onGameOver;
    this.onGameRestart = onGameRestart;
    this.onClutchSave = onClutchSave;
    this.onSmash = onSmash;

    this.width = CANVAS_WIDTH;
    this.height = CANVAS_HEIGHT;

    this.basePaddleWidth = CONFIG.game?.basePaddleWidth ?? 120;
    this.maxArmExtension = CONFIG.armExtension?.maxExtensionPerSide ?? 75;
    this.basePaddleY = this.height - 42;
    this.paddle = {
      x: this.width / 2 - this.basePaddleWidth / 2,
      y: this.basePaddleY,
      width: this.basePaddleWidth,
      height: CONFIG.game?.paddleHeight ?? 14,
      leftExtend: 0,
      rightExtend: 0,
      jumpOffset: 0,
    };
    this.targetCenterX = this.width / 2;
    this.targetLeftExtend = 0;
    this.targetRightExtend = 0;
    this.jumpTimer = 0;
    this.totalJumpDuration = CONFIG.jump?.jumpDurationSec ?? 0.42;
    this.particles = [];
    this.floatingTexts = [];
    this.ball = {
      x: this.width / 2,
      y: this.height - 65,
      radius: CONFIG.game?.ballRadius ?? 9,
      vx: CONFIG.game?.ballSpeedX ?? 230,
      vy: CONFIG.game?.ballSpeedY ?? -300,
      isPowerBall: false,
      powerHitsRemaining: 0,
      trail: [],
    };
    this.bricks = [];
    this.score = 0;
    this.comboStreak = 0;
    this.gameOver = false;
    this.roundTimeRemaining = CONFIG.game?.roundDurationSeconds ?? 90;
    this.lastDisplayedRoundSecond = null;
    this.autoRestartTimer = 0;
    this.countdown = CONFIG.game?.countdownSeconds ?? 3;
    this.countdownGoTimer = 0;
    this.countdownBeeped = {};
    this.slowMotionRemaining = 0;
    this.clutchFlashTimer = 0;
    this.updateRoundTimeDisplay();
  }

  updateRoundTimeDisplay() {
    const displayedSeconds = Math.ceil(this.roundTimeRemaining);
    if (displayedSeconds === this.lastDisplayedRoundSecond) return;
    this.lastDisplayedRoundSecond = displayedSeconds;
    this.onRoundTimeChange?.(displayedSeconds);
  }

  resetBricks() {
    this.bricks = [];
    const totalWidth = BRICK_CONFIG.columns * BRICK_CONFIG.width
      + (BRICK_CONFIG.columns - 1) * BRICK_CONFIG.gap;
    const left = (this.width - totalWidth) / 2;

    for (let row = 0; row < BRICK_CONFIG.rows; row += 1) {
      for (let column = 0; column < BRICK_CONFIG.columns; column += 1) {
        this.bricks.push({
          x: left + column * (BRICK_CONFIG.width + BRICK_CONFIG.gap),
          y: BRICK_CONFIG.top + row * (BRICK_CONFIG.height + BRICK_CONFIG.gap),
          width: BRICK_CONFIG.width,
          height: BRICK_CONFIG.height,
          color: BRICK_COLORS[row],
          row,
          visible: true,
          mystery: false,
        });
      }
    }

    const mysteryCount = Math.min(CONFIG.game?.mysteryBrickCount ?? 3, this.bricks.length);
    const mysteryIndices = new Set();
    while (mysteryIndices.size < mysteryCount) {
      mysteryIndices.add(Math.floor(Math.random() * this.bricks.length));
    }
    for (const index of mysteryIndices) {
      this.bricks[index].mystery = true;
    }
  }

  startCountdown(seconds = 3) {
    this.countdown = seconds;
    this.countdownGoTimer = 0;
    this.countdownBeeped = {};
    this.ball.isPowerBall = false;
    this.ball.powerHitsRemaining = 0;
    this.ball.trail = [];
    this.ball.x = this.paddle.x + this.paddle.width / 2;
    this.ball.y = this.paddle.y - this.ball.radius - 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  launchBall() {
    this.ball.vx = 230 * (Math.random() < 0.5 ? -1 : 1);
    this.ball.vy = -300;
  }

  resetBall() {
    this.startCountdown(2);
  }

  startAgain() {
    this.score = 0;
    this.comboStreak = 0;
    this.gameOver = false;
    this.roundTimeRemaining = CONFIG.game?.roundDurationSeconds ?? 90;
    this.lastDisplayedRoundSecond = null;
    this.autoRestartTimer = 0;
    this.paddle.leftExtend = 0;
    this.paddle.rightExtend = 0;
    this.paddle.jumpOffset = 0;
    this.jumpTimer = 0;
    this.slowMotionRemaining = 0;
    this.clutchFlashTimer = 0;
    this.targetLeftExtend = 0;
    this.targetRightExtend = 0;
    this.paddle.width = this.basePaddleWidth;
    this.paddle.x = this.width / 2 - this.basePaddleWidth / 2;
    this.paddle.y = this.basePaddleY;
    this.targetCenterX = this.width / 2;
    this.particles = [];
    this.floatingTexts = [];
    this.ball.isPowerBall = false;
    this.ball.powerHitsRemaining = 0;
    this.ball.trail = [];
    this.resetBricks();
    this.startCountdown(CONFIG.game?.countdownSeconds ?? 3);
    this.onScoreChange?.(this.score);
    this.updateRoundTimeDisplay();
    this.onGameRestart?.();
  }

  triggerJump() {
    if (this.gameOver) return;
    const jumpCfg = CONFIG.jump;
    if (!jumpCfg?.enabled) return;

    this.totalJumpDuration = jumpCfg.jumpDurationSec ?? 0.42;
    this.jumpTimer = this.totalJumpDuration;
    this.audio.playJumpWhooshSound?.();

    // Spawn downward thruster particles from under the paddle
    const particleCount = 12;
    const paddleLeft = this.paddle.x;
    const paddleW = this.paddle.width;
    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: paddleLeft + Math.random() * paddleW,
        y: this.paddle.y + this.paddle.height + Math.random() * 4,
        vx: (Math.random() - 0.5) * 70,
        vy: 90 + Math.random() * 110,
        life: 0.35 + Math.random() * 0.15,
        maxLife: 0.5,
        color: Math.random() < 0.6 ? "#5ce1b8" : "#8b7bff",
        size: 3 + Math.random() * 2.5,
      });
    }
  }

  addFloatingText(text, x, y, color = "#ffdd44") {
    this.floatingTexts.push({
      text,
      x,
      y,
      vy: -55,
      life: 0.85,
      maxLife: 0.85,
      color,
    });
  }

  spawnSmashParticles(x, y) {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 180;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.25,
        maxLife: 0.65,
        color: Math.random() < 0.5 ? "#ffdd44" : "#ff5588",
        size: 3 + Math.random() * 3.5,
      });
    }
  }

  spawnClutchParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const speed = 65 + Math.random() * 55;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.28 + Math.random() * 0.12,
        maxLife: 0.4,
        color: i % 2 === 0 ? "#ffdd44" : "#ffffff",
        size: 2.5 + Math.random() * 2,
      });
    }
  }

  finish(title, message, autoRestart = false) {
    this.gameOver = true;
    this.autoRestartTimer = autoRestart
      ? CONFIG.game?.roundEndDisplaySeconds ?? 3
      : 0;
    this.onGameOver?.(title, message, autoRestart);
  }

  clampPaddle(x) {
    return Math.max(0, Math.min(this.width - this.paddle.width, x));
  }

  setTargetPaddleX(x, leftRatio = 0, rightRatio = 0) {
    this.targetCenterX = x + this.basePaddleWidth / 2;
    this.targetLeftExtend = Math.max(0, Math.min(1, leftRatio)) * this.maxArmExtension;
    this.targetRightExtend = Math.max(0, Math.min(1, rightRatio)) * this.maxArmExtension;
  }

  clearTargetPaddleX() {
    this.targetCenterX = null;
    this.targetLeftExtend = 0;
    this.targetRightExtend = 0;
  }

  update(delta) {
    if (this.gameOver) {
      if (this.autoRestartTimer > 0) {
        this.autoRestartTimer -= delta;
        if (this.autoRestartTimer <= 0) {
          this.startAgain();
        }
      }
      return;
    }

    const realDelta = delta;
    if (this.slowMotionRemaining > 0) {
      const slowedDuration = Math.min(realDelta, this.slowMotionRemaining);
      this.slowMotionRemaining -= slowedDuration;
      delta -= slowedDuration * 0.5;
    }
    this.clutchFlashTimer = Math.max(0, this.clutchFlashTimer - realDelta);

    // Smooth paddle positioning and arm extensions
    const posAmount = 1 - Math.exp(-delta * 18);
    const extendAmount = 1 - Math.exp(-delta * 14);

    this.paddle.leftExtend += (this.targetLeftExtend - this.paddle.leftExtend) * extendAmount;
    this.paddle.rightExtend += (this.targetRightExtend - this.paddle.rightExtend) * extendAmount;

    const baseHalfWidth = this.basePaddleWidth / 2;
    const currentWidth = this.basePaddleWidth + this.paddle.leftExtend + this.paddle.rightExtend;
    this.paddle.width = currentWidth;

    if (this.targetCenterX !== null) {
      const targetX = this.targetCenterX - baseHalfWidth - this.paddle.leftExtend;
      const clampedTargetX = Math.max(0, Math.min(this.width - currentWidth, targetX));
      this.paddle.x += (clampedTargetX - this.paddle.x) * posAmount;
    }

    // Vertical Jump Arc
    const maxOffset = CONFIG.jump?.maxJumpOffset ?? 65;
    if (this.jumpTimer > 0) {
      this.jumpTimer -= delta;
      const progress = Math.max(0, 1 - (this.jumpTimer / this.totalJumpDuration));
      this.paddle.jumpOffset = Math.sin(progress * Math.PI) * maxOffset;
      if (this.jumpTimer <= 0) {
        this.paddle.jumpOffset = 0;
      }
    } else {
      this.paddle.jumpOffset = 0;
    }
    this.paddle.y = this.basePaddleY - this.paddle.jumpOffset;

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.life -= delta;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update Floating Text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * delta;
      ft.life -= delta;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Power Ball trail
    if (this.ball.isPowerBall) {
      this.ball.trail.push({ x: this.ball.x, y: this.ball.y, life: 0.22 });
      if (this.ball.trail.length > 8) this.ball.trail.shift();
      for (const t of this.ball.trail) {
        t.life -= delta;
      }
      this.ball.trail = this.ball.trail.filter(t => t.life > 0);
    } else {
      this.ball.trail = [];
    }

    if (this.countdown > 0) {
      this.ball.x = this.paddle.x + this.paddle.width / 2;
      this.ball.y = this.paddle.y - this.ball.radius - 2;

      const currentSec = Math.ceil(this.countdown);
      if (!this.countdownBeeped[currentSec] && currentSec >= 1 && currentSec <= 3) {
        this.countdownBeeped[currentSec] = true;
        this.audio.playUiBlip?.(520);
      }

      this.countdown -= delta;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.countdownGoTimer = 0.6;
        this.audio.playUiBlip?.(880);
        this.launchBall();
      }
      return;
    }

    if (this.countdownGoTimer > 0) {
      this.countdownGoTimer -= delta;
    }

    this.roundTimeRemaining = Math.max(0, this.roundTimeRemaining - delta);
    this.updateRoundTimeDisplay();
    if (this.roundTimeRemaining === 0) {
      this.finish(
        "Time's up!",
        `Your score: ${this.score}. Starting a new round...`,
        true,
      );
      return;
    }

    this.ball.x += this.ball.vx * delta;
    this.ball.y += this.ball.vy * delta;

    if (this.ball.x - this.ball.radius <= 0) {
      this.ball.x = this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx);
      this.audio.playWallSound(-0.85);
    } else if (this.ball.x + this.ball.radius >= this.width) {
      this.ball.x = this.width - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx);
      this.audio.playWallSound(0.85);
    }

    if (this.ball.y - this.ball.radius <= 0) {
      this.ball.y = this.ball.radius;
      this.ball.vy = Math.abs(this.ball.vy);
      this.audio.playWallSound(((this.ball.x / this.width) * 1.5) - 0.75);
    }

    // Paddle Hit Collision
    if (
      this.ball.vy > 0
      && this.ball.y + this.ball.radius >= this.paddle.y
      && this.ball.y - this.ball.radius <= this.paddle.y + this.paddle.height
      && this.ball.x + this.ball.radius >= this.paddle.x
      && this.ball.x - this.ball.radius <= this.paddle.x + this.paddle.width
    ) {
      const hitPosition = Math.max(-1, Math.min(1, (this.ball.x - (this.paddle.x + this.paddle.width / 2)) / (this.paddle.width / 2)));
      this.ball.vx = hitPosition * 390;

      const isClutchSave = this.ball.x < this.paddle.x
        || this.ball.x > this.paddle.x + this.paddle.width;
      const isJumping = this.paddle.jumpOffset > 8;
      if (isClutchSave && !isJumping) {
        this.ball.vy = -Math.max(260, Math.abs(this.ball.vy));
        const chargeCap = CONFIG.game?.mysterySmashChargeHits ?? 3;
        const chargeGain = CONFIG.game?.clutchSaveChargeHits ?? 1;
        this.ball.powerHitsRemaining = Math.min(
          chargeCap,
          (this.ball.isPowerBall ? this.ball.powerHitsRemaining : 0) + chargeGain,
        );
        this.ball.isPowerBall = this.ball.powerHitsRemaining > 0;

        const bonus = CONFIG.game?.clutchSaveBonusPoints ?? 10;
        this.score += bonus;
        this.onScoreChange?.(this.score);
        this.addFloatingText(`CLUTCH SAVE +${bonus}`, this.ball.x, this.paddle.y - 25, "#ffdd44");
        this.slowMotionRemaining = CONFIG.game?.clutchSaveSlowMotionSeconds ?? 0.3;
        this.clutchFlashTimer = this.slowMotionRemaining;
        this.audio.playClutchSaveSound?.(((this.ball.x / this.width) * 1.5) - 0.75);
        this.spawnClutchParticles(this.ball.x, this.paddle.y);
        this.onClutchSave?.();
      } else if (isJumping) {
        // SMASH HIT!
        const smashMult = CONFIG.jump?.smashSpeedMultiplier ?? 1.35;
        this.ball.vy = -Math.max(340, Math.abs(this.ball.vy) * smashMult);
        this.ball.isPowerBall = true;
        this.ball.powerHitsRemaining = 3;
        const bonus = CONFIG.jump?.smashBonusPoints ?? 30;
        this.score += bonus;
        this.onScoreChange?.(this.score);
        this.addFloatingText(`SMASH! +${bonus}`, this.ball.x, this.paddle.y - 25, "#ffdd44");
        this.audio.playSmashSound?.(((this.ball.x / this.width) * 1.5) - 0.75);
        this.spawnSmashParticles(this.ball.x, this.paddle.y);
        this.onSmash?.();
      } else {
        this.ball.vy = -Math.max(260, Math.abs(this.ball.vy));
        this.ball.isPowerBall = false;
        this.audio.playPaddleSound(this.ball, this.paddle);
      }
      this.ball.y = this.paddle.y - this.ball.radius;
    }

    // Brick Collisions
    for (const brick of this.bricks) {
      if (
        brick.visible
        && this.ball.x + this.ball.radius >= brick.x
        && this.ball.x - this.ball.radius <= brick.x + brick.width
        && this.ball.y + this.ball.radius >= brick.y
        && this.ball.y - this.ball.radius <= brick.y + brick.height
      ) {
        brick.visible = false;
        this.score += 10;
        this.comboStreak += 1;
        this.onScoreChange?.(this.score);
        this.audio.playBrickSound(brick, this.comboStreak, this.width);

        if (brick.mystery) {
          const chargeHits = CONFIG.game?.mysterySmashChargeHits ?? 3;
          this.ball.vy = -Math.abs(this.ball.vy);
          this.ball.isPowerBall = true;
          this.ball.powerHitsRemaining = chargeHits;
          this.addFloatingText(`SMASH CHARGE! +${chargeHits} PIERCE`, brick.x + brick.width / 2, brick.y, "#5ce1b8");
          this.spawnSmashParticles(brick.x + brick.width / 2, brick.y + brick.height / 2);
          break;
        } else if (this.ball.isPowerBall && this.ball.powerHitsRemaining > 0) {
          // Smash penetrates through brick without bouncing!
          this.ball.powerHitsRemaining -= 1;
          this.spawnSmashParticles(brick.x + brick.width / 2, brick.y + brick.height / 2);
          this.addFloatingText("+10 PIERCE!", brick.x + brick.width / 2, brick.y, "#5ce1b8");
          if (this.ball.powerHitsRemaining <= 0) {
            this.ball.isPowerBall = false;
          }
        } else {
          this.ball.vy *= -1;
          this.ball.isPowerBall = false;
          break;
        }
      }
    }

    if (this.bricks.every(brick => !brick.visible)) {
      this.audio.playGameEndSound();
      this.finish("You win!", `You cleared every brick with a score of ${this.score}.`);
    } else if (this.ball.y - this.ball.radius > this.height) {
      this.comboStreak = 0;
      this.ball.isPowerBall = false;
      this.audio.playMissSound();
      this.resetBall();
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = "#171f31";
    this.ctx.fillRect(0, 0, this.width, this.height);

    for (const brick of this.bricks) {
      if (!brick.visible) continue;
      this.ctx.fillStyle = brick.mystery ? "#8b7bff" : brick.color;
      this.ctx.beginPath();
      this.ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 6);
      this.ctx.fill();
      if (brick.mystery) {
        this.ctx.save();
        this.ctx.fillStyle = "#fff";
        this.ctx.font = "bold 18px system-ui, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("?", brick.x + brick.width / 2, brick.y + brick.height / 2);
        this.ctx.restore();
      }
    }

    // Draw Particles
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // Draw paddle with extended wings
    const coreX = this.paddle.x + this.paddle.leftExtend;
    const coreW = this.basePaddleWidth;

    // Thruster Flames when jumping
    if (this.paddle.jumpOffset > 2) {
      this.ctx.save();
      const flameHeight = Math.min(24, this.paddle.jumpOffset * 0.4 + 8);
      this.ctx.fillStyle = "#5ce1b8";
      this.ctx.shadowColor = "#5ce1b8";
      this.ctx.shadowBlur = 14;

      // Left thruster
      this.ctx.beginPath();
      this.ctx.moveTo(coreX + 16, this.paddle.y + this.paddle.height);
      this.ctx.lineTo(coreX + 26, this.paddle.y + this.paddle.height);
      this.ctx.lineTo(coreX + 21, this.paddle.y + this.paddle.height + flameHeight);
      this.ctx.closePath();
      this.ctx.fill();

      // Right thruster
      this.ctx.beginPath();
      this.ctx.moveTo(coreX + coreW - 26, this.paddle.y + this.paddle.height);
      this.ctx.lineTo(coreX + coreW - 16, this.paddle.y + this.paddle.height);
      this.ctx.lineTo(coreX + coreW - 21, this.paddle.y + this.paddle.height + flameHeight);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.restore();
    }

    // Left extended wing (neon green/cyan)
    if (this.paddle.leftExtend > 2) {
      this.ctx.save();
      this.ctx.fillStyle = this.clutchFlashTimer > 0 ? "#fff2a8" : "#5ce1b8";
      this.ctx.shadowColor = this.clutchFlashTimer > 0 ? "#ffdd44" : "#5ce1b8aa";
      this.ctx.shadowBlur = this.clutchFlashTimer > 0 ? 26 : 12;
      this.ctx.beginPath();
      this.ctx.roundRect(this.paddle.x, this.paddle.y - 1, this.paddle.leftExtend + 8, this.paddle.height + 2, 6);
      this.ctx.fill();
      this.ctx.restore();
    }

    // Right extended wing (neon green/cyan)
    if (this.paddle.rightExtend > 2) {
      this.ctx.save();
      this.ctx.fillStyle = this.clutchFlashTimer > 0 ? "#fff2a8" : "#5ce1b8";
      this.ctx.shadowColor = this.clutchFlashTimer > 0 ? "#ffdd44" : "#5ce1b8aa";
      this.ctx.shadowBlur = this.clutchFlashTimer > 0 ? 26 : 12;
      this.ctx.beginPath();
      this.ctx.roundRect(this.paddle.x + this.paddle.width - this.paddle.rightExtend - 8, this.paddle.y - 1, this.paddle.rightExtend + 8, this.paddle.height + 2, 6);
      this.ctx.fill();
      this.ctx.restore();
    }

    // Core paddle (flashes gold on clutch saves)
    this.ctx.save();
    if (this.clutchFlashTimer > 0) {
      this.ctx.fillStyle = "#fff2a8";
      this.ctx.shadowColor = "#ffdd44";
      this.ctx.shadowBlur = 26;
    } else if (this.paddle.jumpOffset > 5) {
      this.ctx.fillStyle = "#ffdd44";
      this.ctx.shadowColor = "#ffdd44cc";
      this.ctx.shadowBlur = 16;
    } else {
      this.ctx.fillStyle = "#a59aff";
    }
    this.ctx.beginPath();
    this.ctx.roundRect(coreX, this.paddle.y, coreW, this.paddle.height, 7);
    this.ctx.fill();
    this.ctx.restore();

    // Draw Ball & Trails
    if (this.ball.isPowerBall) {
      // Fire/Plasma trail
      for (let i = 0; i < this.ball.trail.length; i++) {
        const t = this.ball.trail[i];
        const progress = (i + 1) / this.ball.trail.length;
        this.ctx.save();
        this.ctx.globalAlpha = progress * 0.45;
        this.ctx.fillStyle = "#ffdd44";
        this.ctx.shadowColor = "#ffaa00";
        this.ctx.shadowBlur = 10;
        this.ctx.beginPath();
        this.ctx.arc(t.x, t.y, this.ball.radius * progress * 0.9, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }

      // Glowing power-up emoji
      this.ctx.save();
      this.ctx.shadowColor = "#ffdd44";
      this.ctx.shadowBlur = 20;
      this.ctx.font = '32px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("🔥", this.ball.x, this.ball.y);
      this.ctx.restore();
    } else {
      this.ctx.save();
      this.ctx.font = '28px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("🏀", this.ball.x, this.ball.y);
      this.ctx.restore();
    }

    // Draw Floating Text
    for (const ft of this.floatingTexts) {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.font = "900 20px system-ui, sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillStyle = ft.color;
      this.ctx.shadowColor = ft.color;
      this.ctx.shadowBlur = 12;
      this.ctx.fillText(ft.text, ft.x, ft.y);
      this.ctx.restore();
    }

    // Draw countdown overlay if active
    if (this.countdown > 0) {
      const currentSec = Math.ceil(this.countdown);
      const secProgress = this.countdown - Math.floor(this.countdown);
      const scale = 1 + secProgress * 0.25;

      this.ctx.save();
      this.ctx.fillStyle = "rgba(16, 21, 34, 0.45)";
      this.ctx.fillRect(0, 0, this.width, this.height);

      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";

      this.ctx.font = "700 24px system-ui, sans-serif";
      this.ctx.fillStyle = "#a59aff";
      this.ctx.fillText("GET READY", this.width / 2, this.height / 2 - 80);

      this.ctx.font = `900 ${Math.round(110 * scale)}px system-ui, sans-serif`;
      this.ctx.fillStyle = "#5ce1b8";
      this.ctx.shadowColor = "#5ce1b888";
      this.ctx.shadowBlur = 24;
      this.ctx.fillText(String(currentSec), this.width / 2, this.height / 2 + 10);

      this.ctx.font = "600 17px system-ui, sans-serif";
      this.ctx.fillStyle = "#c8d0e8";
      this.ctx.shadowBlur = 0;
      this.ctx.fillText("Lean to steer • Extend arms to widen • JUMP to smash!", this.width / 2, this.height / 2 + 100);

      this.ctx.restore();
    } else if (this.countdownGoTimer > 0) {
      this.ctx.save();
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.font = "900 110px system-ui, sans-serif";
      this.ctx.fillStyle = "#5ce1b8";
      this.ctx.shadowColor = "#5ce1b8aa";
      this.ctx.shadowBlur = 30;
      this.ctx.fillText("GO!", this.width / 2, this.height / 2);
      this.ctx.restore();
    }
  }
}
