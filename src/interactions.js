import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { fetchUsdToKrw } from "./api.js";
import { generateDiscountHistoryChartPng } from "./chart.js";
import { buildDealEmbed, buildHistoryEmbed } from "./discord.js";
import {
  findCurrentDealFromGame,
  findCurrentDealFromStoredGame,
  searchCurrentDealCandidates,
} from "./search.js";
import {
  getAlias,
  findStoredGamesByTitle,
  getDealHistory,
  getDealHistoryByGameKey,
  getWatchSubscriptionById,
  listAliases,
  listWatchSubscriptions,
  normalizeAlias,
  recordDealLookupHistory,
  addWatchSubscription,
  removeAlias,
  removeWatchSubscription,
  upsertAlias,
} from "./history.js";
import { fetchItadDealExpiry } from "./itad.js";
import { GAME_ALIASES } from "./query-normalizer.js";

const SELECT_TTL_MS = 10 * 60 * 1000;
const pendingDealSelections = new Map();
const pendingDealShares = new Map();
const pendingWatchSelections = new Map();

function getGameOption(interaction) {
  return interaction.options.getString("game", true).trim();
}

function getAliasOption(interaction) {
  return interaction.options.getString("alias", true).trim();
}

function canManageAliases(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

async function requireAliasPermission(interaction) {
  if (canManageAliases(interaction)) return true;

  await interaction.reply({
    content: "별칭 삭제는 서버 관리 권한이 있는 사용자만 사용할 수 있습니다.",
    ephemeral: true,
  });
  return false;
}

async function replyNoResult(interaction, message) {
  await interaction.editReply({
    content: message,
    embeds: [],
    files: [],
    components: [],
  });
}

function buildMissingGameMessage(query) {
  return [
    `"${query}"와 일치하는 게임 정보를 찾지 못했습니다.`,
    "영문 정식명으로 다시 검색하거나, 자주 쓰는 이름이라면 별칭을 등록해보세요.",
    "",
    `예: /alias-add alias:${query} game:정식 게임명`,
  ].join("\n");
}

function truncate(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function createSelectionId(interaction) {
  return `deal_select:${interaction.id}`;
}

function createWatchSelectionId(interaction) {
  return `watch_select:${interaction.id}`;
}

function createShareId(interaction) {
  return `deal_share:${interaction.id}`;
}

function saveSelection(id, interaction, search, startedAt) {
  pendingDealSelections.set(id, {
    userId: interaction.user.id,
    search,
    startedAt,
    expiresAt: Date.now() + SELECT_TTL_MS,
  });
}

function saveWatchSelection(id, interaction, search) {
  pendingWatchSelections.set(id, {
    userId: interaction.user.id,
    search,
    query: getGameOption(interaction),
    expiresAt: Date.now() + SELECT_TTL_MS,
  });
}

function cleanupSelections() {
  const now = Date.now();
  for (const [id, selection] of pendingDealSelections.entries()) {
    if (selection.expiresAt <= now) pendingDealSelections.delete(id);
  }
  for (const [id, share] of pendingDealShares.entries()) {
    if (share.expiresAt <= now) pendingDealShares.delete(id);
  }
  for (const [id, selection] of pendingWatchSelections.entries()) {
    if (selection.expiresAt <= now) pendingWatchSelections.delete(id);
  }
}

function buildSelectMenu(id, candidates, placeholder = "조회할 게임을 선택해주세요") {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .addOptions(
      candidates.slice(0, 10).map((game, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(game.external, 100))
          .setDescription(truncate(game.steamAppID ? `Steam app ${game.steamAppID}` : "ITAD 검색 결과", 100))
          .setValue(String(index)),
      ),
    );

  return new ActionRowBuilder().addComponents(menu);
}

function formatWatchList(watches) {
  if (watches.length === 0) return "등록된 개인 관심 게임이 없습니다.";

  return [
    "**내 개인 관심 게임**",
    ...watches.map((watch, index) => `${index + 1}. ${watch.title}`),
  ].join("\n");
}

function buildShareButton(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel("공유하고 스레드 만들기")
      .setStyle(ButtonStyle.Primary),
  );
}

function buildShareConfirmButtons(id) {
  const suffix = id.replace("deal_share:", "");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`deal_share_confirm:${suffix}`)
      .setLabel("공유하기")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`deal_share_cancel:${suffix}`)
      .setLabel("취소")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildWatchShareConfirmButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`watch_share_confirm:${id}`)
      .setLabel("공유하기")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`watch_share_cancel:${id}`)
      .setLabel("취소")
      .setStyle(ButtonStyle.Secondary),
  );
}

