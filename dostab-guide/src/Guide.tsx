// Dostab walkthrough: intro -> one beat per real screenshot -> outro.
// Each beat pushes the camera onto the control being explained and a finger taps it at the
// exact box measured by scripts/shots.js.
import React from "react";
import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { theme } from "./theme";
import { fonts } from "./fonts";
import { beats, Beat, STEPS } from "./beats";
import { BgMesh, Grade, Grain, Vignette } from "./components/Layers";
import shots from "../public/shots/shots.json";
import timeline from "./timeline.json";

const P = theme.phone;
const OUTER_W = P.screenW + P.bezel * 2;
const PHONE_LEFT = (1080 - OUTER_W) / 2;
const SCREEN = { left: PHONE_LEFT + P.bezel, top: P.top + P.bezel, w: P.screenW, h: P.screenH };

// Scene lengths come from the real voice-over clips (scripts/tts.js), never fixed numbers.
type Cue = { frames: number; lead: number; vo: number };
const tl = timeline as Record<string, Cue>;
export const INTRO = tl.intro.frames;
export const OUTRO = tl.outro.frames;
const { overlap: OV } = theme;
const durs = beats.map((b) => tl[b.shot].frames);
export const beatStart = (k: number) => INTRO + durs.slice(0, k).reduce((a, d) => a + d, 0) - (k + 1) * OV;
export const TOTAL = beatStart(beats.length) + OUTRO;
const OUTRO_START = beatStart(beats.length);
// The finger lands about two-thirds through the line, when the voice names the button.
const tapFrame = (b: Beat) => {
  const c = tl[b.shot];
  return Math.round(Math.min(c.frames - 28, Math.max(40, c.lead + c.vo * 0.68)));
};

