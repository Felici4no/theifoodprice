// Bundles the extension entry points into extension/dist (IIFE, no runtime deps).
import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const options = {
  entryPoints: ["content", "background", "options"].map((n) => path.join(here, "src", `${n}.ts`)),
  outdir: path.join(here, "dist"),
  bundle: true,
  format: "iife",
  target: "chrome120",
  alias: { "@": path.resolve(here, "..") },
  // Shadow root mode of the overlay. "closed" in real use; end-to-end tests build with
  // TFP_SHADOW_MODE=open so the test browser can click inside the card.
  define: { __TFP_SHADOW_MODE__: JSON.stringify(process.env.TFP_SHADOW_MODE === "open" ? "open" : "closed") },
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  await (await context(options)).watch();
} else {
  await build(options);
}
