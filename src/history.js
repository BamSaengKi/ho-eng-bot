import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REQUESTED_STORES } from "./config.js";

const DATA_DIR = resolve(process.env.DATA_DIR || "data");
const DB_PATH = resolve(process.env.DB_PATH || resolve(DATA_DIR, "deals.sqlite"));
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SAME_DISCOUNT_COOLDOWN_MS = ONE_WEEK_MS;

function normalizeTitle(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeAlias(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nearlyEqual(left, right) {
  return Math.abs(toNumber(left) - toNumber(right)) < 0.001;
}

export function getGameKey(deal) {
  if (deal.steamAppID) return `steam:${deal.steamAppID}`;
  if (deal.itadId) return `itad:${deal.itadId}`;
  if (deal.gameID && String(deal.gameID).includes("-")) return `itad:${deal.gameID}`;
  if (deal.gameID) return `cheapshark:${deal.gameID}`;
  return `title:${deal.storeID}:${normalizeTitle(deal.title)}`;
}

function openDatabase() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      game_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      steam_app_id TEXT,
      game_id TEXT,
      developers TEXT,
      publishers TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deal_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_key TEXT NOT NULL,
      store_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      title TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      sale_price_usd REAL NOT NULL,
      normal_price_usd REAL NOT NULL,
      price_currency TEXT NOT NULL DEFAULT 'USD',
      savings_percent REAL NOT NULL,
      deal_id TEXT NOT NULL,
      FOREIGN KEY (game_key) REFERENCES games(game_key)
    );

    CREATE INDEX IF NOT EXISTS idx_deal_history_game_store_date
      ON deal_history (game_key, store_id, checked_at);

    CREATE TABLE IF NOT EXISTS aliases (
      alias TEXT PRIMARY KEY,
      game TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      game_key TEXT NOT NULL,
      query TEXT NOT NULL,
      title TEXT NOT NULL,
      steam_app_id TEXT,
      game_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, game_key)
    );

    CREATE TABLE IF NOT EXISTS watch_settings (
      user_id TEXT PRIMARY KEY,
      min_discount REAL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watch_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      game_key TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sale_price REAL NOT NULL,
      price_currency TEXT NOT NULL DEFAULT 'USD',
      savings_percent REAL NOT NULL,
      notified_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_watch_notifications_recent
      ON watch_notifications (user_id, game_key, store_id, notified_at);

    CREATE TABLE IF NOT EXISTS expiry_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      user_id TEXT,
      game_key TEXT NOT NULL,
      store_id TEXT NOT NULL,
      expiry_at TEXT NOT NULL,
      notified_at TEXT NOT NULL,
      UNIQUE(scope, user_id, game_key, store_id, expiry_at)
    );

    CREATE TABLE IF NOT EXISTS watch_share_contexts (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      watch_id INTEGER,
      title TEXT NOT NULL,
      store_id TEXT NOT NULL,
      deal_json TEXT NOT NULL,
      steam_details_json TEXT,
      deal_expiry_json TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_notifications (
      key TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL
    );
  `);
  const columns = db.prepare("PRAGMA table_info(deal_history)").all();
  if (!columns.some((column) => column.name === "price_currency")) {
    db.exec("ALTER TABLE deal_history ADD COLUMN price_currency TEXT NOT NULL DEFAULT 'USD'");
  }
  const watchSettingColumns = db.prepare("PRAGMA table_info(watch_settings)").all();
  if (!watchSettingColumns.some((column) => column.name === "store_filter")) {
    db.exec("ALTER TABLE watch_settings ADD COLUMN store_filter TEXT");
  }
  if (!watchSettingColumns.some((column) => column.name === "steam_profile_input")) {
    db.exec("ALTER TABLE watch_settings ADD COLUMN steam_profile_input TEXT");
  }
  if (!watchSettingColumns.some((column) => column.name === "steam_profile_label")) {
    db.exec("ALTER TABLE watch_settings ADD COLUMN steam_profile_label TEXT");
  }
  return db;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function saveWatchShareContext({
  token,
  userId,
  watchId,
  title,
  storeId,
  deal,
  steamDetails,
  dealExpiry,
  createdAt = new Date().toISOString(),
  expiresAt,
}) {
  const db = openDatabase();
  try {
    db.prepare(`
      INSERT OR REPLACE INTO watch_share_contexts (
        token,
        user_id,
        watch_id,
        title,
        store_id,
        deal_json,
        steam_details_json,
        deal_expiry_json,
        created_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      userId,
      watchId ?? null,
      title,
      String(storeId ?? ""),
      JSON.stringify(deal),
      steamDetails ? JSON.stringify(steamDetails) : null,
      dealExpiry ? JSON.stringify(dealExpiry) : null,
      createdAt,
      expiresAt,
    );
  } finally {
    db.close();
  }
}

