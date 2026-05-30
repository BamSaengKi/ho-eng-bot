export const HELP_MESSAGE = [
  "Steam/ITAD 한국 기준으로 AAA급 게임과 개인 관심 게임 할인 정보를 보여주는 봇입니다.",
  "매일 자동으로 할인 정보를 확인하고, 조건에 맞는 할인은 카드와 할인 기록으로 알려줍니다.",
  "",
  "/deal game:엘든링",
  "현재 할인 정보를 검색합니다. 결과는 본인만 볼 수 있고, 공유 버튼으로 채널에 공유할 수 있습니다.",
  "",
  "/history game:Elden Ring",
  "저장된 할인 기록을 확인합니다.",
  "",
  "/steam profile:https://steamcommunity.com/id/example/",
  "Steam 찜목록을 개인 관심 게임으로 가져옵니다.",
  "",
  "/watch-list, /watch-refresh, /watch-remove, /watch-clear",
  "내 관심 게임 목록을 확인, 갱신, 선택 삭제, 전체 삭제합니다.",
  "",
  "/watch-setting min_discount:50, /watch-store stores:steam,epic",
  "개인 알림 최소 할인율과 스토어 필터를 설정합니다.",
  "",
  "/alias-add alias:ㅇㄷㄹ game:Elden Ring, /alias-list",
  "검색 별칭을 추가하거나 확인합니다.",
].join("\n");

export async function handleHelpMessage(message) {
  if (message.author?.bot) return;
  if (message.content.trim() !== "/사용법") return;

  await message.author.send(HELP_MESSAGE);
}
