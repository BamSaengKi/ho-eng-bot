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
];

export const commandPayloads = slashCommands.map((command) => command.toJSON());