function formatElapsedSeconds(startedAt) {
  return `${((performance.now() - startedAt) / 1000).toFixed(2)}초`;
}

function getUserDisplayName(interaction) {
  return interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
}

async function renderDealResult(interaction, result, config, startedAt, correction) {
  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  recordDealLookupHistory({
    deal: result.deal,
    steamDetails: result.steamDetails,
  });
  const history = getDealHistory(result.deal);
  const dealExpiry = result.dealExpiry ?? await fetchItadDealExpiry(result.deal, config);
  const chart = await generateDiscountHistoryChartPng(history, result.deal.title);
  const files = chart
    ? [new AttachmentBuilder(chart, { name: "discount-history.png" })]
    : [];
  const shareId = createShareId(interaction);
  pendingDealShares.set(shareId, {
    userId: interaction.user.id,
    deal: result.deal,
    steamDetails: result.steamDetails,
    dealExpiry,
    history,
    hasHistoryChart: Boolean(chart),
    historyCount: history.length,
    expiresAt: Date.now() + SELECT_TTL_MS,
  });

  await interaction.editReply({
    content: "",
    embeds: [
      buildDealEmbed(result.deal, result.steamDetails, "사용자 명령어 조회", usdToKrw, {
        hasHistoryChart: Boolean(chart),
        historyCount: history.length,
        history,
        dealExpiry,
        lookupLabel: correction
          ? `${config.region} ITAD 현재 할인 정보\n검색어 보정: ${correction.originalQuery} → ${correction.searchQuery}`
          : `${config.region} ITAD 현재 할인 정보`,
        footerText: `검색 소요 시간: ${formatElapsedSeconds(startedAt)}`,
      }),
    ],
    files,
    components: [buildShareButton(shareId)],
  });
}

