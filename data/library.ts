import poems from "./poems.json";
import type { Poem } from "../domain/types";

export const allPoems = poems as Poem[];

export const poemById = (id: string) => allPoems.find((poem) => poem.id === id);

export const todayKey = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export const groundFor = (date = new Date()) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) {
    return { background: "#f3f0e8", color: "#1c1b18", faint: "rgba(28,27,24,0.38)" };
  }
  if (hour >= 11 && hour < 16) {
    return { background: "#f7f6f3", color: "#1c1b18", faint: "rgba(28,27,24,0.38)" };
  }
  if (hour >= 16 && hour < 20) {
    return { background: "#f4ece3", color: "#1c1b18", faint: "rgba(28,27,24,0.42)" };
  }
  return { background: "#1c1b19", color: "#f3efe6", faint: "rgba(243,239,230,0.45)" };
};
