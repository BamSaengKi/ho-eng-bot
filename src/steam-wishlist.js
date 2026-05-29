const STEAM_ID_PATTERN = /\b7656119\d{10}\b/;
const CUSTOM_PROFILE_PATTERN = /^[a-zA-Z0-9_-]{2,64}$/;
const STEAM_WISHLIST_API = "https://api.steampowered.com/IWishlistService/GetWishlist/v1/";
const STEAM_APPDETAILS_API = "https://store.steampowered.com/api/appdetails";
const STEAM_APP_PAGE = "https://store.steampowered.com/app";

function parseSteamProfile(input) {
  const value = String(input ?? "").trim();
  const id64 = value.match(STEAM_ID_PATTERN)?.[0];
  if (id64) {
    return {
      kind: "profiles",
      identifier: id64,
      label: id64,
    };
  }

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const profileIndex = parts.findIndex((part) => part === "profiles");
    const vanityIndex = parts.findIndex((part) => part === "id");
    if (profileIndex >= 0 && parts[profileIndex + 1]?.match(STEAM_ID_PATTERN)) {
      return {
        kind: "profiles",
        identifier: parts[profileIndex + 1],
        label: parts[profileIndex + 1],
      };
    }
    if (vanityIndex >= 0 && CUSTOM_PROFILE_PATTERN.test(parts[vanityIndex + 1] ?? "")) {
      return {
        kind: "vanity",
        identifier: parts[vanityIndex + 1],
        label: parts[vanityIndex + 1],
      };
    }
  } catch {
    // Plain custom profile names are handled below.
  }

  if (CUSTOM_PROFILE_PATTERN.test(value)) {
    return {
      kind: "vanity",
      identifier: value,
      label: value,
    };
  }

  return null;
}

function extractSteamId64FromXml(xml) {
  return String(xml ?? "").match(/<steamID64>(\d+)<\/steamID64>/)?.[1] ?? null;
}

async function resolveSteamProfile(profile) {
  if (profile.kind === "profiles") return profile;

  const url = new URL(`https://steamcommunity.com/id/${profile.identifier}/`);
  url.searchParams.set("xml", "1");

  const response = await fetch(url, {
    headers: {
      "accept": "application/xml,text/xml,*/*",
      "user-agent": "sale-pad-discord-bot/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Steam 프로필을 찾지 못했습니다: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const steamId = extractSteamId64FromXml(xml);
  if (!steamId) {
    throw new Error("Steam 커스텀 URL에서 숫자 프로필 ID를 찾지 못했습니다. 프로필 주소가 맞는지 확인해주세요.");
  }

  return {
    kind: "profiles",
    identifier: steamId,
    label: profile.label,
    steamId,
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.trim().startsWith("<")) {
      throw new Error("Steam이 찜목록 JSON 대신 웹페이지를 반환했습니다. 프로필 공개 설정이나 주소를 확인해주세요.");
    }
    throw new Error("Steam 찜목록 응답을 읽지 못했습니다.");
  }
}

async function fetchWishlistItems(steamId) {
  const url = new URL(STEAM_WISHLIST_API);
  url.searchParams.set("steamid", steamId);

  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "sale-pad-discord-bot/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Steam 찜목록 조회 실패: HTTP ${response.status}`);
  }

  const data = await readJsonResponse(response);
  return data?.response?.items ?? [];
}

async function fetchSteamAppDetailsMap(appIds) {
  const uniqueIds = [...new Set(appIds.map(String).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const details = new Map();
  const concurrency = 5;
  for (let index = 0; index < uniqueIds.length; index += concurrency) {
    const chunk = uniqueIds.slice(index, index + concurrency);
    const results = await Promise.all(chunk.map(async (appId) => {
      const url = new URL(STEAM_APPDETAILS_API);
      url.searchParams.set("appids", appId);
      url.searchParams.set("filters", "basic");
      url.searchParams.set("cc", "KR");
      url.searchParams.set("l", "korean");

      const response = await fetch(url, {
        headers: {
          "accept": "application/json",
          "user-agent": "sale-pad-discord-bot/0.1",
        },
      });
      if (!response.ok) return null;

      const data = await readJsonResponse(response);
      const payload = data?.[appId];
      if (payload?.success && payload.data?.name) {
        return [appId, payload.data];
      }

      const pageName = await fetchSteamAppNameFromStorePage(appId).catch(() => null);
      return pageName ? [appId, { name: pageName }] : null;
    }));

    for (const result of results) {
      if (result) details.set(result[0], result[1]);
    }
  }

  return details;
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchSteamAppNameFromStorePage(appId) {
  const url = new URL(`${STEAM_APP_PAGE}/${appId}/`);
  url.searchParams.set("cc", "KR");
  url.searchParams.set("l", "korean");

  const response = await fetch(url, {
    headers: {
      "accept": "text/html,*/*",
      "user-agent": "Mozilla/5.0 sale-pad-discord-bot/0.1",
    },
  });
  if (!response.ok) return null;

  const html = await response.text();
  const title = html.match(/<div[^>]+class="apphub_AppName"[^>]*>([^<]+)<\/div>/)?.[1] ??
    html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/)?.[1];

  return title ? decodeHtmlEntities(title).trim() : null;
}

function normalizeWishlistItem(appId, item, details) {
  if (!details?.name) return null;

  return {
    external: details.name,
    title: details.name,
    steamAppID: String(appId),
    gameID: null,
    itadId: null,
    source: "steam-wishlist",
    priority: Number(item.priority ?? 999),
    dateAdded: Number(item.added ?? 0),
  };
}

export async function fetchSteamWishlist(input, options = {}) {
  const profile = parseSteamProfile(input);
  if (!profile) {
    throw new Error("Steam 프로필 주소나 커스텀 URL 이름을 인식하지 못했습니다. 예: https://steamcommunity.com/id/이름");
  }

  const resolvedProfile = await resolveSteamProfile(profile);
  const wishlistItems = await fetchWishlistItems(resolvedProfile.identifier);
  const detailsByAppId = await fetchSteamAppDetailsMap(wishlistItems.map((item) => item.appid));
  const items = wishlistItems
    .filter((item) => item?.appid)
    .map((item) => normalizeWishlistItem(item.appid, item, detailsByAppId.get(String(item.appid))))
    .filter(Boolean)
    .sort((a, b) => {
      const priorityDiff = a.priority - b.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.dateAdded - a.dateAdded;
    });

  return {
    profile: resolvedProfile,
    items,
    skippedCount: wishlistItems.length - items.length,
  };
}
