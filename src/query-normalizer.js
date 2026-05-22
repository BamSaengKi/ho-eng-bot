import { getAlias, normalizeAlias } from "./history.js";

export const GAME_ALIASES = new Map([
  ["엘든링", "Elden Ring"],
  ["엘든 링", "Elden Ring"],
  ["사이버펑크", "Cyberpunk 2077"],
  ["사펑", "Cyberpunk 2077"],
  ["위쳐", "The Witcher 3"],
  ["위쳐3", "The Witcher 3"],
  ["더 위쳐", "The Witcher 3"],
  ["레데리", "Red Dead Redemption"],
  ["레데리1", "Red Dead Redemption"],
  ["레데리2", "Red Dead Redemption 2"],
  ["레드데드리뎀션", "Red Dead Redemption"],
  ["레드 데드 리뎀션", "Red Dead Redemption"],
  ["레드 데드 리뎀션 1", "Red Dead Redemption"],
  ["레드 데드 리뎀션 2", "Red Dead Redemption 2"],
  ["reddeadredemption", "Red Dead Redemption"],
  ["red dead redemption", "Red Dead Redemption"],
  ["red dead redemption 1", "Red Dead Redemption"],
  ["발더스", "Baldur's Gate 3"],
  ["발더스게이트", "Baldur's Gate 3"],
  ["발더스 게이트", "Baldur's Gate 3"],
  ["호그와트", "Hogwarts Legacy"],
  ["몬헌", "Monster Hunter"],
  ["몬스터헌터", "Monster Hunter"],
  ["몬스터 헌터", "Monster Hunter"],
  ["어쌔신크리드", "Assassin's Creed"],
  ["어쌔신 크리드", "Assassin's Creed"],
  ["어크", "Assassin's Creed"],
  ["파판", "Final Fantasy"],
  ["파이널판타지", "Final Fantasy"],
  ["파이널 판타지", "Final Fantasy"],
  ["바하", "Resident Evil"],
  ["바이오하자드", "Resident Evil"],
  ["철권", "Tekken"],
  ["문명", "Civilization"],
  ["콜옵", "Call of Duty"],
  ["콜오브듀티", "Call of Duty"],
  ["콜 오브 듀티", "Call of Duty"],
  ["배필", "Battlefield"],
  ["배틀필드", "Battlefield"],
  ["디아", "Diablo"],
  ["디아블로", "Diablo"],
  ["디아3", "Diablo III"],
  ["디아블로3", "Diablo III"],
  ["diablo 3", "Diablo III"],
  ["diablo iii", "Diablo III"],
  ["스타", "StarCraft"],
  ["스타크래프트", "StarCraft"],
  ["스타2", "StarCraft II"],
  ["스타크래프트2", "StarCraft II"],
  ["starcraft 2", "StarCraft II"],
  ["starcraft ii", "StarCraft II"],
  ["그타", "Grand Theft Auto"],
  ["gta", "Grand Theft Auto"],
  ["헤일로", "Halo"],
  ["포르자", "Forza"],
  ["용과같이", "Yakuza"],
  ["용과 같이", "Yakuza"],
  ["야쿠자", "Yakuza"],
  ["다크소울", "Dark Souls"],
  ["다크 소울", "Dark Souls"],
  ["둠", "DOOM"],
]);

const FUZZY_CANDIDATES = [
  ...new Set([
    ...GAME_ALIASES.values(),
    "Elden Ring",
    "Cyberpunk 2077",
    "The Witcher 3",
    "Red Dead Redemption",
    "Red Dead Redemption 2",
    "Baldur's Gate 3",
    "Hogwarts Legacy",
    "Monster Hunter",
    "Assassin's Creed",
    "Final Fantasy",
    "Resident Evil",
    "Tekken",
    "Civilization",
    "Call of Duty",
    "Battlefield",
    "Diablo",
    "Diablo III",
    "StarCraft",
    "StarCraft II",
    "Grand Theft Auto",
    "Halo",
    "Forza",
    "Yakuza",
    "Dark Souls",
    "DOOM",
  ]),
];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[':.-]/g, "")
    .replace(/\s+/g, " ");
}

function compact(value) {
  return normalize(value).replace(/\s+/g, "");
}

function levenshtein(left, right) {
  const a = compact(left);
  const b = compact(right);
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function getFuzzyThreshold(query) {
  const length = compact(query).length;
  if (length >= 10) return 2;
  if (length >= 5) return 1;
  return 0;
}

export function resolveGameQuery(query) {
  const normalized = normalize(query);
  const storedAlias = getAlias(query) ?? getAlias(normalizeAlias(query));
  if (storedAlias) {
    return {
      query: storedAlias.game,
      corrected: storedAlias.game !== query,
      reason: "기본 별칭 보정",
    };
  }

  const alias = GAME_ALIASES.get(normalized) ?? GAME_ALIASES.get(compact(query));
  if (alias) {
    return {
      query: alias,
      corrected: alias !== query,
      reason: "별칭 보정",
    };
  }

  const threshold = getFuzzyThreshold(query);
  if (threshold === 0) {
    return {
      query,
      corrected: false,
      reason: null,
    };
  }

  const [best] = FUZZY_CANDIDATES
    .map((candidate) => ({
      candidate,
      distance: levenshtein(query, candidate),
    }))
    .sort((a, b) => a.distance - b.distance);

  if (best && best.distance <= threshold && normalize(best.candidate) !== normalized) {
    return {
      query: best.candidate,
      corrected: true,
      reason: `오타 보정`,
    };
  }

  return {
    query,
    corrected: false,
    reason: null,
  };
}
