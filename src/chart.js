import sharp from "sharp";

const WIDTH = 900;
const HEIGHT = 460;
const PAD = {
  top: 42,
  right: 42,
  bottom: 76,
  left: 86,
};

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatUsd(value) {
  return `$${Number(value).toFixed(2)}`;
}

function uniqueByDateAndPrice(history) {
  const seen = new Set();
  return history.filter((point) => {
    const key = `${point.checkedAt}:${point.salePriceUsd}:${point.savingsPercent}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSvg(history, title) {
  const points = uniqueByDateAndPrice(history);
  const chartWidth = WIDTH - PAD.left - PAD.right;
  const chartHeight = HEIGHT - PAD.top - PAD.bottom;
  const prices = points.map((point) => Number(point.salePriceUsd));
  const discounts = points.map((point) => Number(point.savingsPercent));
  const maxPrice = Math.max(...prices, 1);
  const minPrice = Math.min(...prices, maxPrice);
  const priceRange = Math.max(maxPrice - minPrice, 1);
  const xStep = points.length > 1 ? chartWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = PAD.left + (points.length > 1 ? index * xStep : chartWidth / 2);
    const y = PAD.top + chartHeight - ((Number(point.salePriceUsd) - minPrice) / priceRange) * chartHeight;
    return { ...point, x, y };
  });

  const path = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const value = maxPrice - priceRange * ratio;
    const y = PAD.top + chartHeight * ratio;
    return `
      <line x1="${PAD.left}" y1="${y}" x2="${WIDTH - PAD.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1" />
      <text x="${PAD.left - 14}" y="${y + 5}" text-anchor="end" font-size="16" fill="#64748b">${formatUsd(value)}</text>
    `;
  }).join("");

  const labels = coords.map((point, index) => {
    const labelAnchor = points.length === 1 ? "middle" : index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
    const valueAnchor = points.length === 1 ? "middle" : index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
    const valueX = index === 0 ? point.x + 8 : index === points.length - 1 ? point.x - 8 : point.x;
    const value = `${Math.round(point.savingsPercent)}% · ${formatUsd(point.salePriceUsd)}`;
    return `
      <text x="${point.x}" y="${HEIGHT - 38}" text-anchor="${labelAnchor}" font-size="15" fill="#64748b">${formatDate(point.checkedAt)}</text>
      <text x="${valueX}" y="${Math.max(PAD.top + 24, point.y - 16)}" text-anchor="${valueAnchor}" font-size="15" font-weight="700" fill="#0f766e">${value}</text>
      <circle cx="${point.x}" cy="${point.y}" r="7" fill="#0f8f7f" stroke="#ffffff" stroke-width="3" />
    `;
  }).join("");

  const emptyState = points.length === 0
    ? `<text x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" font-size="24" fill="#64748b">할인 기록이 아직 없습니다.</text>`
    : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <rect width="${WIDTH}" height="${HEIGHT}" rx="0" fill="#f8fafc" />
      <text x="${PAD.left}" y="32" font-size="24" font-weight="800" fill="#0f172a">${escapeXml(title)}</text>
      <text x="${WIDTH - PAD.right}" y="32" text-anchor="end" font-size="16" fill="#64748b">할인가 히스토리</text>
      <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" stroke="#94a3b8" stroke-width="1.5" />
      <line x1="${PAD.left}" y1="${HEIGHT - PAD.bottom}" x2="${WIDTH - PAD.right}" y2="${HEIGHT - PAD.bottom}" stroke="#94a3b8" stroke-width="1.5" />
      ${yTicks}
      ${path ? `<path d="${path}" fill="none" stroke="#0f8f7f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />` : ""}
      ${labels}
      ${emptyState}
      <text x="${PAD.left}" y="${HEIGHT - 14}" font-size="14" fill="#94a3b8">점 위 숫자는 할인율과 할인가입니다.</text>
    </svg>
  `;
}

export async function generateDiscountHistoryChartPng(history, title) {
  if (history.length < 2) return null;

  const svg = buildSvg(history, title);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
