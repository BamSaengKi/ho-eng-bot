import { bg, C, footer, title } from "./common.mjs";

export async function slide07(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx, "#f8faf7");
  title(slide, ctx, "HOW TO USE", "사용자는 명령어 몇 개만 기억하면 된다", "검색은 본인만 보고, 필요할 때 공유한다. 관심 게임은 DM으로 조용히 받는다.");
  const rows = [
    ["/deal game:엘든링", "현재 할인 카드 검색. 여러 결과는 선택 메뉴로 고름."],
    ["/history game:Elden Ring", "저장된 할인 기록 확인. 기록 2개 이상이면 그래프 표시."],
    ["/alias-add alias:ㅇㄷㄹ game:Elden Ring", "누구나 검색 별칭 추가 가능."],
    ["/alias-list", "등록된 기본 별칭 확인."],
    ["/watch-add game:Hades", "개인 관심 게임 등록. 할인 조건 충족 시 DM 수신."],
    ["/watch-list /watch-remove", "내 관심 게임 확인 또는 삭제."],
    ["/사용법", "채팅으로 간단 사용법 안내."],
  ];
  ctx.addShape(slide, { x: 74, y: 284, w: 1130, h: 322, fill: C.white, line: ctx.line(C.faint, 1) });
  ctx.addShape(slide, { x: 74, y: 284, w: 1130, h: 42, fill: C.tealDark });
  ctx.addText(slide, { text: "명령어", x: 104, y: 296, w: 360, h: 22, fontSize: 15, bold: true, color: C.white });
  ctx.addText(slide, { text: "동작", x: 500, y: 296, w: 620, h: 22, fontSize: 15, bold: true, color: C.white });
  rows.forEach((row, i) => {
    const y = 338 + i * 38;
    if (i % 2 === 1) ctx.addShape(slide, { x: 74, y: y - 7, w: 1130, h: 38, fill: "#f1f6f2" });
    ctx.addText(slide, { text: row[0], x: 104, y, w: 360, h: 23, fontSize: 16, bold: true, color: C.ink });
    ctx.addText(slide, { text: row[1], x: 500, y, w: 650, h: 23, fontSize: 16, color: C.muted });
  });
  footer(slide, ctx, 7);
  return slide;
}
