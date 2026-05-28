import { SlashCommandBuilder } from "discord.js";

export const slashCommands = [
  new SlashCommandBuilder()
    .setName("deal")
    .setDescription("특정 게임의 현재 최저 할인 정보를 카드로 보여줍니다.")
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("조회할 게임 이름")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("history")
    .setDescription("저장된 특정 게임의 할인 기록을 그래프로 보여줍니다.")
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("조회할 게임 이름")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("alias-add")
    .setDescription("게임 검색 별칭을 추가하거나 수정합니다.")
    .addStringOption((option) =>
      option
        .setName("alias")
        .setDescription("사용자가 입력할 별칭")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("실제로 검색할 게임 이름")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("alias-list")
    .setDescription("등록된 게임 검색 별칭을 보여줍니다."),
  new SlashCommandBuilder()
    .setName("alias-remove")
    .setDescription("게임 검색 별칭을 삭제합니다.")
    .addStringOption((option) =>
      option
        .setName("alias")
        .setDescription("삭제할 별칭")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("watch-add")
    .setDescription("개인 관심 게임을 등록하고 할인 시 채널 알림을 받습니다.")
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("등록할 게임 이름")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("steam")
    .setDescription("공개 Steam 찜목록을 개인 관심 게임에 가져옵니다.")
    .addStringOption((option) =>
      option
        .setName("profile")
        .setDescription("Steam 프로필 URL 또는 커스텀 URL 이름")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("가져올 최대 개수")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("watch-list")
    .setDescription("내 개인 관심 게임 목록을 보여줍니다."),
  new SlashCommandBuilder()
    .setName("watch-remove")
    .setDescription("개인 관심 게임을 삭제합니다.")
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("삭제할 게임 이름")
        .setRequired(true),
    ),
];

export const commandPayloads = slashCommands.map((command) => command.toJSON());
