import "dotenv/config";
import cron from "node-cron";
import { AttachmentBuilder, Client, Events, GatewayIntentBits } from "discord.js";
import { resolve } from "node:path";
import { fetchUsdToKrw } from "./api.js";
import { generateDiscountHistoryChartPng } from "./chart.js";
import { classifyAaaGame } from "./classifier.js";
import { FRANCHISE_GROUPS, RELATED_CONTENT_KEYWORDS, SPECIAL_EDITION_KEYWORDS } from "./config.js";
import { buildDealEmbed, buildSeriesDealEmbed } from "./discord.js";
import { handleHelpMessage } from "./help.js";
import {
  getDealHistory,
  getGameKey,
  hasRecentAppNotification,
  hasExpiryNotification,
  listWatchUserIds,
  recordAppNotification,
  recordDealHistories,
  recordExpiryNotification,
} from "./history.js";
import { handleInteraction } from "./interactions.js";
import {
  applyItadInfoToDeal,
  fetchItadDealExpiry,
  fetchItadDealFeed,
  fetchItadGameInfo,
  isItadExpiryToday,
  itadInfoToSteamDetails,
} from "./itad.js";
import { postWatchDeals } from "./watch.js";
import {
  isStrictRegionEnabled,
  normalizeRegion,
} from "./region.js";
import { readJson, writeJson } from "./storage.js";

const DATA_DIR = resolve(process.env.DATA_DIR || "data");
const SENT_DEALS_PATH = resolve(DATA_DIR, "sent-deals.json");

const config = {
  token: process.env.DISCORD_TOKEN,
  channelId: process.env.DISCORD_CHANNEL_ID,
  schedule: process.env.SCHEDULE_CRON || "0 10 * * *",
  timezone: process.env.TIMEZONE || "Asia/Seoul",
  minDiscount: Number(process.env.MIN_DISCOUNT || 10),
  maxDeals: Number(process.env.MAX_DEALS || 10),
  storeIds: (process.env.STORE_IDS || "1,11,13,25")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  fallbackUsdToKrw: Number(process.env.USD_TO_KRW_FALLBACK || 1370),
  region: normalizeRegion(process.env.REGION),
  regionStrict: isStrictRegionEnabled(process.env.REGION_STRICT),
  steamLanguage: process.env.STEAM_LANGUAGE || "korean",
  itadApiKey: process.env.ITAD_API_KEY || "",
  itadShopIds: process.env.ITAD_SHOP_IDS || "",
  itadShopNames: process.env.ITAD_SHOPS || "",
  itadDailyScanLimit: Number(process.env.ITAD_DAILY_SCAN_LIMIT || 2500),
  watchSetupReminderDays: Number(process.env.WATCH_SETUP_REMINDER_DAYS || 0),
  enableGuildMembersIntent: process.env.ENABLE_GUILD_MEMBERS_INTENT === "true",
  once: process.argv.includes("--once"),
  dryRun: process.argv.includes("--dry-run"),
  includeSent: process.argv.includes("--include-sent"),
};

function assertConfig() {
  const missing = [];
  if (!config.dryRun && !config.token) missing.push("DISCORD_TOKEN");
  if (!config.dryRun && !config.channelId) missing.push("DISCORD_CHANNEL_ID");
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function formatPercent(value) {
  const percent = Number(value);
  return Number.isFinite(percent) ? `${Math.round(percent)}%` : "할인율 정보 없음";
}

function formatDryRunPrice(value, currency = "USD") {
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(Number(value));
}

function printDryRunDeals(deals, usdToKrw, storeSummaries) {
  for (const summary of storeSummaries) {
    const suffix = summary.error ? ` (${summary.error})` : "";
    console.log(
      `[info] ${summary.storeName}: ${summary.discountedCount} discounted, ${summary.aaaCount} AAA matched${suffix}`,
    );
  }

  if (deals.length === 0) {
    console.log("[info] No AAA discounts matched.");
    return;
  }

  console.log(`[info] Matched ${deals.length} AAA discounts. USD/KRW=${usdToKrw}`);
  for (const [index, item] of deals.entries()) {
    if (item.type === "series") {
      console.log(
        [
          `${index + 1}. ${item.label} 시리즈 할인`,
          `   games: ${item.items.map((entry) => entry.deal.title).join(", ")}`,
          `   related: ${item.relatedContent?.length ?? 0} DLC/edition item(s)`,
        ].join("\n"),
      );
      continue;
    }

    const storeName = item.deal.storeName ?? `Store ${item.deal.storeID}`;
    console.log(
      [
        `${index + 1}. ${item.deal.title}`,
        `   store: ${storeName}`,
        `   discount: ${formatPercent(item.deal.savings)}`,
        `   price: ${formatDryRunPrice(item.deal.salePrice, item.deal.priceCurrency)} (normal ${formatDryRunPrice(item.deal.normalPrice, item.deal.priceCurrency)})`,
        `   related: ${item.relatedEditions?.length ?? 0} DLC/edition item(s)`,
        `   reason: ${item.aaaReason}`,
      ].join("\n"),
    );
  }
}

async function enrichItadFeedItems(items) {
  const enriched = [];
  const concurrency = 5;

  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    const results = await Promise.all(chunk.map(async (item) => {
      const info = await fetchItadGameInfo(item.deal, config).catch(() => null);
      if (!info) return item;

      return {
        ...item,
        deal: applyItadInfoToDeal(item.deal, info),
        steamDetails: itadInfoToSteamDetails(info),
        itadInfo: info,
      };
    }));
    enriched.push(...results);
  }

  return enriched;
}

function uniqueDealItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.deal.itadId ?? item.deal.gameID}:${item.deal.storeID}:${item.deal.salePrice}:${item.deal.savings}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTitleText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/®|™/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSpecialEditionTitle(title) {
  const normalized = normalizeTitleText(title);
  return SPECIAL_EDITION_KEYWORDS.some((keyword) => normalized.includes(normalizeTitleText(keyword)));
}

function isRelatedContentTitle(title) {
  const normalized = normalizeTitleText(title);
  return RELATED_CONTENT_KEYWORDS.some((keyword) => normalized.includes(normalizeTitleText(keyword)));
}

function getFranchiseGroup(title) {
  const normalized = normalizeTitleText(title);
  return FRANCHISE_GROUPS.find((group) =>
    group.keywords.some((keyword) => normalized.includes(normalizeTitleText(keyword))),
  ) ?? null;
}

function getBaseTitle(title) {
  let normalized = normalizeTitleText(title);
  for (const keyword of RELATED_CONTENT_KEYWORDS) {
    normalized = normalized.replace(new RegExp(`\\b${normalizeTitleText(keyword).replaceAll(" ", "\\s+")}\\b`, "gi"), " ");
  }
  return normalized
    .replace(/\s+/g, " ")
    .trim();
}

function attachRelatedEditions(baseItems, editionItems) {
  const editionsByBase = new Map();
  for (const item of editionItems) {
    const group = getFranchiseGroup(item.deal.title);
    const baseTitle = group?.key ?? getBaseTitle(item.deal.title);
    if (!baseTitle) continue;
    const editions = editionsByBase.get(baseTitle) ?? [];
    editions.push(item.deal);
    editionsByBase.set(baseTitle, editions);
  }

  return baseItems.map((item) => ({
    ...item,
    relatedEditions: (editionsByBase.get(getFranchiseGroup(item.deal.title)?.key ?? getBaseTitle(item.deal.title)) ?? [])
      .sort((a, b) => Number(b.savings) - Number(a.savings))
      .slice(0, 5),
  }));
}

function groupDisplayDeals(items) {
  const grouped = new Map();
  const singles = [];

  for (const item of items) {
    const group = getFranchiseGroup(item.deal.title);
    if (!group) {
      singles.push({ type: "deal", ...item });
      continue;
    }

    const existing = grouped.get(group.key) ?? {
      type: "series",
      key: group.key,
      label: group.label,
      items: [],
      relatedContent: [],
    };
    existing.items.push(item);
    existing.relatedContent.push(...(item.relatedEditions ?? []));
    grouped.set(group.key, existing);
  }

  const displayItems = [];
  for (const group of grouped.values()) {
    group.items.sort((a, b) => Number(b.deal.savings) - Number(a.deal.savings));
    group.relatedContent = [...new Map(
      group.relatedContent.map((deal) => [`${deal.title}:${deal.storeID}:${deal.salePrice}`, deal]),
    ).values()].sort((a, b) => Number(b.savings) - Number(a.savings)).slice(0, 8);

    if (group.items.length >= 2) {
      displayItems.push(group);
    } else {
      const [item] = group.items;
      displayItems.push({
        type: "deal",
        ...item,
        relatedEditions: group.relatedContent.length > 0 ? group.relatedContent : item.relatedEditions,
      });
    }
  }

  displayItems.push(...singles);
  return displayItems
    .sort((a, b) => {
      const leftSavings = a.type === "series" ? Math.max(...a.items.map((item) => Number(item.deal.savings))) : Number(a.deal.savings);
      const rightSavings = b.type === "series" ? Math.max(...b.items.map((item) => Number(item.deal.savings))) : Number(b.deal.savings);
      return rightSavings - leftSavings;
    });
}

