import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createZipBlob } from "../js/zip.js";

describe("zip.js - createZipBlob", () => {
  it("creates a valid zip blob for a single file", async () => {
    const content = "Hello SwayBreak Video!";
    const file = {
      name: "sample.txt",
      blob: new Blob([content], { type: "text/plain" }),
      timestamp: Date.now(),
    };

    const zipBlob = await createZipBlob([file]);
    assert.strictEqual(zipBlob.type, "application/zip");
    assert.ok(zipBlob.size > content.length);

    const buffer = await zipBlob.arrayBuffer();
    const view = new DataView(buffer);

    // Verify local file header signature: 0x04034b50 ("PK\x03\x04")
    const localHeaderSignature = view.getUint32(0, true);
    assert.strictEqual(localHeaderSignature, 0x04034b50);

    // Verify end of central directory signature: 0x06054b50 ("PK\x05\x06")
    const eocdSignature = view.getUint32(buffer.byteLength - 22, true);
    assert.strictEqual(eocdSignature, 0x06054b50);
  });

  it("creates a valid zip archive containing multiple files (video + json events)", async () => {
    const videoData = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
    const eventsData = JSON.stringify({ recording: "video.mp4", events: [{ type: "SMASH", at: 1.23 }] });

    const files = [
      {
        name: "game-session/video.mp4",
        blob: new Blob([videoData], { type: "video/mp4" }),
        timestamp: new Date("2026-05-15T10:30:00Z").getTime(),
      },
      {
        name: "game-session/video.events.json",
        blob: new Blob([eventsData], { type: "application/json" }),
        timestamp: new Date("2026-05-15T10:30:00Z").getTime(),
      },
    ];

    const zipBlob = await createZipBlob(files);
    assert.ok(zipBlob.size > videoData.length + eventsData.length);

    const buffer = await zipBlob.arrayBuffer();
    const textDecoder = new TextDecoder();
    const fileNamesFound = [];

    // Scan for local headers and parse file names
    let offset = 0;
    while (offset < buffer.byteLength - 4) {
      const sig = new DataView(buffer).getUint32(offset, true);
      if (sig === 0x04034b50) {
        const nameLen = new DataView(buffer).getUint16(offset + 26, true);
        const nameBytes = new Uint8Array(buffer, offset + 30, nameLen);
        fileNamesFound.push(textDecoder.decode(nameBytes));
        offset += 30 + nameLen;
      } else {
        offset += 1;
      }
    }

    assert.ok(fileNamesFound.includes("game-session/video.mp4"));
    assert.ok(fileNamesFound.includes("game-session/video.events.json"));
  });

  it("handles dates before 1980 by clamping to DOS epoch minimum (1980)", async () => {
    const file = {
      name: "old.txt",
      blob: new Blob(["legacy date content"]),
      timestamp: new Date("1970-01-01T00:00:00Z").getTime(),
    };

    const zipBlob = await createZipBlob([file]);
    const buffer = await zipBlob.arrayBuffer();
    const view = new DataView(buffer);

    // DOS date field is at offset 12 in local header
    const dosDate = view.getUint16(12, true);
    const dosYear = (dosDate >> 9) + 1980;
    assert.ok(dosYear >= 1980);
  });

  it("rejects filenames that exceed 0xffff bytes", async () => {
    const longName = "a".repeat(70000);
    const file = {
      name: longName,
      blob: new Blob(["data"]),
      timestamp: Date.now(),
    };

    await assert.rejects(
      async () => {
        await createZipBlob([file]);
      },
      {
        message: /filename is too long/,
      },
    );
  });

  it("creates an empty zip archive when passed an empty list", async () => {
    const zipBlob = await createZipBlob([]);
    assert.strictEqual(zipBlob.size, 22); // End of central directory record length is exactly 22 bytes
    const buffer = await zipBlob.arrayBuffer();
    const view = new DataView(buffer);
    assert.strictEqual(view.getUint32(0, true), 0x06054b50);
  });
});
