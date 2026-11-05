// Single source of truth. Nothing below is ever inlined in a component.
// The palette is the product's own: the app, the printed record and this film all use the
// same navy and the same gold, so they read as one thing.
import { Easing } from "remotion";
import { fonts } from "./fonts";

export const theme = {
  colors: {
    bg: "#0b1e31",
    bgMid: "#14304f",
    bgLift: "#1d4878",
    primary: "#c9922e",      // THE hero colour — gold, one element per frame
    primaryLift: "#e8b44a",
    accent: "#9dc0e0",
    text: "#ffffff",
    textDim: "#b9d0e6",
    textFaint: "#93b2cd",
    ink: "#16202c",
    paper: "#ffffff",
  },
  // Resolved from the loaded faces, never a bare family name.
  fonts,
  // Linear is forbidden. Entrances lean on spring; moves and Ken Burns on inOut.
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),      // easeOutExpo
    inOut: Easing.bezier(0.83, 0, 0.17, 1),   // easeInOutQuint
    in: Easing.bezier(0.7, 0, 0.84, 0),       // exits only
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },  // words, small pops
    smooth: { damping: 20, stiffness: 90, mass: 1 },     // cards, screenshots
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },  // the marks
  },
  // Type floors for a 1080p film watched at a third of its size.
  size: {
    eyebrow: 29,
    h1: 96,
    h2: 74,
    body: 34,
    small: 28,
  },
  pad: 110,
} as const;
