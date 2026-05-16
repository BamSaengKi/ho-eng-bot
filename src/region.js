const STEAM_STORE_ID = "1";

function toPriceUnits(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number / 100 : null;
}

export function normalizeRegion(value) {
  return String(value || "KR").trim().toUpperCase();
}

export function isStrictRegionEnabled(value) {
  return String(value ?? "true").toLowerCase() !== "false";
}

export function applySteamRegionalPrice(deal, steamDetails, region) {
  const price = steamDetails?.price_overview;
  const initial = toPriceUnits(price?.initial);
  const final = toPriceUnits(price?.final);
  const discount = Number(price?.discount_percent);

  if (!price?.currency || final == null || initial == null) {
    return null;
  }

  return {
    ...deal,
    storeID: "1",
    storeUrl: `https://store.steampowered.com/app/${deal.steamAppID}`,
    salePrice: String(final),
    normalPrice: String(initial),
    savings: String(Number.isFinite(discount) ? discount : 0),
    priceCurrency: price.currency,
    region,
    regionVerified: true,
  };
}

export function shouldSkipStoreForRegion(storeId, config) {
  return config.regionStrict && String(storeId) !== STEAM_STORE_ID;
}

export function getSteamRegionOptions(config) {
  return {
    region: config.region,
    language: config.steamLanguage,
  };
}