export function getWatchShareContext(token) {
  const db = openDatabase();
  try {
    const row = db.prepare(`
      SELECT
        token,
        user_id AS userId,
        watch_id AS watchId,
        title,
        store_id AS storeId,
        deal_json AS dealJson,
        steam_details_json AS steamDetailsJson,
        deal_expiry_json AS dealExpiryJson,
        created_at AS createdAt,
        expires_at AS expiresAt
      FROM watch_share_contexts
      WHERE token = ?
    `).get(token);

    if (!row) return null;
    if (new Date(row.expiresAt).getTime() <= Date.now()) return null;

    return {
      token: row.token,
      userId: row.userId,
      watchId: row.watchId,
      title: row.title,
      storeId: row.storeId,
      deal: parseJson(row.dealJson),
      steamDetails: parseJson(row.steamDetailsJson),
      dealExpiry: parseJson(row.dealExpiryJson),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  } finally {
    db.close();
  }
}

export function deleteWatchShareContext(token) {
  const db = openDatabase();
  try {
    db.prepare("DELETE FROM watch_share_contexts WHERE token = ?").run(token);
  } finally {
    db.close();
  }
}

export function hasExpiryNotification(scope, deal, expiryAt, userId = null) {
  const db = openDatabase();
  try {
    const row = db.prepare(`
      SELECT id
      FROM expiry_notifications
      WHERE scope = ?
        AND user_id IS ?
        AND game_key = ?
        AND store_id = ?
        AND expiry_at = ?
      LIMIT 1
    `).get(scope, userId, getGameKey(deal), String(deal.storeID), expiryAt);
    return Boolean(row);
  } finally {
    db.close();
  }
}

export function recordExpiryNotification(scope, deal, expiryAt, userId = null, notifiedAt = new Date().toISOString()) {
  const db = openDatabase();
  try {
    db.prepare(`
      INSERT OR IGNORE INTO expiry_notifications (
        scope,
        user_id,
        game_key,
        store_id,
        expiry_at,
        notified_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(scope, userId, getGameKey(deal), String(deal.storeID), expiryAt, notifiedAt);
  } finally {
    db.close();
  }
}

export function getGameKeyFromSearchResult(game) {
  if (game.steamAppID) return `steam:${game.steamAppID}`;
  if (game.itadId) return `itad:${game.itadId}`;
  if (game.gameID && String(game.gameID).includes("-")) return `itad:${game.gameID}`;
  if (game.gameID) return `cheapshark:${game.gameID}`;
  return `title:${normalizeTitle(game.external)}`;
}

export function addWatchSubscription(userId, game, query, createdAt = new Date().toISOString()) {
  const db = openDatabase();
  const gameKey = getGameKeyFromSearchResult(game);
  try {
    db.prepare(`
      INSERT INTO watchlist (
        user_id,
        game_key,
        query,
        title,
        steam_app_id,
        game_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, game_key) DO UPDATE SET
        query = excluded.query,
        title = excluded.title,
        steam_app_id = excluded.steam_app_id,
        game_id = excluded.game_id,
        created_at = excluded.created_at
    `).run(
      userId,
      gameKey,
      query,
      game.external,
      game.steamAppID || null,
      game.gameID || null,
      createdAt,
    );

    return {
      id: db.prepare("SELECT id FROM watchlist WHERE user_id = ? AND game_key = ?").get(userId, gameKey)?.id,
      userId,
      gameKey,
      query,
      title: game.external,
      steamAppId: game.steamAppID || null,
      gameId: game.gameID || null,
      createdAt,
    };
  } finally {
    db.close();
  }
}

export function listWatchSubscriptions(userId) {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        id,
        user_id AS userId,
        game_key AS gameKey,
        query,
        title,
        steam_app_id AS steamAppId,
        game_id AS gameId,
        created_at AS createdAt
      FROM watchlist
      WHERE user_id = ?
      ORDER BY title ASC
    `).all(userId);
  } finally {
    db.close();
  }
}

export function listAllWatchSubscriptions() {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        id,
        user_id AS userId,
        game_key AS gameKey,
        query,
        title,
        steam_app_id AS steamAppId,
        game_id AS gameId,
        created_at AS createdAt
      FROM watchlist
      ORDER BY user_id ASC, title ASC
    `).all();
  } finally {
    db.close();
  }
}

export function listWatchUserIds() {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT DISTINCT user_id AS userId
      FROM watchlist
      ORDER BY user_id ASC
    `).all().map((row) => row.userId);
  } finally {
    db.close();
  }
}

