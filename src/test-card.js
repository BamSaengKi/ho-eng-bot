import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { buildDealEmbed } from "./discord.js";

const token = process.env.DISCORD_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;

if (!token || !channelId) {
  throw new Error("DISCORD_TOKEN and DISCORD_CHANNEL_ID are required in .env");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async () => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      throw new Error("DISCORD_CHANNEL_ID is not a text channel the bot can access.");
    }

    const embed = buildDealEmbed(
      {
        title: "테스트 카드: AAA 할인 알림",
        dealID: "test-card",
        storeID: "1",
        salePrice: "39.99",
        normalPrice: "59.99",
        savings: "33.34",
        steamRatingPercent: "95",
        steamRatingCount: "10000",
        thumb: null,
      },
      {
        developers: ["FromSoftware"],
        publishers: ["Bandai Namco"],
      },
      "테스트용 샘플 카드",
      Number(process.env.USD_TO_KRW_FALLBACK || 1370),
      {
        hasHistoryChart: false,
        historyCount: 1,
        history: [
          {
            checkedAt: new Date().toISOString(),
            salePriceUsd: 39.99,
            priceCurrency: "USD",
            savingsPercent: 33.34,
          },
        ],
        footerText: "오늘의 할인 정보",
      },
    );

    await channel.send({
      content: "테스트 카드 전송입니다. 할인 기록 문구 확인용입니다.",
      embeds: [embed],
    });
    console.log("[info] Test card sent.");
  } catch (error) {
    console.error("[error] Test card failed:", error.message);
    if (error.code === 10003) {
      console.error("[hint] Discord returned Unknown Channel. Check DISCORD_CHANNEL_ID and bot channel permissions.");
    }
    process.exitCode = 1;
  } finally {
    await client.destroy();
  }
});

await client.login(token);
