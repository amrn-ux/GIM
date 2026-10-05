// Tiny dependency-free SVG charts (work offline). Points are {t: ms, v: number}.
const W = 320;
const shortDate = (t) => { const d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1); };
const nf = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10));

function empty(text, h) {
  return `<div class="chart-empty" style="height:${h}px">${text}</div>`;
}

export function lineChart(points, { color = 'var(--accent)', height = 180 } = {}) {
  if (!points.length) return empty('Not enough data yet', 100);
  const pad = { l: 34, r: 12, t: 18, b: 22 };
  const ts = points.map((p) => p.t); const vs = points.map((p) => p.v);
  const t0 = Math.min(...ts); const t1 = Math.max(...ts);
  let v0 = Math.min(...vs); let v1 = Math.max(...vs);
  if (v0 === v1) { v0 -= 1; v1 += 1; }
  const m = (v1 - v0) * 0.12; v0 -= m; v1 += m;
  const x = (t) => pad.l + (t1 === t0 ? (W - pad.l - pad.r) / 2 : ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - v0) / (v1 - v0)) * (height - pad.t - pad.b);
  const path = points.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const showLabels = points.length <= 10;
  let out = `<svg viewBox="0 0 ${W} ${height}" class="chart" role="img">`;
  for (const v of [v0 + m, (v0 + v1) / 2, v1 - m]) {
    out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 4}" y="${y(v) + 3}" class="axis" text-anchor="end">${nf(v)}</text>`;
  }
  if (points.length > 1) out += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  for (const p of points) {
    out += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="3.5" fill="${color}"/>`;
    if (showLabels) out += `<text x="${x(p.t)}" y="${y(p.v) - 7}" class="val" text-anchor="middle">${nf(p.v)}</text>`;
  }
  out += `<text x="${pad.l}" y="${height - 5}" class="axis">${shortDate(t0)}</text><text x="${W - pad.r}" y="${height - 5}" class="axis" text-anchor="end">${shortDate(t1)}</text></svg>`;
  return out;
}

export function barChart(points, { color = 'var(--accent)', height = 140, labels = true } = {}) {
  if (!points.length || points.every((p) => p.v === 0)) return empty('Nothing recorded in this period', 90);
  const pad = { l: 34, r: 8, t: 14, b: 20 };
  const max = Math.max(...points.map((p) => p.v)) * 1.1;
  const bw = (W - pad.l - pad.r) / points.length;
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  let out = `<svg viewBox="0 0 ${W} ${height}" class="chart" role="img">`;
  for (const v of [max / 1.1, max / 2.2]) out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 4}" y="${y(v) + 3}" class="axis" text-anchor="end">${nf(v)}</text>`;
  points.forEach((p, i) => {
    const h = Math.max(0, height - pad.b - y(p.v));
    out += `<rect x="${pad.l + i * bw + bw * 0.12}" y="${y(p.v)}" width="${bw * 0.76}" height="${h}" rx="2" fill="${color}"/>`;
  });
  if (labels) out += `<text x="${pad.l}" y="${height - 5}" class="axis">${shortDate(points[0].t)}</text><text x="${W - pad.r}" y="${height - 5}" class="axis" text-anchor="end">${shortDate(points[points.length - 1].t)}</text>`;
  return out + '</svg>';
}

