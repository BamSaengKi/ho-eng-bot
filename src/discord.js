import { EmbedBuilder } from "discord.js";
import { REQUESTED_STORES } from "./config.js";
import { getSteamReviewSummary } from "./classifier.js";

const CHEAPSHARK_REDIRECT = "https://www.cheapshark.com/redirect";

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatKrw(usdPrice, usdToKrw) {
  return krwFormatter.format(Math.round(Number(usdPrice) * usdToKrw));
}

export function buildDealEmbed(deal, steamDetails, aaaReason, usdToKrw, options = {}) {
  const discount = Math.round(Number(deal.savings));
  const dealUrl = new URL(CHEAPSHARK_REDIRECT);
  dealUrl.searchParams.set("dealID", deal.dealID);
  const storeName = REQUESTED_STORES.get(String(deal.storeID)) ?? `Store ${deal.storeID}`;
  const developers = steamDetails?.developers?.join(", ") || "정보 없음";
  const publishers = steamDetails?.publishers?.join(", ") || "정보 없음";
  const embed = new EmbedBuilder()
    .setColor(0x0f8f7f)
    .setTitle(deal.title)
    .setURL(dealUrl.toString())
    .setDescription(`${storeName}에서 ${discount}% 할인 중입니다.`)
    .setThumbnail(deal.thumb || null)
    .addFields(
      {
        name: "할인가",
        value: `${formatKrw(deal.salePrice, usdToKrw)} (${usdFormatter.format(Number(deal.salePrice))})`,
        inline: true,
      },
      {
        name: "정가",
        value: `${formatKrw(deal.normalPrice, usdToKrw)} (${usdFormatter.format(Number(deal.normalPrice))})`,
        inline: true,
      },
      {
        name: "Steam 리뷰",
        value: getSteamReviewSummary(deal),
        inline: true,
      },
      {
        name: "개발사",
        value: developers.slice(0, 1024),
        inline: true,
      },
      {
        name: "퍼블리셔",
        value: publishers.slice(0, 1024),
        inline: true,
      },
      {
        name: "AAA 판별",
        value: aaaReason,
        inline: false,
      },
    )
    .setFooter({ text: "Sale Pad AAA 할인 알림" })
    .setTimestamp(new Date());

  embed.addFields({
    name: "할인 기록",
    value: options.hasHistoryChart
      ? `${options.historyCount}개 기록 저장됨 · 그래프 첨부`
      : "이전 할인 정보가 없습니다.",
    inline: false,
  });

  if (options.hasHistoryChart) {
    embed.setImage("attachment://discount-history.png");
  }

  return embed;
}

export function buildHistoryEmbed(game, history, options = {}) {
  const latest = history.at(-1);
  const embed = new EmbedBuilder()
    .setColor(0x0f8f7f)
    .setTitle(`${game.title} 할인 기록`)
    .setDescription(latest ? `최근 저장된 할인 기록 ${history.length}개입니다.` : "저장된 할인 기록이 없습니다.")
    .setFooter({ text: "Sale Pad 할인 기록" })
    .setTimestamp(new Date());

  if (latest) {
    embed.addFields(
      {
        name: "최근 할인가",
        value: `${formatKrw(latest.salePriceUsd, options.usdToKrw)} (${usdFormatter.format(Number(latest.salePriceUsd))})`,
        inline: true,
      },
      {
        name: "최근 할인율",
        value: `${Math.round(Number(latest.savingsPercent))}%`,
        inline: true,
      },
      {
        name: "최근 스토어",
        value: latest.storeName || "정보 없음",
        inline: true,
      },
    );
  }

  embed.addFields({
    name: "그래프",
    value: options.hasHistoryChart ? "할인 기록 그래프 첨부" : "이전 할인 정보가 없습니다.",
    inline: false,
  });

  if (options.hasHistoryChart) {
    embed.setImage("attachment://discount-history.png");
  }

  return embed;
}
