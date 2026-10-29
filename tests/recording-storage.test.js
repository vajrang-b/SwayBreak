import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  isAutoSaveEnabled,
  setAutoSaveEnabled,
  saveRecording,
  getRecordings,
  deleteRecording,
} from "../js/recording-storage.js";

describe("recording-storage.js", () => {
  beforeEach(() => {
    localStorage.clear();
    indexedDB._clear();
  });

  describe("auto-save preference", () => {
    it("defaults to true when localStorage key is unset", () => {
      assert.strictEqual(isAutoSaveEnabled(), true);
    });

    it("returns false when set to false", () => {
      setAutoSaveEnabled(false);
      assert.strictEqual(isAutoSaveEnabled(), false);
      assert.strictEqual(localStorage.getItem("leanon-auto-save-recordings"), "false");
    });

    it("returns true when set to true", () => {
      setAutoSaveEnabled(false);
      setAutoSaveEnabled(true);
      assert.strictEqual(isAutoSaveEnabled(), true);
      assert.strictEqual(localStorage.getItem("leanon-auto-save-recordings"), "true");
    });
  });

  describe("indexedDB operations", () => {
    it("saves and retrieves recordings sorted descending by createdAt", async () => {
      const rec1 = {
        id: "rec-1",
        name: "game-1.webm",
        blob: new Blob(["video1"]),
        createdAt: "2026-05-10T12:00:00.000Z",
        events: [],
      };
      const rec2 = {
        id: "rec-2",
        name: "game-2.webm",
        blob: new Blob(["video2"]),
        createdAt: "2026-05-12T14:30:00.000Z",
        events: [{ type: "SMASH", at: 5.5 }],
      };
      const rec3 = {
        id: "rec-3",
        name: "game-3.webm",
        blob: new Blob(["video3"]),
        createdAt: "2026-05-11T09:00:00.000Z",
        events: [],
      };

      await saveRecording(rec1);
      await saveRecording(rec2);
      await saveRecording(rec3);

      const recordings = await getRecordings();
      assert.strictEqual(recordings.length, 3);
      // rec2 (May 12) > rec3 (May 11) > rec1 (May 10)
      assert.strictEqual(recordings[0].id, "rec-2");
      assert.strictEqual(recordings[1].id, "rec-3");
      assert.strictEqual(recordings[2].id, "rec-1");
      assert.strictEqual(recordings[0].events.length, 1);
    });

    it("returns an empty array when no recordings are saved", async () => {
      const recordings = await getRecordings();
      assert.deepStrictEqual(recordings, []);
    });

    it("deletes a recording by id", async () => {
      const rec = {
        id: "rec-delete-me",
        name: "todelete.webm",
        blob: new Blob(["del"]),
        createdAt: "2026-05-10T12:00:00.000Z",
        events: [],
      };

      await saveRecording(rec);
      let list = await getRecordings();
      assert.strictEqual(list.length, 1);

      await deleteRecording("rec-delete-me");
      list = await getRecordings();
      assert.strictEqual(list.length, 0);
    });

    it("updates an existing recording when saved with the same id", async () => {
      const rec = {
        id: "rec-update",
        name: "version1.webm",
        blob: new Blob(["v1"]),
        createdAt: "2026-05-10T12:00:00.000Z",
        events: [],
      };

      await saveRecording(rec);
      rec.name = "version2.webm";
      rec.events = [{ type: "CLUTCH", at: 1.0 }];
      await saveRecording(rec);

      const list = await getRecordings();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].name, "version2.webm");
      assert.strictEqual(list[0].events.length, 1);
    });
  });
});
