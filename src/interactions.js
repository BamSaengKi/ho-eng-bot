import { AttachmentBuilder } from "discord.js";
import { fetchUsdToKrw } from "./api.js";
import { generateDiscountHistoryChartPng } from "./chart.js";
import { buildDealEmbed, buildHistoryEmbed } from "./discord.js";
import { findBestCurrentDeal } from "./search.js";
import { findStoredGamesByTitle, getDealHistory, getDealHistoryByGameKey } from "./history.js";

function getGameOption(interaction) {
  return interaction.options.getString("game", true).trim();
}

async function replyNoResult(interaction, message) {
  await interaction.editReply({
    content: message,
    embeds: [],
    files: [],
  });
}

export async function handleDealCommand(interaction, config) {
  const query = getGameOption(interaction);
  await interaction.deferReply();

  const result = await findBestCurrentDeal(query);
  if (!result) {
    await replyNoResult(interaction, `"${query}"의 현재 할인 정보를 찾지 못했습니다.`);
    return;
  }

  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  const history = getDealHistory(result.deal);
  const chart = await generateDiscountHistoryChartPng(history, result.deal.title);
  const files = chart
    ? [new AttachmentBuilder(chart, { name: "discount-history.png" })]
    : [];

  await interaction.editReply({
    embeds: [
      buildDealEmbed(result.deal, result.steamDetails, "사용자 명령어 조회", usdToKrw, {
        hasHistoryChart: Boolean(chart),
        historyCount: history.length,
      }),
    ],
    files,
  });
}

export async function handleHistoryCommand(interaction, config) {
  const query = getGameOption(interaction);
  await interaction.deferReply();

  const [game] = findStoredGamesByTitle(query, 1);
  if (!game) {
    await replyNoResult(interaction, `"${query}"의 저장된 할인 기록이 없습니다.`);
    return;
  }

  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  const history = getDealHistoryByGameKey(game.gameKey);
  const chart = await generateDiscountHistoryChartPng(history, game.title);
  const files = chart
    ? [new AttachmentBuilder(chart, { name: "discount-history.png" })]
    : [];

  await interaction.editReply({
    embeds: [
      buildHistoryEmbed(game, history, {
        hasHistoryChart: Boolean(chart),
        usdToKrw,
      }),
    ],
    files,
  });
}

export async function handleInteraction(interaction, config) {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "deal") {
      await handleDealCommand(interaction, config);
      return;
    }

    if (interaction.commandName === "history") {
      await handleHistoryCommand(interaction, config);
    }
  } catch (error) {
    console.error(`[error] /${interaction.commandName} failed:`, error);
    const payload = {
      content: "명령어 처리 중 오류가 발생했습니다.",
      embeds: [],
      files: [],
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}
