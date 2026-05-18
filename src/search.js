import { fetchDealDetails, fetchSteamAppDetails, searchCheapSharkGames } from "./api.js";
import { resolveGameQuery } from "./query-normalizer.js";
import { applySteamRegionalPrice, getSteamRegionOptions } from "./region.js";

const ADD_ON_HINTS = [
  "deluxe kit",
  "kit",
  "sunbreak",
  "iceborne",
  "soundtrack",
  "costume",
  "character pass",
  "season pass",
  "expansion pass",
  "starter pack",
  "upgrade pack",
];

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isLikelyAddOn(game) {
  const title = normalize(game.external);
  return ADD_ON_HINTS.some((hint) => title.includes(hint));
}

function scoreGame(query, game) {
  const text = normalize(game.external);
  const target = normalize(query);
  if (text === target) return 0;
  if (text.startsWith(target)) return 1;
  if (text.includes(target)) return 2;
  return 3;
}

function toDeal(gameInfo, dealId) {
  const salePrice = Number(gameInfo.salePrice);
  const normalPrice = Number(gameInfo.retailPrice);
  const savings = normalPrice > 0 ? ((normalPrice - salePrice) / normalPrice) * 100 : 0;

  return {
    title: gameInfo.name,
    dealID: dealId,
    storeID: gameInfo.storeID,
    gameID: gameInfo.gameID,
    steamAppID: gameInfo.steamAppID,
    salePrice: gameInfo.salePrice,
    normalPrice: gameInfo.retailPrice,
    savings: String(savings),
    steamRatingPercent: gameInfo.steamRatingPercent,
    steamRatingCount: gameInfo.steamRatingCount,
    thumb: gameInfo.thumb,
  };
}

export async function findBestCurrentDeal(query, config = {}) {
  const search = await searchCurrentDealCandidates(query);
  for (const candidate of search.candidates) {
    const result = await findCurrentDealFromGame(candidate, config);
    if (result) {
      return {
        ...result,
        originalQuery: query,
        searchQuery: search.searchQuery,
        queryCorrection: search.queryCorrection,
      };
    }
  }

  return null;
}

export async function findCurrentDealFromStoredGame(watch, config = {}) {
  const search = await searchCurrentDealCandidates(watch.title ?? watch.query);
  const candidate = search.candidates.find((game) =>
    (watch.steamAppId && String(game.steamAppID) === String(watch.steamAppId)) ||
    (watch.gameId && String(game.gameID) === String(watch.gameId)) ||
    normalize(game.external) === normalize(watch.title),
  ) ?? search.candidates[0];

  if (!candidate) return null;
  return findCurrentDealFromGame(candidate, config);
}

export async function searchCurrentDealCandidates(query, limit = 10) {
  const resolved = resolveGameQuery(query);
  const queries = [...new Set([resolved.query, query])];

  for (const searchQuery of queries) {
    const candidates = await searchCandidatesForQuery(searchQuery, limit);
    if (candidates.length > 0) {
      return {
        originalQuery: query,
        searchQuery,
        queryCorrection: resolved.corrected && searchQuery === resolved.query ? resolved : null,
        candidates,
      };
    }
  }

  return {
    originalQuery: query,
    searchQuery: query,
    queryCorrection: null,
    candidates: [],
  };
}

async function searchCandidatesForQuery(query, limit) {
  const games = await searchCheapSharkGames(query, limit);
  return [...games].sort((a, b) => {
    const scoreDiff = scoreGame(query, a) - scoreGame(query, b);
    if (scoreDiff !== 0) return scoreDiff;
    const addOnDiff = Number(isLikelyAddOn(a)) - Number(isLikelyAddOn(b));
    if (addOnDiff !== 0) return addOnDiff;
    return Number(a.cheapest || Infinity) - Number(b.cheapest || Infinity);
  });
}

export async function findCurrentDealFromGame(game, config = {}) {
  if (!game?.cheapestDealID) return null;

  const dealId = decodeURIComponent(game.cheapestDealID);
  const details = await fetchDealDetails(dealId);
  const gameInfo = details?.gameInfo;
  if (!gameInfo) return null;

  const deal = toDeal(gameInfo, dealId);
  const steamDetails = deal.steamAppID
    ? await fetchSteamAppDetails(deal.steamAppID, getSteamRegionOptions(config))
    : null;
  const regionalDeal = applySteamRegionalPrice(deal, steamDetails, config.region);

  if (config.regionStrict && !regionalDeal) return null;
  if (config.regionStrict && Number(regionalDeal.savings) < Number(config.minDiscount ?? 1)) return null;

  return {
    deal: regionalDeal ?? {
      ...deal,
      region: config.region,
      regionVerified: false,
    },
    steamDetails,
  };
}