export function getWatchSubscriptionById(id) {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        id,
        user_id AS userId,
        game_key AS gameKey,
        query,
        title,
        steam_app_id AS steamAppId,
        game_id AS gameId,
        created_at AS createdAt
      FROM watchlist
      WHERE id = ?
    `).get(id);
  } finally {
    db.close();
  }
}

export function removeWatchSubscription(userId, query) {
  const watches = listWatchSubscriptions(userId);
  const normalized = normalizeAlias(query);
  const match = watches.find((watch) =>
    normalizeAlias(watch.title) === normalized ||
    normalizeAlias(watch.query) === normalized ||
    watch.gameKey === query,
  );
  if (!match) return null;

  const db = openDatabase();
  try {
    db.prepare("DELETE FROM watchlist WHERE user_id = ? AND game_key = ?").run(userId, match.gameKey);
    return match;
  } finally {
    db.close();
  }
}

export function removeWatchSubscriptionById(userId, id) {
  const db = openDatabase();
  try {
    const watch = db.prepare(`
      SELECT
        id,
        user_id AS userId,
        game_key AS gameKey,
        query,
        title,
        steam_app_id AS steamAppId,
        game_id AS gameId,
        created_at AS createdAt
      FROM watchlist
      WHERE user_id = ? AND id = ?
    `).get(userId, id);
    if (!watch) return null;

    db.prepare("DELETE FROM watchlist WHERE user_id = ? AND id = ?").run(userId, id);
    return watch;
  } finally {
    db.close();
  }
}

export function clearWatchSubscriptions(userId) {
  const db = openDatabase();
  try {
    const result = db.prepare("DELETE FROM watchlist WHERE user_id = ?").run(userId);
    return result.changes;
  } finally {
    db.close();
  }
}

export function getWatchSettings(userId) {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        user_id AS userId,
        min_discount AS minDiscount,
        store_filter AS storeFilter,
        steam_profile_input AS steamProfileInput,
        steam_profile_label AS steamProfileLabel,
        updated_at AS updatedAt
      FROM watch_settings
      WHERE user_id = ?
    `).get(userId) ?? {
      userId,
      minDiscount: null,
      storeFilter: null,
      steamProfileInput: null,
      steamProfileLabel: null,
      updatedAt: null,
    };
  } finally {
    db.close();
  }
}

