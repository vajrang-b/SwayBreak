import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

describe("main.js - High score and challenge logic", () => {
  const BEST_SCORE_KEY = "swaybreak-best-score";

  function createScoreManager() {
    let bestScore = 0;
    let hasSavedBestScore = false;

    const savedBestScore = localStorage.getItem(BEST_SCORE_KEY);
    if (savedBestScore !== null) {
      const parsedScore = Number(savedBestScore);
      if (Number.isFinite(parsedScore) && parsedScore >= 0) {
        bestScore = parsedScore;
        hasSavedBestScore = true;
      }
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
      }
      if (isNewBest) return `New personal best: ${score}!`;
      if (score === bestScore) return `You matched your best score of ${bestScore}.`;
      return `You scored ${score}. Your best is ${bestScore}. ${bestScore - score} away.`;
    }

    return {
      getBestScore: () => bestScore,
      saveBestScore,
    };
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it("registers initial score as new personal best", () => {
    const manager = createScoreManager();
    const msg = manager.saveBestScore(150);
    assert.strictEqual(msg, "New personal best: 150!");
    assert.strictEqual(manager.getBestScore(), 150);
    assert.strictEqual(localStorage.getItem(BEST_SCORE_KEY), "150");
  });

  it("updates personal best when higher score achieved", () => {
    const manager = createScoreManager();
    manager.saveBestScore(100);
    const msg = manager.saveBestScore(250);
    assert.strictEqual(msg, "New personal best: 250!");
    assert.strictEqual(manager.getBestScore(), 250);
    assert.strictEqual(localStorage.getItem(BEST_SCORE_KEY), "250");
  });

  it("returns matched message when score equals current best", () => {
    const manager = createScoreManager();
    manager.saveBestScore(200);
    const msg = manager.saveBestScore(200);
    assert.strictEqual(msg, "You matched your best score of 200.");
  });

  it("returns distance message when score is lower than best", () => {
    const manager = createScoreManager();
    manager.saveBestScore(300);
    const msg = manager.saveBestScore(180);
    assert.strictEqual(msg, "You scored 180. Your best is 300. 120 away.");
  });

  it("restores best score from localStorage on initialization", () => {
    localStorage.setItem(BEST_SCORE_KEY, "540");
    const manager = createScoreManager();
    assert.strictEqual(manager.getBestScore(), 540);

    const msg = manager.saveBestScore(400);
    assert.strictEqual(msg, "You scored 400. Your best is 540. 140 away.");
  });

  describe("challenge parameter parsing", () => {
    function parseChallengeScore(queryString) {
      const challengeScore = Number(new URLSearchParams(queryString).get("challenge"));
      if (Number.isSafeInteger(challengeScore) && challengeScore > 0) {
        return `Challenge: beat ${challengeScore} in 90 seconds!`;
      }
      return null;
    }

    it("parses valid challenge score from query string", () => {
      const status = parseChallengeScore("?challenge=420");
      assert.strictEqual(status, "Challenge: beat 420 in 90 seconds!");
    });

    it("ignores absent, non-integer, or non-positive challenge scores", () => {
      assert.strictEqual(parseChallengeScore(""), null);
      assert.strictEqual(parseChallengeScore("?challenge=abc"), null);
      assert.strictEqual(parseChallengeScore("?challenge=0"), null);
      assert.strictEqual(parseChallengeScore("?challenge=-50"), null);
    });
  });

  describe("Fullscreen and AR presentation state", () => {
    function createFullscreenManager(mockDoc) {
      let userExitedFullscreen = false;

      function isFullscreenActive() {
        return Boolean(
          mockDoc.fullscreenElement ||
          mockDoc.webkitFullscreenElement ||
          mockDoc.mozFullScreenElement ||
          mockDoc.msFullscreenElement ||
          mockDoc.body?.classList?.contains("is-fullscreen")
        );
      }

      function syncFullscreenUI(btn, floatingBtn, active = isFullscreenActive()) {
        mockDoc.body?.classList?.toggle("is-fullscreen", active);
        if (btn) {
          btn.setAttribute("aria-pressed", String(active));
          btn.textContent = active ? "✕ Exit full screen" : "⛶ Full screen";
        }
        if (floatingBtn) {
          floatingBtn.setAttribute("aria-label", active ? "Exit full screen" : "Toggle full screen");
          floatingBtn.setAttribute("title", active ? "Exit full screen (F or Esc)" : "Toggle full screen (F)");
        }
      }

      async function enterFullscreen(btn, floatingBtn) {
        userExitedFullscreen = false;
        if (mockDoc.documentElement?.requestFullscreen) {
          await mockDoc.documentElement.requestFullscreen();
          mockDoc.fullscreenElement = mockDoc.documentElement;
        } else {
          mockDoc.body?.classList?.add("is-fullscreen");
        }
        syncFullscreenUI(btn, floatingBtn, true);
      }

      async function exitFullscreen(btn, floatingBtn) {
        userExitedFullscreen = true;
        if (mockDoc.exitFullscreen) {
          await mockDoc.exitFullscreen();
          mockDoc.fullscreenElement = null;
        }
        mockDoc.body?.classList?.remove("is-fullscreen");
        syncFullscreenUI(btn, floatingBtn, false);
      }

      async function toggleFullscreen(btn, floatingBtn) {
        if (isFullscreenActive()) {
          await exitFullscreen(btn, floatingBtn);
        } else {
          await enterFullscreen(btn, floatingBtn);
        }
      }

      return {
        isFullscreenActive,
        syncFullscreenUI,
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen,
        getUserExitedFullscreen: () => userExitedFullscreen,
      };
    }

    it("detects fullscreen state across native properties and CSS fallback class", () => {
      const doc = {
        fullscreenElement: null,
        body: { classList: { contains: (cls) => cls === "is-fullscreen" } },
      };
      const manager = createFullscreenManager(doc);
      assert.strictEqual(manager.isFullscreenActive(), true);

      const docNative = {
        fullscreenElement: {},
        body: { classList: { contains: () => false } },
      };
      const nativeManager = createFullscreenManager(docNative);
      assert.strictEqual(nativeManager.isFullscreenActive(), true);

      const docInactive = {
        fullscreenElement: null,
        body: { classList: { contains: () => false } },
      };
      const inactiveManager = createFullscreenManager(docInactive);
      assert.strictEqual(inactiveManager.isFullscreenActive(), false);
    });

    it("updates button labels and ARIA state on enter and exit", async () => {
      let isFsClass = false;
      const attributes = new Map();
      const btn = {
        textContent: "",
        setAttribute: (k, v) => attributes.set(k, v),
      };
      const floatingBtn = {
        setAttribute: (k, v) => attributes.set(`floating-${k}`, v),
      };
      const doc = {
        fullscreenElement: null,
        documentElement: {
          requestFullscreen: async () => {},
        },
        exitFullscreen: async () => {},
        body: {
          classList: {
            toggle: (cls, force) => { isFsClass = force; },
            contains: (cls) => isFsClass,
            add: () => { isFsClass = true; },
            remove: () => { isFsClass = false; },
          },
        },
      };

      const manager = createFullscreenManager(doc);

      await manager.enterFullscreen(btn, floatingBtn);
      assert.strictEqual(manager.isFullscreenActive(), true);
      assert.strictEqual(btn.textContent, "✕ Exit full screen");
      assert.strictEqual(attributes.get("aria-pressed"), "true");
      assert.strictEqual(attributes.get("floating-aria-label"), "Exit full screen");
      assert.strictEqual(manager.getUserExitedFullscreen(), false);

      await manager.exitFullscreen(btn, floatingBtn);
      assert.strictEqual(manager.isFullscreenActive(), false);
      assert.strictEqual(btn.textContent, "⛶ Full screen");
      assert.strictEqual(attributes.get("aria-pressed"), "false");
      assert.strictEqual(attributes.get("floating-aria-label"), "Toggle full screen");
      assert.strictEqual(manager.getUserExitedFullscreen(), true);
    });

    it("toggles between windowed and fullscreen correctly", async () => {
      let isFs = false;
      const doc = {
        get fullscreenElement() { return isFs ? {} : null; },
        set fullscreenElement(val) { isFs = Boolean(val); },
        documentElement: { requestFullscreen: async () => { isFs = true; } },
        exitFullscreen: async () => { isFs = false; },
        body: { classList: { contains: () => isFs, toggle: () => {}, add: () => {}, remove: () => {} } },
      };
      const btn = { setAttribute: () => {} };
      const floatingBtn = { setAttribute: () => {} };

      const manager = createFullscreenManager(doc);
      assert.strictEqual(manager.isFullscreenActive(), false);

      await manager.toggleFullscreen(btn, floatingBtn);
      assert.strictEqual(manager.isFullscreenActive(), true);

      await manager.toggleFullscreen(btn, floatingBtn);
      assert.strictEqual(manager.isFullscreenActive(), false);
    });
  });
});

