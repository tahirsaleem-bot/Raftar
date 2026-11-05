// The film: the five-layer stack, the scenes in sequence, the presenter who rides the
// whole thing, and the voice-over. Scene lengths come from timeline.json, which is
// generated from the real recorded clips — so the picture can never drift from the words.
import React from "react";
import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import { BgMesh, Grade, Grain, Vignette } from "./components/Layers";
import { SCENE_COMPONENTS } from "./Scenes";
import timeline from "../public/timeline.json";

export const FPS = 30;
export const SCENES = timeline.scenes as { id: string; t0: number; d: number; lead: number }[];
export const TOTAL_FRAMES = Math.round(timeline.total * FPS);
const CROSS = 14;   // frames of overlap between scenes

/** Raftar. Large beside the opening, then he settles into the corner and stays. */
const Presenter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = SCENES[0].d;
  const moveAt = Math.round((intro - 1.2) * fps);
  const trip = interpolate(frame, [moveAt, moveAt + 36], [0, 1], {
    easing: theme.ease.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const mix = (a: number, b: number) => a + (b - a) * trip;

  // Steps aside on the closing card, where the two marks are the subject.
  const last = SCENES[SCENES.length - 1];
  const lastStart = Math.round(last.t0 * fps);
  const bow = interpolate(frame, [lastStart, lastStart + 15], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const appear = spring({ frame: frame - 12, fps, config: theme.spring.smooth });
  const size = mix(330, 128);
  const breath = 1 + 0.045 * Math.sin((frame / fps) * 1.5);

  return (
    <div style={{
      position: "absolute", left: mix(1230, theme.pad), top: mix(330, 830),
      width: size, height: size, opacity: appear * bow, zIndex: 6,
    }}>
      <div style={{
        position: "absolute", inset: -14, borderRadius: "50%",
        border: `3px solid rgba(201,146,46,${(0.45 + 0.25 * Math.sin((frame / fps) * 1.5)).toFixed(3)})`,
        transform: `scale(${breath.toFixed(4)})`,
      }} />
      <Img src={staticFile("raftar.png")} style={{
        width: "100%", height: "100%", borderRadius: "50%", display: "block",
        boxShadow: "0 22px 60px rgba(0,0,0,0.5)",
      }} />
      <div style={{
        position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: -52,
        fontFamily: theme.fonts.display, fontSize: 20, fontWeight: 600, letterSpacing: "0.16em",
        textTransform: "uppercase", color: theme.colors.accent, whiteSpace: "nowrap",
        opacity: 1 - trip,
      }}>Raftar</div>
    </div>
  );
};

/** The corner lockup, on every frame except the last card. */
const BrandBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const last = SCENES[SCENES.length - 1];
  const lastStart = Math.round(last.t0 * fps);
  const fade = interpolate(frame, [lastStart, lastStart + 15], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const chip: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: theme.colors.paper, borderRadius: 10, padding: "9px 14px",
    boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
  };
  return (
    <div style={{
      position: "absolute", right: 104, bottom: 64, zIndex: 23,
      display: "flex", alignItems: "center", gap: 14, opacity: fade,
    }}>
      <div style={chip}><Img src={staticFile("logo_taleemabad.png")} style={{ height: 32 }} /></div>
      <div style={chip}><Img src={staticFile("logo_niete.png")} style={{ height: 26 }} /></div>
    </div>
  );
};

const Wordmark: React.FC = () => (
  <div style={{
    position: "absolute", top: 58, left: 86, zIndex: 5,
    display: "flex", alignItems: "center", gap: 15,
  }}>
    <div style={{ width: 13, height: 13, borderRadius: "50%", background: theme.colors.primary }} />
    <div style={{
      fontFamily: theme.fonts.display, fontSize: 25, fontWeight: 600,
      letterSpacing: "0.14em", textTransform: "uppercase", color: theme.colors.accent,
    }}>Exit Interviews</div>
  </div>
);

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: theme.colors.bg }}>
    <BgMesh />
    <Wordmark />

    {SCENES.map((s, i) => {
      const Scene = SCENE_COMPONENTS[i];
      const from = Math.round(s.t0 * FPS);
      const dur = Math.round(s.d * FPS);
      return (
        // The overlap is what makes one scene hand over to the next rather than cut.
        <Sequence key={s.id} from={i === 0 ? 0 : from - CROSS}
          durationInFrames={dur + (i === 0 ? 0 : CROSS)} layout="none">
          <Fading cross={i === 0 ? 0 : CROSS}>
            <Scene />
          </Fading>
        </Sequence>
      );
    })}

    <Presenter />
    <BrandBar />
    <Grade />
    <Grain />
    <Vignette />

    {SCENES.map((s) => (
      <Sequence key={"a" + s.id} from={Math.round((s.t0 + s.lead) * FPS)} layout="none">
        <Audio src={staticFile(`vo/${s.id}.mp3`)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

const Fading: React.FC<{ cross: number; children: React.ReactNode }> = ({ cross, children }) => {
  const frame = useCurrentFrame();
  const o = cross === 0 ? 1 : interpolate(frame, [0, cross], [0, 1], {
    easing: theme.ease.out, extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
