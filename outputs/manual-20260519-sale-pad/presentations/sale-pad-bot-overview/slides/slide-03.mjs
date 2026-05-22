import { bg, C, card, footer, title } from "./common.mjs";

export async function slide03(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx, "#f8faf7");
  title(slide, ctx, "FEATURE MAP", "현재 구현된 기능", "채널 공지, 개인 검색, 별칭, 히스토리, 개인 관심 게임이 하나의 DB와 카드 생성 흐름을 공유합니다.");
  card(slide, ctx, "매일 자동 할인 공지", "CheapShark와 Steam API를 조회해 조건에 맞는 AAA급 할인을 채널에 카드로 전송합니다. 없으면 오늘은 할인정보가 없어요. 메시지를 보냅니다.", 64, 290, 344, 150, C.teal);
  card(slide, ctx, "개인 검색과 공유", "/deal 검색 결과는 본인만 보고, 버튼으로 공개 공유와 스레드 생성을 할 수 있습니다. 여러 후보는 선택 메뉴로 처리합니다.", 468, 290, 344, 150, C.blue);
  card(slide, ctx, "할인 기록과 그래프", "할인율, 날짜, 할인가를 SQLite에 저장합니다. 기록 1개는 텍스트, 2개 이상은 PNG 그래프로 표시합니다.", 872, 290, 344, 150, C.coral);
  card(slide, ctx, "검색 별칭", "한글 별칭과 오타 보정으로 Steam 영문명 검색을 도와줍니다. 추가는 누구나, 삭제는 관리자만 가능합니다.", 64, 482, 344, 122, C.gold);
  card(slide, ctx, "개인 관심 게임 DM", "/watch-add로 등록한 게임은 AAA 여부와 별개로 매일 확인하고 할인 조건 충족 시 DM으로 카드와 기록을 보냅니다.", 468, 482, 344, 122, C.tealDark);
  card(slide, ctx, "운영 도움 기능", "/사용법, slash command 등록 스크립트, dry-run, run-once, pm2 운영 흐름을 갖췄습니다.", 872, 482, 344, 122, C.slate);
  footer(slide, ctx, 3);
  return slide;
}
