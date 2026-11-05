// The stack every frame sits in, bottom to top:
//   background mesh -> content -> colour grade -> grain -> vignette
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";

export const BgMesh: React.FC = () => {
  const frame = useCurrentFrame();
  const d1 = Math.sin(frame / 55) * 60;
  const d2 = Math.cos(frame / 70) * 50;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <AbsoluteFill style={{
        background: `radial-gradient(120% 80% at 30% 10%, ${theme.colors.bgLift} 0%, ${theme.colors.bgMid} 45%, ${theme.colors.bg} 100%)`,
      }} />
      <div style={{
        position: "absolute", width: 1300, height: 1300, borderRadius: "50%", top: -560, left: -420 + d1,
        filter: "blur(70px)", background: `radial-gradient(circle, ${theme.colors.primary}30, transparent 62%)`,
      }} />
      <div style={{
        position: "absolute", width: 1100, height: 1100, borderRadius: "50%", bottom: -420, right: -360 - d2,
        filter: "blur(80px)", background: `radial-gradient(circle, ${theme.colors.primaryDeep}40, transparent 66%)`,
      }} />
      <Dots />
    </AbsoluteFill>
  );
};

// Seeded so the field is identical on every render.
const Dots: React.FC = () => {
  const frame = useCurrentFrame();
  let seed = 20261028;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const dots = Array.from({ length: 60 }, () => ({ x: rnd() * 1080, y: rnd() * 1920, r: 1 + rnd() * 2.4, o: 0.08 + rnd() * 0.2, s: rnd() }));
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y - ((frame * (0.2 + d.s * 0.4)) % 1920)} r={d.r}
          fill={theme.colors.primary} opacity={d.o} />
      ))}
    </svg>
  );
};

export const Grade: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill style={{ backgroundColor: theme.colors.bgLift, mixBlendMode: "soft-light", opacity: 0.18 }} />
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.10), transparent 22%, transparent 78%, rgba(0,0,0,0.25))" }} />
  </AbsoluteFill>
);

export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const noise = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";
  return (
    <AbsoluteFill style={{
      pointerEvents: "none", backgroundImage: noise, backgroundSize: "220px",
      backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`, opacity: 0.05, mixBlendMode: "overlay",
    }} />
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.32) 100%)" }} />
);
