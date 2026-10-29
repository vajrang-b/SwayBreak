import { downloadBlob } from "./download.js?v=1";

function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E', // Safari
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (window.MediaRecorder && window.MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function createPostureRecorder(options) {
  const gameCanvas = options.gameCanvas;
  const webcamCanvas = options.webcamCanvas || null;
  const videoElement = options.videoElement || null;
  const fps = options.fps || 30;
  const maxSeconds = options.maxSeconds || 180; // auto-stop safety cap
  const autoDownload = options.autoDownload !== false;
  const onEvent = options.onEvent || (() => {});
  const onError = options.onError || (() => {});

  if (!gameCanvas) throw new Error('createPostureRecorder: gameCanvas is required');
  if (!window.MediaRecorder) throw new Error('MediaRecorder is not supported in this browser');
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new Error('Canvas recording is not supported in this browser');
  }

  let recordingCanvas = null;
  let ctx = null;
  let activeSession = null;
  let rafId = 0;
  let drawRunning = false;
  let lastDrawTime = 0;
  const frameIntervalMs = 1000 / fps;

  function drawFrame(now = performance.now()) {
    if (!drawRunning) return;
    rafId = requestAnimationFrame(drawFrame);

    if (now - lastDrawTime < frameIntervalMs) return;
    lastDrawTime = now;

    const width = gameCanvas.width || 960;
    const height = gameCanvas.height || 600;
    if (recordingCanvas.width !== width || recordingCanvas.height !== height) {
      recordingCanvas.width = width;
      recordingCanvas.height = height;
    }

    const isAR = (typeof options.getARMode === 'function') ? options.getARMode() : false;
    const video = videoElement;
    const hasWebcamCanvas = Boolean(webcamCanvas?.width && webcamCanvas.height);
    const hasVideo = Boolean(video && video.readyState >= 2);

    if (isAR && (hasWebcamCanvas || hasVideo)) {
      // In AR mode: draw camera background with pose skeleton covering the entire canvas
      const source = hasWebcamCanvas ? webcamCanvas : video;
      const sWidth = source.videoWidth || source.width || 640;
      const sHeight = source.videoHeight || source.height || 480;
      const scale = Math.max(width / sWidth, height / sHeight);
      const drawW = Math.round(sWidth * scale);
      const drawH = Math.round(sHeight * scale);
      const offsetX = Math.round((width - drawW) / 2);
      const offsetY = Math.round((height - drawH) / 2);

      ctx.save();
      if (source === video) {
        // Video element is raw camera feed, mirror it
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, -offsetX - drawW, offsetY, drawW, drawH);
      } else {
        // webcamCanvas is already mirrored by pose.js drawPreview
        ctx.drawImage(webcamCanvas, offsetX, offsetY, drawW, drawH);
      }
      ctx.restore();

      // Overlay the game elements (bricks, ball, paddle, particles) on top
      ctx.drawImage(gameCanvas, 0, 0, width, height);
    } else {
      // Standard non-AR mode: Draw game canvas on dark background
      ctx.fillStyle = '#101522';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(gameCanvas, 0, 0, width, height);

      // If webcam skeleton canvas is available, overlay picture-in-picture in bottom-left corner
      // (Never in the top-right brick zone!)
      if (hasWebcamCanvas) {
        const pipW = Math.round(width * 0.22);
        const pipH = Math.round((webcamCanvas.height / webcamCanvas.width) * pipW);
        const pipX = 16;
        const pipY = height - pipH - 16;
        ctx.save();
        ctx.fillStyle = 'rgba(10, 14, 24, 0.75)';
        ctx.fillRect(pipX - 2, pipY - 2, pipW + 4, pipH + 4);
        ctx.drawImage(webcamCanvas, pipX, pipY, pipW, pipH);
        ctx.restore();
      }
    }
  }

  function start(microphoneStream = null) {
    if (activeSession?.recorder.state === 'recording') return;
    const width = gameCanvas.width || 960;
    const height = gameCanvas.height || 600;
    recordingCanvas = document.createElement('canvas');
    recordingCanvas.width = width;
    recordingCanvas.height = height;
    ctx = recordingCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create the recording canvas context');

    let stream;
    let audioRecording;
    try {
      stream = recordingCanvas.captureStream(fps);
      audioRecording = options.createAudioRecording?.(microphoneStream);
      if (options.createAudioRecording && !audioRecording) {
        throw new Error('Game audio recording is not supported in this browser');
      }
      audioRecording?.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      const mimeType = pickMimeType();
      const recorder = new window.MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 2500000,
      });
      const session = {
        recorder,
        stream,
        audioRecording,
        chunks: [],
        events: [],
        startTime: performance.now(),
        stopTimer: 0,
      };
      activeSession = session;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) session.chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        const error = event.error || new Error('The browser could not continue recording');
        onError(error);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(session.chunks, { type });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const filename = `posture-breaker-${stamp}.${ext}`;
        session.stream.getTracks().forEach((track) => track.stop());
        session.audioRecording?.stop();
        if (activeSession === session) activeSession = null;
        if (autoDownload) {
          downloadBlob(blob, filename);
          if (session.events.length > 0) {
            const eventLog = new Blob(
              [JSON.stringify({ recording: filename, events: session.events }, null, 2)],
              { type: 'application/json' },
            );
            downloadBlob(eventLog, `posture-breaker-${stamp}.events.json`);
          }
        }
        if (options.onFile) options.onFile(blob, session.events, filename);
        onEvent('STOP', Math.round((performance.now() - session.startTime) / 1000));
      };

      drawRunning = true;
      drawFrame();
      recorder.start(1000);
      session.stopTimer = setTimeout(() => stop(), maxSeconds * 1000);
      onEvent('START', 0);
    } catch (error) {
      drawRunning = false;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
      audioRecording?.stop();
      activeSession = null;
      throw error;
    }
  }

  function markEvent(type) {
    const session = activeSession;
    if (!session || session.recorder.state !== 'recording') return;
    const atMs = Math.round(performance.now() - session.startTime);
    const seconds = Number((atMs / 1000).toFixed(3));
    session.events.push({ type, at: seconds, atMs });
    onEvent(type, seconds);
  }

  function stop() {
    drawRunning = false;
    cancelAnimationFrame(rafId);
    const session = activeSession;
    if (session?.recorder.state === 'recording') {
      clearTimeout(session.stopTimer);
      session.recorder.stop();
    }
  }

  function isRecording() {
    return activeSession?.recorder.state === 'recording';
  }

  return { start, stop, markEvent, isRecording };
}
