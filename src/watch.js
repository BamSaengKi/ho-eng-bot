import { AttachmentBuilder } from "discord.js";
import { fetchUsdToKrw } from "./api.js";
import { generateDiscountHistoryChartPng } from "./chart.js";
import { buildDealEmbed } from "./discord.js";
import {
  getDealHistory,
  hasRecentWatchNotification,
  listAllWatchSubscriptions,
  recordDealLookupHistory,
  recordWatchNotification,
} from "./history.js";
import { findCurrentDealFromStoredGame } from "./search.js";

export async function postWatchDeals(client, config) {
  const watches = listAllWatchSubscriptions();
  if (watches.length === 0) {
    console.log("[info] No personal watch subscriptions.");
    return;
  }

  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  let sent = 0;

  for (const watch of watches) {
    try {
      const result = await findCurrentDealFromStoredGame(watch, config);
      if (!result) continue;
      if (Number(result.deal.savings) < Number(config.minDiscount ?? 1)) continue;
      if (hasRecentWatchNotification(watch.userId, result.deal)) continue;

      recordDealLookupHistory({
        deal: result.deal,
        steamDetails: result.steamDetails,
      });

      const history = getDealHistory(result.deal);
      const chart = await generateDiscountHistoryChartPng(history, result.deal.title);
      const files = chart
        ? [new AttachmentBuilder(chart, { name: "discount-history.png" })]
        : [];
      const user = await client.users.fetch(watch.userId);

      await user.send({
        content: `관심 게임 할인 알림: ${result.deal.title}`,
        embeds: [
          buildDealEmbed(result.deal, result.steamDetails, "개인 관심 게임", usdToKrw, {
            hasHistoryChart: Boolean(chart),
            historyCount: history.length,
            history,
            lookupLabel: `${config.region} Steam 개인 관심 게임`,
            footerText: "개인 관심 게임 할인 알림",
          }),
        ],
        files,
      });

      recordWatchNotification(watch.userId, result.deal);
      sent += 1;
    } catch (error) {
      console.warn(`[warn] Watch notification failed for ${watch.userId}/${watch.title}: ${error.message}`);
    }
  }

  console.log(`[info] Posted ${sent} personal watch notifications.`);
}
