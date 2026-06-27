import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { fetchSteamAppDetails, fetchSteamAppReviews, fetchUsdToKrw } from "./api.js";
import { generateDiscountHistoryChartPng } from "./chart.js";
import { appendAaaFeedbackButton } from "./components.js";
import { buildDealEmbed } from "./discord.js";
import {
  getDealHistory,
  getGameKey,
  getWatchSettings,
  hasExpiryNotification,
  hasRecentWatchNotification,
  listAllWatchSubscriptions,
  recordDealLookupHistory,
  recordExpiryNotification,
  recordWatchNotification,
  saveAaaFeedbackContext,
  saveWatchShareContext,
} from "./history.js";
import { fetchItadCurrentDeals, fetchItadDealExpiry, isItadExpiryToday } from "./itad.js";
import { getSteamRegionOptions } from "./region.js";
import { findCurrentDealFromStoredGame } from "./search.js";

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
  const seenStoreIds = new Set(candidates.map((candidate) => String(candidate.deal.storeID ?? "")));

  for (const item of itadItems) {
    const storeId = String(item.deal.storeID ?? "");
    if (seenStoreIds.has(storeId)) continue;
    seenStoreIds.add(storeId);
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
  return [
    group.expiryReminder ? "**관심 게임 할인 종료 알림**" : "**관심 게임 할인 알림**",
    `watch-list에 등록된 게임입니다: **${group.deal.title}**`,
    group.expiryReminder ? "오늘 할인 종료 예정입니다." : "",
  ].filter(Boolean).join("\n");
}

const WATCH_SHARE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const AAA_FEEDBACK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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

function buildWatchShareButton(token) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`watch_share:${token}`)
      .setLabel("공유하고 스레드 만들기")
      .setStyle(ButtonStyle.Primary),
  );
}

function createAaaFeedbackToken({ deal, steamDetails, aaaReason }) {
  const token = randomUUID();
  saveAaaFeedbackContext({
    token,
    deal,
    steamDetails,
    aaaReason,
    expiresAt: new Date(Date.now() + AAA_FEEDBACK_TTL_MS).toISOString(),
  });
  return token;
}

function buildWatchActionRow(shareToken, feedbackToken) {
  return appendAaaFeedbackButton(buildWatchShareButton(shareToken), feedbackToken);
}

export async function postWatchDeals(client, config) {
  const watches = listAllWatchSubscriptions();
  if (watches.length === 0) {
    console.log("[info] No personal watch subscriptions.");
    return;
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

      const watchSettings = getWatchSettings(watch.userId);
      for (const candidate of candidates) {
        const minDiscount = Number(watchSettings.minDiscount ?? config.minDiscount ?? 1);
        if (!matchesStoreFilter(candidate.deal, watchSettings.storeFilter)) {
          stats.belowMinDiscount += 1;
          continue;
        }
        if (Number(candidate.deal.savings) < minDiscount) {
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
          watchId: watch.id,
          displayName: "회원님",
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

    for (const watcher of group.watchers) {
      try {
        const user = await client.users.fetch(watcher.userId);
        const shareToken = randomUUID();
        saveWatchShareContext({
          token: shareToken,
          userId: watcher.userId,
          watchId: watcher.watchId,
          title: group.deal.title,
          storeId: group.deal.storeID,
          deal: group.deal,
          steamDetails: group.steamDetails,
          dealExpiry: group.dealExpiry,
          expiresAt: new Date(Date.now() + WATCH_SHARE_TTL_MS).toISOString(),
        });
        const feedbackToken = createAaaFeedbackToken({
          deal: group.deal,
          steamDetails: group.steamDetails,
          aaaReason: "개인 관심 게임",
        });
        const messageFiles = chart
          ? [new AttachmentBuilder(chart, { name: historyImageName })]
          : [];
        await user.send({
          content: formatDealContent(group),
          embeds: [
            buildDealEmbed(group.deal, group.steamDetails, "개인 관심 게임", usdToKrw, {
              hasHistoryChart: Boolean(chart),
              historyCount: history.length,
              history,
              dealExpiry: group.dealExpiry,
              expiryReminder: group.expiryReminder,
              historyImageName,
              lookupLabel: `${config.region} 개인 관심 게임\n${watcher.displayName}이 관심 게임으로 등록한 할인 정보입니다.`,
              footerText: group.expiryReminder ? "관심 게임 할인 종료 알림" : "관심 게임 할인 알림",
            }),
          ],
          files: messageFiles,
          components: [buildWatchActionRow(shareToken, feedbackToken)],
        });

        recordWatchNotification(watcher.userId, watcher.deal);
        if (watcher.expiryReminder && watcher.expiryAt) {
          recordExpiryNotification("watch", watcher.deal, watcher.expiryAt, watcher.userId);
          stats.expiryReminders += 1;
        }
        stats.sent += 1;
        stats.cards += 1;
      } catch (error) {
        stats.failed += 1;
        console.warn(`[warn] Watch DM send failed for ${watcher.userId}/${group.deal.title}: ${error.message}`);
      }
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
