import {
  deleteRecording,
  getRecordings,
  isAutoSaveEnabled,
  setAutoSaveEnabled,
} from "./recording-storage.js?v=1";
import { createZipBlob } from "./zip.js?v=1";

const list = document.querySelector("#recordings-list");
const status = document.querySelector("#recordings-status");
const downloadAllButton = document.querySelector("#download-all");
const autoSaveToggle = document.querySelector("#auto-save-toggle");
let recordings = [];
let previewUrls = [];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

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

function renderRecordings() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  list.replaceChildren();
  downloadAllButton.disabled = recordings.length === 0;
  if (recordings.length === 0) {
    status.textContent = "No saved recordings yet. Enable auto-save before playing to keep future games here.";
    return;
  }

  const totalSize = recordings.reduce((sum, item) => sum + item.blob.size, 0);
  status.textContent = `${recordings.length} recording${recordings.length === 1 ? "" : "s"} · ${formatBytes(totalSize)} total`;

  for (const recording of recordings) {
    const card = document.createElement("article");
    card.className = "recording-card";
    const title = document.createElement("h2");
    title.textContent = recording.name;
    const details = document.createElement("p");
    details.textContent = `${new Date(recording.createdAt).toLocaleString()} · ${formatBytes(recording.blob.size)} · ${recording.events.length} event markers`;
    const preview = document.createElement("video");
    preview.controls = true;
    preview.playsInline = true;
    preview.preload = "metadata";
    preview.src = URL.createObjectURL(recording.blob);
    previewUrls.push(preview.src);
    const actions = document.createElement("div");
    actions.className = "recording-card-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Download video";
    saveButton.addEventListener("click", () => downloadBlob(recording.blob, recording.name));
    actions.append(saveButton);

    if (recording.events.length > 0) {
      const eventsButton = document.createElement("button");
      eventsButton.type = "button";
      eventsButton.textContent = "Download event markers";
      eventsButton.addEventListener("click", () => {
        downloadBlob(showEvents(recording), recording.name.replace(/\.(mp4|webm)$/i, ".events.json"));
      });
      actions.append(eventsButton);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary-button";
    removeButton.textContent = "Delete";
    removeButton.addEventListener("click", async () => {
      try {
        await deleteRecording(recording.id);
        await loadRecordings();
      } catch (error) {
        status.textContent = `Could not delete recording: ${error.message}`;
      }
    });
    actions.append(removeButton);
    card.append(title, details, preview, actions);
    list.append(card);
  }
}

async function loadRecordings() {
  recordings = await getRecordings();
  renderRecordings();
}

try {
  autoSaveToggle.checked = isAutoSaveEnabled();
} catch (error) {
  autoSaveToggle.disabled = true;
  status.textContent = `Auto-save preference unavailable: ${error.message}`;
}
autoSaveToggle.addEventListener("change", () => {
  try {
    setAutoSaveEnabled(autoSaveToggle.checked);
  } catch (error) {
    autoSaveToggle.checked = !autoSaveToggle.checked;
    status.textContent = `Could not save auto-save preference: ${error.message}`;
  }
});

downloadAllButton.addEventListener("click", async () => {
  if (recordings.length === 0) return;
  downloadAllButton.disabled = true;
  status.textContent = "Preparing ZIP archive…";
  try {
    const files = [];
    for (const recording of recordings) {
      const folder = recording.id;
      files.push({
        name: `${folder}/${recording.name}`,
        blob: recording.blob,
        timestamp: recording.createdAt,
      });
      if (recording.events.length > 0) {
        files.push({
          name: `${folder}/${recording.name.replace(/\.(mp4|webm)$/i, ".events.json")}`,
          blob: showEvents(recording),
          timestamp: recording.createdAt,
        });
      }
    }
    const archive = await createZipBlob(files);
    const filename = `posture-breaker-recordings-${new Date().toISOString().slice(0, 10)}.zip`;
    const archiveFile = new File([archive], filename, { type: archive.type });
    if (typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [archiveFile] })) {
      await navigator.share({ files: [archiveFile], title: filename });
      status.textContent = "Choose Save to Files or another destination in the share menu.";
    } else {
      downloadBlob(archive, filename);
      status.textContent = `ZIP ready with ${recordings.length} recording${recordings.length === 1 ? "" : "s"}. Check your downloads.`;
    }
  } catch (error) {
    if (error.name === "AbortError") {
      status.textContent = "Export canceled.";
      return;
    }
    console.error("Could not export recordings:", error);
    status.textContent = `Could not prepare recordings ZIP: ${error.message}`;
  } finally {
    downloadAllButton.disabled = recordings.length === 0;
  }
});

loadRecordings().catch((error) => {
  console.error("Could not load local recordings:", error);
  status.textContent = `Could not load local recordings: ${error.message}`;
});

window.addEventListener("pagehide", () => {
  for (const url of previewUrls) URL.revokeObjectURL(url);
});