type Ring = { x: number; y: number; w: number; h: number } | null;
const ringOf = (id: string) => (shots as Record<string, { ring: Ring }>)[id].ring;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ---------- small pieces ----------
const Words: React.FC<{ text: string; delay?: number; per?: number; style?: React.CSSProperties; animate?: boolean }> =
  ({ text, delay = 0, per = 3, style, animate = true }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    return (
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.28em", ...style }}>
        {text.split(" ").map((w, i) => {
          const p = animate ? spring({ frame: frame - delay - i * per, fps, config: theme.spring.snappy }) : 1;
          return (
            <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${interpolate(p, [0, 1], [26, 0])}px)` }}>{w}</span>
          );
        })}
      </div>
    );
  };

const Logo: React.FC<{ size: number; delay?: number }> = ({ size, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: theme.spring.bouncy });
  const rot = interpolate(spring({ frame: frame - delay, fps, config: theme.spring.smooth }), [0, 1], [-25, 0]);
  const breathe = 1 + Math.sin(frame / 20) * 0.015;
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, background: `linear-gradient(145deg, ${theme.colors.primary}, ${theme.colors.primaryDeep})`,
      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
      fontFamily: fonts.display, fontWeight: 700, fontSize: size * 0.56,
      boxShadow: `0 ${size * 0.15}px ${size * 0.45}px ${theme.colors.glow}`,
      opacity: p, transform: `scale(${interpolate(p, [0, 1], [0.4, 1]) * breathe}) rotate(${rot}deg)`,
    }}>D</div>
  );
};

// ---------- phone ----------
// Bezel + a light screen fill, so cross-fading screenshots never dip to black.
const PhoneShell: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = beatStart(0) - 6;
  const p = spring({ frame: frame - start, fps, config: theme.spring.smooth });
  const leave = interpolate(frame, [OUTRO_START, OUTRO_START + 10], [0, 1], { easing: theme.ease.in, ...clamp });
  const float = Math.sin(frame / 34) * 4;
  return (
    <div style={{
      position: "absolute", left: PHONE_LEFT, top: P.top, width: OUTER_W, height: P.screenH + P.bezel * 2,
      borderRadius: P.radius + P.bezel, background: theme.colors.bezel,
      boxShadow: `0 60px 120px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.08), 0 0 90px ${theme.colors.primary}22`,
      opacity: p * (1 - leave),
      transform: `translateY(${interpolate(p, [0, 1], [260, 0]) + leave * 140 + float}px) scale(${interpolate(p, [0, 1], [0.9, 1]) - leave * 0.06})`,
    }}>
      <div style={{ position: "absolute", left: P.bezel, top: P.bezel, width: P.screenW, height: P.screenH, borderRadius: P.radius, background: "#f8fafc" }} />
    </div>
  );
};
// Matches PhoneShell's float so screenshots ride with the bezel.
const useFloat = (globalOffset: number) => Math.sin((useCurrentFrame() + globalOffset) / 34) * 4;

// ---------- tap marker ----------
const TapMarker: React.FC<{ ring: NonNullable<Ring>; tap: boolean; at: number }> = ({ ring, tap, at: TAP }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = ring.x * P.screenW, cy = ring.y * P.screenH;
  const bw = ring.w * P.screenW + 18, bh = ring.h * P.screenH + 16;

  const hi = spring({ frame: frame - Math.max(8, TAP - 40), fps, config: theme.spring.snappy });
  const pulse = 1 + Math.sin(frame / 7) * 0.02;
  const approach = spring({ frame: frame - (TAP - 30), fps, config: theme.spring.smooth, durationInFrames: 26 });
  const press = tap ? interpolate(frame, [TAP - 3, TAP, TAP + 6], [1, 0.78, 1], { easing: theme.ease.out, ...clamp }) : 1;
  const ripple = interpolate(frame, [TAP, TAP + 22], [0, 1], { easing: theme.ease.out, ...clamp });
  const flash = interpolate(frame, [TAP, TAP + 4, TAP + 26], [0, 0.32, 0], { easing: theme.ease.out, ...clamp });
  const fingerOut = interpolate(frame, [TAP + 16, TAP + 28], [0, 1], { easing: theme.ease.in, ...clamp });
  const fx = cx + interpolate(approach, [0, 1], [170, 0]);
  const fy = cy + interpolate(approach, [0, 1], [320, 0]);

  return (
    <>
      <div style={{
        position: "absolute", left: cx - bw / 2, top: cy - bh / 2, width: bw, height: bh, borderRadius: 18,
        border: `5px solid ${theme.colors.primary}`, background: `rgba(16,185,129,${flash})`,
        boxShadow: `0 0 0 6px rgba(16,185,129,0.18), 0 0 40px ${theme.colors.glow}`,
        opacity: hi, transform: `scale(${interpolate(hi, [0, 1], [1.25, 1]) * pulse})`,
      }} />
      {tap && (
        <>
          <div style={{
            position: "absolute", left: cx - 90, top: cy - 90, width: 180, height: 180, borderRadius: "50%",
            border: "4px solid #fff", opacity: ripple > 0 ? (1 - ripple) * 0.9 : 0, transform: `scale(${0.3 + ripple})`,
          }} />
          <div style={{
            position: "absolute", left: fx - 38, top: fy - 38, width: 76, height: 76, borderRadius: "50%",
            background: "rgba(255,255,255,0.88)", border: `5px solid ${theme.colors.primaryDeep}`,
            boxShadow: "0 14px 30px rgba(0,0,0,0.35)",
            opacity: approach * (1 - fingerOut), transform: `scale(${press * interpolate(approach, [0, 1], [1.3, 1])})`,
          }} />
        </>
      )}
    </>
  );
};

// ---------- beat ----------
const Progress: React.FC<{ step: number; fresh: boolean }> = ({ step, fresh }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = fresh ? spring({ frame: frame - 4, fps, config: theme.spring.snappy }) : 1;
  return (
    <div style={{ position: "absolute", top: 92, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 12 }}>
      {Array.from({ length: STEPS }, (_, i) => {
        const n = i + 1, active = n === step;
        const w = active ? interpolate(grow, [0, 1], [18, 64]) : 18;
        return <div key={i} style={{ width: w, height: 12, borderRadius: 8, background: n <= step ? "#fff" : "rgba(255,255,255,0.22)", opacity: active ? 1 : n < step ? 0.6 : 1 }} />;
      })}
    </div>
  );
};

const BeatScene: React.FC<{ b: Beat; index: number; fresh: boolean }> = ({ b, index, fresh }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ring = ringOf(b.shot);
  const mark = b.mark !== false && ring;
  // Push toward the control's row but keep x centred, so neither edge of the screen is cropped.
  const origin = mark ? `50% ${(ring.y * 100).toFixed(1)}%` : "50% 40%";
  const push = interpolate(frame, [0, tl[b.shot].frames], [1, mark ? 1.06 : 1.04], { easing: theme.ease.inOut, ...clamp });
  const slide = spring({ frame, fps, config: theme.spring.smooth });
  const float = useFloat(beatStart(index));

  return (
    <AbsoluteFill>
      <Progress step={b.step} fresh={fresh} />
      <div style={{ position: "absolute", top: 150, left: 70, right: 70, color: theme.colors.text }}>
        <div style={{
          fontFamily: fonts.body, fontWeight: 600, fontSize: 30, letterSpacing: 4, color: theme.colors.textDim,
          opacity: fresh ? spring({ frame, fps, config: theme.spring.smooth }) : 1,
        }}>STEP {b.step} OF {STEPS}</div>
        <Words text={b.title} animate={fresh} delay={3}
          style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 70, lineHeight: 1.1, marginTop: 10 }} />
        <Words text={b.line} delay={fresh ? 12 : 4} per={2}
          style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 38, lineHeight: 1.32, marginTop: 18, color: "#d4ebe1" }} />
      </div>
      <div style={{
        position: "absolute", left: SCREEN.left, top: SCREEN.top + float, width: SCREEN.w, height: SCREEN.h,
        borderRadius: P.radius, overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, transformOrigin: origin,
          transform: `translateX(${interpolate(slide, [0, 1], [36, 0])}px) scale(${push})`,
        }}>
          <Img src={staticFile(`shots/${b.shot}.png`)} style={{ width: SCREEN.w, height: SCREEN.h, display: "block" }} />
          {mark && <TapMarker ring={ring} tap={b.tap !== false} at={tapFrame(b)} />}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- intro / outro ----------
const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sub = spring({ frame: frame - 48, fps, config: theme.spring.smooth });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", color: theme.colors.text, textAlign: "center" }}>
      {[0, 1, 2].map((i) => {
        const r = interpolate(frame, [6 + i * 10, 70 + i * 10], [0, 1], { easing: theme.ease.out, ...clamp });
        return <div key={i} style={{ position: "absolute", top: 560 - 140, width: 280, height: 280, borderRadius: "50%", border: `3px solid ${theme.colors.primary}`, opacity: (1 - r) * 0.5, transform: `scale(${1 + r * 2.2})` }} />;
      })}
      <div style={{ position: "absolute", top: 420 }}><Logo size={280} delay={4} /></div>
      <div style={{ position: "absolute", top: 800, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Words text="Dostab" delay={18} style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 150, justifyContent: "center" }} />
        <Words text="Split trips with friends — every rupee, exactly." delay={30} per={2}
          style={{ fontFamily: fonts.body, fontWeight: 500, fontSize: 46, color: "#d4ebe1", justifyContent: "center", maxWidth: 860, marginTop: 24, lineHeight: 1.3 }} />
        <div style={{
          marginTop: 70, padding: "18px 40px", borderRadius: 60, border: "2px solid rgba(255,255,255,0.25)",
          fontFamily: fonts.body, fontWeight: 600, fontSize: 34, letterSpacing: 2, color: theme.colors.textDim,
          opacity: sub, transform: `translateY(${interpolate(sub, [0, 1], [30, 0])}px) scale(${interpolate(sub, [0, 1], [0.92, 1])})`,
        }}>HOW IT WORKS · {STEPS} STEPS</div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pill = spring({ frame: frame - 30, fps, config: theme.spring.bouncy });
  const tip = spring({ frame: frame - 50, fps, config: theme.spring.smooth });
  const glow = 0.5 + Math.sin(frame / 10) * 0.2;
  return (
    <AbsoluteFill style={{ alignItems: "center", color: theme.colors.text, textAlign: "center" }}>
      <div style={{ position: "absolute", top: 560 }}><Logo size={220} delay={2} /></div>
      <div style={{ position: "absolute", top: 870, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Words text="Start your first group" delay={10} style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 80, justifyContent: "center", maxWidth: 900, lineHeight: 1.1 }} />
        <div style={{
          marginTop: 70, padding: "30px 46px", borderRadius: 28, background: theme.colors.primary, color: "#022c22",
          fontFamily: fonts.display, fontWeight: 600, fontSize: 40,
          boxShadow: `0 20px 70px rgba(16,185,129,${glow})`,
          opacity: pill, transform: `translateY(${interpolate(pill, [0, 1], [40, 0])}px) scale(${interpolate(pill, [0, 1], [0.85, 1])})`,
        }}>dostab-production.up.railway.app</div>
        <div style={{
          marginTop: 60, maxWidth: 820, fontFamily: fonts.body, fontWeight: 500, fontSize: 38, lineHeight: 1.4, color: "#d4ebe1",
          opacity: tip, transform: `translateY(${interpolate(tip, [0, 1], [30, 0])}px)`,
        }}>Tip: in Chrome, open the menu and tap <b style={{ color: "#fff" }}>Add to Home screen</b> — Dostab sits on your phone like an app.</div>
      </div>
    </AbsoluteFill>
  );
};

const Voice: React.FC<{ id: string; from: number }> = ({ id, from }) => (
  <Sequence from={from + tl[id].lead} durationInFrames={tl[id].vo + 6}>
    <Audio src={staticFile(`vo/${id}/audio.mp3`)} volume={1} />
  </Sequence>
);

// ---------- composition ----------
export const Guide: React.FC = () => {
  const timing = springTiming({ config: { damping: 200 }, durationInFrames: OV });
  return (
    <AbsoluteFill style={{ fontFamily: fonts.body }}>
      <BgMesh />
      <PhoneShell />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO}><Intro /></TransitionSeries.Sequence>
        {beats.flatMap((b, i) => [
          <TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={timing} />,
          <TransitionSeries.Sequence key={`s${i}`} durationInFrames={durs[i]}>
            <BeatScene b={b} index={i} fresh={i === 0 || beats[i - 1].step !== b.step} />
          </TransitionSeries.Sequence>,
        ])}
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={OUTRO}><Outro /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Grade />
      <Grain />
      <Vignette />

      {/* Music sits well under the voice the whole way through. */}
      <Audio src={staticFile("sfx/music.wav")} loop volume={(f) => interpolate(f, [0, 20, TOTAL - 40, TOTAL], [0, 0.16, 0.16, 0], clamp)} />
      <Sequence from={4} durationInFrames={50}><Audio src={staticFile("sfx/chime.wav")} volume={0.35} /></Sequence>
      <Voice id="intro" from={0} />
      {beats.map((b, i) => (
        <React.Fragment key={i}>
          <Voice id={b.shot} from={beatStart(i)} />
          <Sequence from={Math.max(0, beatStart(i) - 2)} durationInFrames={14}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.2} /></Sequence>
          {b.tap !== false && b.mark !== false && (
            <Sequence from={beatStart(i) + tapFrame(b) - 2} durationInFrames={6}><Audio src={staticFile("sfx/tap.wav")} volume={0.6} /></Sequence>
          )}
        </React.Fragment>
      ))}
      <Voice id="outro" from={OUTRO_START} />
      <Sequence from={OUTRO_START + 28} durationInFrames={50}><Audio src={staticFile("sfx/chime.wav")} volume={0.3} /></Sequence>
    </AbsoluteFill>
  );
};
