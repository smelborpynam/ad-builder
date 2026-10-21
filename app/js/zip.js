// Minimal ZIP writer (stored, no compression — JPG/PNG are already compressed).
window.Zip = (() => {
  'use strict';
  const CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  function create() {
    const files = [];
    return {
      add(name, bytes) { files.push({ name, bytes }); },
      get size() { return files.length; },
      toBlob() {
        const enc = new TextEncoder();
        const { time, date } = dosDateTime(new Date());
        const parts = [];
        const central = [];
        let offset = 0;

        for (const f of files) {
          const name = enc.encode(f.name);
          const crc = crc32(f.bytes);
          const size = f.bytes.length;

          const local = new DataView(new ArrayBuffer(30));
          local.setUint32(0, 0x04034b50, true);
          local.setUint16(4, 20, true);
          local.setUint16(6, 0x0800, true); // UTF-8 names
          local.setUint16(8, 0, true);      // stored
          local.setUint16(10, time, true);
          local.setUint16(12, date, true);
          local.setUint32(14, crc, true);
          local.setUint32(18, size, true);
          local.setUint32(22, size, true);
          local.setUint16(26, name.length, true);
          local.setUint16(28, 0, true);
          parts.push(new Uint8Array(local.buffer), name, f.bytes);

          const cd = new DataView(new ArrayBuffer(46));
          cd.setUint32(0, 0x02014b50, true);
          cd.setUint16(4, 20, true);
          cd.setUint16(6, 20, true);
          cd.setUint16(8, 0x0800, true);
          cd.setUint16(10, 0, true);
          cd.setUint16(12, time, true);
          cd.setUint16(14, date, true);
          cd.setUint32(16, crc, true);
          cd.setUint32(20, size, true);
          cd.setUint32(24, size, true);
          cd.setUint16(28, name.length, true);
          cd.setUint32(42, offset, true);
          central.push(new Uint8Array(cd.buffer), name);

          offset += 30 + name.length + size;
        }

        const cdSize = central.reduce((n, p) => n + p.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, cdSize, true);
        end.setUint32(16, offset, true);

        return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
      },
    };
  }

  return { create };
})();
