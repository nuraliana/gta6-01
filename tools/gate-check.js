// Local gate check for the Solmar Bay entry: mirrors the sealed scorer's rows
// that can be checked offline (game_files, screenshots, dossier_matches shape).
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts && node tools/gate-check.js [out]
const fs = require('fs');
const path = require('path');

const out = process.argv[2] || 'out';
const gameDir = path.join(out, 'game');
const shotDir = path.join(out, 'screenshots');
let fails = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ?? ''}`);
  if (!ok) fails++;
};

// game_files
let entries = 0;
let bytes = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    entries++;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile()) {
      bytes += fs.statSync(p).size;
      if (Buffer.byteLength(path.relative(gameDir, p), 'utf8') > 1000) check('game path length', false, p);
    } else check('game plain files', false, p);
  }
};
walk(gameDir);
check('game_files count<=993', entries <= 993, `${entries} entries`);
check('game_files bytes<=48MiB', bytes <= 48 * 1024 * 1024, `${bytes} bytes`);
const index = path.join(gameDir, 'index.html');
check('index.html <=1MiB', fs.existsSync(index) && fs.statSync(index).size <= 1024 * 1024,
  fs.existsSync(index) ? `${fs.statSync(index).size} bytes` : 'missing');

// screenshots
const shots = fs.readdirSync(shotDir).filter((f) => !f.startsWith('.')).sort();
check('screenshots count 3-4', shots.length >= 3 && shots.length <= 4, `${shots.length}: ${shots.join(', ')}`);
for (const s of shots) {
  const p = path.join(shotDir, s);
  const buf = fs.readFileSync(p);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  let w = 0, h = 0;
  if (isJpeg) {
    // Parse SOF markers for dimensions.
    let i = 2;
    while (i < buf.length - 1) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        h = buf.readUInt16BE(i + 5);
        w = buf.readUInt16BE(i + 7);
        break;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } else if (isPng) {
    w = buf.readUInt32BE(16);
    h = buf.readUInt32BE(20);
  }
  check(`shot ${s} jpeg/png <=256KiB`, (isJpeg || isPng) && buf.length <= 262144, `${buf.length} bytes`);
  check(`shot ${s} dims`, Math.max(w, h) <= 1280 && Math.min(w, h) >= 480, `${w}x${h}`);
}

// dossier
const dossier = JSON.parse(fs.readFileSync(path.join(out, 'dossier.json'), 'utf8'));
check('dossier schema', dossier.schema === 'makefun/dossier/v1', dossier.schema);
check('dossier <=1.5MiB', fs.statSync(path.join(out, 'dossier.json')).size <= 1.5 * 1024 * 1024,
  `${fs.statSync(path.join(out, 'dossier.json')).size} bytes`);
check('dossier text <=160KiB', Buffer.byteLength(dossier.text, 'utf8') <= 163840,
  `${Buffer.byteLength(dossier.text, 'utf8')} bytes`);
check('dossier images', Array.isArray(dossier.images) && dossier.images.length === shots.length,
  `${(dossier.images || []).length} images`);
console.log(fails === 0 ? 'GATE-CHECK OK' : `GATE-CHECK FAILED: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
