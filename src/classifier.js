import {
  AAA_COMPANIES,
  AAA_COMPANY_ONLY_MIN_STEAM_REVIEWS,
  AAA_STRONG_TITLE_KEYWORDS,
  AAA_TITLE_KEYWORDS,
  EXCLUDED_TITLE_KEYWORDS,
} from "./config.js";

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/®|™/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(source, needles) {
  const text = normalize(source);
  return needles.some((needle) => {
    const normalizedNeedle = normalize(needle);
    if (!normalizedNeedle) return false;
    return text === normalizedNeedle ||
      text.startsWith(`${normalizedNeedle} `) ||
      text.endsWith(` ${normalizedNeedle}`) ||
      text.includes(` ${normalizedNeedle} `);
  });
}

export function classifyAaaGame(deal, steamDetails) {
  const companies = [
    ...(steamDetails?.developers ?? []),
    ...(steamDetails?.publishers ?? []),
  ];
  const companyText = companies.join(" ");
  const title = deal.title ?? steamDetails?.name ?? "";
  const excludedKeyword = EXCLUDED_TITLE_KEYWORDS.find((keyword) => includesAny(title, [keyword]));
  const matchedCompany = AAA_COMPANIES.find((company) => includesAny(companyText, [company]));
  const matchedKeyword = AAA_TITLE_KEYWORDS.find((keyword) => includesAny(title, [keyword]));
  const matchedStrongKeyword = AAA_STRONG_TITLE_KEYWORDS.find((keyword) => includesAny(title, [keyword]));
  const steamReviewCount = Number(deal.steamRatingCount);

  if (excludedKeyword) {
    return {
      isAaa: false,
      reason: `추가 콘텐츠 제외: ${excludedKeyword}`,
    };
  }

  if (matchedCompany && matchedStrongKeyword) {
    return {
      isAaa: true,
      reason: `AAA 회사+타이틀 매칭: ${matchedCompany}, ${matchedStrongKeyword}`,
    };
  }

  if (matchedStrongKeyword) {
    return {
      isAaa: true,
      reason: `AAA 타이틀 매칭: ${matchedStrongKeyword}`,
    };
  }

  if (
    matchedCompany &&
    Number.isFinite(steamReviewCount) &&
    steamReviewCount >= AAA_COMPANY_ONLY_MIN_STEAM_REVIEWS
  ) {
    return {
      isAaa: true,
      reason: `AAA 회사+리뷰 규모 매칭: ${matchedCompany}, Steam 리뷰 ${steamReviewCount.toLocaleString("ko-KR")}개`,
    };
  }

  return {
    isAaa: false,
    reason: "AAA 기준 미충족",
  };
}

export function getSteamReviewSummary(deal) {
  const percent = Number(deal.steamRatingPercent);
  const count = Number(deal.steamRatingCount);

  if (!Number.isFinite(percent) || percent <= 0 || !Number.isFinite(count) || count <= 0) {
    return "리뷰 없음";
  }
  if (percent >= 95) return `압도적 긍정적 (${percent}%)`;
  if (percent >= 70) return `긍정적 (${percent}%)`;
  if (percent >= 40) return `복합적 (${percent}%)`;
  if (percent >= 20) return `부정적 (${percent}%)`;
  return `압도적 부정적 (${percent}%)`;
}
