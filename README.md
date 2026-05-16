# Sale Pad Discord Bot

AAA급 게임이 10% 이상 할인되면 매일 Discord 채널에 카드 형태로 올리는 별도 봇 프로젝트입니다.

## 준비

```bash
cp .env.example .env
npm install
```

`.env`에 Discord bot token과 채널 ID를 넣습니다.

```env
DISCORD_TOKEN=...
DISCORD_CHANNEL_ID=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
```

`DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`는 slash command 등록용입니다.
비워두면 `npm run register-commands`가 `DISCORD_CHANNEL_ID` 기준으로 자동 추론합니다.

## 실행

Discord 전송 없이 조회/필터링만 확인:

```bash
npm run dry-run
```

이미 보낸 딜까지 포함해 조회:

```bash
npm run dry-run:all
```

한 번만 조회하고 전송:

```bash
npm run run-once
```

봇을 켜두고 매일 자동 실행:

```bash
npm start
```

Slash command 등록:

```bash
npm run register-commands
```

Discord 채팅방에서 사용:

```text
/deal game:Elden Ring
/history game:Elden Ring
```

## 동작

- CheapShark에서 Steam, Epic Games Store, Humble Store, Uplay 할인을 조회합니다.
- 할인율이 `MIN_DISCOUNT` 이상인 딜만 확인합니다.
- Steam `appdetails`에서 개발사/퍼블리셔를 확인합니다.
- AAA 개발사/퍼블리셔 목록에 걸리는 게임만 Discord embed 카드로 전송합니다.
- 시즌 패스, DLC, 사운드트랙 같은 추가 콘텐츠는 제목 키워드로 제외합니다.
- 이미 보낸 `dealID`는 `data/sent-deals.json`에 저장해 중복 전송을 막습니다.
- Steam 앱 상세 정보는 `data/steam-app-cache.json`에 캐시합니다.
- AAA 조건에 맞는 할인 기록은 `data/deals.sqlite`에 저장합니다.
- 다음 알림부터 같은 게임/스토어의 과거 할인 기록이 2개 이상이면 Discord embed에 할인 히스토리 그래프를 PNG로 첨부합니다.
- 같은 게임/스토어에서 할인율과 가격이 직전 기록과 같으면 히스토리에 중복 저장하지 않습니다.
- 이미 보낸 `dealID`라도 가격이나 할인율이 바뀌어 새 히스토리가 저장되면 다시 알림 후보가 됩니다.
- `npm run dry-run`은 Discord 토큰 없이 후보 딜과 AAA 판별 사유를 콘솔에 출력합니다.
- `npm run dry-run:all`은 이미 보낸 딜까지 포함해서 개발용으로 전체 후보를 확인합니다.
- `/deal`은 CheapShark에서 특정 게임의 현재 최저 할인 정보를 조회해 카드로 보여줍니다.
- `/history`는 `data/deals.sqlite`에 저장된 특정 게임의 할인 기록과 그래프를 보여줍니다.

## AAA 판별

Steam에는 공식 AAA 필드가 없어서 `src/config.js`의 개발사/퍼블리셔 목록으로 추정합니다.
필요한 회사나 프랜차이즈를 추가하면서 정확도를 높이면 됩니다.
추가 콘텐츠 제외 키워드도 같은 파일의 `EXCLUDED_TITLE_KEYWORDS`에서 조정할 수 있습니다.
