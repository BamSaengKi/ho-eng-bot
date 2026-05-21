import { bg, C, footer, line, node, title } from "./common.mjs";

export async function slide06(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "DATA MODEL", "기록은 알림 품질을 높이는 기억 장치다", "같은 할인 반복을 줄이고, 다음 카드에서 과거 할인 맥락을 보여주기 위해 SQLite에 필요한 상태를 보관합니다.");
  node(slide, ctx, "games", "game_key\ntitle\nsteam_app_id\ngame_id", 88, 304, 196, 168, C.white, C.teal);
  node(slide, ctx, "deal_history", "checked_at\nsale_price\nnormal_price\nsavings_percent\nprice_currency", 352, 270, 240, 224, C.white, C.coral);
  node(slide, ctx, "aliases", "alias\ngame\ncreated_by", 660, 304, 196, 168, C.white, C.gold);
  node(slide, ctx, "watchlist", "user_id\ngame_key\nquery\ntitle", 924, 252, 214, 134, C.white, C.blue);
  node(slide, ctx, "watch_notifications", "user_id\ngame_key\nsale_price\nsavings_percent\nnotified_at", 924, 422, 214, 150, C.white, C.tealDark);
  line(slide, ctx, 288, 384, 58, 3, C.teal);
  line(slide, ctx, 596, 384, 58, 3, C.coral);
  line(slide, ctx, 860, 348, 58, 3, C.blue);
  line(slide, ctx, 860, 500, 58, 3, C.tealDark);
  ctx.addText(slide, { text: "중복 제어", x: 86, y: 554, w: 170, h: 28, fontSize: 17, bold: true, color: C.tealDark });
  ctx.addText(slide, { text: "deal 조회 기록은 동일 할인율 주 1회 제한, 개인 DM은 사용자·게임·스토어·할인율·가격 기준 주 1회 제한", x: 86, y: 586, w: 960, h: 32, fontSize: 18, color: C.ink });
  footer(slide, ctx, 6);
  return slide;
}
