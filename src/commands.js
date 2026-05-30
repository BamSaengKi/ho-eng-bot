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
    .setName("help")
    .setDescription("봇 사용법을 본인만 볼 수 있게 보여줍니다."),
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
        .setDescription("삭제할 게임 이름. 비워두면 선택 메뉴가 뜹니다.")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("watch-clear")
    .setDescription("내 개인 관심 게임 목록을 모두 삭제합니다."),
  new SlashCommandBuilder()
    .setName("watch-refresh")
    .setDescription("마지막으로 가져온 Steam 찜목록으로 watch-list를 다시 갱신합니다.")
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("가져올 최대 개수")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("watch-store")
    .setDescription("개인 관심 게임 알림을 받을 스토어를 설정합니다.")
    .addStringOption((option) =>
      option
        .setName("stores")
        .setDescription("all 또는 steam,epic,humble,ubisoft,blizzard")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("watch-cleanup")
    .setDescription("내 개인 관심 게임의 중복/오래된 항목을 정리합니다."),
  new SlashCommandBuilder()
    .setName("watch-setting")
    .setDescription("개인 관심 게임 알림 설정을 변경합니다.")
    .addIntegerOption((option) =>
      option
        .setName("min_discount")
        .setDescription("관심 게임 알림을 받을 최소 할인율")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("봇 운영 상태를 확인합니다. 관리자 전용입니다."),
  new SlashCommandBuilder()
    .setName("watch-report")
    .setDescription("관심 게임 알림 스킵 사유를 확인합니다. 관리자 전용입니다."),
];

export const commandPayloads = slashCommands.map((command) => command.toJSON());
