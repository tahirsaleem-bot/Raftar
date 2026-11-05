// Single source of truth: colours, easings, springs, layout. Never inline these elsewhere.
import { Easing } from "remotion";

export const theme = {
  colors: {
    bg: "#03130e",
    bgMid: "#062319",
    bgLift: "#0b3a2a",
    primary: "#10b981", // hero — one element per frame
    primaryDeep: "#047857",
    text: "#f0fdf8",
    textDim: "#9fbfb2",
    owe: "#f87171",
    glow: "rgba(16, 185, 129, 0.45)",
    bezel: "#0b0f0e",
  },
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.83, 0, 0.17, 1),
    in: Easing.bezier(0.7, 0, 0.84, 0),
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
  },
  // Phone geometry on the 1080×1920 canvas. Screenshots are 390×844 CSS px.
  phone: {
    screenW: 620,
    scale: 620 / 390,
    screenH: (844 * 620) / 390,
    bezel: 16,
    top: 470,
    radius: 64,
  },
  fps: 30,
  beat: 96, // frames per screenshot beat
  tapAt: 50, // frame inside a beat where the finger lands
  overlap: 12, // cross-fade between beats
} as const;
