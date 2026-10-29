import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createZipBlob } from "../js/zip.js";

describe("recordings-page.js - UI logic & Export helpers", () => {
  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function showEvents(recording) {
    return new Blob(
      [JSON.stringify({ recording: recording.name, events: recording.events }, null, 2)],
      { type: "application/json" },
    );
  }

  describe("formatBytes", () => {
    it("formats values under 1 megabyte as kilobytes", () => {
      assert.strictEqual(formatBytes(0), "0 KB");
      assert.strictEqual(formatBytes(1024), "1 KB");
      assert.strictEqual(formatBytes(512 * 1024), "512 KB");
      assert.strictEqual(formatBytes(1023 * 1024), "1023 KB");
    });

    it("formats values of 1 megabyte or greater as megabytes with 1 decimal", () => {
      assert.strictEqual(formatBytes(1024 * 1024), "1.0 MB");
      assert.strictEqual(formatBytes(2.5 * 1024 * 1024), "2.5 MB");
      assert.strictEqual(formatBytes(10.75 * 1024 * 1024), "10.8 MB");
    });
  });

  describe("showEvents", () => {
    it("serializes recording event markers into JSON blob", async () => {
      const recording = {
        name: "posture-breaker-2026.mp4",
        events: [
          { type: "START", at: 0 },
          { type: "SMASH", at: 4.25, atMs: 4250 },
        ],
      };

      const blob = showEvents(recording);
      assert.strictEqual(blob.type, "application/json");

      const text = await blob.text();
      const parsed = JSON.parse(text);
      assert.strictEqual(parsed.recording, "posture-breaker-2026.mp4");
      assert.strictEqual(parsed.events.length, 2);
      assert.strictEqual(parsed.events[1].type, "SMASH");
    });
  });

  describe("export recordings ZIP flow", () => {
    it("prepares files array for createZipBlob including companion events", async () => {
      const recordings = [
        {
          id: "rec-1",
          name: "match1.mp4",
          blob: new Blob(["video 1 data"]),
          createdAt: "2026-05-10T10:00:00.000Z",
          events: [{ type: "CLUTCH", at: 2.5 }],
        },
        {
          id: "rec-2",
          name: "match2.webm",
          blob: new Blob(["video 2 data"]),
          createdAt: "2026-05-11T11:00:00.000Z",
          events: [],
        },
      ];

      const files = [];
      for (const recording of recordings) {
        const folder = recording.id;
        files.push({
          name: `${folder}/${recording.name}`,
          blob: recording.blob,
          timestamp: new Date(recording.createdAt).getTime(),
        });
        if (recording.events.length > 0) {
          files.push({
            name: `${folder}/${recording.name.replace(/\.(mp4|webm)$/i, ".events.json")}`,
            blob: showEvents(recording),
            timestamp: new Date(recording.createdAt).getTime(),
          });
        }
      }

      assert.strictEqual(files.length, 3);
      assert.strictEqual(files[0].name, "rec-1/match1.mp4");
      assert.strictEqual(files[1].name, "rec-1/match1.events.json");
      assert.strictEqual(files[2].name, "rec-2/match2.webm");

      const zipBlob = await createZipBlob(files);
      assert.ok(zipBlob.size > 0);
      assert.strictEqual(zipBlob.type, "application/zip");
    });
  });
});

