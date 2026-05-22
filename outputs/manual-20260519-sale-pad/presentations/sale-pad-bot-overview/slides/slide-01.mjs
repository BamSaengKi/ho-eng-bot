import { bg, C, footer, pill } from "./common.mjs";

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx, C.paper);
  ctx.addShape(slide, { x: 0, y: 0, w: 1280, h: 720, fill: C.paper });
  ctx.addShape(slide, { x: 830, y: 0, w: 450, h: 720, fill: C.tealDark });
  ctx.addShape(slide, { x: 906, y: 82, w: 230, h: 230, fill: C.mint, line: ctx.line(C.mint, 1) });
  ctx.addText(slide, { text: "SALE\nPAD", x: 940, y: 128, w: 165, h: 120, fontSize: 42, bold: true, color: C.tealDark, align: "center" });
  ctx.addShape(slide, { x: 900, y: 380, w: 250, h: 52, fill: C.white, line: ctx.line(C.white, 1) });
  ctx.addText(slide, { text: "Discord 할인 알림 봇", x: 924, y: 395, w: 202, h: 25, fontSize: 18, bold: true, color: C.tealDark, align: "center" });
  pill(slide, ctx, "Steam KR", 64, 72, 104, C.teal);
  pill(slide, ctx, "Discord", 184, 72, 104, C.blue);
  pill(slide, ctx, "SQLite", 304, 72, 96, C.coral);
  ctx.addText(slide, { text: "Sale Pad Discord Bot", x: 64, y: 158, w: 690, h: 70, fontSize: 52, bold: true, color: C.ink });
  ctx.addText(slide, { text: "AAA급 할인과 개인 관심 게임을 매일 확인하고, 카드·기록·그래프로 알려주는 게임 할인 알림 시스템", x: 66, y: 252, w: 690, h: 90, fontSize: 25, color: C.muted });
  ctx.addShape(slide, { x: 66, y: 405, w: 570, h: 2, fill: C.faint });
  ctx.addText(slide, { text: "구현 범위", x: 66, y: 432, w: 150, h: 26, fontSize: 16, bold: true, color: C.tealDark });
  ctx.addText(slide, { text: "일일 자동 알림 · 한국 Steam 가격 검증 · slash command 검색 · 별칭 보정 · 할인 히스토리 DB · 그래프 생성 · 개인 DM 구독", x: 66, y: 468, w: 650, h: 70, fontSize: 20, color: C.ink });
  footer(slide, ctx, 1);
  return slide;
}
