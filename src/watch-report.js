import { fetchSteamAppDetails, fetchSteamAppReviews, fetchUsdToKrw } from "./api.js";
import {
  getWatchSettings,
  hasRecentWatchNotification,
  listAllWatchSubscriptions,
} from "./history.js";
import { fetchItadCurrentDeals } from "./itad.js";
import { getSteamRegionOptions, isStrictRegionEnabled, normalizeRegion } from "./region.js";
import { findCurrentDealFromStoredGame } from "./search.js";

function buildConfig(baseConfig = {}) {
  return {
    minDiscount: Number(baseConfig.minDiscount ?? process.env.MIN_DISCOUNT ?? 10),
    fallbackUsdToKrw: Number(baseConfig.fallbackUsdToKrw ?? process.env.USD_TO_KRW_FALLBACK ?? 1370),
    region: normalizeRegion(baseConfig.region ?? process.env.REGION),
    regionStrict: baseConfig.regionStrict ?? isStrictRegionEnabled(process.env.REGION_STRICT),
    steamLanguage: baseConfig.steamLanguage ?? process.env.STEAM_LANGUAGE ?? "korean",
    itadApiKey: baseConfig.itadApiKey ?? process.env.ITAD_API_KEY ?? "",
    itadShopIds: baseConfig.itadShopIds ?? process.env.ITAD_SHOP_IDS ?? "",
    itadShopNames: baseConfig.itadShopNames ?? process.env.ITAD_SHOPS ?? "",
  };
}

function getProbeDeal(watch, result) {
  return result?.deal ?? {
    title: watch.title ?? watch.query,
    steamAppID: watch.steamAppId,
    gameID: watch.gameId,
    region: "KR",
    regionVerified: true,
  };
}

function normalizeStore(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function matchesStoreFilter(deal, storeFilter) {
  if (!storeFilter) return true;
  const filters = String(storeFilter).split(",").map(normalizeStore).filter(Boolean);
  if (filters.length === 0 || filters.includes("all")) return true;
  const storeName = normalizeStore(deal.storeName);
  const storeId = String(deal.storeID ?? "");
  return filters.some((filter) =>
    storeName.includes(filter) ||
    storeId === filter ||
    (filter === "epic" && storeName.includes("epicgame")) ||
    (filter === "humble" && storeName.includes("humble")) ||
    (filter === "ubisoft" && (storeName.includes("ubisoft") || storeName.includes("uplay"))) ||
    (filter === "blizzard" && storeName.includes("blizzard")) ||
    (filter === "steam" && storeName.includes("steam"))
  );
}

async function enrichCandidate(candidate, watch, config) {
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

async function collectCandidates(watch, config) {
  const candidates = [];
  const result = await findCurrentDealFromStoredGame(watch, config);
  if (result) candidates.push(result);

  const seenStoreIds = new Set(candidates.map((candidate) => String(candidate.deal.storeID ?? "")));
  const itadItems = result?.allDeals ?? await fetchItadCurrentDeals(getProbeDeal(watch, result), config);
  for (const item of itadItems) {
    const storeId = String(item.deal.storeID ?? "");
    if (seenStoreIds.has(storeId)) continue;
    seenStoreIds.add(storeId);
    candidates.push({
      deal: item.deal,
      steamDetails: result?.steamDetails ?? null,
    });
  }

  return Promise.all(candidates.map((candidate) => enrichCandidate(candidate, watch, config)));
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export async function collectWatchReport(baseConfig = {}) {
  const config = buildConfig(baseConfig);
  const watches = listAllWatchSubscriptions();
  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  const stats = {
    watches: watches.length,
    noCurrentDeal: 0,
    belowMinDiscount: 0,
    storeFiltered: 0,
    recentlyNotified: 0,
    wouldSend: 0,
    errors: 0,
  };
  const lines = [];

  for (const watch of watches) {
    try {
      const candidates = await collectCandidates(watch, config);
      if (candidates.length === 0) {
        stats.noCurrentDeal += 1;
        lines.push(`no deal · ${watch.title} · user ${watch.userId}`);
        continue;
      }

      const settings = getWatchSettings(watch.userId);
      const minDiscount = Number(settings.minDiscount ?? config.minDiscount ?? 1);
      for (const result of candidates) {
        const deal = result.deal;
        const summary = `${deal.title} · ${Math.round(Number(deal.savings))}% · ${formatPrice(deal, usdToKrw)} · ${deal.storeName ?? deal.storeID}`;
        if (!matchesStoreFilter(deal, settings.storeFilter)) {
          stats.storeFiltered += 1;
          lines.push(`store filter · ${summary}`);
          continue;
        }
        if (Number(deal.savings) < minDiscount) {
          stats.belowMinDiscount += 1;
          lines.push(`below ${minDiscount}% · ${summary}`);
          continue;
        }
        if (hasRecentWatchNotification(watch.userId, deal)) {
          stats.recentlyNotified += 1;
          lines.push(`recently sent · ${summary}`);
          continue;
        }
        stats.wouldSend += 1;
        lines.push(`would send · ${summary}`);
      }
    } catch (error) {
      stats.errors += 1;
      lines.push(`error · ${watch.title} · ${error.message}`);
    }
  }

  return {
    stats,
    lines,
  };
}