async function collectAaaDeals() {
  const sentDeals = await readJson(SENT_DEALS_PATH, { dealIds: [] });
  const sentDealIds = new Set(sentDeals.dealIds ?? []);
  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  const historyItems = [];
  const storeSummaries = [{
    storeId: "itad",
    storeName: "ITAD selected stores",
    discountedCount: 0,
    aaaCount: 0,
    error: null,
  }];

  try {
    const rawItems = await fetchItadDealFeed(config);
    storeSummaries[0].discountedCount = rawItems.length;
    const baseRawItems = rawItems.filter((item) => !isRelatedContentTitle(item.deal.title));
    const editionRawItems = rawItems.filter((item) => isRelatedContentTitle(item.deal.title) || isSpecialEditionTitle(item.deal.title));
    const titleCandidates = baseRawItems.filter((item) => classifyAaaGame(item.deal, item.steamDetails).isAaa);
    const topDiscountCandidates = baseRawItems.slice(0, 100);
    const editionItems = await enrichItadFeedItems(editionRawItems);
    const items = attachRelatedEditions(
      await enrichItadFeedItems(uniqueDealItems([...titleCandidates, ...topDiscountCandidates])),
      editionItems,
    );
    for (const item of items) {
      const classification = classifyAaaGame(item.deal, item.steamDetails);
      if (!classification.isAaa) continue;
      storeSummaries[0].aaaCount += 1;
      historyItems.push({
        ...item,
        aaaReason: classification.reason,
      });
    }
  } catch (error) {
    storeSummaries[0].error = error.message;
    console.warn(`[warn] ITAD deals failed: ${error.message}`);
  }

  let savedHistory = new Map();
  if (!config.dryRun) {
    savedHistory = recordDealHistories(historyItems);
  }

  const notificationItems = historyItems.filter((item) => {
    if (config.includeSent) return true;
    if (!sentDealIds.has(item.deal.dealID)) return true;

    const historyKey = `${getGameKey(item.deal)}:${item.deal.storeID}`;
    return savedHistory.get(historyKey) === true;
  });

  const deals = groupDisplayDeals(notificationItems).slice(0, config.maxDeals);

  return {
    deals,
    historyItems,
    historyCount: historyItems.length,
    sentDealIds,
    storeSummaries,
    usdToKrw,
  };
}

async function postDailyDeals(client) {
  const channel = await client.channels.fetch(config.channelId);
  if (!channel?.isTextBased()) {
    throw new Error("DISCORD_CHANNEL_ID is not a text channel the bot can access.");
  }

  const { deals, historyItems, sentDealIds, usdToKrw } = await collectAaaDeals();
  if (deals.length === 0) {
    const expiryReminderCount = await postDailyExpiryReminders(channel, historyItems, usdToKrw);
    if (expiryReminderCount === 0) {
      await channel.send({
        content: "오늘은 할인정보가 없어요.",
      });
    }
    console.log("[info] No new AAA discounts matched today.");
    return;
  }

  await channel.send({
    content: `오늘의 AAA급 게임 할인 ${deals.length}개를 찾았습니다. (${config.region} 기준, ${config.minDiscount}% 이상 할인)`,
  });

  for (const item of deals) {
    if (item.type === "series") {
      await channel.send({
        embeds: [
          buildSeriesDealEmbed(item, usdToKrw, {
            region: config.region,
            footerText: "오늘의 할인 정보",
          }),
        ],
      });
      for (const entry of item.items) {
        sentDealIds.add(entry.deal.dealID);
      }
      continue;
    }

    const history = getDealHistory(item.deal);
    const dealExpiry = item.dealExpiry ?? await fetchItadDealExpiry(item.deal, config);
    const chart = await generateDiscountHistoryChartPng(history, item.deal.title);
    const files = chart
      ? [new AttachmentBuilder(chart, { name: "discount-history.png" })]
      : [];

    await channel.send({
      embeds: [
        buildDealEmbed(item.deal, item.steamDetails, item.aaaReason, usdToKrw, {
          hasHistoryChart: Boolean(chart),
          historyCount: history.length,
          history,
          dealExpiry,
          relatedEditions: item.relatedEditions,
          footerText: "오늘의 할인 정보",
        }),
      ],
      files,
    });
    sentDealIds.add(item.deal.dealID);
  }

  await writeJson(SENT_DEALS_PATH, {
    updatedAt: new Date().toISOString(),
    dealIds: [...sentDealIds],
  });
  console.log(`[info] Posted ${deals.length} deals.`);

  await postDailyExpiryReminders(channel, historyItems, usdToKrw);
}

