import { fragmentsFromSamples, type Fragments, type Sample } from "../domain/fragments";

const loadImage = (uri: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = uri;
  });

export const reducePhoto = async (
  uri: string,
): Promise<{ fragments: Fragments; thumb: string } | null> => {
  if (typeof document === "undefined") return null;
  const image = await loadImage(uri);
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  const samples: Sample[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    samples.push({ r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] });
  }
  const reduced = fragmentsFromSamples(samples, size);
  if (!reduced) return null;

  let person = false;
  const detector = (globalThis as { FaceDetector?: new (options: { fastMode: boolean; maxDetectedFaces: number }) => { detect: (source: CanvasImageSource) => Promise<unknown[]> } }).FaceDetector;
  if (detector) {
    try {
      const faces = await new detector({ fastMode: true, maxDetectedFaces: 1 }).detect(canvas);
      person = faces.length > 0;
    } catch {
      person = false;
    }
  }

  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 24;
  thumbCanvas.height = 24;
  thumbCanvas.getContext("2d")?.drawImage(image, 0, 0, 24, 24);
  return {
    fragments: { see: reduced.see, person, season: reduced.season },
    thumb: thumbCanvas.toDataURL("image/jpeg", 0.6),
  };
};