export function upsertWatchSettings(userId, settings, updatedAt = new Date().toISOString()) {
  const current = getWatchSettings(userId);
  const nextMinDiscount = settings.minDiscount === undefined
    ? current.minDiscount
    : settings.minDiscount;
  const nextStoreFilter = settings.storeFilter === undefined
    ? current.storeFilter
    : settings.storeFilter;
  const nextSteamProfileInput = settings.steamProfileInput === undefined
    ? current.steamProfileInput
    : settings.steamProfileInput;
  const nextSteamProfileLabel = settings.steamProfileLabel === undefined
    ? current.steamProfileLabel
    : settings.steamProfileLabel;
  const db = openDatabase();
  try {
    db.prepare(`
      INSERT INTO watch_settings (
        user_id,
        min_discount,
        store_filter,
        steam_profile_input,
        steam_profile_label,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        min_discount = excluded.min_discount,
        store_filter = excluded.store_filter,
        steam_profile_input = excluded.steam_profile_input,
        steam_profile_label = excluded.steam_profile_label,
        updated_at = excluded.updated_at
    `).run(
      userId,
      nextMinDiscount,
      nextStoreFilter,
      nextSteamProfileInput,
      nextSteamProfileLabel,
      updatedAt,
    );
    return getWatchSettings(userId);
  } finally {
    db.close();
  }
}

export function cleanupWatchSubscriptions(userId) {
  const watches = listWatchSubscriptions(userId);
  const seen = new Set();
  const deleteIds = [];
  for (const watch of watches) {
    const normalizedTitle = normalizeAlias(watch.title);
    const key = watch.steamAppId ? `steam:${watch.steamAppId}` : normalizedTitle;
    if (normalizedTitle.startsWith("steam app ") || seen.has(key)) {
      deleteIds.push(watch.id);
      continue;
    }
    seen.add(key);
  }

  if (deleteIds.length === 0) return 0;

  const db = openDatabase();
  try {
    const statement = db.prepare("DELETE FROM watchlist WHERE user_id = ? AND id = ?");
    let removed = 0;
    for (const id of deleteIds) {
      removed += statement.run(userId, id).changes;
    }
    return removed;
  } finally {
    db.close();
  }
}

export function hasRecentWatchNotification(userId, deal, maxAgeMs = ONE_WEEK_MS, checkedAt = new Date().toISOString()) {
  const db = openDatabase();
  try {
    const since = new Date(new Date(checkedAt).getTime() - maxAgeMs).toISOString();
    const row = db.prepare(`
      SELECT id
      FROM watch_notifications
      WHERE user_id = ?
        AND game_key = ?
        AND store_id = ?
        AND notified_at >= ?
        AND abs(savings_percent - ?) < 0.001
        AND abs(sale_price - ?) < 0.001
        AND price_currency = ?
      LIMIT 1
    `).get(
      userId,
      getGameKey(deal),
      String(deal.storeID),
      since,
      toNumber(deal.savings),
      toNumber(deal.salePrice),
      deal.priceCurrency || "USD",
    );

    return Boolean(row);
  } finally {
    db.close();
  }
}

