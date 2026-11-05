// Remotion renders in a bare browser, so every face must be loaded explicitly.
import { loadFont as loadLexend } from "@remotion/google-fonts/Lexend";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const lexend = loadLexend("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

export const fonts = { display: lexend.fontFamily, body: inter.fontFamily };
