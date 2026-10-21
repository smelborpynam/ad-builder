// Draws ad images on a canvas and plans which photo/style goes into each slot.
window.AdRender = (() => {
  'use strict';
  const { FONTS, PRINT_DPI } = AdPresets;

  // ---------- Styles ----------
  // The first pass for every size is "clean". Extra images needed beyond the number
  // of photos step through these looks in order.
  const STYLES = [
    { id: 'clean', name: 'Clean' },
    { id: 'sparkle', name: 'Gold sparkle' },
    { id: 'noir', name: 'Black & white' },
    { id: 'spotlight', name: 'Spotlight' },
    { id: 'frame', name: 'Gold frame' },
    { id: 'warm', name: 'Warm glow' },
    { id: 'backdrop', name: 'Full photo on blur', skip: (shape) => shape === 'strip' },
    { id: 'swap', name: 'Flipped layout' },
    { id: 'zoom', name: 'Close-up', skip: (shape, photo) => !!(photo && photo.hasTitle) },
    { id: 'tint', name: 'Accent color tint' },
    { id: 'cinema', name: 'Cinematic bars', skip: (shape) => shape === 'strip' || shape === 'tower' },
  ];

  function stylesFor(shape, photo) {
    return STYLES.filter((s) => !s.skip || !s.skip(shape, photo));
  }

  function shapeOf(w, h) {
    const r = w / h;
    if (r >= 2.8) return 'strip';
    if (r >= 1.15) return 'landscape';
    if (r >= 0.85) return 'square';
    if (r >= 0.6) return 'portrait';
    return 'tower';
  }

  // ---------- Sizes & planning ----------
  function pxSize(row) {
    const k = row.unit === 'in' ? PRINT_DPI : 1;
    return { w: Math.round((+row.w || 0) * k), h: Math.round((+row.h || 0) * k) };
  }

  function validRows(theatre) {
    return (theatre.sizes || []).filter((r) => {
      const { w, h } = pxSize(r);
      return (+r.count || 0) > 0 && w > 0 && h > 0;
    });
  }

  function theatreTotal(theatre) {
    return validRows(theatre).reduce((n, r) => n + (+r.count || 0), 0);
  }

  // Spread `total` images across rows in proportion to each row's requested count.
  function distribute(base, total) {
    const sum = base.reduce((a, b) => a + b, 0);
    if (!total || total === sum || !sum) return base.slice();
    const raw = base.map((c) => (c * total) / sum);
    const out = raw.map((x) => Math.floor(x));
    if (total >= base.length) out.forEach((v, i) => { if (v < 1) out[i] = 1; });
    let diff = total - out.reduce((a, b) => a + b, 0);
    const byFrac = raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f);
    for (let j = 0; diff > 0; j++) { out[byFrac[j % byFrac.length].i]++; diff--; }
    while (diff < 0) {
      let m = 0;
      out.forEach((v, i) => { if (v > out[m]) m = i; });
      out[m]--; diff++;
    }
    return out;
  }

  // Photos ordered by how well they suit a size (aspect match, title art in strips).
  function photoOrder(photos, w, h, shape) {
    const ra = w / h;
    return photos
      .map((p, i) => {
        const mismatch = Math.abs(Math.log((p.w / p.h) / ra));
        let score = mismatch;
        if (p.hasTitle && shape === 'strip') score += 5;
        if (p.hasTitle && mismatch > 0.12) score += 0.3;
        return { p, i, score };
      })
      .sort((a, b) => a.score - b.score || a.i - b.i)
      .map((x) => x.p);
  }

  function plan(act, theatre, total) {
    const rows = validRows(theatre);
    const counts = distribute(rows.map((r) => +r.count || 0), total || theatreTotal(theatre));
    const items = [];
    rows.forEach((row, i) => {
      const { w, h } = pxSize(row);
      const shape = shapeOf(w, h);
      const order = photoOrder(act.photos || [], w, h, shape);
      const P = order.length;
      for (let k = 0; k < counts[i]; k++) {
        const photo = P ? order[(k + i) % P] : null;
        const cycle = P ? Math.floor(k / P) : k;
        const styles = stylesFor(shape, photo);
        items.push({
          key: `${row.id}:${k}`, row, w, h, shape, n: k + 1, count: counts[i],
          photoId: photo ? photo.id : null,
          styleId: styles[cycle % styles.length].id,
        });
      }
    });
    return items;
  }

  // ---------- Show text ----------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function joinList(parts) {
    if (parts.length <= 1) return parts.join('');
    if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
  }

  function fmtTime(t) {
    if (!t) return '';
    const [H, M] = t.split(':').map(Number);
    if (Number.isNaN(H)) return t;
    const h = ((H + 11) % 12) + 1;
    const ap = H >= 12 ? 'PM' : 'AM';
    return M ? `${h}:${String(M).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
  }

  // [{date:'2026-12-06', time:'19:30'}, ...] -> "Dec 6", "Dec 6 & 7", "Dec 6–8", "Nov 30 & Dec 1"
  function formatDates(dates, withTimes) {
    const seen = new Set();
    const list = (dates || [])
      .filter((d) => d && d.date && !seen.has(d.date) && seen.add(d.date))
      .map((d) => { const [y, m, day] = d.date.split('-').map(Number); return { y, m, d: day, time: d.time || '' }; })
      .sort((a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d));
    if (!list.length) return '';

    const groups = [];
    for (const x of list) {
      const g = groups[groups.length - 1];
      if (g && g.y === x.y && g.m === x.m) g.days.push(x.d);
      else groups.push({ y: x.y, m: x.m, days: [x.d] });
    }
    const groupStr = (g) => {
      const runs = [];
      for (const d of g.days) {
        const r = runs[runs.length - 1];
        if (r && d === r[1] + 1) r[1] = d; else runs.push([d, d]);
      }
      const parts = [];
      for (const [a, b] of runs) {
        if (b - a >= 2) parts.push(`${a}–${b}`);
        else for (let d = a; d <= b; d++) parts.push(String(d));
      }
      return `${MONTHS[g.m - 1]} ${joinList(parts)}`;
    };
    let s = joinList(groups.map(groupStr));
    if (withTimes) {
      const times = [...new Set(list.map((x) => x.time).filter(Boolean))];
      if (times.length === 1) s += ` · ${fmtTime(times[0])}`;
    }
    return s;
  }

  function showInfo(show, theatre) {
    return {
      venue: theatre ? (theatre.displayName || theatre.name || '') : '',
      dates: formatDates(show.dates, show.showTimes),
      custom: (show.customText || '').trim(),
      extra: (show.extraLine || '').trim(),
    };
  }

  function infoPreviewText(info) {
    if (info.custom) return info.custom.replace(/\s*[|\n]\s*/g, ' / ');
    return [info.venue, info.dates].filter(Boolean).join(', ');
  }

  // ---------- Drawing helpers ----------
  const FALLBACK = {
    serif: 'Georgia, "Times New Roman", serif',
    sans: 'Arial, Helvetica, sans-serif',
    script: '"Brush Script MT", "Segoe Script", cursive',
  };
  const fontInfo = (family) => FONTS.find((f) => f.family === family) || { weight: 700, kind: 'sans' };
  function font(family, size) {
    const f = fontInfo(family);
    return `${f.weight} ${Math.max(1, size).toFixed(2)}px "${family}", ${FALLBACK[f.kind] || FALLBACK.sans}`;
  }

  const HAS_LETTER_SPACING = (() => {
    try { return 'letterSpacing' in document.createElement('canvas').getContext('2d'); } catch { return false; }
  })();
  function setSpacing(ctx, px) { if (HAS_LETTER_SPACING) ctx.letterSpacing = `${px}px`; }

  const FILTER_OK = (() => {
    try {
      const c = document.createElement('canvas').getContext('2d');
      if (typeof c.filter !== 'string') return false;
      c.filter = 'blur(2px)';
      return c.filter === 'blur(2px)';
    } catch { return false; }
  })();

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rgba(hex, a) {
    let h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function goldGradient(ctx, y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.45, '#f5d37c');
    g.addColorStop(1, '#c9973f');
    return g;
  }

  function shadowFor(ctx, size) {
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = size * 0.05;
  }
  function noShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

  function containFit(iw, ih, box) {
    const s = Math.min(box.w / iw, box.h / ih);
    const w = iw * s, h = ih * s;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  }

  function drawCover(ctx, img, r, fx = 0.5, fy = 0.4, zoom = 1) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const ra = r.w / r.h;
    let sw, sh;
    if (iw / ih > ra) { sh = ih; sw = sh * ra; } else { sw = iw; sh = sw / ra; }
    sw /= zoom; sh /= zoom;
    const sx = Math.min(Math.max(fx * iw - sw / 2, 0), iw - sw);
    const sy = Math.min(Math.max(fy * ih - sh / 2, 0), ih - sh);
    ctx.drawImage(img, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
  }

  // Blurred, darkened copy of the photo filling `r` (used behind full "contain" photos).
  function drawBlurred(g, img, r, scale) {
    const dw = Math.max(1, Math.round(r.w * scale)), dh = Math.max(1, Math.round(r.h * scale));
    const tmp = document.createElement('canvas');
    tmp.width = dw; tmp.height = dh;
    const t = tmp.getContext('2d');
    const blur = Math.max(dw, dh) / 30;
    if (FILTER_OK) {
      t.filter = `blur(${blur}px)`;
      drawCover(t, img, { x: -blur * 2, y: -blur * 2, w: dw + blur * 4, h: dh + blur * 4 }, 0.5, 0.5);
      t.filter = 'none';
    } else {
      const s = document.createElement('canvas');
      s.width = Math.max(1, Math.round(dw / 24)); s.height = Math.max(1, Math.round(dh / 24));
      drawCover(s.getContext('2d'), img, { x: 0, y: 0, w: s.width, h: s.height }, 0.5, 0.5);
      t.imageSmoothingQuality = 'high';
      t.drawImage(s, 0, 0, dw, dh);
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(tmp, Math.round(r.x * scale), Math.round(r.y * scale));
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(r.x, r.y, r.w, r.h);
  }

  // ---------- Layout ----------
  // Works out where the photo, title and show info go for a given size.
  function layout(W, H, shape, o) {
    const pad = Math.min(W, H) * 0.06;
    const L = { photoRect: { x: 0, y: 0, w: W, h: H }, feather: null, titleBox: null, infoBox: null, topShade: 0, bottomShade: 0, containRect: null, panel: null };

    if (shape === 'strip') {
      const pw = Math.min(W * 0.5, H * 1.9);
      const right = !o.swap;
      L.photoRect = right ? { x: W - pw, y: 0, w: pw, h: H } : { x: 0, y: 0, w: pw, h: H };
      L.feather = { side: right ? 'left' : 'right', size: pw * 0.5 };
      const tw = W - pw * 0.72 - pad * 0.8;
      const tr = right ? { x: pad * 0.8, w: tw } : { x: pw * 0.72, w: tw };
      L.panel = right ? { x: 0, y: 0, w: W - pw * 0.5, h: H } : { x: pw * 0.5, y: 0, w: W - pw * 0.5, h: H };
      const vp = H * 0.12, ih = H - 2 * vp;
      if (o.wantTitle && o.wantInfo) {
        if (H >= 150) {
          L.titleBox = { x: tr.x, y: vp, w: tr.w, h: ih * 0.6 };
          L.infoBox = { x: tr.x, y: vp + ih * 0.66, w: tr.w, h: ih * 0.34 };
        } else {
          const gap = tr.w * 0.04;
          L.titleBox = { x: tr.x, y: vp, w: tr.w * 0.5 - gap, h: ih };
          L.infoBox = { x: tr.x + tr.w * 0.5 + gap, y: vp, w: tr.w * 0.5 - gap, h: ih };
        }
      } else if (o.wantTitle) L.titleBox = { x: tr.x, y: vp, w: tr.w, h: ih };
      else if (o.wantInfo) L.infoBox = { x: tr.x, y: vp, w: tr.w, h: ih };
      return L;
    }

    if (shape === 'landscape' && o.wantTitle) {
      // Title panel on one side, photo fading in from the other (like the Christmas example).
      const right = !o.swap;
      const pw = W * 0.66;
      L.photoRect = right ? { x: W - pw, y: 0, w: pw, h: H } : { x: 0, y: 0, w: pw, h: H };
      L.containRect = L.photoRect;
      L.feather = { side: right ? 'left' : 'right', size: pw * 0.38 };
      const panelW = W * 0.4;
      L.panel = right ? { x: 0, y: 0, w: panelW, h: H } : { x: W - panelW, y: 0, w: panelW, h: H };
      const px = right ? pad : W - panelW + pad * 0.5;
      const pwid = panelW - pad * 1.5;
      if (o.wantInfo) {
        L.titleBox = { x: px, y: H * 0.12, w: pwid, h: H * 0.48 };
        L.infoBox = { x: px, y: H * 0.66, w: pwid, h: H * 0.22 };
      } else {
        L.titleBox = { x: px, y: H * 0.18, w: pwid, h: H * 0.64 };
      }
      return L;
    }

    // Full-bleed photo with text at top/bottom.
    const tFrac = { landscape: 0.24, square: 0.22, portrait: 0.2, tower: 0.19 }[shape];
    const iFrac = { landscape: 0.13, square: 0.14, portrait: 0.13, tower: 0.17 }[shape];
    const top = !o.swap;
    const sidePad = shape === 'landscape' ? W * 0.08 : pad;
    if (o.wantTitle) {
      const b = { x: sidePad, y: pad * 0.8, w: W - 2 * sidePad, h: H * tFrac };
      if (!top) b.y = H - pad * 0.8 - b.h;
      L.titleBox = b;
    }
    if (o.wantInfo) {
      const b = { x: sidePad, y: H - pad * 0.8 - H * iFrac, w: W - 2 * sidePad, h: H * iFrac };
      if (!top) b.y = pad * 0.8;
      L.infoBox = b;
    }
    const boxes = [L.titleBox, L.infoBox].filter(Boolean);
    const tops = boxes.filter((b) => b.y < H / 2);
    const bots = boxes.filter((b) => b.y >= H / 2);
    if (tops.length) L.topShade = 0.55;
    if (bots.length) L.bottomShade = 0.55;
    const y0 = tops.length ? Math.max(...tops.map((b) => b.y + b.h)) : 0;
    const y1 = bots.length ? Math.min(...bots.map((b) => b.y)) : H;
    L.containRect = { x: 0, y: y0, w: W, h: Math.max(H * 0.3, y1 - y0) };
    return L;
  }

  // ---------- Photo layer ----------
  function drawPhotoLayer(W, H, scale, shape, photo, img, L, styleId, act) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * scale));
    c.height = Math.max(1, Math.round(H * scale));
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.imageSmoothingQuality = 'high';
    const r = L.photoRect;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const mismatch = Math.abs(Math.log((iw / ih) / (r.w / r.h)));
    // Photos with title art are never cropped by more than a sliver, so the title stays whole.
    const contain = shape !== 'strip' && (styleId === 'backdrop' || (photo.hasTitle && mismatch > 0.02));

    if (contain) {
      drawBlurred(g, img, r, scale);
      // Near-matching shapes fill the whole frame; very different shapes sit between the text areas.
      const cr = mismatch < 0.12 && styleId !== 'backdrop' ? r : (L.containRect || r);
      const inset = cr === r ? 0 : Math.min(cr.w, cr.h) * 0.03;
      const fit = containFit(iw, ih, { x: cr.x + inset, y: cr.y + inset, w: cr.w - inset * 2, h: cr.h - inset * 2 });
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = Math.min(W, H) * 0.03;
      g.drawImage(img, fit.x, fit.y, fit.w, fit.h);
      g.restore();
    } else {
      drawCover(g, img, r, photo.fx ?? 0.5, photo.fy ?? 0.4, styleId === 'zoom' ? 1.35 : 1);
    }

    const fill = (op, color, alpha = 1) => {
      g.save();
      g.globalCompositeOperation = op;
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.restore();
    };
    if (styleId === 'noir') { fill('saturation', '#808080'); fill('soft-light', '#000000', 0.3); }
    if (styleId === 'warm') { fill('soft-light', '#ff8a2b', 0.6); fill('multiply', '#ffe2b8', 0.35); }
    if (styleId === 'tint') { fill('color', act.style.preColor || '#c8102e', 0.8); }

    if (L.feather) {
      const f = L.feather;
      const left = f.side === 'left';
      const x0 = left ? r.x : r.x + r.w;
      const x1 = left ? r.x + f.size : r.x + r.w - f.size;
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.45, 'rgba(0,0,0,0.6)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = grad;
      g.fillRect(Math.min(x0, x1), r.y, f.size, r.h);
      g.globalCompositeOperation = 'source-over';
    }
    return c;
  }

  // ---------- Decorations ----------
  function drawShades(ctx, W, H, L) {
    const boxes = [L.titleBox, L.infoBox].filter(Boolean);
    if (L.bottomShade) {
      const yTop = Math.min(...boxes.filter((b) => b.y >= H / 2).map((b) => b.y - b.h * 1.3), H * 0.75);
      const g = ctx.createLinearGradient(0, yTop, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, `rgba(0,0,0,${L.bottomShade * 0.8})`);
      g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, L.bottomShade * 1.6)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, yTop, W, H - yTop);
    }
    if (L.topShade) {
      const yBot = Math.max(...boxes.filter((b) => b.y < H / 2).map((b) => b.y + b.h * 2.3), H * 0.25);
      const g = ctx.createLinearGradient(0, 0, 0, yBot);
      g.addColorStop(0, `rgba(0,0,0,${Math.min(0.9, L.topShade * 1.5)})`);
      g.addColorStop(0.5, `rgba(0,0,0,${L.topShade * 0.75})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, yBot);
    }
  }

  function starPath(ctx, x, y, s) {
    const k = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x + k, y - k, x + s, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + s);
    ctx.quadraticCurveTo(x - k, y + k, x - s, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - s);
    ctx.fill();
  }

  function drawSparkles(ctx, W, H, rand, color) {
    const m = Math.min(W, H);
    const n = Math.round(Math.min(170, 30 + (W * H) / 12000));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = rand() * W;
      const y = Math.pow(rand(), 1.4) * H;
      const t = rand();
      // Keep the bigger sparkles toward the edges and top, away from faces.
      const dx = (x - W / 2) / (W / 2), dy = (y - H * 0.45) / (H / 2);
      const central = dx * dx + dy * dy < 0.55;
      if (t < 0.55 || (central && t >= 0.85)) {
        const r = m * (0.004 + rand() * 0.02);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(color, 0.15 + rand() * 0.45));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      } else if (t < 0.85) {
        ctx.fillStyle = rgba('#fff4cf', 0.4 + rand() * 0.5);
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, m * 0.0022), 0, Math.PI * 2); ctx.fill();
      } else if (t >= 0.93) {
        const s = m * (0.012 + rand() * 0.02);
        const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.9);
        g.addColorStop(0, rgba(color, 0.55));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, s * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba('#fff8e1', 0.9);
        starPath(ctx, x, y, s);
      }
    }
    ctx.restore();
  }

  function drawSpotlight(ctx, W, H) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.42, Math.min(W, H) * 0.2, W * 0.5, H * 0.42, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawFrame(ctx, W, H, color) {
    const m = Math.min(W, H);
    const i = m * 0.035, lw = Math.max(1, m * 0.006);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(i, i, W - 2 * i, H - 2 * i);
    const j = i + lw * 2.5;
    ctx.lineWidth = Math.max(0.75, lw * 0.5);
    ctx.strokeRect(j, j, W - 2 * j, H - 2 * j);
    ctx.restore();
  }

  // ---------- Text ----------
  function drawTitle(ctx, box, act, logoImg) {
    if (logoImg) {
      const fit = containFit(logoImg.naturalWidth || logoImg.width, logoImg.naturalHeight || logoImg.height, box);
      ctx.save();
      shadowFor(ctx, fit.h * 0.25);
      ctx.drawImage(logoImg, fit.x, fit.y, fit.w, fit.h);
      ctx.restore();
      return;
    }
    const t = act.title || {}, s = act.style;
    const hasPre = !!(t.pre && t.pre.trim());
    const lines = [];
    if (hasPre) lines.push({ text: t.pre.trim(), family: s.preFont, ratio: 1, lh: 1.05, color: s.preColor, ls: 0 });
    if (t.connector && t.connector.trim()) lines.push({ text: t.connector.trim(), family: s.infoFont, ratio: 0.34, lh: 1.5, color: s.mainColor, ls: 0.04, flank: true });
    if (t.main && t.main.trim()) lines.push({ text: t.main.trim(), family: s.mainFont, ratio: hasPre ? 0.62 : 1, lh: 1.12, color: s.mainColor, ls: 0.05 });
    if (t.sub && t.sub.trim()) lines.push({ text: t.sub.trim(), family: s.mainFont, ratio: hasPre ? 0.24 : 0.3, lh: 1.6, color: s.mainColor, ls: 0.18, flank: true });
    if (!lines.length) return;

    // Measure everything at size 100, then scale to fit the box.
    ctx.save();
    let blockW = 0, blockH = 0;
    for (const l of lines) {
      const size = l.ratio * 100;
      ctx.font = font(l.family, size);
      setSpacing(ctx, l.ls * size);
      l.w100 = ctx.measureText(l.text).width;
      const need = l.flank ? l.w100 + size * 3.2 : l.w100;
      blockW = Math.max(blockW, need);
      blockH += size * l.lh;
    }
    const S = 100 * Math.min(box.w / blockW, box.h / blockH);
    const k = S / 100;
    const bw = blockW * k;
    const cx = box.x + box.w / 2;
    let y = box.y + (box.h - blockH * k) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of lines) {
      const size = l.ratio * S;
      const lineH = size * l.lh;
      const cy = y + lineH / 2;
      ctx.font = font(l.family, size);
      setSpacing(ctx, l.ls * size);
      shadowFor(ctx, size);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, cx + (HAS_LETTER_SPACING ? l.ls * size / 2 : 0), cy);
      if (l.flank) {
        const tw = l.w100 * k;
        const gap = size * 0.6;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = Math.max(1, size * 0.07);
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2, cy); ctx.lineTo(cx - tw / 2 - gap, cy);
        ctx.moveTo(cx + tw / 2 + gap, cy); ctx.lineTo(cx + bw / 2, cy);
        ctx.stroke();
      }
      y += lineH;
    }
    setSpacing(ctx, 0);
    ctx.restore();
  }

  function drawInfo(ctx, box, info, act, opts) {
    let candidates;
    if (info.custom) candidates = [info.custom.split(/\s*[|\n]\s*/).filter(Boolean)];
    else if (opts.minimal) candidates = [[info.dates || info.venue]];
    else if (info.venue && info.dates) candidates = [[`${info.venue}, ${info.dates}`], [info.venue, info.dates]];
    else candidates = [[info.venue || info.dates]];
    candidates = candidates.map((c) => c.filter(Boolean)).filter((c) => c.length);
    if (!candidates.length) return;

    const fam = act.style.infoFont;
    const lh = 1.18;
    const extra = !opts.minimal ? info.extra : '';
    const extraRatio = 0.45;
    ctx.save();
    let best = null;
    for (const lines of candidates) {
      ctx.font = font(fam, 100);
      let maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      let totalH = lines.length * lh * 100;
      if (extra) {
        ctx.font = font(fam, 100 * extraRatio);
        maxW = Math.max(maxW, ctx.measureText(extra).width);
        totalH += extraRatio * 100 * 1.35;
      }
      const size = Math.min(100 * Math.min(box.w / maxW, box.h / totalH), opts.cap);
      const score = size * (lines.length === 1 ? 1.25 : 1);
      if (!best || score > best.score) best = { lines, size, score, totalH: (totalH / 100) * size };
    }
    const { lines, size } = best;
    let y = box.y + (box.h - best.totalH) / 2;
    const cx = box.x + box.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const paint = (text, sz, lineH) => {
      const cy = y + lineH / 2;
      ctx.font = font(fam, sz);
      shadowFor(ctx, sz);
      ctx.fillStyle = act.style.infoGold ? goldGradient(ctx, cy - sz * 0.45, cy + sz * 0.45) : act.style.infoColor;
      ctx.fillText(text, cx, cy);
      y += lineH;
    };
    for (const l of lines) paint(l, size, size * lh);
    if (extra) paint(extra, size * extraRatio, size * extraRatio * 1.35);
    noShadow(ctx);
    ctx.restore();
  }

  // ---------- Main entry ----------
  // o: { w, h, scale, act, photo, img, logoImg, styleId, info, localized, minimal, seed }
  function render(canvas, o) {
    const W = o.w, H = o.h, scale = o.scale || 1;
    canvas.width = Math.max(1, Math.round(W * scale));
    canvas.height = Math.max(1, Math.round(H * scale));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    const act = o.act, s = act.style;
    const shape = shapeOf(W, H);
    const photo = o.img ? o.photo : null;
    const styleId = stylesFor(shape, photo).some((x) => x.id === o.styleId) ? o.styleId : 'clean';
    const t = act.title || {};
    const hasTitleContent = !!(o.logoImg || [t.pre, t.main, t.sub].some((x) => x && x.trim()));
    const wantTitle = hasTitleContent && (shape === 'strip' || !photo || !photo.hasTitle);
    const wantInfo = o.localized !== false && !!(o.info && (o.info.custom || o.info.venue || o.info.dates));
    const L = layout(W, H, shape, { wantTitle, wantInfo, swap: styleId === 'swap' });

    ctx.fillStyle = s.bgColor || '#0b0a0a';
    ctx.fillRect(0, 0, W, H);
    if (L.panel) {
      const p = L.panel;
      const g = ctx.createRadialGradient(p.x + p.w / 2, p.y + p.h / 2, 0, p.x + p.w / 2, p.y + p.h / 2, Math.max(p.w, p.h) * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.07)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }

    if (photo) {
      const layer = drawPhotoLayer(W, H, scale, shape, photo, o.img, L, styleId, act);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
      layer.width = layer.height = 0;
    }

    const rand = rng(hashStr(String(o.seed || 'seed') + styleId));
    if (styleId === 'spotlight') drawSpotlight(ctx, W, H);
    drawShades(ctx, W, H, L);
    if (styleId === 'sparkle') drawSparkles(ctx, W, H, rand, s.mainColor || '#d9b45a');
    if (styleId === 'cinema') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H * 0.1);
      ctx.fillRect(0, H * 0.9, W, H * 0.1);
    }
    if (L.titleBox) drawTitle(ctx, L.titleBox, act, o.logoImg);
    if (L.infoBox) {
      const cap = shape === 'strip' ? H * 0.42 : Math.min(W, H) * 0.13;
      drawInfo(ctx, L.infoBox, o.info, act, { minimal: !!o.minimal, cap: o.minimal ? cap * 1.4 : cap });
    }
    if (styleId === 'frame') drawFrame(ctx, W, H, s.mainColor || '#d9b45a');
  }

  return {
    STYLES, stylesFor, shapeOf, pxSize, validRows, theatreTotal, distribute, plan,
    formatDates, fmtTime, showInfo, infoPreviewText, render,
  };
})();
