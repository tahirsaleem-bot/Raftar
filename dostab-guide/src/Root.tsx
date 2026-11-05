import React from "react";
import { Composition } from "remotion";
import { Guide, TOTAL } from "./Guide";
import { theme } from "./theme";

export const RemotionRoot: React.FC = () => (
  <Composition id="DostabGuide" component={Guide} durationInFrames={TOTAL} fps={theme.fps} width={1080} height={1920} />
);