async function postDailyExpiryReminders(channel, deals, usdToKrw) {
  const reminderItems = [];
  for (const item of deals) {
    const dealExpiry = item.dealExpiry ?? await fetchItadDealExpiry(item.deal, config);
    if (!isItadExpiryToday(dealExpiry) || hasExpiryNotification("daily", item.deal, dealExpiry.raw)) {
      continue;
    }
    reminderItems.push({ ...item, dealExpiry });
  }

  if (reminderItems.length === 0) return 0;

  await channel.send({
    content: `오늘 할인 종료 예정인 AAA급 게임 ${reminderItems.length}개가 있습니다.`,
  });

  for (const item of reminderItems) {
    const history = getDealHistory(item.deal);
    const chart = await generateDiscountHistoryChartPng(history, item.deal.title);
    const files = chart
      ? [new AttachmentBuilder(chart, { name: "discount-history.png" })]
      : [];

    await channel.send({
      embeds: [
        buildDealEmbed(item.deal, item.steamDetails, item.aaaReason, usdToKrw, {
          hasHistoryChart: Boolean(chart),
          historyCount: history.length,
          history,
          dealExpiry: item.dealExpiry,
          expiryReminder: true,
          lookupLabel: `${config.region} Steam 할인 종료 알림\n오늘 할인 종료일이에요.`,
          footerText: "할인 종료 알림",
        }),
      ],
      files,
    });
    recordExpiryNotification("daily", item.deal, item.dealExpiry.raw);
  }
  return reminderItems.length;
}

async function postScheduledNotifications(client) {
  try {
    await postDailyDeals(client);
  } catch (error) {
    console.error("[error] Scheduled daily post failed:", error);
  }

  try {
    await postWatchDeals(client, config);
  } catch (error) {
    console.error("[error] Scheduled watch post failed:", error);
  }

  try {
    await postWatchSetupReminder(client);
  } catch (error) {
    console.error("[error] Scheduled watch setup reminder failed:", error);
  }
}

async function postWatchSetupReminder(client) {
  if (!Number.isFinite(config.watchSetupReminderDays) || config.watchSetupReminderDays <= 0) return 0;
  if (!config.enableGuildMembersIntent) {
    console.warn("[warn] Watch setup reminder skipped: ENABLE_GUILD_MEMBERS_INTENT=true is required.");
    return 0;
  }

  const reminderKey = `watch-setup-reminder:${config.channelId}`;
  const intervalMs = config.watchSetupReminderDays * 24 * 60 * 60 * 1000;
  if (hasRecentAppNotification(reminderKey, intervalMs)) return 0;

  const channel = await client.channels.fetch(config.channelId);
  if (!channel?.isTextBased() || !channel.guild) return 0;

  let members;
  try {
    members = await channel.guild.members.fetch();
  } catch (error) {
    console.warn(`[warn] Cannot fetch guild members for watch setup reminder: ${error.message}`);
    return 0;
  }

  const watchUserIds = new Set(listWatchUserIds());
  const emptyWatchMembers = members.filter((member) =>
    !member.user.bot && !watchUserIds.has(member.id)
  );
  if (emptyWatchMembers.size === 0) return 0;

  await channel.send({
    content: [
      "아직 개인 관심 게임을 등록하지 않은 분들은 Steam 찜목록을 가져와보세요.",
      "`/steam profile:Steam프로필주소`",
      "찜목록을 watch-list에 채우면 관심 게임 할인 알림을 받을 수 있습니다.",
    ].join("\n"),
  });
  recordAppNotification(reminderKey);
  console.log(`[info] Posted watch setup reminder for ${emptyWatchMembers.size} member(s) without watch-list.`);
  return emptyWatchMembers.size;
}

async function main() {
  assertConfig();

  if (config.dryRun) {
    const { deals, storeSummaries, usdToKrw } = await collectAaaDeals();
    printDryRunDeals(deals, usdToKrw, storeSummaries);
    return;
  }

  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ];
  if (config.watchSetupReminderDays > 0 && config.enableGuildMembersIntent) {
    intents.push(GatewayIntentBits.GuildMembers);
  }

  const client = new Client({ intents });

  client.once(Events.ClientReady, async () => {
    console.log(`[info] Logged in as ${client.user.tag}`);

    if (config.once) {
      await postScheduledNotifications(client);
      await client.destroy();
      return;
    }

    cron.schedule(
      config.schedule,
      () => {
        postScheduledNotifications(client);
      },
      {
        timezone: config.timezone,
      },
    );
    console.log(`[info] Scheduled ${config.schedule} (${config.timezone})`);
  });

  client.on("interactionCreate", (interaction) => {
    handleInteraction(interaction, config).catch((error) => {
      console.error("[error] Interaction handler failed:", error);
    });
  });

  client.on(Events.MessageCreate, (message) => {
    handleHelpMessage(message).catch((error) => {
      console.error("[error] Help message handler failed:", error);
    });
  });

  await client.login(config.token);
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exitCode = 1;
});
