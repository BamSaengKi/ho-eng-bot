import { bg, C, footer, line, node, smallLabel, title } from "./common.mjs";

export async function slide04(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "SYSTEM FLOW", "매일 오전 10시, 두 갈래의 알림 흐름이 돈다", "공개 채널 알림과 개인 관심 게임 DM은 조회 조건은 다르지만, 저장·카드·그래프 생성 체계를 공유합니다.");
  const y = 348;
  node(slide, ctx, "1. Cron", "node-cron\nAsia/Seoul\n기본 10:00", 64, y, 150, 126, C.white, C.teal);
  line(slide, ctx, 220, y + 62, 46);
  node(slide, ctx, "2A. AAA 채널", "CheapShark 할인\nSteam KR 검증\nAAA 판별", 272, y - 70, 210, 126, C.white, C.blue);
  node(slide, ctx, "2B. 개인 관심", "watchlist 조회\n게임별 현재 할인\n중복 DM 제한", 272, y + 86, 210, 126, C.white, C.coral);
  line(slide, ctx, 488, y - 8, 56);
  line(slide, ctx, 488, y + 148, 56);
  node(slide, ctx, "3. DB 기록", "deal_history\nwatch_notifications\naliases", 560, y + 10, 190, 126, C.white, C.gold);
  line(slide, ctx, 756, y + 72, 54);
  node(slide, ctx, "4. 카드 생성", "Discord embed\n할인 기록 텍스트\n그래프 PNG", 826, y + 10, 190, 126, C.white, C.tealDark);
  line(slide, ctx, 1022, y + 72, 54);
  node(slide, ctx, "5. 전송", "채널 메시지\n또는 개인 DM", 1090, y + 10, 126, 126, C.white, C.slate);
  smallLabel(slide, ctx, "공개 자동 알림", 286, y - 92, 160, C.blue);
  smallLabel(slide, ctx, "개인 구독 알림", 286, y + 212, 160, C.coral);
  footer(slide, ctx, 4);
  return slide;
}
