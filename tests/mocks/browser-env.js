// tests/mocks/browser-env.js

export function createMockLocalStorage() {
  let store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key(index) {
      return Object.keys(store)[index] || null;
    },
  };
}

export function createMockIndexedDB() {
  const databases = new Map();

  return {
    open(name, version = 1) {
      const request = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };

      queueMicrotask(() => {
        let db = databases.get(name);
        const oldVersion = db ? db.version : 0;

        if (!db) {
          const storeMap = new Map();
          db = {
            name,
            version,
            objectStores: storeMap,
            createObjectStore(storeName, { keyPath } = {}) {
              const items = new Map();
              const store = { keyPath, items };
              storeMap.set(storeName, store);
              return store;
            },
            transaction(storeNames, mode) {
              const names = Array.isArray(storeNames) ? storeNames : [storeNames];
              const pendingRequests = [];
              let aborted = false;

              const tx = {
                mode,
                error: null,
                oncomplete: null,
                onerror: null,
                onabort: null,
                abort() {
                  aborted = true;
                  queueMicrotask(() => {
                    if (tx.onabort) tx.onabort({ target: tx });
                  });
                },
                objectStore(storeName) {
                  const s = storeMap.get(storeName);
                  if (!s) throw new Error(`Object store not found: ${storeName}`);
                  return {
                    put(record) {
                      const key = s.keyPath ? record[s.keyPath] : Math.random().toString();
                      s.items.set(key, record);
                      const req = { onsuccess: null, onerror: null };
                      pendingRequests.push(req);
                      return req;
                    },
                    getAll() {
                      const req = { result: Array.from(s.items.values()), onsuccess: null, onerror: null };
                      pendingRequests.push(req);
                      return req;
                    },
                    delete(id) {
                      s.items.delete(id);
                      const req = { onsuccess: null, onerror: null };
                      pendingRequests.push(req);
                      return req;
                    },
                  };
                },
              };

              queueMicrotask(() => {
                if (aborted) return;
                for (const req of pendingRequests) {
                  if (req.onsuccess) req.onsuccess({ target: req });
                }
                queueMicrotask(() => {
                  if (aborted) return;
                  if (tx.oncomplete) tx.oncomplete({ target: tx });
                });
              });
              return tx;
            },
            close() {},
          };
          databases.set(name, db);
        }

        request.result = db;

        if (version > oldVersion && request.onupgradeneeded) {
          request.onupgradeneeded({ target: request });
        }
        if (request.onsuccess) {
          request.onsuccess({ target: request });
        }
      });

      return request;
    },
    _clear() {
      databases.clear();
    },
  };
}

export function createMockTrack(kind = "audio") {
  return {
    kind,
    readyState: "live",
    stop() {
      this.readyState = "ended";
    },
  };
}

export function createMockMediaStream(tracks = []) {
  const currentTracks = tracks.length > 0 ? [...tracks] : [createMockTrack("audio"), createMockTrack("video")];
  return {
    getAudioTracks() {
      return currentTracks.filter(t => t.kind === "audio");
    },
    getVideoTracks() {
      return currentTracks.filter(t => t.kind === "video");
    },
    getTracks() {
      return currentTracks;
    },
    addTrack(track) {
      currentTracks.push(track);
    },
  };
}

export function createMockAudioContext() {
  const currentTime = 0;
  function createAudioParam(initial = 0) {
    return {
      value: initial,
      setValueAtTime(v) { this.value = v; },
      exponentialRampToValueAtTime(v) { this.value = v; },
      setTargetAtTime(v) { this.value = v; },
      cancelScheduledValues() {},
    };
  }

  return {
    currentTime,
    state: "running",
    sampleRate: 44100,
    destination: { connect() {}, disconnect() {} },
    createGain() {
      return {
        gain: createAudioParam(1),
        connect() {},
        disconnect() {},
      };
    },
    createDynamicsCompressor() {
      return {
        threshold: createAudioParam(-20),
        knee: createAudioParam(18),
        ratio: createAudioParam(4),
        attack: createAudioParam(0.005),
        release: createAudioParam(0.25),
        connect() {},
        disconnect() {},
      };
    },
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      return {
        sampleRate,
        numberOfChannels: channels,
        length,
        getChannelData: () => data,
      };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
      };
    },
    createOscillator() {
      return {
        type: "sine",
        frequency: createAudioParam(440),
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
      };
    },
    createStereoPanner() {
      return {
        pan: createAudioParam(0),
        connect() {},
        disconnect() {},
      };
    },
    createBiquadFilter() {
      return {
        type: "bandpass",
        frequency: createAudioParam(350),
        Q: { value: 1 },
        connect() {},
        disconnect() {},
      };
    },
    createMediaStreamDestination() {
      return {
        stream: createMockMediaStream([createMockTrack("audio")]),
        connect() {},
        disconnect() {},
      };
    },
    createMediaStreamSource() {
      return {
        connect() {},
        disconnect() {},
      };
    },
    async decodeAudioData(data) {
      return {
        sampleRate: 44100,
        numberOfChannels: 2,
        length: 1000,
        getChannelData: () => new Float32Array(1000),
      };
    },
    async resume() {
      this.state = "running";
    },
  };
}

export function createMockCanvasContext() {
  return {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    globalAlpha: 1,
    shadowColor: "transparent",
    shadowBlur: 0,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    stroke() {},
    fillRect() {},
    clearRect() {},
    fillText() {},
    drawImage() {},
    roundRect() {},
    translate() {},
    scale() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
}

export function createMockElement(tagName = "div") {
  const listeners = new Map();
  const children = [];
  const attributes = new Map();

  return {
    tagName: tagName.toUpperCase(),
    textContent: "",
    innerHTML: "",
    className: "",
    hidden: false,
    disabled: false,
    checked: false,
    src: "",
    width: 0,
    height: 0,
    videoWidth: 640,
    videoHeight: 480,
    readyState: 4,
    paused: false,
    ended: false,
    srcObject: null,
    play: async () => {},
    pause: () => {},
    classList: {
      toggle(cls, force) {
        return force;
      },
      add() {},
      remove() {},
      contains() { return false; },
    },
    setAttribute(key, val) {
      attributes.set(key, String(val));
    },
    getAttribute(key) {
      return attributes.get(key) || null;
    },
    getContext(type) {
      if (type === "2d") return createMockCanvasContext();
      return null;
    },
    captureStream(fps = 30) {
      return createMockMediaStream([createMockTrack("video")]);
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    append(...newChildren) {
      children.push(...newChildren);
    },
    replaceChildren(...newChildren) {
      children.length = 0;
      children.push(...newChildren);
    },
    remove() {},
    click() {
      const handlers = listeners.get("click") || [];
      handlers.forEach(h => h({ target: this, preventDefault() {} }));
    },
    addEventListener(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    removeEventListener(event, handler) {
      if (!listeners.has(event)) return;
      const list = listeners.get(event).filter(h => h !== handler);
      listeners.set(event, list);
    },
    dispatch(event, data) {
      const handlers = listeners.get(event) || [];
      handlers.forEach(h => h({ target: this, ...data }));
    },
  };
}

export class MockMediaRecorder {
  static isTypeSupported(type) {
    return true;
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.options = options;
    this.state = "inactive";
    this.mimeType = options.mimeType || "video/webm";
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
  }

  start(timeslice) {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(["mock video chunk"], { type: this.mimeType }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}
