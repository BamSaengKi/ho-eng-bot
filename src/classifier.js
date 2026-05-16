import { AAA_COMPANIES, AAA_TITLE_KEYWORDS, EXCLUDED_TITLE_KEYWORDS } from "./config.js";

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function includesAny(source, needles) {
  const text = normalize(source);
  return needles.some((needle) => text.includes(normalize(needle)));
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

  if (excludedKeyword) {
    return {
      isAaa: false,
      reason: `추가 콘텐츠 제외: ${excludedKeyword}`,
    };
  }

  if (matchedCompany) {
    return {
      isAaa: true,
      reason: `AAA 회사 매칭: ${matchedCompany}`,
    };
  }

  if (matchedKeyword) {
    return {
      isAaa: true,
      reason: `AAA 타이틀 매칭: ${matchedKeyword}`,
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
