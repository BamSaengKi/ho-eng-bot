import "dotenv/config";
import { fetchUsdToKrw } from "./api.js";
import { listAllWatchSubscriptions, hasRecentWatchNotification } from "./history.js";
import { isStrictRegionEnabled, normalizeRegion } from "./region.js";
import { findCurrentDealFromStoredGame } from "./search.js";

const config = {
  minDiscount: Number(process.env.MIN_DISCOUNT || 10),
  fallbackUsdToKrw: Number(process.env.USD_TO_KRW_FALLBACK || 1370),
  region: normalizeRegion(process.env.REGION),
  regionStrict: isStrictRegionEnabled(process.env.REGION_STRICT),
  steamLanguage: process.env.STEAM_LANGUAGE || "korean",
};

function formatPrice(deal, usdToKrw) {
  const currency = deal.priceCurrency || "USD";
  const value = Number(deal.salePrice);
  if (currency === "KRW") {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(value);
  }

  const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
  const krw = new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Math.round(value * usdToKrw));
  return `${krw} (${usd})`;
}

function formatPercent(value) {
  const percent = Number(value);
  return Number.isFinite(percent) ? `${Math.round(percent)}%` : "할인율 정보 없음";
}

const watches = listAllWatchSubscriptions();
if (watches.length === 0) {
  console.log("[watch-check] No personal watch subscriptions.");
  process.exit(0);
}

const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
console.log(`[watch-check] ${watches.length} subscription(s), region=${config.region}, minDiscount=${config.minDiscount}%`);

for (const watch of watches) {
  try {
    const result = await findCurrentDealFromStoredGame(watch, config);
    if (!result) {
      console.log(`[skip:no-current-deal] user=${watch.userId} title="${watch.title}"`);
      continue;
    }

    const discount = Number(result.deal.savings);
    const price = formatPrice(result.deal, usdToKrw);
    const duplicate = hasRecentWatchNotification(watch.userId, result.deal);
    const summary = [
      `user=${watch.userId}`,
      `title="${result.deal.title}"`,
      `discount=${formatPercent(discount)}`,
      `price=${price}`,
      `store=${result.deal.storeID}`,
      `regionVerified=${Boolean(result.deal.regionVerified)}`,
    ].join(" ");

    if (discount < config.minDiscount) {
      console.log(`[skip:below-min-discount] ${summary}`);
      continue;
    }

    if (duplicate) {
      console.log(`[skip:recently-notified] ${summary}`);
      continue;
    }

    console.log(`[would-send] ${summary}`);
  } catch (error) {
    console.log(`[error] user=${watch.userId} title="${watch.title}" message="${error.message}"`);
  }
}
