// The motion vocabulary. Every entrance moves two or three properties at once — a lone
// fade is forbidden — and nothing enters at the same instant as anything else.
import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

/** Fade + rise + scale. The workhorse. `out` makes it leave too, faster than it arrived. */
export const Entrance: React.FC<{
  delay?: number;
  out?: number;            // frame at which the exit starts
  rise?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, out, rise = 40, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  // Exits run in ~10 frames against the entrance's ~20.
  const leave = out == null ? 0 : interpolate(frame, [out, out + 10], [0, 1], {
    easing: theme.ease.in, extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity: p * (1 - leave),
        transform: `translateY(${interpolate(p, [0, 1], [rise, 0]) - leave * 18}px) `
          + `scale(${interpolate(p, [0, 1], [0.94, 1])})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Word by word, three frames apart. */
export const WordReveal: React.FC<{
  text: string;
  delay?: number;
  per?: number;
  out?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, per = 3, out, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leave = out == null ? 0 : interpolate(frame, [out, out + 10], [0, 1], {
    easing: theme.ease.in, extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return (
    // A pixel gap, never em: em resolves against the parent's font size, which collapses
    // the spacing next to 90px type.
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: 22, rowGap: 2, ...style }}>
      {text.split(" ").map((word, i) => {
        const p = spring({ frame: frame - delay - i * per, fps, config: theme.spring.snappy });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p * (1 - leave),
              transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Every still drifts. A screenshot held dead still for eight seconds is what makes a
 *  film look flat. Consecutive shots are given opposite directions. */
export const KenBurns: React.FC<{
  src: string;
  dir?: "in" | "out";
  delay?: number;
  style?: React.CSSProperties;
}> = ({ src, dir = "in", delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  const life = interpolate(frame, [delay, durationInFrames], [0, 1], {
    easing: theme.ease.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const sign = dir === "out" ? -1 : 1;
  const scale = (1 + sign * 0.055 * life) * interpolate(p, [0, 1], [0.975, 1]);
  const pan = sign * -18 * life;
  return (
    <div
      style={{
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 38px 100px rgba(0,0,0,0.55)",
        opacity: p,
        transform: `translate(${pan}px, ${interpolate(p, [0, 1], [44, 0])}px) scale(${scale})`,
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ display: "block", width: "100%", height: "auto" }} />
    </div>
  );
};

/** Anything on screen for more than two seconds gets micro-motion. */
export const Breathe: React.FC<{ amount?: number; speed?: number; children: React.ReactNode;
  style?: React.CSSProperties }> = ({ amount = 0.012, speed = 1.5, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = 1 + amount * Math.sin((frame / fps) * speed);
  return <div style={{ transform: `scale(${s.toFixed(4)})`, ...style }}>{children}</div>;
};

/** A brand mark on its own white ground. Never recoloured, never redrawn. */
export const Mark: React.FC<{ src: string; height: number; pad?: number; radius?: number;
  delay?: number }> = ({ src, height, pad = 14, radius = 10, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.bouncy });
  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: theme.colors.paper, borderRadius: radius, padding: `${pad}px ${pad * 1.5}px`,
        boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [26, 0])}px) scale(${interpolate(p, [0, 1], [0.9, 1])})`,
      }}
    >
      <Img src={staticFile(src)} style={{ display: "block", height, width: "auto" }} />
    </div>
  );
};
