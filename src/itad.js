const ITAD_API = "https://api.isthereanydeal.com";
const DEFAULT_ITAD_SHOP_NAMES = [
  "Steam",
  "Epic Game Store",
  "Ubisoft Store",
  "Blizzard",
  "Humble Store",
];
const ITAD_SHOP_ALIASES = new Map([
  ["steam", ["steam"]],
  ["epic game store", ["epic game store", "epic games store", "epic"]],
  ["ubisoft store", ["ubisoft store", "ubisoft", "uplay"]],
  ["blizzard", ["blizzard", "blizzard shop", "battle.net", "battle net"]],
  ["humble store", ["humble store", "humble bundle", "humble"]],
]);
let shopMapCache = null;

function getApiKey(config = {}) {
  return config.itadApiKey || process.env.ITAD_API_KEY || "";
}

function formatExpiry(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatDateKey(value, timeZone = "Asia/Seoul") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function isItadExpiryToday(expiry, now = new Date(), timeZone = "Asia/Seoul") {
  if (!expiry?.raw) return false;
  return formatDateKey(expiry.raw, timeZone) === formatDateKey(now, timeZone);
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getConfiguredShopIds(config = {}) {
  const raw = config.itadShopIds ?? process.env.ITAD_SHOP_IDS;
  return parseCsv(raw)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function getConfiguredShopNames(config = {}) {
  const names = parseCsv(config.itadShopNames ?? process.env.ITAD_SHOPS);
  return names.length > 0 ? names : DEFAULT_ITAD_SHOP_NAMES;
}

async function getItadJson(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      "ITAD-API-Key": apiKey,
    },
  });
  if (!response.ok) {
    const error = new Error(`ITAD request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function postItadJson(url, apiKey, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ITAD-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = new Error(`ITAD request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function lookupItadGameId(deal, apiKey) {
  if (deal.itadId) return deal.itadId;
  if (deal.gameID && String(deal.gameID).includes("-")) return deal.gameID;

  const url = new URL(`${ITAD_API}/games/lookup/v1`);
  if (deal.steamAppID) {
    url.searchParams.set("appid", String(deal.steamAppID));
  } else {
    url.searchParams.set("title", deal.title);
  }

  const payload = await getItadJson(url, apiKey);
  if (!payload?.found) return null;
  return payload.game?.id ?? null;
}

export async function resolveItadShopIds(config = {}) {
  const apiKey = getApiKey(config);
  if (!apiKey) return [];
  const configuredIds = getConfiguredShopIds(config);
  if (configuredIds.length > 0) return configuredIds;

  const targets = getConfiguredShopNames(config).flatMap((name) => {
    const normalized = normalizeText(name);
    return ITAD_SHOP_ALIASES.get(normalized) ?? [normalized];
  });
  const targetSet = new Set(targets.map(normalizeText));

  shopMapCache ??= await getItadJson(`${ITAD_API}/service/shops/map/v1`, apiKey);
  const shops = shopMapCache;
  const matched = [];
  for (const shop of shops ?? []) {
    const title = normalizeText(shop.title);
    const compactTitle = title.replace(/\s+/g, "");
    const exactMatch = targetSet.has(title) ||
      [...targetSet].some((target) => target.replace(/\s+/g, "") === compactTitle);
    if (exactMatch) {
      matched.push(Number(shop.id));
    }
  }

  return [...new Set(matched.filter((value) => Number.isInteger(value) && value > 0))];
}

function pickSteamReview(info) {
  const review = info?.reviews?.find((item) => String(item.source).toLowerCase() === "steam");
  if (!review) return null;
  return {
    steamRatingPercent: String(review.score),
    steamRatingCount: String(review.count),
  };
}

export function itadInfoToSteamDetails(info) {
  if (!info) return null;
  return {
    name: info.title,
    developers: (info.developers ?? []).map((item) => item.name).filter(Boolean),
    publishers: (info.publishers ?? []).map((item) => item.name).filter(Boolean),
    header_image: info.assets?.banner600 ?? info.assets?.banner400 ?? info.assets?.banner300 ?? info.assets?.boxart,
    price_overview: null,
  };
}

export function itadInfoToCandidate(info) {
  return {
    external: info.title,
    title: info.title,
    type: info.type,
    itadId: info.id,
    gameID: info.id,
    steamAppID: info.appid,
    cheapest: "?",
    thumb: info.assets?.banner145 ?? info.assets?.boxart,
    assets: info.assets,
    source: "itad",
  };
}

export function applyItadInfoToDeal(deal, info) {
  const review = pickSteamReview(info);
  return {
    ...deal,
    title: deal.title ?? info?.title,
    itadId: deal.itadId ?? info?.id,
    gameID: deal.gameID ?? info?.id,
    steamAppID: deal.steamAppID ?? info?.appid,
    steamRatingPercent: deal.steamRatingPercent ?? review?.steamRatingPercent,
    steamRatingCount: deal.steamRatingCount ?? review?.steamRatingCount,
    thumb: deal.thumb ?? info?.assets?.banner145 ?? info?.assets?.boxart,
  };
}

export async function fetchItadGameInfo(gameOrId, config = {}) {
  const apiKey = getApiKey(config);
  if (!apiKey) return null;
  const id = typeof gameOrId === "string"
    ? gameOrId
    : gameOrId?.itadId ?? (String(gameOrId?.gameID ?? "").includes("-") ? gameOrId.gameID : null);
  if (!id) return null;

  const url = new URL(`${ITAD_API}/games/info/v2`);
  url.searchParams.set("id", id);
  return getItadJson(url, apiKey);
}

export async function searchItadGames(query, config = {}, limit = 10) {
  const apiKey = getApiKey(config);
  if (!apiKey) return [];

  const url = new URL(`${ITAD_API}/games/search/v1`);
  url.searchParams.set("title", query);
  url.searchParams.set("results", String(limit));
  const games = await getItadJson(url, apiKey);
  return (games ?? [])
    .filter((game) => !game.type || ["game", "package"].includes(game.type))
    .map(itadInfoToCandidate);
}

function extractDeals(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.deals)) return payload.deals;
  if (Array.isArray(payload?.data?.deals)) return payload.data.deals;
  if (Array.isArray(payload?.prices)) return payload.prices;
  if (Array.isArray(payload?.data?.prices)) return payload.data.prices;
  return [];
}

function flattenPriceDeals(payload) {
  const records = extractDeals(payload);
  return records.flatMap((record) => {
    if (Array.isArray(record?.deals)) {
      return record.deals.map((deal) => ({ record, itadDeal: deal }));
    }
    return [{ record, itadDeal: record }];
  });
}

function findSteamDeal(payload) {
  const deals = flattenPriceDeals(payload).map((item) => item.itadDeal);
  return deals.find((deal) => {
    const shop = String(deal?.shop?.id ?? deal?.shop?.name ?? deal?.store ?? "").toLowerCase();
    return shop.includes("steam") && deal?.expiry;
  }) ?? deals.find((deal) => deal?.expiry) ?? null;
}

function toItadDeal(baseDeal, gameId, record, itadDeal) {
  const shopId = itadDeal?.shop?.id;
  const shopName = itadDeal?.shop?.name ?? `ITAD Store ${shopId}`;
  const price = itadDeal?.price;
  const regular = itadDeal?.regular;
  const cut = Number(itadDeal?.cut);
  if (!shopId || !price || !regular || !Number.isFinite(cut)) return null;

  return {
    title: baseDeal.title ?? record?.title ?? "Unknown",
    dealID: `itad:${gameId}:${shopId}:${price.amountInt ?? price.amount}:${regular.amountInt ?? regular.amount}:${cut}`,
    storeID: `itad:${shopId}`,
    storeName: shopName,
    gameID: baseDeal.gameID ?? gameId,
    itadId: gameId,
    steamAppID: baseDeal.steamAppID,
    salePrice: price.amount,
    normalPrice: regular.amount,
    priceCurrency: price.currency ?? regular.currency ?? "USD",
    savings: String(cut),
    steamRatingPercent: baseDeal.steamRatingPercent,
    steamRatingCount: baseDeal.steamRatingCount,
    thumb: baseDeal.thumb,
    storeUrl: itadDeal.url,
    region: baseDeal.region ?? "KR",
    regionVerified: true,
    source: "itad",
  };
}

function toItadDealFromListItem(item, config = {}) {
  return toItadDeal(
    {
      title: item.title,
      gameID: item.id,
      itadId: item.id,
      steamAppID: item.appid,
      thumb: item.assets?.banner145 ?? item.assets?.boxart,
      region: config.region || "KR",
      regionVerified: true,
      ...pickSteamReview(item),
    },
    item.id,
    item,
    item.deal,
  );
}

export async function fetchItadCurrentDeals(deal, config = {}) {
  const apiKey = getApiKey(config);
  if (!apiKey || (!deal?.steamAppID && !deal?.itadId && !String(deal?.gameID ?? "").includes("-"))) return [];

  try {
    const gameId = await lookupItadGameId(deal, apiKey);
    if (!gameId) return [];

    const shopIds = await resolveItadShopIds(config);
    if (shopIds.length === 0) return [];

    const url = new URL(`${ITAD_API}/games/prices/v3`);
    url.searchParams.set("country", config.region || "KR");
    url.searchParams.set("deals", "true");
    url.searchParams.set("shops", shopIds.join(","));

    const payload = await postItadJson(url, apiKey, [gameId]);
    return flattenPriceDeals(payload)
      .map(({ record, itadDeal }) => {
        const mappedDeal = toItadDeal(deal, gameId, record, itadDeal);
        if (!mappedDeal) return null;

        const formatted = formatExpiry(itadDeal?.expiry);
        return {
          deal: mappedDeal,
          dealExpiry: formatted
            ? {
              raw: itadDeal.expiry,
              formatted,
              isToday: isItadExpiryToday({ raw: itadDeal.expiry }),
            }
            : null,
        };
      })
      .filter((item) => item && Number(item.deal.savings) >= Number(config.minDiscount ?? 1));
  } catch (error) {
    console.warn(`[warn] ITAD multi-store lookup failed for ${deal.title}: ${error.message}`);
    return [];
  }
}

export async function fetchItadDealFeed(config = {}, options = {}) {
  const apiKey = getApiKey(config);
  if (!apiKey) return [];

  const shopIds = await resolveItadShopIds(config);
  if (shopIds.length === 0) return [];

  const scanLimit = Number(options.scanLimit ?? config.itadDailyScanLimit ?? process.env.ITAD_DAILY_SCAN_LIMIT ?? 300);
  const pageSize = Math.min(200, scanLimit);
  const items = [];
  let offset = 0;

  while (items.length < scanLimit) {
    const payload = await postItadJson(`${ITAD_API}/deals/v2`, apiKey, {
      country: config.region || "KR",
      limit: Math.min(pageSize, scanLimit - items.length),
      offset,
      sort: "-cut",
      shops: shopIds,
      mature: true,
    });

    for (const item of payload.list ?? []) {
      const deal = toItadDealFromListItem(item, config);
      if (!deal || Number(deal.savings) < Number(config.minDiscount ?? 1)) continue;
      items.push({
        deal,
        steamDetails: itadInfoToSteamDetails(item),
        itadInfo: item,
        dealExpiry: formatExpiry(item.deal?.expiry)
          ? {
            raw: item.deal.expiry,
            formatted: formatExpiry(item.deal.expiry),
            isToday: isItadExpiryToday({ raw: item.deal.expiry }),
          }
          : null,
      });
    }

    if (!payload.hasMore || payload.nextOffset == null) break;
    offset = payload.nextOffset;
  }

  return items;
}

export async function fetchItadDealExpiry(deal, config = {}) {
  const apiKey = getApiKey(config);
  if (!apiKey || !deal?.steamAppID) return null;

  try {
    const gameId = await lookupItadGameId(deal, apiKey);
    if (!gameId) return null;

    const url = new URL(`${ITAD_API}/games/prices/v3`);
    url.searchParams.set("country", config.region || "KR");
    url.searchParams.set("deals", "true");
    url.searchParams.set("shops", "61");

    const payload = await postItadJson(url, apiKey, [gameId]);
    const itadDeal = findSteamDeal(payload);
    const formatted = formatExpiry(itadDeal?.expiry);
    if (!formatted) return null;

    return {
      raw: itadDeal.expiry,
      formatted,
      isToday: isItadExpiryToday({ raw: itadDeal.expiry }),
    };
  } catch (error) {
    console.warn(`[warn] ITAD expiry lookup failed for ${deal.title}: ${error.message}`);
    return null;
  }
}
