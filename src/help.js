export const HELP_MESSAGE = [
  "Steam 한국 기준으로 AAA급 게임 할인 정보를 찾아 Discord 카드로 보여주는 봇입니다.",
  "매일 자동으로 할인 정보를 확인하고, 조건에 맞는 할인은 카드와 할인 기록으로 알려줍니다.",
  "",
  "/deal game:엘든링",
  "현재 할인 정보를 검색합니다. 결과가 여러 개면 선택 메뉴가 뜹니다.",
  "검색 결과는 본인만 볼 수 있고, [공유하고 스레드 만들기] 버튼으로 채널에 공유할 수 있습니다.",
  "",
  "/history game:Elden Ring",
  "저장된 할인 기록을 확인합니다. 기록이 여러 개면 그래프가 함께 표시됩니다.",
  "",
  "/alias-add alias:ㅇㄷㄹ? game:Elden Ring",
  "검색 별칭을 추가합니다. 누구나 사용할 수 있습니다.",
  "",
  "/alias-list",
  "등록된 기본 별칭을 확인합니다.",
  "",
  "/watch-add game:Hades",
  "개인 관심 게임으로 등록하고 할인 시 채널 알림을 받습니다.",
  "/watch-list, /watch-remove game:Hades",
  "내 관심 게임 목록을 확인하거나 삭제합니다.",
].join("\n");

export async function handleHelpMessage(message) {
  if (message.author?.bot) return;
  if (message.content.trim() !== "/사용법") return;

  await message.reply(HELP_MESSAGE);
}
