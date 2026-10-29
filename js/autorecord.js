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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function createPostureRecorder(options) {
  const gameCanvas = options.gameCanvas;
  const webcamCanvas = options.webcamCanvas || null;
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

  const width = 720;
  const height = 1280;
  const gameAreaHeight = 700;
  const webcamAreaY = 740;
  const webcamAreaHeight = height - webcamAreaY;

  let recordingCanvas = null;
  let ctx = null;
  let activeSession = null;
  let rafId = 0;
  let drawRunning = false;

  function drawFrame() {
    if (!drawRunning) return;
    ctx.fillStyle = '#101522';
    ctx.fillRect(0, 0, width, height);

    const gameScale = Math.min(width / gameCanvas.width, gameAreaHeight / gameCanvas.height);
    const gameWidth = Math.round(gameCanvas.width * gameScale);
    const gameHeight = Math.round(gameCanvas.height * gameScale);
    ctx.drawImage(
      gameCanvas,
      Math.round((width - gameWidth) / 2),
      Math.round((gameAreaHeight - gameHeight) / 2),
      gameWidth,
      gameHeight,
    );

    if (webcamCanvas?.width && webcamCanvas.height) {
      const webcamScale = Math.min(width / webcamCanvas.width, webcamAreaHeight / webcamCanvas.height);
      const webcamWidth = Math.round(webcamCanvas.width * webcamScale);
      const webcamHeight = Math.round(webcamCanvas.height * webcamScale);
      ctx.drawImage(
        webcamCanvas,
        Math.round((width - webcamWidth) / 2),
        webcamAreaY + Math.round((webcamAreaHeight - webcamHeight) / 2),
        webcamWidth,
        webcamHeight,
      );
    }
    rafId = requestAnimationFrame(drawFrame);
  }

  function start(microphoneStream = null) {
    if (activeSession?.recorder.state === 'recording') return;
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
        if (options.onFile) options.onFile(blob, session.events);
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
