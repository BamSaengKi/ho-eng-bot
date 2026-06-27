import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

function truncateLabel(value, maxLength = 80) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function buildAaaFeedbackButton(token, label = "AAA 아님 신고") {
  return new ButtonBuilder()
    .setCustomId(`aaa_feedback:${token}`)
    .setLabel(truncateLabel(label))
    .setStyle(ButtonStyle.Secondary);
}

export function buildAaaFeedbackRow(token) {
  return new ActionRowBuilder().addComponents(buildAaaFeedbackButton(token));
}

export function appendAaaFeedbackButton(row, token) {
  return row.addComponents(buildAaaFeedbackButton(token));
}

export function buildAaaFeedbackReviewButtons(feedbackId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aaa_feedback_approve:${feedbackId}`)
      .setLabel("블랙리스트 추가")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`aaa_feedback_reject:${feedbackId}`)
      .setLabel("거절")
      .setStyle(ButtonStyle.Secondary),
  );
}
