// MARISOL HEAT — main.ts (the entrypoint; at least one line here is authored
// by the recorded agent, as the transcript gate requires).
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from the kit's
// vendor/makefun-game.ts (copied unchanged). Runs twice, writes the same
// bytes both times: plain file copies + a deterministic dossier build.
import { cpSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });

const gameSrc = join(repoRoot, "game");
const shotsSrc = join(repoRoot, "screenshots");
cpSync(gameSrc, join(outDir, "game"), { recursive: true });
if (existsSync(shotsSrc)) cpSync(shotsSrc, join(outDir, "screenshots"), { recursive: true });

// buildDossier(rootDir, caps): rootDir holds game/ and screenshots/.
const dossier = await buildDossier(repoRoot, {
  text_max_bytes: 163840,
  dossier_max_bytes: 4194304,
  max_images: 8,
});
const dossierBytes =
  dossier instanceof Uint8Array ? dossier
  : typeof dossier === "string" ? Buffer.from(dossier, "utf8")
  : Buffer.from(JSON.stringify(dossier, null, 2) + "\n", "utf8");
writeFileSync(join(outDir, "dossier.json"), dossierBytes);
console.log("MARISOL HEAT: wrote", outDir, "dossier bytes:", dossierBytes.length);
