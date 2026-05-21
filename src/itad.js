const ITAD_API = "https://api.isthereanydeal.com";

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

function extractDeals(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.deals)) return payload.deals;
  if (Array.isArray(payload?.data?.deals)) return payload.data.deals;
  if (Array.isArray(payload?.prices)) return payload.prices;
  if (Array.isArray(payload?.data?.prices)) return payload.data.prices;
  return [];
}

function findSteamDeal(payload) {
  const records = extractDeals(payload);
  const deals = records.flatMap((record) => Array.isArray(record?.deals) ? record.deals : [record]);
  return deals.find((deal) => {
    const shop = String(deal?.shop?.id ?? deal?.shop?.name ?? deal?.store ?? "").toLowerCase();
    return shop.includes("steam") && deal?.expiry;
  }) ?? deals.find((deal) => deal?.expiry) ?? null;
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
    };
  } catch (error) {
    console.warn(`[warn] ITAD expiry lookup failed for ${deal.title}: ${error.message}`);
    return null;
  }
}
