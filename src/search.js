import {
  applyItadInfoToDeal,
  fetchItadCurrentDeals,
  fetchItadGameInfo,
  itadInfoToSteamDetails,
  searchItadGames,
} from "./itad.js";
import { resolveGameQuery } from "./query-normalizer.js";

const ADD_ON_HINTS = [
  "deluxe kit",
  "kit",
  "sunbreak",
  "iceborne",
  "eternal orbs",
  "premium arcade",
  "skins bundle",
  "soundtrack",
  "costume",
  "character pass",
  "season pass",
  "expansion pass",
  "starter pack",
  "upgrade pack",
];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/®|™/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function pickBestDeal(items) {
  return [...items].sort((a, b) => {
    const discountDiff = Number(b.deal.savings) - Number(a.deal.savings);
    if (discountDiff !== 0) return discountDiff;
    return Number(a.deal.salePrice) - Number(b.deal.salePrice);
  })[0] ?? null;
}

async function buildDealResult(game, config = {}) {
  const info = await fetchItadGameInfo(game, config);
  const baseDeal = {
    title: info?.title ?? game.external,
    gameID: info?.id ?? game.itadId ?? game.gameID,
    itadId: info?.id ?? game.itadId ?? game.gameID,
    steamAppID: info?.appid ?? game.steamAppID,
    thumb: info?.assets?.banner145 ?? info?.assets?.boxart ?? game.thumb,
    region: config.region,
    regionVerified: true,
  };

  const currentDeals = await fetchItadCurrentDeals(baseDeal, config);
  const best = pickBestDeal(currentDeals);
  if (!best) return null;

  return {
    deal: applyItadInfoToDeal(best.deal, info),
    steamDetails: itadInfoToSteamDetails(info),
    dealExpiry: best.dealExpiry,
    allDeals: currentDeals.map((item) => ({
      ...item,
      deal: applyItadInfoToDeal(item.deal, info),
    })),
  };
}

export async function findBestCurrentDeal(query, config = {}) {
  const search = await searchCurrentDealCandidates(query, 10, config);
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
  const candidate = {
    external: watch.title ?? watch.query,
    title: watch.title ?? watch.query,
    gameID: watch.gameId,
    itadId: String(watch.gameId ?? "").includes("-") ? watch.gameId : null,
    steamAppID: watch.steamAppId,
    source: "itad",
  };

  if (candidate.itadId) {
    const result = await findCurrentDealFromGame(candidate, config);
    if (result) return result;
  }

  const search = await searchCurrentDealCandidates(watch.title ?? watch.query, 10, config);
  const match = search.candidates.find((game) =>
    (watch.steamAppId && String(game.steamAppID) === String(watch.steamAppId)) ||
    (watch.gameId && String(game.gameID) === String(watch.gameId)) ||
    normalize(game.external) === normalize(watch.title),
  ) ?? search.candidates[0];

  return match ? findCurrentDealFromGame(match, config) : null;
}

export async function searchCurrentDealCandidates(query, limit = 10, config = {}) {
  const resolved = resolveGameQuery(query);
  const queries = [...new Set([resolved.query, query])];

  for (const searchQuery of queries) {
    const candidates = await searchCandidatesForQuery(searchQuery, limit, config);
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

async function searchCandidatesForQuery(query, limit, config) {
  const games = await searchItadGames(query, config, limit);
  return [...games].sort((a, b) => {
    const addOnDiff = Number(isLikelyAddOn(a)) - Number(isLikelyAddOn(b));
    if (addOnDiff !== 0) return addOnDiff;
    const scoreDiff = scoreGame(query, a) - scoreGame(query, b);
    if (scoreDiff !== 0) return scoreDiff;
    return a.external.localeCompare(b.external);
  });
}

export async function findCurrentDealFromGame(game, config = {}) {
  return buildDealResult(game, config);
}
