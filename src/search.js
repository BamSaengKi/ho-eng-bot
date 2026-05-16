import { fetchDealDetails, fetchSteamAppDetails, searchCheapSharkGames } from "./api.js";
import { applySteamRegionalPrice, getSteamRegionOptions } from "./region.js";

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
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
  const games = await searchCheapSharkGames(query, 10);
  const sortedGames = [...games].sort((a, b) => {
    const scoreDiff = scoreGame(query, a) - scoreGame(query, b);
    if (scoreDiff !== 0) return scoreDiff;
    return Number(a.cheapest || Infinity) - Number(b.cheapest || Infinity);
  });

  for (const game of sortedGames) {
    if (!game?.cheapestDealID) continue;

    const dealId = decodeURIComponent(game.cheapestDealID);
    const details = await fetchDealDetails(dealId);
    const gameInfo = details?.gameInfo;
    if (!gameInfo) continue;

    const deal = toDeal(gameInfo, dealId);
    const steamDetails = deal.steamAppID
      ? await fetchSteamAppDetails(deal.steamAppID, getSteamRegionOptions(config))
      : null;
    const regionalDeal = applySteamRegionalPrice(deal, steamDetails, config.region);

    if (config.regionStrict && !regionalDeal) continue;
    if (config.regionStrict && Number(regionalDeal.savings) < Number(config.minDiscount ?? 1)) continue;

    return {
      deal: regionalDeal ?? {
        ...deal,
        region: config.region,
        regionVerified: false,
      },
      steamDetails,
    };
  }

  return null;
}
