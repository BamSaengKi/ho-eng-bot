import { AttachmentBuilder } from "discord.js";
import { fetchSteamAppDetails, fetchSteamAppReviews, fetchUsdToKrw } from "./api.js";
import { generateDiscountHistoryChartPng } from "./chart.js";
import { buildDealEmbed } from "./discord.js";
import {
  getDealHistory,
  getGameKey,
  hasExpiryNotification,
  hasRecentWatchNotification,
  listAllWatchSubscriptions,
  recordDealLookupHistory,
  recordExpiryNotification,
  recordWatchNotification,
} from "./history.js";
import { fetchItadCurrentDeals, fetchItadDealExpiry, isItadExpiryToday } from "./itad.js";
import { getSteamRegionOptions } from "./region.js";
import { findCurrentDealFromStoredGame } from "./search.js";

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function isSteamDeal(deal) {
  return String(deal.storeID) === "1" || String(deal.storeName ?? "").toLowerCase() === "steam";
}

function createWatchProbeDeal(watch, result) {
  return result?.deal ?? {
    title: watch.title ?? watch.query,
    steamAppID: watch.steamAppId,
    gameID: watch.gameId,
    region: "KR",
    regionVerified: true,
  };
}

async function enrichWithSteamInfo(candidate, watch, config) {
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

async function collectWatchDealCandidates(watch, config) {
  const candidates = [];
  const result = await findCurrentDealFromStoredGame(watch, config);
  if (result) {
    candidates.push({
      ...result,
      source: "cheapshark",
      dealExpiry: null,
    });
  }

  const probeDeal = createWatchProbeDeal(watch, result);
  const itadItems = result?.allDeals ?? await fetchItadCurrentDeals(probeDeal, config);
  const hasSteamCandidate = candidates.some((candidate) => isSteamDeal(candidate.deal));

  for (const item of itadItems) {
    if (hasSteamCandidate && isSteamDeal(item.deal)) continue;
    candidates.push({
      deal: item.deal,
      steamDetails: result?.steamDetails ?? null,
      dealExpiry: item.dealExpiry,
      source: "itad",
    });
  }

  const seen = new Set();
  const uniqueCandidates = candidates.filter((candidate) => {
    const key = [
      getGameKey(candidate.deal),
      candidate.deal.storeID,
      candidate.deal.priceCurrency || "USD",
      candidate.deal.salePrice,
      candidate.deal.savings,
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return Promise.all(uniqueCandidates.map((candidate) => enrichWithSteamInfo(candidate, watch, config)));
}

function formatDealContent(group) {
  const mentions = uniqueValues(group.watchers.map((watcher) => `<@${watcher.userId}>`));
  return [
    group.expiryReminder ? "**관심 게임 할인 종료 알림**" : "**관심 게임 할인 알림**",
    `watch-list에 등록된 게임입니다: **${group.deal.title}**`,
    group.expiryReminder ? "오늘 할인 종료 예정입니다." : "",
    mentions.length > 0 ? `대상: ${mentions.join(" ")}` : "",
  ].filter(Boolean).join("\n");
}

function formatThreadName(group) {
  const title = `${group.deal.title} 할인 정보`;
  return title.length > 100 ? title.slice(0, 100) : title;
}

export async function postWatchDeals(client, config) {
  const watches = listAllWatchSubscriptions();
  if (watches.length === 0) {
    console.log("[info] No personal watch subscriptions.");
    return;
  }

  const channel = await client.channels.fetch(config.channelId);
  if (!channel?.isTextBased()) {
    throw new Error("DISCORD_CHANNEL_ID is not a text channel the bot can access.");
  }

  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  const stats = {
    sent: 0,
    cards: 0,
    expiryReminders: 0,
    noCurrentDeal: 0,
    belowMinDiscount: 0,
    recentlyNotified: 0,
    failed: 0,
  };
  const groupedDeals = new Map();

  for (const watch of watches) {
    try {
      const candidates = await collectWatchDealCandidates(watch, config);
      if (candidates.length === 0) {
        stats.noCurrentDeal += 1;
        continue;
      }

      for (const candidate of candidates) {
        if (Number(candidate.deal.savings) < Number(config.minDiscount ?? 1)) {
          stats.belowMinDiscount += 1;
          continue;
        }
        const dealExpiry = candidate.dealExpiry ?? await fetchItadDealExpiry(candidate.deal, config);
        const expiryReminder = isItadExpiryToday(dealExpiry) &&
          !hasExpiryNotification("watch", candidate.deal, dealExpiry.raw, watch.userId);
        if (hasRecentWatchNotification(watch.userId, candidate.deal) && !expiryReminder) {
          stats.recentlyNotified += 1;
          continue;
        }

        recordDealLookupHistory({
          deal: candidate.deal,
          steamDetails: candidate.steamDetails,
        });

        const member = "guild" in channel
          ? await channel.guild.members.fetch(watch.userId).catch(() => null)
          : null;
        const displayName = member?.displayName ?? "해당 사용자";
        const groupKey = `${getGameKey(candidate.deal)}:${candidate.deal.storeID}`;
        const group = groupedDeals.get(groupKey) ?? {
          deal: candidate.deal,
          steamDetails: candidate.steamDetails,
          dealExpiry,
          expiryReminder,
          watchers: [],
        };
        group.dealExpiry = group.dealExpiry ?? dealExpiry;
        group.expiryReminder = group.expiryReminder || expiryReminder;
        group.watchers.push({
          userId: watch.userId,
          displayName,
          deal: candidate.deal,
          expiryReminder,
          expiryAt: dealExpiry?.raw ?? null,
        });
        groupedDeals.set(groupKey, group);
      }
    } catch (error) {
      stats.failed += 1;
      console.warn(`[warn] Watch notification failed for ${watch.userId}/${watch.title}: ${error.message}`);
    }
  }

  const groups = [...groupedDeals.values()];
  for (const group of groups) {
    const history = getDealHistory(group.deal);
    const chart = await generateDiscountHistoryChartPng(history, group.deal.title);
    const historyImageName = "discount-history.png";
    const files = chart
      ? [new AttachmentBuilder(chart, { name: historyImageName })]
      : [];
    const watcherNames = uniqueValues(group.watchers.map((watcher) => watcher.displayName)).join(", ");
    const watcherLabel = group.watchers.length > 1
      ? `${watcherNames}님들이 관심 게임으로 등록한 할인 정보입니다.`
      : `${watcherNames}님이 관심 게임으로 등록한 할인 정보입니다.`;

    try {
      const message = await channel.send({
        content: formatDealContent(group),
        embeds: [
          buildDealEmbed(group.deal, group.steamDetails, "개인 관심 게임", usdToKrw, {
            hasHistoryChart: Boolean(chart),
            historyCount: history.length,
            history,
            dealExpiry: group.dealExpiry,
            expiryReminder: group.expiryReminder,
            historyImageName,
            lookupLabel: `${config.region} 개인 관심 게임\n${watcherLabel}`,
            footerText: group.expiryReminder ? "관심 게임 할인 종료 알림" : "관심 게임 할인 알림",
          }),
        ],
        files,
      });

      try {
        await message.startThread({
          name: formatThreadName(group),
          reason: "Watch deal thread",
        });
      } catch (error) {
        console.warn(`[warn] Failed to create watch deal thread: ${error.message}`);
      }

      for (const watcher of group.watchers) {
        recordWatchNotification(watcher.userId, watcher.deal);
        if (watcher.expiryReminder && watcher.expiryAt) {
          recordExpiryNotification("watch", watcher.deal, watcher.expiryAt, watcher.userId);
          stats.expiryReminders += 1;
        }
        stats.sent += 1;
      }
      stats.cards += 1;
    } catch (error) {
      stats.failed += 1;
      console.warn(`[warn] Watch deal send failed: ${error.message}`);
    }
  }

  console.log(
    [
      `[info] Watch notifications: sent=${stats.sent}`,
      `cards=${stats.cards}`,
      `expiryReminders=${stats.expiryReminders}`,
      `noCurrentDeal=${stats.noCurrentDeal}`,
      `belowMinDiscount=${stats.belowMinDiscount}`,
      `recentlyNotified=${stats.recentlyNotified}`,
      `failed=${stats.failed}`,
    ].join(" "),
  );
}