export function recordWatchNotification(userId, deal, notifiedAt = new Date().toISOString()) {
  const db = openDatabase();
  try {
    db.prepare(`
      INSERT INTO watch_notifications (
        user_id,
        game_key,
        store_id,
        sale_price,
        price_currency,
        savings_percent,
        notified_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      getGameKey(deal),
      String(deal.storeID),
      toNumber(deal.salePrice),
      deal.priceCurrency || "USD",
      toNumber(deal.savings),
      notifiedAt,
    );
  } finally {
    db.close();
  }
}

export function hasRecentAppNotification(key, maxAgeMs, checkedAt = new Date().toISOString()) {
  const db = openDatabase();
  try {
    const row = db.prepare("SELECT sent_at AS sentAt FROM app_notifications WHERE key = ?").get(key);
    if (!row) return false;
    return new Date(row.sentAt).getTime() >= new Date(checkedAt).getTime() - maxAgeMs;
  } finally {
    db.close();
  }
}

export function recordAppNotification(key, sentAt = new Date().toISOString()) {
  const db = openDatabase();
  try {
    db.prepare(`
      INSERT INTO app_notifications (key, sent_at)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET sent_at = excluded.sent_at
    `).run(key, sentAt);
  } finally {
    db.close();
  }
}

export function getAppNotification(key) {
  const db = openDatabase();
  try {
    return db.prepare("SELECT key, sent_at AS sentAt FROM app_notifications WHERE key = ?").get(key) ?? null;
  } finally {
    db.close();
  }
}

export function getStorageSummary() {
  const db = openDatabase();
  try {
    return {
      dbPath: DB_PATH,
      games: db.prepare("SELECT COUNT(*) AS count FROM games").get().count,
      dealHistory: db.prepare("SELECT COUNT(*) AS count FROM deal_history").get().count,
      aliases: db.prepare("SELECT COUNT(*) AS count FROM aliases").get().count,
      watchlist: db.prepare("SELECT COUNT(*) AS count FROM watchlist").get().count,
      watchUsers: db.prepare("SELECT COUNT(DISTINCT user_id) AS count FROM watchlist").get().count,
      watchSettings: db.prepare("SELECT COUNT(*) AS count FROM watch_settings").get().count,
    };
  } finally {
    db.close();
  }
}

export function getAlias(alias) {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT alias, game, created_by AS createdBy, created_at AS createdAt
      FROM aliases
      WHERE alias = ?
    `).get(normalizeAlias(alias));
  } finally {
    db.close();
  }
}

export function upsertAlias(alias, game, createdBy, createdAt = new Date().toISOString()) {
  const db = openDatabase();
  const normalizedAlias = normalizeAlias(alias);
  try {
    db.prepare(`
      INSERT INTO aliases (alias, game, created_by, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(alias) DO UPDATE SET
        game = excluded.game,
        created_by = excluded.created_by,
        created_at = excluded.created_at
    `).run(normalizedAlias, String(game).trim(), createdBy, createdAt);
    return getAlias(normalizedAlias);
  } finally {
    db.close();
  }
}