export async function handleDealCommand(interaction, config) {
  const query = getGameOption(interaction);
  const startedAt = performance.now();
  await interaction.deferReply({ ephemeral: true });

  const search = await searchCurrentDealCandidates(query, 10, config);
  if (search.candidates.length === 0) {
    await replyNoResult(interaction, buildMissingGameMessage(query));
    return;
  }

  if (search.candidates.length > 1) {
    cleanupSelections();
    const selectionId = createSelectionId(interaction);
    saveSelection(selectionId, interaction, search, startedAt);
    const correctionText = search.queryCorrection
      ? `\n검색어 보정: ${search.originalQuery} → ${search.searchQuery}`
      : "";

    await interaction.editReply({
      content: `"${search.searchQuery}" 검색 결과가 여러 개입니다. 조회할 게임을 선택해주세요.${correctionText}`,
      components: [buildSelectMenu(selectionId, search.candidates)],
    });
    return;
  }

  const result = await findCurrentDealFromGame(search.candidates[0], config);
  if (!result) {
    await replyNoResult(interaction, `"${search.candidates[0].external}"의 ${config.region} 현재 할인 정보를 찾지 못했습니다.`);
    return;
  }

  await renderDealResult(interaction, result, config, startedAt, search.queryCorrection
    ? {
      originalQuery: search.originalQuery,
      searchQuery: search.searchQuery,
    }
    : null);
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

export async function handleAliasAddCommand(interaction) {
  const alias = getAliasOption(interaction);
  const game = getGameOption(interaction);
  const saved = upsertAlias(alias, game, interaction.user.id);

  await interaction.reply({
    content: `기본 별칭에 추가했습니다.\n\`${saved.alias}\` → \`${saved.game}\``,
    ephemeral: true,
  });
}

export async function handleAliasListCommand(interaction) {
  const userAliases = listAliases(30);
  const customAliasKeys = new Set(userAliases.map((alias) => alias.alias));
  const defaultAliases = [...GAME_ALIASES.entries()]
    .filter(([alias]) => !customAliasKeys.has(alias))
    .map(([alias, game]) => ({ alias, game }));
  const aliases = [...userAliases, ...defaultAliases].slice(0, 80);

  await interaction.reply({
    content: [
    "**기본 별칭**",
      ...aliases.map((alias) => `\`${alias.alias}\` → \`${alias.game}\``),
    ].join("\n"),
    ephemeral: true,
  });
}

export async function handleAliasRemoveCommand(interaction) {
  if (!(await requireAliasPermission(interaction))) return;

  const alias = getAliasOption(interaction);
  const existing = getAlias(alias);
  if (!existing) {
    await interaction.reply({
      content: `\`${normalizeAlias(alias)}\` 별칭을 찾지 못했습니다.`,
      ephemeral: true,
    });
    return;
  }

  removeAlias(alias);
  await interaction.reply({
    content: `기본 별칭에서 삭제했습니다.\n\`${existing.alias}\` → \`${existing.game}\``,
    ephemeral: true,
  });
}

export async function handleWatchAddCommand(interaction) {
  const query = getGameOption(interaction);
  await interaction.deferReply({ ephemeral: true });

  const search = await searchCurrentDealCandidates(query, 10, config);
  if (search.candidates.length === 0) {
    await replyNoResult(interaction, buildMissingGameMessage(query));
    return;
  }

  if (search.candidates.length > 1) {
    cleanupSelections();
    const selectionId = createWatchSelectionId(interaction);
    saveWatchSelection(selectionId, interaction, search);
    const correctionText = search.queryCorrection
      ? `\n검색어 보정: ${search.originalQuery} → ${search.searchQuery}`
      : "";

    await interaction.editReply({
      content: `"${search.searchQuery}" 검색 결과가 여러 개입니다. 관심 게임으로 등록할 항목을 선택해주세요.${correctionText}`,
      components: [buildSelectMenu(selectionId, search.candidates, "등록할 게임을 선택해주세요")],
    });
    return;
  }

  const saved = addWatchSubscription(interaction.user.id, search.candidates[0], query);
  await interaction.editReply({
    content: [
      `개인 관심 게임에 등록했습니다: **${saved.title}**`,
      "매일 자동 조회에서 할인 조건에 맞으면 공지 채널에 알려드립니다.",
    ].join("\n"),
    components: [],
  });
}

export async function handleWatchListCommand(interaction) {
  const watches = listWatchSubscriptions(interaction.user.id);
  await interaction.reply({
    content: formatWatchList(watches),
    ephemeral: true,
  });
}

export async function handleWatchRemoveCommand(interaction) {
  const query = getGameOption(interaction);
  const removed = removeWatchSubscription(interaction.user.id, query);

  await interaction.reply({
    content: removed
      ? `개인 관심 게임에서 삭제했습니다: **${removed.title}**`
      : `"${query}"와 일치하는 개인 관심 게임을 찾지 못했습니다.`,
    ephemeral: true,
  });
}

export async function handleInteraction(interaction, config) {
  try {
    if (interaction.isButton() && interaction.customId.startsWith("watch_share_confirm:")) {
      await handleWatchShareConfirm(interaction, config);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("watch_share_cancel:")) {
      await handleWatchShareCancel(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("watch_share:")) {
      await handleWatchShare(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("deal_share_confirm:")) {
      await handleDealShareConfirm(interaction, config);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("deal_share_cancel:")) {
      await handleDealShareCancel(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("deal_share:")) {
      await handleDealShare(interaction, config);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("deal_select:")) {
      await handleDealSelection(interaction, config);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("watch_select:")) {
      await handleWatchSelection(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "deal") {
      await handleDealCommand(interaction, config);
      return;
    }

    if (interaction.commandName === "history") {
      await handleHistoryCommand(interaction, config);
      return;
    }

    if (interaction.commandName === "alias-add") {
      await handleAliasAddCommand(interaction);
      return;
    }

    if (interaction.commandName === "alias-list") {
      await handleAliasListCommand(interaction);
      return;
    }

    if (interaction.commandName === "alias-remove") {
      await handleAliasRemoveCommand(interaction);
      return;
    }

    if (interaction.commandName === "watch-add") {
      await handleWatchAddCommand(interaction);
      return;
    }

    if (interaction.commandName === "watch-list") {
      await handleWatchListCommand(interaction);
      return;
    }

    if (interaction.commandName === "watch-remove") {
      await handleWatchRemoveCommand(interaction);
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

async function handleDealShare(interaction, config) {
  cleanupSelections();
  const share = pendingDealShares.get(interaction.customId);
  if (!share || share.expiresAt <= Date.now()) {
    pendingDealShares.delete(interaction.customId);
    await interaction.reply({
      content: "공유 가능 시간이 만료되었습니다. `/deal` 명령어로 다시 검색해주세요.",
      ephemeral: true,
    });
    return;
  }

  if (share.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 공유 버튼은 명령어를 실행한 사용자만 사용할 수 있습니다.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `"${share.deal.title}" 할인 정보를 이 채널에 공개로 공유하고 스레드를 만들까요?`,
    components: [buildShareConfirmButtons(interaction.customId)],
    ephemeral: true,
  });
}

async function handleDealShareCancel(interaction) {
  const shareId = interaction.customId.replace("deal_share_cancel:", "deal_share:");
  const share = pendingDealShares.get(shareId);
  if (share && share.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 공유 확인은 명령어를 실행한 사용자만 사용할 수 있습니다.",
      ephemeral: true,
    });
    return;
  }

  await interaction.update({
    content: "공유를 취소했습니다.",
    components: [],
  });
}

async function handleDealShareConfirm(interaction, config) {
  cleanupSelections();
  const shareId = interaction.customId.replace("deal_share_confirm:", "deal_share:");
  const share = pendingDealShares.get(shareId);
  if (!share || share.expiresAt <= Date.now()) {
    pendingDealShares.delete(shareId);
    await interaction.update({
      content: "공유 가능 시간이 만료되었습니다. `/deal` 명령어로 다시 검색해주세요.",
      components: [],
    });
    return;
  }

  if (share.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 공유 확인은 명령어를 실행한 사용자만 사용할 수 있습니다.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.channel?.isTextBased()) {
    await interaction.update({
      content: "이 채널에서는 공유 메시지를 만들 수 없습니다.",
      components: [],
    });
    return;
  }

  await interaction.update({
    content: "공유 중입니다...",
    components: [],
  });

  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  const dealExpiry = share.dealExpiry ?? await fetchItadDealExpiry(share.deal, config);
  const chart = await generateDiscountHistoryChartPng(share.history, share.deal.title);
  const files = chart
    ? [new AttachmentBuilder(chart, { name: "discount-history.png" })]
    : [];
  const message = await interaction.channel.send({
    content: `<@${interaction.user.id}>님이 공유한 할인 정보입니다.`,
    embeds: [
      buildDealEmbed(share.deal, share.steamDetails, "공유된 사용자 조회", usdToKrw, {
        hasHistoryChart: Boolean(chart),
        historyCount: share.historyCount,
        history: share.history,
        dealExpiry,
        lookupLabel: `${config.region} ITAD 현재 할인 정보`,
        footerText: "공유된 할인 정보",
      }),
    ],
    files,
  });

  try {
    await message.startThread({
      name: truncate(`${share.deal.title} 할인 정보`, 100),
      reason: "Deal share thread",
    });
  } catch (error) {
    console.warn(`[warn] Failed to create deal share thread: ${error.message}`);
    await interaction.editReply("할인 정보는 공유했지만 스레드 생성은 실패했습니다.");
    return;
  }

  pendingDealShares.delete(shareId);
  await interaction.editReply("할인 정보를 채널에 공유하고 스레드를 만들었습니다.");
}

async function handleWatchShare(interaction) {
  const watchId = interaction.customId.replace("watch_share:", "");
  const watch = getWatchSubscriptionById(watchId);
  if (!watch) {
    await interaction.reply({
      content: "관심 게임 등록 정보를 찾지 못했습니다. `/watch-add`로 다시 등록해주세요.",
    });
    return;
  }

  if (watch.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 공유 버튼은 관심 게임을 등록한 사용자만 사용할 수 있습니다.",
    });
    return;
  }

  await interaction.reply({
    content: `"${watch.title}" 할인 정보를 공지 채널에 공개로 공유하고 스레드를 만들까요?`,
    components: [buildWatchShareConfirmButtons(watchId)],
  });
}

async function handleWatchShareCancel(interaction) {
  const watchId = interaction.customId.replace("watch_share_cancel:", "");
  const watch = getWatchSubscriptionById(watchId);
  if (watch && watch.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 공유 확인은 관심 게임을 등록한 사용자만 사용할 수 있습니다.",
    });
    return;
  }

  await interaction.update({
    content: "공유를 취소했습니다.",
    components: [],
  });
}

async function handleWatchShareConfirm(interaction, config) {
  const watchId = interaction.customId.replace("watch_share_confirm:", "");
  const watch = getWatchSubscriptionById(watchId);
  if (!watch) {
    await interaction.update({
      content: "관심 게임 등록 정보를 찾지 못했습니다. `/watch-add`로 다시 등록해주세요.",
      components: [],
    });
    return;
  }

  if (watch.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 공유 확인은 관심 게임을 등록한 사용자만 사용할 수 있습니다.",
    });
    return;
  }

  await interaction.update({
    content: "공유 중입니다...",
    components: [],
  });

  const result = await findCurrentDealFromStoredGame(watch, config);
  if (!result || Number(result.deal.savings) < Number(config.minDiscount ?? 1)) {
    await interaction.editReply("현재 공유할 수 있는 할인 정보를 찾지 못했습니다.");
    return;
  }

  const channel = await interaction.client.channels.fetch(config.channelId);
  if (!channel?.isTextBased()) {
    await interaction.editReply("공유할 공지 채널을 찾지 못했습니다.");
    return;
  }

  const usdToKrw = await fetchUsdToKrw(config.fallbackUsdToKrw);
  recordDealLookupHistory({
    deal: result.deal,
    steamDetails: result.steamDetails,
  });
  const history = getDealHistory(result.deal);
  const dealExpiry = result.dealExpiry ?? await fetchItadDealExpiry(result.deal, config);
  const chart = await generateDiscountHistoryChartPng(history, result.deal.title);
  const files = chart
    ? [new AttachmentBuilder(chart, { name: "discount-history.png" })]
    : [];
  const displayName = getUserDisplayName(interaction);
  const message = await channel.send({
    content: `<@${interaction.user.id}>님이 관심 게임 할인 정보를 공유했습니다.`,
    embeds: [
      buildDealEmbed(result.deal, result.steamDetails, "개인 관심 게임 공유", usdToKrw, {
        hasHistoryChart: Boolean(chart),
        historyCount: history.length,
        history,
        dealExpiry,
        lookupLabel: `${config.region} 개인 관심 게임\n${displayName}님이 관심 게임으로 등록한 할인 정보입니다.`,
        footerText: "공유된 관심 게임 할인 정보",
      }),
    ],
    files,
  });

  try {
    await message.startThread({
      name: truncate(`${result.deal.title} 할인 정보`, 100),
      reason: "Watch deal share thread",
    });
  } catch (error) {
    console.warn(`[warn] Failed to create watch share thread: ${error.message}`);
    await interaction.editReply("할인 정보는 공유했지만 스레드 생성은 실패했습니다.");
    return;
  }

  await interaction.editReply("할인 정보를 공지 채널에 공유하고 스레드를 만들었습니다.");
}

