// tests/setup.js
import { register } from "node:module";
import {
  createMockLocalStorage,
  createMockIndexedDB,
  createMockAudioContext,
  createMockCanvasContext,
  createMockElement,
  createMockMediaStream,
  createMockTrack,
  MockMediaRecorder,
} from "./mocks/browser-env.js";

register("./loader.js", import.meta.url);

const mockStorage = createMockLocalStorage();
const mockIDB = createMockIndexedDB();

class MockHTMLCanvasElement {
  constructor() {
    this.width = 960;
    this.height = 600;
  }
  getContext(type) {
    if (type === "2d") return createMockCanvasContext();
    return null;
  }
  captureStream(fps = 30) {
    return createMockMediaStream([createMockTrack("video")]);
  }
}

globalThis.HTMLCanvasElement = MockHTMLCanvasElement;
globalThis.localStorage = mockStorage;
globalThis.indexedDB = mockIDB;
globalThis.AudioContext = createMockAudioContext;
globalThis.webkitAudioContext = createMockAudioContext;
globalThis.MediaRecorder = MockMediaRecorder;

globalThis.fetch = async (url) => {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(512),
  };
};

if (!globalThis.URL.createObjectURL) {
  let counter = 0;
  globalThis.URL.createObjectURL = (blob) => `blob:mock-url-${++counter}`;
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => {};
}

const mockBody = createMockElement("body");
mockBody.appendChild = (child) => child;
mockBody.removeChild = () => {};

const mockDoc = {
  documentElement: createMockElement("html"),
  createElement(tag) {
    if (tag === "canvas") {
      const el = new MockHTMLCanvasElement();
      el.tagName = "CANVAS";
      return el;
    }
    return createMockElement(tag);
  },
  querySelector(selector) {
    return createMockElement("div");
  },
  querySelectorAll(selector) {
    return [];
  },
  addEventListener() {},
  removeEventListener() {},
  exitFullscreen: async () => {},
  webkitExitFullscreen: async () => {},
  fullscreenElement: null,
  body: mockBody,
};

globalThis.document = mockDoc;

globalThis.window = {
  isSecureContext: true,
  innerWidth: 1024,
  innerHeight: 768,
  location: { search: "" },
  AudioContext: globalThis.AudioContext,
  webkitAudioContext: globalThis.webkitAudioContext,
  MediaRecorder: globalThis.MediaRecorder,
  addEventListener: () => {},
  removeEventListener: () => {},
};

Object.defineProperty(globalThis, "navigator", {
  value: {
    mediaDevices: {
      getUserMedia: async (constraints) => {
        const tracks = [];
        if (constraints?.video !== false) tracks.push(createMockTrack("video"));
        if (constraints?.audio) tracks.push(createMockTrack("audio"));
        return createMockMediaStream(tracks);
      },
    },
    share: async () => {},
    canShare: () => true,
  },
  configurable: true,
  writable: true,
});

globalThis.requestAnimationFrame = (callback) => {
  return setTimeout(() => callback(Date.now()), 16);
};

globalThis.cancelAnimationFrame = (id) => {
  clearTimeout(id);
};