export function removeAlias(alias) {
  const db = openDatabase();
  try {
    const result = db.prepare("DELETE FROM aliases WHERE alias = ?").run(normalizeAlias(alias));
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function listAliases(limit = 30) {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT alias, game, created_by AS createdBy, created_at AS createdAt
      FROM aliases
      ORDER BY alias ASC
      LIMIT ?
    `).all(limit);
  } finally {
    db.close();
  }
}

function upsertGame(db, item, checkedAt) {
  const deal = item.deal;
  const steamDetails = item.steamDetails;
  db.prepare(`
    INSERT INTO games (
      game_key,
      title,
      steam_app_id,
      game_id,
      developers,
      publishers,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_key) DO UPDATE SET
      title = excluded.title,
      steam_app_id = excluded.steam_app_id,
      game_id = excluded.game_id,
      developers = excluded.developers,
      publishers = excluded.publishers,
      updated_at = excluded.updated_at
  `).run(
    getGameKey(deal),
    deal.title ?? steamDetails?.name ?? "Unknown",
    deal.steamAppID || null,
    deal.gameID || null,
    JSON.stringify(steamDetails?.developers ?? []),
    JSON.stringify(steamDetails?.publishers ?? []),
    checkedAt,
  );
}

function getLastHistory(db, gameKey, storeId) {
  return db.prepare(`
    SELECT sale_price_usd, normal_price_usd, price_currency, savings_percent
    FROM deal_history
    WHERE game_key = ? AND store_id = ?
    ORDER BY checked_at DESC, id DESC
    LIMIT 1
  `).get(gameKey, String(storeId));
}

function hasRecentSameDiscount(db, deal, checkedAt, maxAgeMs) {
  if (!maxAgeMs) return false;

  const since = new Date(new Date(checkedAt).getTime() - maxAgeMs).toISOString();
  const row = db.prepare(`
    SELECT id
    FROM deal_history
    WHERE game_key = ?
      AND store_id = ?
      AND checked_at >= ?
      AND abs(savings_percent - ?) < 0.001
    LIMIT 1
  `).get(getGameKey(deal), String(deal.storeID), since, toNumber(deal.savings));

  return Boolean(row);
}

function shouldInsertHistory(db, deal, checkedAt, options = {}) {
  const sameDiscountCooldownMs = options.sameDiscountCooldownMs ?? DEFAULT_SAME_DISCOUNT_COOLDOWN_MS;
  if (hasRecentSameDiscount(db, deal, checkedAt, sameDiscountCooldownMs)) {
    return false;
  }
  if (sameDiscountCooldownMs) return true;

  const last = getLastHistory(db, getGameKey(deal), deal.storeID);
  if (!last) return true;

  return !(
    nearlyEqual(last.sale_price_usd, deal.salePrice) &&
    nearlyEqual(last.normal_price_usd, deal.normalPrice) &&
    String(last.price_currency || "USD") === String(deal.priceCurrency || "USD") &&
    nearlyEqual(last.savings_percent, deal.savings)
  );
}

export function recordDealHistories(items, checkedAt = new Date().toISOString(), options = {}) {
  if (items.length === 0) return new Map();

  const db = openDatabase();
  const saved = new Map();

  try {
    db.exec("BEGIN");
    const insertHistory = db.prepare(`
      INSERT INTO deal_history (
        game_key,
        store_id,
        store_name,
        title,
        checked_at,
        sale_price_usd,
        normal_price_usd,
        price_currency,
        savings_percent,
        deal_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      const deal = item.deal;
      const gameKey = getGameKey(deal);
      upsertGame(db, item, checkedAt);

      if (!shouldInsertHistory(db, deal, checkedAt, options)) {
        const key = `${gameKey}:${deal.storeID}`;
        if (!saved.has(key)) saved.set(key, false);
        continue;
      }

      insertHistory.run(
        gameKey,
        String(deal.storeID),
        deal.storeName ?? REQUESTED_STORES.get(String(deal.storeID)) ?? `Store ${deal.storeID}`,
        deal.title ?? item.steamDetails?.name ?? "Unknown",
        checkedAt,
        toNumber(deal.salePrice),
        toNumber(deal.normalPrice),
        deal.priceCurrency || "USD",
        toNumber(deal.savings),
        deal.dealID,
      );
      saved.set(`${gameKey}:${deal.storeID}`, true);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }

  return saved;
}

export function recordDealLookupHistory(item, checkedAt = new Date().toISOString()) {
  return recordDealHistories([item], checkedAt);
}

export function getDealHistory(deal, limit = 20) {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        checked_at AS checkedAt,
        sale_price_usd AS salePriceUsd,
        normal_price_usd AS normalPriceUsd,
        price_currency AS priceCurrency,
        savings_percent AS savingsPercent
      FROM deal_history
      WHERE game_key = ? AND store_id = ?
      ORDER BY checked_at DESC, id DESC
      LIMIT ?
    `).all(getGameKey(deal), String(deal.storeID), limit).reverse();
  } finally {
    db.close();
  }
}

export function findStoredGamesByTitle(query, limit = 5) {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        game_key AS gameKey,
        title,
        steam_app_id AS steamAppId,
        game_id AS gameId
      FROM games
      WHERE lower(title) LIKE lower(?)
      ORDER BY
        CASE WHEN lower(title) = lower(?) THEN 0 ELSE 1 END,
        title ASC
      LIMIT ?
    `).all(`%${query}%`, query, limit);
  } finally {
    db.close();
  }
}

export function getDealHistoryByGameKey(gameKey, limit = 20) {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        checked_at AS checkedAt,
        sale_price_usd AS salePriceUsd,
        normal_price_usd AS normalPriceUsd,
        price_currency AS priceCurrency,
        savings_percent AS savingsPercent,
        store_name AS storeName,
        title
      FROM deal_history
      WHERE game_key = ?
      ORDER BY checked_at DESC, id DESC
      LIMIT ?
    `).all(gameKey, limit).reverse();
  } finally {
    db.close();
  }
}