async function handleDealSelection(interaction, config) {
  const selection = pendingDealSelections.get(interaction.customId);
  if (!selection || selection.expiresAt <= Date.now()) {
    pendingDealSelections.delete(interaction.customId);
    await interaction.update({
      content: "선택 시간이 만료되었습니다. `/deal` 명령어로 다시 검색해주세요.",
      embeds: [],
      files: [],
      components: [],
    });
    return;
  }

  if (selection.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 선택 메뉴는 명령어를 실행한 사용자만 사용할 수 있습니다.",
      ephemeral: true,
    });
    return;
  }

  const index = Number(interaction.values[0]);
  const game = selection.search.candidates[index];
  if (!game) {
    await interaction.update({
      content: "선택한 검색 결과를 찾지 못했습니다. `/deal` 명령어로 다시 검색해주세요.",
      embeds: [],
      files: [],
      components: [],
    });
    return;
  }

  await interaction.deferUpdate();
  pendingDealSelections.delete(interaction.customId);

  const result = await findCurrentDealFromGame(game, config);
  if (!result) {
    await interaction.editReply({
      content: `"${game.external}"의 ${config.region} 현재 할인 정보를 찾지 못했습니다.`,
      embeds: [],
      files: [],
      components: [],
    });
    return;
  }

  await renderDealResult(interaction, result, config, selection.startedAt, selection.search.queryCorrection
    ? {
      originalQuery: selection.search.originalQuery,
      searchQuery: selection.search.searchQuery,
    }
    : null);
}

