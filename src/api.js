const CHEAPSHARK_API = "https://www.cheapshark.com/api/1.0";
const STEAM_APPDETAILS_API = "https://store.steampowered.com/api/appdetails";
const FX_API = "https://open.er-api.com/v6/latest/USD";

export async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Request failed with ${response.status}`);
    error.status = response.status;
    error.retryAfter = Number(response.headers.get("retry-after")) || null;
    throw error;
  }
  return response.json();
}

export async function fetchDeals({ storeId, minDiscount }) {
  const url = new URL(`${CHEAPSHARK_API}/deals`);
  url.searchParams.set("storeID", storeId);
  url.searchParams.set("pageSize", "60");
  url.searchParams.set("sortBy", "Savings");
  url.searchParams.set("desc", "1");
  url.searchParams.set("onSale", "1");

  const deals = await getJson(url);
  return deals.filter((deal) => Number(deal.savings) >= minDiscount);
}

export async function searchCheapSharkGames(title, limit = 10) {
  const url = new URL(`${CHEAPSHARK_API}/games`);
  url.searchParams.set("title", title);
  url.searchParams.set("limit", String(limit));

  return getJson(url);
}

export async function fetchDealDetails(dealId) {
  const url = new URL(`${CHEAPSHARK_API}/deals`);
  url.searchParams.set("id", dealId);

  return getJson(url);
}

export async function fetchSteamAppDetails(appId, options = {}) {
  const url = new URL(STEAM_APPDETAILS_API);
  url.searchParams.set("appids", appId);
  url.searchParams.set("filters", "basic,developers,publishers,metacritic,price_overview");
  if (options.region) url.searchParams.set("cc", options.region);
  if (options.language) url.searchParams.set("l", options.language);

  const data = await getJson(url);
  const payload = data?.[appId];
  if (!payload?.success) return null;
  return payload.data ?? null;
}

export async function fetchUsdToKrw(fallbackRate) {
  try {
    const data = await getJson(FX_API);
    const rate = Number(data?.rates?.KRW);
    return Number.isFinite(rate) && rate > 0 ? rate : fallbackRate;
  } catch {
    return fallbackRate;
  }
}
