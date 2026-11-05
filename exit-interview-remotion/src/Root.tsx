import React from "react";
import { Composition } from "remotion";
import { Film, FPS, TOTAL_FRAMES } from "./Film";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ExitInterviews"
    component={Film}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
