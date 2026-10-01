import { seeTags, type SeeTag } from "./types.ts";

export const seasons = ["spring", "summer", "autumn", "winter"] as const;

export type Season = (typeof seasons)[number];

export type Sample = { r: number; g: number; b: number };

export type Fragments = {
  see: SeeTag[];
  person: boolean;
  season: Season;
};

const luminance = (sample: Sample) => 0.2126 * sample.r + 0.7152 * sample.g + 0.0722 * sample.b;

const saturation = (sample: Sample) => {
  const max = Math.max(sample.r, sample.g, sample.b);
  const min = Math.min(sample.r, sample.g, sample.b);
  return max === 0 ? 0 : (max - min) / max;
};

const hue = (sample: Sample) => {
  const max = Math.max(sample.r, sample.g, sample.b);
  const min = Math.min(sample.r, sample.g, sample.b);
  const span = max - min;
  if (span === 0) return 0;
  const channel =
    max === sample.r
      ? (sample.g - sample.b) / span
      : max === sample.g
        ? (sample.b - sample.r) / span + 2
        : (sample.r - sample.g) / span + 4;
  return (channel * 60 + 360) % 360;
};

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export const fragmentsFromSamples = (
  samples: Sample[],
  width: number,
): Omit<Fragments, "person"> | null => {
  if (samples.length < 16 || width < 4) return null;
  const lums = samples.map(luminance);
  const light = mean(lums);
  const white =
    samples.filter((sample) => sample.r > 235 && sample.g > 235 && sample.b > 235).length /
    samples.length;
  let flips = 0;
  for (let index = 1; index < lums.length; index += 1) {
    if (index % width === 0) continue;
    if (Math.abs(lums[index] - lums[index - 1]) > 90) flips += 1;
  }
  const flipRate = flips / lums.length;
  if (white > 0.82) return null;
  if (white > 0.45 && flipRate > 0.22) return null;

  const see = new Set<SeeTag>();
  if (light > 175) see.add("light");
  if (light < 55) see.add("night");
  else if (light < 100) see.add("evening");
  else see.add("day");

  const height = Math.ceil(samples.length / width);
  const topEnd = Math.floor(height / 3) * width;
  const bottomStart = Math.floor((height * 2) / 3) * width;
  const top = samples.slice(0, topEnd);
  const bottom = samples.slice(bottomStart);
  const blueOf = (group: Sample[]) =>
    group.length === 0 ? 0 : mean(group.map((sample) => sample.b - Math.max(sample.r, sample.g)));
  if (blueOf(top) > 18) see.add("sky");
  if (blueOf(bottom) > 18) see.add("water");

  const green = samples.filter(
    (sample) => sample.g > sample.r * 1.15 && sample.g > sample.b * 1.05 && sample.g > 70,
  ).length / samples.length;
  if (green > 0.22) see.add("plant");
  if (see.has("plant") && see.has("sky")) see.add("scenery");

  const color = mean(samples.map(saturation));
  if (color < 0.16 && light >= 55 && light <= 175) see.add("ordinary");
  if (!see.has("sky") && !see.has("plant") && light > 80 && light < 190 && color < 0.28) {
    see.add("indoor");
  }

  const known = seeTags.filter((tag) => see.has(tag));
  return { see: known, season: seasonOf(samples, light) };
};

const seasonOf = (samples: Sample[], light: number): Season => {
  const colorful = samples.filter((sample) => saturation(sample) > 0.22);
  if (colorful.length < samples.length * 0.12) return "winter";
  const tone = mean(colorful.map(hue));
  if (tone < 45 || tone >= 330) return light > 150 ? "spring" : "autumn";
  if (tone < 75) return "autumn";
  if (tone < 170) return light > 130 ? "summer" : "spring";
  return "winter";
};
