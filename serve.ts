// MARISOL HEAT — serve.ts
// Tiny static server for local playtesting: serves game/ at http://localhost:8080.
// Standard library only, no build step.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "game");
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
};

const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "/index.html" : (req.url ?? "/index.html").split("?")[0];
  try {
    const data = await readFile(join(root, decodeURIComponent(path)));
    res.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
server.listen(8080, () => console.log("MARISOL HEAT at http://localhost:8080"));
