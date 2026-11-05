// A real screen with the camera moving onto the control the narration is naming.
//
// A generic Ken Burns drift is fine for a photograph and wrong for a walkthrough: the
// viewer is being told "press Send invite", so the frame should travel to Send invite.
// The ring's position comes from shots.json, which shots.js measures from the element's
// own bounding box when it takes the screenshot — never guessed from the CSS.
import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import shots from "../../public/shots/shots.json";

type Ring = { x: number; y: number; w: number; h: number } | null;
type Shot = { file: string; width: number; height: number; ring: Ring };

export const Screen: React.FC<{
  id: keyof typeof shots;
  /** How far in to push by the end of the scene. 1 = no push. */
  zoom?: number;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ id, zoom = 1.18, delay = 0, style }) => {
  const meta = shots[id] as Shot;
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const enter = spring({ frame: frame - delay, fps, config: theme.spring.smooth });
  // The push runs across the whole scene, so the move is never noticed as a move.
  const push = interpolate(frame, [delay, durationInFrames], [1, zoom], {
    easing: theme.ease.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Scale about the ring, so the control stays put while everything grows around it.
  const origin = meta.ring
    ? `${(meta.ring.x * 100).toFixed(1)}% ${(meta.ring.y * 100).toFixed(1)}%`
    : "50% 50%";

  return (
    <div style={{ position: "relative", ...style }}>
      <div
        style={{
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 38px 100px rgba(0,0,0,0.55)",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [44, 0])}px) `
            + `scale(${(push * interpolate(enter, [0, 1], [0.975, 1])).toFixed(4)})`,
          transformOrigin: origin,
        }}
      >
        <Img src={staticFile(`shots/${meta.file}`)}
          style={{ display: "block", width: "100%", height: "auto" }} />
      </div>
    </div>
  );
};

