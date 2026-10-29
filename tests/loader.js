export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("https://")) {
    const code = `
      export class FilesetResolver {
        static async forVisionTasks(path) {
          return { path };
        }
      }
      export class PoseLandmarker {
        static async createFromOptions(vision, options) {
          return new PoseLandmarker(vision, options);
        }
        constructor(vision, options) {
          this.vision = vision;
          this.options = options;
        }
        detectForVideo(video, timestamp) {
          return { landmarks: [] };
        }
        close() {}
      }
    `;
    return {
      shortCircuit: true,
      url: `data:text/javascript,${encodeURIComponent(code)}`,
    };
  }
  return nextResolve(specifier, context);
}
