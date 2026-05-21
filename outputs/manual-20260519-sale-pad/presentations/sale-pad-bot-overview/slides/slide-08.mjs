import { bg, C, footer, line, node, title } from "./common.mjs";

export async function slide08(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "OPERATIONS", "서버에서는 pull, command 등록, pm2 재시작으로 반영한다", "AWS EC2 무료 플랜에 맞춰 가벼운 Node 프로세스로 운영하고, 외부 호출은 정해진 일일 스케줄 중심으로 제한합니다.");
  node(slide, ctx, "1. GitHub", "작업 브랜치\ncommit / push\nmain merge", 82, 324, 190, 132, C.white, C.teal);
  line(slide, ctx, 286, 388, 58, 3, C.teal);
  node(slide, ctx, "2. EC2", "git pull\nnpm install\n.env 유지", 358, 324, 190, 132, C.white, C.blue);
  line(slide, ctx, 562, 388, 58, 3, C.blue);
  node(slide, ctx, "3. Discord", "npm run register-commands\n새 slash command 반영", 634, 324, 230, 132, C.white, C.coral);
  line(slide, ctx, 878, 388, 58, 3, C.coral);
  node(slide, ctx, "4. PM2", "pm2 restart\npm2 logs\npm2 save", 950, 324, 190, 132, C.white, C.gold);
  ctx.addShape(slide, { x: 82, y: 530, w: 1058, h: 58, fill: C.tealDark });
  ctx.addText(slide, { text: "운영 체크포인트: Message Content Intent, DM 수신 가능 여부, REGION=KR / REGION_STRICT=true, SQLite 파일 백업", x: 108, y: 548, w: 1006, h: 24, fontSize: 19, bold: true, color: C.white, align: "center" });
  footer(slide, ctx, 8);
  return slide;
}
