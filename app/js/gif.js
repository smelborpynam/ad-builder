// Minimal animated GIF writer. One shared palette (built from sample frames), ordered dithering so
// unchanged pixels stay identical from frame to frame, and each frame stores only what changed.
window.Gif = (() => {
  'use strict';
  const TRANSPARENT = 255; // palette slot kept for "same as the frame before"

  function writer() {
    let buf = new Uint8Array(1 << 20), n = 0;
    const need = (k) => {
      if (n + k <= buf.length) return;
      const next = new Uint8Array(Math.max(buf.length * 2, n + k));
      next.set(buf.subarray(0, n));
      buf = next;
    };
    return {
      byte(b) { need(1); buf[n++] = b; },
      u16(v) { need(2); buf[n++] = v & 255; buf[n++] = (v >> 8) & 255; },
      bytes(a) { need(a.length); buf.set(a, n); n += a.length; },
      str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); },
      result: () => buf.slice(0, n),
    };
  }

  // Median cut over a 5-bit-per-channel histogram of the sample frames.
  function buildPalette(samples, maxColors) {
    const hist = new Uint32Array(32768);
    for (const data of samples) {
      const step = Math.max(1, Math.floor(data.length / 4 / 400000)) * 4;
      for (let i = 0; i < data.length; i += step) hist[((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)]++;
    }
    const ch = (bin, c) => (c === 0 ? bin >> 10 : c === 1 ? (bin >> 5) & 31 : bin & 31);
    const makeBox = (bins) => {
      const lo = [31, 31, 31], hi = [0, 0, 0];
      let count = 0;
      for (const b of bins) {
        count += hist[b];
        for (let c = 0; c < 3; c++) { const v = ch(b, c); if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
      }
      const range = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const axis = range.indexOf(Math.max(...range));
      return { bins, count, axis, score: count * range[axis] };
    };
    const all = [];
    for (let b = 0; b < hist.length; b++) if (hist[b]) all.push(b);
    const boxes = all.length ? [makeBox(all)] : [];
    while (boxes.length < maxColors) {
      let best = -1;
      boxes.forEach((bx, i) => { if (bx.bins.length > 1 && (best < 0 || bx.score > boxes[best].score)) best = i; });
      if (best < 0) break;
      const { bins, axis, count } = boxes[best];
      bins.sort((a, b) => ch(a, axis) - ch(b, axis));
      let acc = 0, cut = 1;
      for (let i = 0; i < bins.length - 1; i++) { acc += hist[bins[i]]; if (acc >= count / 2) { cut = i + 1; break; } cut = i + 1; }
      boxes.splice(best, 1, makeBox(bins.slice(0, cut)), makeBox(bins.slice(cut)));
    }
    const pal = new Uint8Array(256 * 3);
    boxes.forEach((bx, i) => {
      let r = 0, g = 0, b = 0;
      for (const bin of bx.bins) { const k = hist[bin]; r += k * ch(bin, 0); g += k * ch(bin, 1); b += k * ch(bin, 2); }
      const k = bx.count || 1;
      pal[i * 3] = Math.min(255, Math.round((r / k) * 8 + 4));
      pal[i * 3 + 1] = Math.min(255, Math.round((g / k) * 8 + 4));
      pal[i * 3 + 2] = Math.min(255, Math.round((b / k) * 8 + 4));
    });
    return { pal, size: Math.max(1, boxes.length) };
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.47) * 18);

  // LZW-compresses palette indices into GIF data sub-blocks (classic "compress" hash table).
  const HSIZE = 5003;
  const htab = new Int32Array(HSIZE), codetab = new Int32Array(HSIZE);
  function lzw(w, pixels, minCode) {
    w.byte(minCode);
    const block = new Uint8Array(255);
    let blen = 0;
    const flushBlock = () => { if (blen) { w.byte(blen); w.bytes(block.subarray(0, blen)); blen = 0; } };
    const out = (b) => { block[blen++] = b; if (blen === 255) flushBlock(); };

    const initBits = minCode + 1, clearCode = 1 << minCode, eof = clearCode + 1;
    let nBits = initBits, maxcode = (1 << nBits) - 1, freeEnt = clearCode + 2, clearFlag = false;
    let acc = 0, accBits = 0;
    const output = (code) => {
      acc |= code << accBits;
      accBits += nBits;
      while (accBits >= 8) { out(acc & 255); acc >>>= 8; accBits -= 8; }
      if (freeEnt > maxcode || clearFlag) {
        if (clearFlag) { nBits = initBits; maxcode = (1 << nBits) - 1; clearFlag = false; }
        else { nBits++; maxcode = nBits === 12 ? 4096 : (1 << nBits) - 1; }
      }
      if (code === eof) { while (accBits > 0) { out(acc & 255); acc >>>= 8; accBits -= 8; } accBits = 0; flushBlock(); }
    };

    htab.fill(-1);
    output(clearCode);
    let ent = pixels[0];
    outer: for (let i = 1; i < pixels.length; i++) {
      const c = pixels[i];
      const fcode = (c << 12) + ent;
      let h = (c << 4) ^ ent;
      if (htab[h] === fcode) { ent = codetab[h]; continue; }
      if (htab[h] >= 0) {
        const disp = h === 0 ? 1 : HSIZE - h;
        do {
          h -= disp;
          if (h < 0) h += HSIZE;
          if (htab[h] === fcode) { ent = codetab[h]; continue outer; }
        } while (htab[h] >= 0);
      }
      output(ent);
      ent = c;
      if (freeEnt < 4096) { codetab[h] = freeEnt++; htab[h] = fcode; }
      else { htab.fill(-1); freeEnt = clearCode + 2; clearFlag = true; output(clearCode); }
    }
    output(ent);
    output(eof);
    w.byte(0);
  }

  // samples: RGBA arrays of a few frames, to pick the colours from.
  function create(width, height, samples) {
    const { pal, size } = buildPalette(samples, 255);
    const lut = new Int16Array(1 << 18).fill(-1);
    const nearest = (key) => {
      const r = ((key >> 12) << 2) + 2, g = (((key >> 6) & 63) << 2) + 2, b = ((key & 63) << 2) + 2;
      let best = 0, bd = Infinity;
      for (let i = 0; i < size; i++) {
        const dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b;
        const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (d < bd) { bd = d; best = i; }
      }
      lut[key] = best;
      return best;
    };
    const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

    const w = writer();
    w.str('GIF89a');
    w.u16(width); w.u16(height);
    w.byte(0xf7); w.byte(0); w.byte(0);
    w.bytes(pal);
    w.byte(0x21); w.byte(0xff); w.byte(11); w.str('NETSCAPE2.0'); w.byte(3); w.byte(1); w.u16(0); w.byte(0); // loop forever

    let prev = null;
    const idx = new Uint8Array(width * height);
    return {
      // data: RGBA pixels of the whole frame; delay in hundredths of a second.
      addFrame(data, delay) {
        for (let y = 0, p = 0; y < height; y++) {
          const row = (y & 3) * 4;
          for (let x = 0; x < width; x++, p++) {
            const d = BAYER[row + (x & 3)], i = p * 4;
            const key = ((clamp(data[i] + d) >> 2) << 12) | ((clamp(data[i + 1] + d) >> 2) << 6) | (clamp(data[i + 2] + d) >> 2);
            const v = lut[key];
            idx[p] = v >= 0 ? v : nearest(key);
          }
        }
        let x0 = 0, y0 = 0, x1 = width - 1, y1 = height - 1, pixels = idx, transparent = false;
        if (prev) {
          // Only the box around what changed; unchanged pixels inside it are see-through.
          x0 = width; y0 = height; x1 = -1; y1 = -1;
          for (let y = 0, p = 0; y < height; y++) {
            for (let x = 0; x < width; x++, p++) {
              if (idx[p] !== prev[p]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            }
          }
          if (x1 < 0) { x0 = y0 = x1 = y1 = 0; }
          const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
          pixels = new Uint8Array(bw * bh);
          for (let y = 0; y < bh; y++) {
            const src = (y + y0) * width + x0;
            for (let x = 0; x < bw; x++) {
              const v = idx[src + x];
              if (v === prev[src + x]) pixels[y * bw + x] = TRANSPARENT;
              else { pixels[y * bw + x] = v; prev[src + x] = v; }
            }
          }
          transparent = true;
        } else {
          prev = idx.slice();
        }
        w.byte(0x21); w.byte(0xf9); w.byte(4);
        w.byte((1 << 2) | (transparent ? 1 : 0)); // keep the previous frame underneath
        w.u16(Math.max(2, Math.round(delay)));
        w.byte(TRANSPARENT); w.byte(0);
        w.byte(0x2c); w.u16(x0); w.u16(y0); w.u16(x1 - x0 + 1); w.u16(y1 - y0 + 1); w.byte(0);
        lzw(w, pixels, 8);
      },
      finish() { w.byte(0x3b); return w.result(); },
    };
  }

  return { create };
})();
