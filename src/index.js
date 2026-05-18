import "dotenv/config";
import cron from "node-cron";
import { AttachmentBuilder, Client, Events, GatewayIntentBits } from "discord.js";
import { resolve } from "node:path";
import { fetchDeals, fetchSteamAppDetails, fetchUsdToKrw } from "./api.js";
import { generateDiscountHistoryChartPng } from "./chart.js";
import { classifyAaaGame } from "./classifier.js";
import { REQUESTED_STORES } from "./config.js";
import { buildDealEmbed } from "./discord.js";
import { handleHelpMessage } from "./help.js";
import { getDealHistory, getGameKey, recordDealHistories } from "./history.js";
import { handleInteraction } from "./interactions.js";
import { postWatchDeals } from "./watch.js";
import {
  applySteamRegionalPrice,
  getSteamRegionOptions,
  isStrictRegionEnabled,
  normalizeRegion,
  shouldSkipStoreForRegion,
} from "./region.js";
import { readJson, writeJson } from "./storage.js";

const DATA_DIR = resolve("data");
const SENT_DEALS_PATH = resolve(DATA_DIR, "sent-deals.json");
const STEAM_CACHE_PATH = resolve(DATA_DIR, "steam-app-cache.json");

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
    const storeName = REQUESTED_STORES.get(String(item.deal.storeID)) ?? `Store ${item.deal.storeID}`;
    console.log(
      [
        `${index + 1}. ${item.deal.title}`,
        `   store: ${storeName}`,
        `   discount: ${formatPercent(item.deal.savings)}`,
        `   price: ${formatDryRunPrice(item.deal.salePrice, item.deal.priceCurrency)} (normal ${formatDryRunPrice(item.deal.normalPrice, item.deal.priceCurrency)})`,
        `   reason: ${item.aaaReason}`,
      ].join("\n"),
    );
  }
}

async function getSteamDetailsWithCache(appId, cache) {
  if (!appId) return null;
  const cacheKey = `${appId}:${config.region}:${config.steamLanguage}`;
  if (cache[cacheKey]) return cache[cacheKey];

  const details = await fetchSteamAppDetails(appId, getSteamRegionOptions(config));
  cache[cacheKey] = {
    savedAt: new Date().toISOString(),
    ...(details ?? {}),
  };
  return cache[cacheKey];
}

async function collectAaaDeals() {
  const sentDeals = await readJson(SENT_DEALS_PATH, { dealIds: [] });
  const sentDealIds = new Set(sentDeals.dealIds ?? []);
  const steamCache = await readJson(STEAM_CACHE_PATH, {});
  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  const historyItems = [];
  const storeSummaries = [];

  for (const storeId of config.storeIds) {
    if (!REQUESTED_STORES.has(storeId)) continue;
    const storeName = REQUESTED_STORES.get(storeId) ?? storeId;
    const summary = {
      storeId,
      storeName,
      discountedCount: 0,
      aaaCount: 0,
      error: null,
    };

    try {
      if (shouldSkipStoreForRegion(storeId, config)) {
        summary.error = `${config.region} strict mode skips non-Steam stores`;
        continue;
      }

      const deals = await fetchDeals({ storeId, minDiscount: config.minDiscount });
      summary.discountedCount = deals.length;
      for (const deal of deals) {
        const steamDetails = await getSteamDetailsWithCache(deal.steamAppID, steamCache);
        const regionalDeal = applySteamRegionalPrice(deal, steamDetails, config.region);
        if (config.regionStrict && !regionalDeal) continue;

        const checkedDeal = regionalDeal ?? {
          ...deal,
          region: config.region,
          regionVerified: false,
        };
        if (Number(checkedDeal.savings) < config.minDiscount) continue;

        const classification = classifyAaaGame(deal, steamDetails);
        if (!classification.isAaa) continue;
        summary.aaaCount += 1;

        const item = {
          deal: checkedDeal,
          steamDetails,
          aaaReason: classification.reason,
        };
        historyItems.push(item);
      }
    } catch (error) {
      summary.error = error.message;
      console.warn(`[warn] ${storeName} deals failed: ${error.message}`);
    } finally {
      storeSummaries.push(summary);
    }
  }

  await writeJson(STEAM_CACHE_PATH, steamCache);
  let savedHistory = new Map();
  if (!config.dryRun) {
    savedHistory = recordDealHistories(historyItems);
  }

  const notificationItems = historyItems.filter((item) => {
    if (config.dryRun && config.includeSent) return true;
    if (!sentDealIds.has(item.deal.dealID)) return true;

    const historyKey = `${getGameKey(item.deal)}:${item.deal.storeID}`;
    return savedHistory.get(historyKey) === true;
  });

  const deals = notificationItems
    .sort((a, b) => Number(b.deal.savings) - Number(a.deal.savings))
    .slice(0, config.maxDeals);

  return {
    deals,
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

  const { deals, sentDealIds, usdToKrw } = await collectAaaDeals();
  if (deals.length === 0) {
    await channel.send({
      content: "오늘은 할인정보가 없어요.",
    });
    console.log("[info] No new AAA discounts matched today.");
    return;
  }

  await channel.send({
    content: `오늘의 AAA급 게임 할인 ${deals.length}개를 찾았습니다. (${config.region} 기준, ${config.minDiscount}% 이상 할인)`,
  });

  for (const item of deals) {
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
}

async function main() {
  assertConfig();

  if (config.dryRun) {
    const { deals, storeSummaries, usdToKrw } = await collectAaaDeals();
    printDryRunDeals(deals, usdToKrw, storeSummaries);
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

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
