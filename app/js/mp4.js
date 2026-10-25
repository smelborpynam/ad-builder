// Minimal MP4 (H.264) video writer using the browser's built-in video encoder (WebCodecs).
window.Mp4 = (() => {
  'use strict';
  const supported = () => typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';

  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const u16 = (v) => [(v >> 8) & 255, v & 255];
  const str = (s) => [...s].map((c) => c.charCodeAt(0));
  function box(type, ...parts) {
    const body = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
    const size = 8 + body.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(size);
    out.set([...u32(size), ...str(type)], 0);
    let o = 8;
    for (const p of body) { out.set(p, o); o += p.length; }
    return out;
  }
  const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].flatMap(u32);

  async function pickConfig(width, height, fps) {
    const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
    const level = mbs <= 8192 ? '28' : mbs <= 8704 ? '2a' : mbs <= 22080 ? '32' : '33';
    const bitrate = Math.round(Math.min(12e6, Math.max(1.5e6, width * height * fps * 0.1)));
    for (const profile of ['6400', '4d00', '4200']) {
      const config = { codec: `avc1.${profile}${level}`, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
      try {
        const res = await VideoEncoder.isConfigSupported(config);
        if (res.supported) return config;
      } catch { /* try the next profile */ }
    }
    throw new Error(`This browser can't make ${width}×${height} videos. Try Chrome or Edge.`);
  }

  // frames: how many; draw(i) returns the canvas for frame i (width × height, both even).
  async function encode({ width, height, fps, frames, draw, onProgress }) {
    if (!supported()) throw new Error('Making videos needs Chrome or Edge.');
    const config = await pickConfig(width, height, fps);
    const chunks = [];
    let description = null, failure = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta && meta.decoderConfig && meta.decoderConfig.description) {
          const d = meta.decoderConfig.description;
          description = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
        }
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        chunks.push({ data, key: chunk.type === 'key' });
      },
      error: (e) => { failure = e; },
    });
    encoder.configure(config);
    const dur = Math.round(1e6 / fps);
    for (let i = 0; i < frames; i++) {
      if (failure) break;
      const canvas = await draw(i);
      const frame = new VideoFrame(canvas, { timestamp: i * dur, duration: dur });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 4 && !failure) await new Promise((r) => setTimeout(r, 2));
      if (onProgress) onProgress((i + 1) / frames);
    }
    if (!failure) await encoder.flush().catch((e) => { failure = e; });
    encoder.close();
    if (failure) throw new Error(`Video failed: ${failure.message || failure}`);
    if (!description || !chunks.length) throw new Error('Video failed: the encoder gave no output.');
    return mux(width, height, fps, chunks, description);
  }

  // Lays the encoded frames out as one MP4 track, header first so it plays while loading.
  function mux(width, height, fps, chunks, avcC) {
    const timescale = fps * 1000, delta = 1000;
    const mediaDur = chunks.length * delta;
    const movieDur = Math.round((chunks.length / fps) * 1000);
    const keys = [];
    chunks.forEach((c, i) => { if (c.key) keys.push(i + 1); });
    const total = chunks.reduce((n, c) => n + c.data.length, 0);

    const ftyp = box('ftyp', str('isom'), u32(512), str('isomiso2avc1mp41'));
    const moov = (offset) => box('moov',
      box('mvhd', u32(0), u32(0), u32(0), u32(1000), u32(movieDur), u32(0x10000), u16(0x100), u16(0), u32(0), u32(0), MATRIX, new Uint8Array(24), u32(2)),
      box('trak',
        box('tkhd', u32(3), u32(0), u32(0), u32(1), u32(0), u32(movieDur), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
        box('mdia',
          box('mdhd', u32(0), u32(0), u32(0), u32(timescale), u32(mediaDur), u16(0x55c4), u16(0)),
          box('hdlr', u32(0), u32(0), str('vide'), u32(0), u32(0), u32(0), str('VideoHandler\0')),
          box('minf',
            box('vmhd', u32(1), u16(0), u16(0), u16(0), u16(0)),
            box('dinf', box('dref', u32(0), u32(1), box('url ', u32(1)))),
            box('stbl',
              box('stsd', u32(0), u32(1),
                box('avc1', new Uint8Array(6), u16(1), u16(0), u16(0), u32(0), u32(0), u32(0), u16(width), u16(height),
                  u32(0x480000), u32(0x480000), u32(0), u16(1), new Uint8Array(32), u16(0x18), u16(0xffff), box('avcC', avcC))),
              box('stts', u32(0), u32(1), u32(chunks.length), u32(delta)),
              box('stss', u32(0), u32(keys.length), keys.flatMap(u32)),
              box('stsc', u32(0), u32(1), u32(1), u32(chunks.length), u32(1)),
              box('stsz', u32(0), u32(0), u32(chunks.length), chunks.flatMap((c) => u32(c.data.length))),
              box('stco', u32(0), u32(1), u32(offset)))))));
    const head = moov(0);
    const offset = ftyp.length + head.length + 8;
    return new Blob([ftyp, moov(offset), Uint8Array.from([...u32(total + 8), ...str('mdat')]), ...chunks.map((c) => c.data)], { type: 'video/mp4' });
  }

  return { supported, encode };
})();
