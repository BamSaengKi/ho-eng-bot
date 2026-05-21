import { bg, C, footer, node, title } from "./common.mjs";

export async function slide05(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx, "#f7f1e8");
  title(slide, ctx, "TECH STACK", "작게 유지하되, 필요한 곳은 검증 가능한 도구를 쓴다", "API 조회, Discord 상호작용, SQLite 기록, sharp 그래프 생성으로 구성된 Node.js 기반 봇입니다.");
  node(slide, ctx, "Runtime", "Node.js ESM\nnode-cron\npm2 운영", 80, 304, 210, 138, C.white, C.teal);
  node(slide, ctx, "Discord", "discord.js v14\nslash command\nembed, button, select menu, DM", 322, 304, 250, 138, C.white, C.blue);
  node(slide, ctx, "Data/API", "CheapShark deals/search\nSteam appdetails cc=KR\n환율 fallback", 604, 304, 250, 138, C.white, C.coral);
  node(slide, ctx, "Storage", "node:sqlite\n할인 기록\n별칭\n개인 관심 게임", 886, 304, 250, 138, C.white, C.gold);
  ctx.addShape(slide, { x: 80, y: 500, w: 1056, h: 64, fill: C.tealDark });
  ctx.addText(slide, { text: "그래프 생성은 AI 토큰 없이 sharp 기반 SVG→PNG 렌더링으로 처리", x: 104, y: 518, w: 1008, h: 28, fontSize: 22, bold: true, color: C.white, align: "center" });
  footer(slide, ctx, 5);
  return slide;
}
