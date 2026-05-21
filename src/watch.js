import { AttachmentBuilder } from "discord.js";
import { fetchUsdToKrw } from "./api.js";
import { generateDiscountHistoryChartPng } from "./chart.js";
import { buildDealEmbed } from "./discord.js";
import {
  getDealHistory,
  getGameKey,
  hasRecentWatchNotification,
  listAllWatchSubscriptions,
  recordDealLookupHistory,
  recordWatchNotification,
} from "./history.js";
import { fetchItadDealExpiry } from "./itad.js";
import { findCurrentDealFromStoredGame } from "./search.js";

const MAX_EMBEDS_PER_MESSAGE = 10;

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatNewsletterContent(groups, totalCount) {
  const mentions = uniqueValues(groups.flatMap((group) => group.watchers.map((watcher) => `<@${watcher.userId}>`)));
  return [
    "**관심 게임 할인 뉴스레터**",
    `watch-list에 등록된 게임 중 오늘 할인 중인 항목 ${totalCount}개를 찾았습니다.`,
    mentions.length > 0 ? `대상: ${mentions.join(" ")}` : "",
  ].filter(Boolean).join("\n");
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
    noCurrentDeal: 0,
    belowMinDiscount: 0,
    recentlyNotified: 0,
    failed: 0,
  };
  const groupedDeals = new Map();

  for (const watch of watches) {
    try {
      const result = await findCurrentDealFromStoredGame(watch, config);
      if (!result) {
        stats.noCurrentDeal += 1;
        continue;
      }
      if (Number(result.deal.savings) < Number(config.minDiscount ?? 1)) {
        stats.belowMinDiscount += 1;
        continue;
      }
      if (hasRecentWatchNotification(watch.userId, result.deal)) {
        stats.recentlyNotified += 1;
        continue;
      }

      recordDealLookupHistory({
        deal: result.deal,
        steamDetails: result.steamDetails,
      });

      const member = "guild" in channel
        ? await channel.guild.members.fetch(watch.userId).catch(() => null)
        : null;
      const displayName = member?.displayName ?? "해당 사용자";
      const groupKey = `${getGameKey(result.deal)}:${result.deal.storeID}`;
      const group = groupedDeals.get(groupKey) ?? {
        deal: result.deal,
        steamDetails: result.steamDetails,
        watchers: [],
      };
      group.watchers.push({
        userId: watch.userId,
        displayName,
        deal: result.deal,
      });
      groupedDeals.set(groupKey, group);
    } catch (error) {
      stats.failed += 1;
      console.warn(`[warn] Watch notification failed for ${watch.userId}/${watch.title}: ${error.message}`);
    }
  }

  const groups = [...groupedDeals.values()];
  for (const groupChunk of chunkItems(groups, MAX_EMBEDS_PER_MESSAGE)) {
    const embeds = [];
    const files = [];

    for (const [index, group] of groupChunk.entries()) {
      const history = getDealHistory(group.deal);
      const dealExpiry = await fetchItadDealExpiry(group.deal, config);
      const chart = await generateDiscountHistoryChartPng(history, group.deal.title);
      const historyImageName = `discount-history-${index + 1}.png`;
      if (chart) {
        files.push(new AttachmentBuilder(chart, { name: historyImageName }));
      }

      const watcherNames = uniqueValues(group.watchers.map((watcher) => watcher.displayName)).join(", ");
      const watcherLabel = group.watchers.length > 1
        ? `${watcherNames}님들이 관심 게임으로 등록한 할인 정보입니다.`
        : `${watcherNames}님이 관심 게임으로 등록한 할인 정보입니다.`;
      embeds.push(buildDealEmbed(group.deal, group.steamDetails, "개인 관심 게임", usdToKrw, {
        hasHistoryChart: Boolean(chart),
        historyCount: history.length,
        history,
        dealExpiry,
        historyImageName,
        lookupLabel: `${config.region} Steam 개인 관심 게임\n${watcherLabel}`,
        footerText: "관심 게임 할인 뉴스레터",
      }));
    }

    try {
      const message = await channel.send({
        content: formatNewsletterContent(groupChunk, groups.length),
        embeds,
        files,
      });

      try {
        await message.startThread({
          name: "관심 게임 할인 뉴스레터",
          reason: "Watch deal newsletter thread",
        });
      } catch (error) {
        console.warn(`[warn] Failed to create watch newsletter thread: ${error.message}`);
      }

      for (const group of groupChunk) {
        for (const watcher of group.watchers) {
          recordWatchNotification(watcher.userId, watcher.deal);
          stats.sent += 1;
        }
      }
      stats.cards += groupChunk.length;
    } catch (error) {
      stats.failed += 1;
      console.warn(`[warn] Watch newsletter send failed: ${error.message}`);
    }
  }

  console.log(
    [
      `[info] Watch notifications: sent=${stats.sent}`,
      `cards=${stats.cards}`,
      `noCurrentDeal=${stats.noCurrentDeal}`,
      `belowMinDiscount=${stats.belowMinDiscount}`,
      `recentlyNotified=${stats.recentlyNotified}`,
      `failed=${stats.failed}`,
    ].join(" "),
  );
}