async function handleWatchSelection(interaction) {
  const selection = pendingWatchSelections.get(interaction.customId);
  if (!selection || selection.expiresAt <= Date.now()) {
    pendingWatchSelections.delete(interaction.customId);
    await interaction.update({
      content: "선택 시간이 만료되었습니다. `/watch-add` 명령어로 다시 등록해주세요.",
      embeds: [],
      files: [],
      components: [],
    });
    return;
  }

  if (selection.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 선택 메뉴는 명령어를 실행한 사용자만 사용할 수 있습니다.",
      ephemeral: true,
    });
    return;
  }

  const index = Number(interaction.values[0]);
  const game = selection.search.candidates[index];
  if (!game) {
    await interaction.update({
      content: "선택한 검색 결과를 찾지 못했습니다. `/watch-add` 명령어로 다시 등록해주세요.",
      embeds: [],
      files: [],
      components: [],
    });
    return;
  }

  const saved = addWatchSubscription(interaction.user.id, game, selection.query);
  pendingWatchSelections.delete(interaction.customId);

  await interaction.update({
    content: [
      `개인 관심 게임에 등록했습니다: **${saved.title}**`,
      "매일 자동 조회에서 할인 조건에 맞으면 공지 채널에 알려드립니다.",
    ].join("\n"),
    embeds: [],
    files: [],
    components: [],
  });
}
