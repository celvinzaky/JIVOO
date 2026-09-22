/**
 * js/charts.js (ES module)
 * A dependency-free canvas bar chart. The spec forbids frontend
 * frameworks/libraries beyond vanilla JS, so this hand-rolls just enough
 * charting for the Super Admin / Back Office dashboards (§8.2, §14).
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{label: string, count: number}[]} series
 * @param {{color?: string, maxLabels?: number}} [opts]
 */
export function renderBarChart(canvas, series, opts = {}) {
  const color = opts.color || '#1e5fbf';
  const maxLabels = opts.maxLabels ?? 7;
  const dpr = window.devicePixelRatio || 1;

  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 400;
  const cssHeight = canvas.clientHeight || 160;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!series.length) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.fillText('Belum ada data', 8, cssHeight / 2);
    return;
  }

  const padding = { top: 8, right: 4, bottom: 22, left: 4 };
  const chartW = cssWidth - padding.left - padding.right;
  const chartH = cssHeight - padding.top - padding.bottom;
  const max = Math.max(1, ...series.map((s) => s.count));
  const barGap = 4;
  const barWidth = Math.max(2, chartW / series.length - barGap);

  const labelEvery = Math.max(1, Math.ceil(series.length / maxLabels));

  series.forEach((point, i) => {
    const x = padding.left + i * (barWidth + barGap);
    const h = (point.count / max) * chartH;
    const y = padding.top + (chartH - h);

    ctx.fillStyle = point.count > 0 ? color : '#eef1f4';
    const r = Math.min(3, barWidth / 2);
    roundRect(ctx, x, y, barWidth, Math.max(2, h), r);
    ctx.fill();

    if (i % labelEvery === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(point.label, x + barWidth / 2, cssHeight - 6);
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
