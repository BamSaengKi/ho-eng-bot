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

function formatCurrency(value, currency) {
  return new Intl.NumberFormat(currency === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(Number(value));
}

function formatKrw(usdPrice, usdToKrw) {
  return krwFormatter.format(Math.round(Number(usdPrice) * usdToKrw));
}

function formatDealPrice(value, deal, usdToKrw) {
  if (deal.priceCurrency && deal.priceCurrency !== "USD") {
    return formatCurrency(value, deal.priceCurrency);
  }

  return `${formatKrw(value, usdToKrw)} (${usdFormatter.format(Number(value))})`;
}

function formatHistoryPrice(value, currency, usdToKrw) {
  if (currency && currency !== "USD") return formatCurrency(value, currency);
  return `${formatKrw(value, usdToKrw)} (${usdFormatter.format(Number(value))})`;
}

function formatHistoryDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatRelatedDeals(deals, usdToKrw) {
  return deals.slice(0, 5).map((deal) => {
    const discount = Math.round(Number(deal.savings));
    return [
      `**${deal.title}**`,
      `${deal.storeName ?? `Store ${deal.storeID}`}`,
      `${discount}%`,
      formatDealPrice(deal.salePrice, deal, usdToKrw),
    ].join(" · ");
  }).join("\n");
}

function formatSingleHistory(history, usdToKrw) {
  const [record] = history ?? [];
  if (!record) return "이전 할인 정보가 없습니다.";

  return [
    `${formatHistoryDate(record.checkedAt)}`,
    `${Math.round(Number(record.savingsPercent))}%`,
    `${formatHistoryPrice(record.salePriceUsd, record.priceCurrency, usdToKrw)}`,
  ].join(" · ");
}

export function buildDealEmbed(deal, steamDetails, aaaReason, usdToKrw, options = {}) {
  const discount = Math.round(Number(deal.savings));
  const dealUrl = deal.storeUrl ? new URL(deal.storeUrl) : new URL(CHEAPSHARK_REDIRECT);
  if (!deal.storeUrl) dealUrl.searchParams.set("dealID", deal.dealID);
  const storeName = deal.storeName ?? REQUESTED_STORES.get(String(deal.storeID)) ?? `Store ${deal.storeID}`;
  const developers = steamDetails?.developers?.join(", ") || "정보 없음";
  const publishers = steamDetails?.publishers?.join(", ") || "정보 없음";
  const description = options.expiryReminder
    ? `${storeName} 할인이 오늘 종료될 예정입니다.`
    : `${storeName}에서 ${discount}% 할인 중입니다.`;
  const embed = new EmbedBuilder()
    .setColor(0x0f8f7f)
    .setTitle(deal.title)
    .setURL(dealUrl.toString())
    .setDescription(description)
    .setThumbnail(deal.thumb || null)
    .addFields(
      {
        name: "할인가",
        value: formatDealPrice(deal.salePrice, deal, usdToKrw),
        inline: true,
      },
      {
        name: "정가",
        value: formatDealPrice(deal.normalPrice, deal, usdToKrw),
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
        name: options.lookupLabel ? "조회 기준" : "AAA 판별",
        value: options.lookupLabel ?? aaaReason,
        inline: false,
      },
      {
        name: "지역 기준",
        value: deal.regionVerified
          ? `${deal.region ?? "KR"} ${storeName} 가격 확인됨`
          : `${deal.region ?? "KR"} 구매 가능 여부 미검증`,
        inline: false,
      },
      {
        name: "할인 종료",
        value: options.dealExpiry?.formatted ?? "확인 불가 · 스토어에서 직접 확인",
        inline: false,
      },
    )
    .setFooter({ text: options.footerText ?? "Sale Pad AAA 할인 알림" })
    .setTimestamp(new Date());

  embed.addFields({
    name: "할인 기록",
    value: options.hasHistoryChart ? `${options.historyCount}개 기록 저장됨 · 날짜별 그래프 첨부` : formatSingleHistory(options.history, usdToKrw),
    inline: false,
  });

  if (options.relatedEditions?.length > 0) {
    embed.addFields({
      name: "에디션 할인",
      value: formatRelatedDeals(options.relatedEditions, usdToKrw).slice(0, 1024),
      inline: false,
    });
  }

  if (options.hasHistoryChart) {
    embed.setImage(`attachment://${options.historyImageName ?? "discount-history.png"}`);
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
        value: formatHistoryPrice(latest.salePriceUsd, latest.priceCurrency, options.usdToKrw),
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
    value: options.hasHistoryChart ? "할인 기록 그래프 첨부" : formatSingleHistory(history, options.usdToKrw),
    inline: false,
  });

  if (options.hasHistoryChart) {
    embed.setImage("attachment://discount-history.png");
  }

  return embed;
}
