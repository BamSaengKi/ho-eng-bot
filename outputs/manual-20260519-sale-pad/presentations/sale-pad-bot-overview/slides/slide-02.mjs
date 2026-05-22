import { bg, C, footer, metric, title } from "./common.mjs";

export async function slide02(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "WHY IT MATTERS", "할인 정보는 많지만, 필요한 알림은 적어야 한다", "지역 제한, 중복 알림, 검색 오타, 할인 이력 부재를 줄이는 쪽에 초점을 맞춘 봇입니다.");
  metric(slide, ctx, "KR", "Steam 한국 가격 기준으로 검증", 64, 318, 250, C.teal);
  metric(slide, ctx, "10%+", "기본 최소 할인율 조건", 340, 318, 250, C.gold);
  metric(slide, ctx, "1주", "동일 할인율 반복 기록 제한", 616, 318, 250, C.coral);
  metric(slide, ctx, "DM", "개인 관심 게임 알림 확장", 892, 318, 250, C.blue);
  ctx.addText(slide, { text: "의의", x: 66, y: 502, w: 110, h: 28, fontSize: 17, bold: true, color: C.tealDark });
  ctx.addText(slide, { text: "단순 가격 크롤러가 아니라, 한국에서 실제 구매 가능한 Steam 가격을 기준으로 사용자가 바로 판단할 수 있는 카드와 과거 할인 맥락을 함께 제공합니다.", x: 66, y: 538, w: 990, h: 58, fontSize: 21, color: C.ink });
  footer(slide, ctx, 2);
  return slide;
}
