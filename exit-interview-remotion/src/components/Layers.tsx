// The five-layer stack every scene sits in, bottom to top:
//   background mesh -> content -> colour grade -> grain -> vignette
// Without the top three the frame reads as a slide; with them it reads as film.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";

// Never a flat background. Two slow blobs drift so the field is alive even when the
// content is still, plus the gold constellation the brand uses.
export const BgMesh: React.FC = () => {
  const frame = useCurrentFrame();
  const d1 = Math.sin(frame / 55) * 50;
  const d2 = Math.cos(frame / 70) * 40;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(130% 110% at 28% 18%, ${theme.colors.bgLift} 0%, ${theme.colors.bgMid} 45%, ${theme.colors.bg} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute", width: 1300, height: 1300, borderRadius: "50%",
          top: -520, left: -320 + d1, filter: "blur(60px)",
          background: `radial-gradient(circle, ${theme.colors.bgLift}44, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute", width: 950, height: 950, borderRadius: "50%",
          bottom: -430, right: -260 - d2, filter: "blur(80px)",
          background: `radial-gradient(circle, ${theme.colors.primary}18, transparent 66%)`,
        }}
      />
      <Constellation />
    </AbsoluteFill>
  );
};

// Seeded, so the dots are identical on every render and never flicker.
const Constellation: React.FC = () => {
  let seed = 20261026;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const dots = Array.from({ length: 70 }, () => ({
    x: 1150 + rnd() * 740, y: 40 + rnd() * 420, r: 1 + rnd() * 2.2, o: 0.1 + rnd() * 0.22,
  }));
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={theme.colors.primary} opacity={d.o} />
      ))}
    </svg>
  );
};

// Pulls the screenshots and the drawn scenes into one look.
export const Grade: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill
      style={{ backgroundColor: theme.colors.bgLift, mixBlendMode: "soft-light", opacity: 0.2 }}
    />
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.12), transparent 26%, transparent 72%, rgba(0,0,0,0.22))",
      }}
    />
  </AbsoluteFill>
);

// Moves every frame; a static noise texture reads as dirt on the lens.
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const noise =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        backgroundImage: noise,
        backgroundSize: "220px",
        backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`,
        opacity: 0.055,
        mixBlendMode: "overlay",
      }}
    />
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: "radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,0.26) 100%)",
    }}
  />
);
