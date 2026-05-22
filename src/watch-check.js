import "dotenv/config";
import { fetchSteamAppDetails, fetchSteamAppReviews, fetchUsdToKrw } from "./api.js";
import { listAllWatchSubscriptions, hasRecentWatchNotification } from "./history.js";
import { fetchItadCurrentDeals } from "./itad.js";
import { getSteamRegionOptions, isStrictRegionEnabled, normalizeRegion } from "./region.js";
import { findCurrentDealFromStoredGame } from "./search.js";

const config = {
  minDiscount: Number(process.env.MIN_DISCOUNT || 10),
  fallbackUsdToKrw: Number(process.env.USD_TO_KRW_FALLBACK || 1370),
  region: normalizeRegion(process.env.REGION),
  regionStrict: isStrictRegionEnabled(process.env.REGION_STRICT),
  steamLanguage: process.env.STEAM_LANGUAGE || "korean",
  itadApiKey: process.env.ITAD_API_KEY || "",
  itadShopIds: process.env.ITAD_SHOP_IDS || "",
  itadShopNames: process.env.ITAD_SHOPS || "",
};

function getProbeDeal(watch, result) {
  return result?.deal ?? {
    title: watch.title ?? watch.query,
    steamAppID: watch.steamAppId,
    gameID: watch.gameId,
    region: config.region,
    regionVerified: true,
  };
}

function isSteamDeal(deal) {
  return String(deal.storeID) === "1" || String(deal.storeName ?? "").toLowerCase() === "steam";
}

async function enrichCandidate(candidate, watch) {
  const steamAppId = candidate.deal.steamAppID ?? watch.steamAppId;
  if (!steamAppId) return candidate;

  const [steamDetails, review] = await Promise.all([
    candidate.steamDetails
      ? Promise.resolve(candidate.steamDetails)
      : fetchSteamAppDetails(steamAppId, getSteamRegionOptions(config)).catch(() => null),
    candidate.deal.steamRatingPercent && candidate.deal.steamRatingCount
      ? Promise.resolve(null)
      : fetchSteamAppReviews(steamAppId).catch(() => null),
  ]);

  return {
    ...candidate,
    steamDetails,
    deal: {
      ...candidate.deal,
      steamAppID: steamAppId,
      steamRatingPercent: candidate.deal.steamRatingPercent ?? review?.steamRatingPercent,
      steamRatingCount: candidate.deal.steamRatingCount ?? review?.steamRatingCount,
      thumb: candidate.deal.thumb ?? steamDetails?.header_image,
    },
  };
}

async function collectCandidates(watch) {
  const candidates = [];
  const result = await findCurrentDealFromStoredGame(watch, config);
  if (result) candidates.push(result);

  const hasSteamCandidate = candidates.some((candidate) => isSteamDeal(candidate.deal));
  const itadItems = result?.allDeals ?? await fetchItadCurrentDeals(getProbeDeal(watch, result), config);
  for (const item of itadItems) {
    if (hasSteamCandidate && isSteamDeal(item.deal)) continue;
    candidates.push({
      deal: item.deal,
      steamDetails: result?.steamDetails ?? null,
    });
  }

  return Promise.all(candidates.map((candidate) => enrichCandidate(candidate, watch)));
}

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
    const candidates = await collectCandidates(watch);
    if (candidates.length === 0) {
      console.log(`[skip:no-current-deal] user=${watch.userId} title="${watch.title}"`);
      continue;
    }

    for (const result of candidates) {
      const discount = Number(result.deal.savings);
      const price = formatPrice(result.deal, usdToKrw);
      const duplicate = hasRecentWatchNotification(watch.userId, result.deal);
      const summary = [
        `user=${watch.userId}`,
        `title="${result.deal.title}"`,
        `discount=${formatPercent(discount)}`,
        `price=${price}`,
        `store=${result.deal.storeName ?? result.deal.storeID}`,
        `review=${result.deal.steamRatingPercent ?? "none"}%/${result.deal.steamRatingCount ?? 0}`,
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
    }
  } catch (error) {
    console.log(`[error] user=${watch.userId} title="${watch.title}" message="${error.message}"`);
  }
}
