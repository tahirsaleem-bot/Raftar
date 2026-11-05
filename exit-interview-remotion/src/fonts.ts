// Fonts have to be loaded explicitly: Remotion renders in a bare browser, so a
// font-family the project never loaded silently falls back to a serif — which is exactly
// what the first still showed.
import { loadFont as loadLexend } from "@remotion/google-fonts/Lexend";
import { loadFont as loadSource } from "@remotion/google-fonts/SourceSans3";
import { loadFont as loadNastaliq } from "@remotion/google-fonts/NotoNastaliqUrdu";

const lexend = loadLexend("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });
const source = loadSource("normal", { weights: ["400", "600"], subsets: ["latin"] });
const nastaliq = loadNastaliq("normal", { weights: ["400", "600"], subsets: ["arabic"] });

export const fonts = {
  display: lexend.fontFamily,
  body: source.fontFamily,
  urdu: nastaliq.fontFamily,
};

/** Resolved once the three faces are in; the render waits on it. */
export const fontsReady = Promise.all([
  lexend.waitUntilDone(),
  source.waitUntilDone(),
  nastaliq.waitUntilDone(),
]);
