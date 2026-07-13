// Small pure-canvas helpers shared by the rate-card renderer.

export const GOLD = '#EFDFB4', GOLD_DEEP = '#D9BC7E';
export const font = (weight: number, size: number) => `${weight} ${size}px 'Inter', sans-serif`;

export const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// object-fit: cover for drawImage
export const coverDraw = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
};

export const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['—'];
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    const next = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next; else { lines.push(cur); cur = wd; }
  }
  lines.push(cur);
  return lines;
};

// ONE font size for a whole group of cells: the largest size at which every
// word of every cell fits its column. Uniform sizing reads as designed;
// per-cell shrinking reads as broken.
export interface MeasuredCell { text: string; maxW: number; weight: number }
export const uniformSize = (ctx: CanvasRenderingContext2D, cells: MeasuredCell[], base: number, min: number): number => {
  for (let size = base; size > min; size--) {
    if (cells.every(c => {
      ctx.font = font(c.weight, size);
      return c.text.split(/\s+/).every(wd => ctx.measureText(wd).width <= c.maxW);
    })) return size;
  }
  return min;
};

// Hero block (sharp cover crop + top scrim + bottom fade) and the masthead:
// logo top-right, catalog name as a large gold-gradient script heading,
// letter-spaced RATE LIST kicker beneath it.
export interface MastheadOpts { W: number; M: number; heroH: number; heroImg: HTMLImageElement; logoImg: HTMLImageElement | null; name: string; scriptFont: string }
export const drawMasthead = (ctx: CanvasRenderingContext2D, m: MastheadOpts) => {
  const { W, M, heroH } = m;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, heroH); ctx.clip();
  coverDraw(ctx, m.heroImg, 0, 0, W, heroH);
  const top = ctx.createLinearGradient(0, 0, 0, 240);
  top.addColorStop(0, 'rgba(0,0,0,0.38)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 240);
  const fade = ctx.createLinearGradient(0, heroH - 320, 0, heroH);
  fade.addColorStop(0, 'rgba(7,9,14,0)'); fade.addColorStop(1, 'rgba(7,9,14,0.92)');
  ctx.fillStyle = fade; ctx.fillRect(0, heroH - 320, W, 320);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 3;
  let logoBottom = M + 10;
  if (m.logoImg) {
    const lw = 300, lh = lw * (m.logoImg.naturalHeight / m.logoImg.naturalWidth);
    ctx.drawImage(m.logoImg, W - M - lw, M + 6, lw, lh);
    logoBottom = M + 6 + lh;
  }
  let size = 210;
  do { ctx.font = `400 ${size}px '${m.scriptFont}', cursive`; size -= 6; } while (size > 84 && ctx.measureText(m.name).width > W - 2 * M - 40);
  const nameBase = Math.min(logoBottom + 60 + size * 0.9, heroH - 190);
  const grad = ctx.createLinearGradient(0, nameBase - size, 0, nameBase + size * 0.25);
  grad.addColorStop(0, GOLD); grad.addColorStop(1, GOLD_DEEP);
  ctx.fillStyle = grad; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(m.name, W - M - 10, nameBase);
  try { (ctx as any).letterSpacing = '10px'; } catch { /* noop */ }
  ctx.font = font(600, 24); ctx.fillStyle = 'rgba(245,238,220,0.78)';
  ctx.fillText('RATE LIST', W - M - 10, nameBase + 64);
  try { (ctx as any).letterSpacing = '0px'; } catch { /* noop */ }
  ctx.restore();
};

// Frosted-glass source: blur via multi-step downscale→upscale, two cycles
// (single-step 16× upscaling leaves blocky artifacts; ctx.filter isn't
// available on Safari, so this stays fully portable).
export const makeBlur = (src: HTMLCanvasElement, W: number, H: number): HTMLCanvasElement => {
  const step = (from: HTMLCanvasElement, w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    const cc = c.getContext('2d')!;
    cc.imageSmoothingEnabled = true;
    cc.drawImage(from, 0, 0, c.width, c.height);
    return c;
  };
  let b = step(step(step(src, W / 4, H / 4), W / 16, H / 16), W / 4, H / 4);
  b = step(step(b, W / 16, H / 16), W / 4, H / 4);
  return b;
};
