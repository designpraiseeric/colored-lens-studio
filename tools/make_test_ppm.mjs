// Makes the 720x576 PPM the OpenFX reference-host test needs, from test/fixtures/frame.bmp.
import fs from 'node:fs';
import { decodeImage } from '../core/image.js';
const [out = 'engine/build/test_720x576.ppm'] = process.argv.slice(2);
const f = decodeImage(fs.readFileSync(new URL('../test/fixtures/frame.bmp', import.meta.url))), W = 720, H = 576, px = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (Math.floor(y * f.h / H) * f.w + Math.floor(x * f.w / W)) * 4, d = (y * W + x) * 3; px[d] = f.data[s]; px[d + 1] = f.data[s + 1]; px[d + 2] = f.data[s + 2]; }
fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), px])); console.log(out);
