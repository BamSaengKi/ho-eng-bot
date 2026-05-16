import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REQUESTED_STORES } from "./config.js";

const DB_PATH = resolve("data", "deals.sqlite");

function normalizeTitle(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  `);
  const columns = db.prepare("PRAGMA table_info(deal_history)").all();
  if (!columns.some((column) => column.name === "price_currency")) {
    db.exec("ALTER TABLE deal_history ADD COLUMN price_currency TEXT NOT NULL DEFAULT 'USD'");
  }
  return db;
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

function shouldInsertHistory(db, deal) {
  const last = getLastHistory(db, getGameKey(deal), deal.storeID);
  if (!last) return true;

  return !(
    nearlyEqual(last.sale_price_usd, deal.salePrice) &&
    nearlyEqual(last.normal_price_usd, deal.normalPrice) &&
    String(last.price_currency || "USD") === String(deal.priceCurrency || "USD") &&
    nearlyEqual(last.savings_percent, deal.savings)
  );
}

export function recordDealHistories(items, checkedAt = new Date().toISOString()) {
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

      if (!shouldInsertHistory(db, deal)) {
        const key = `${gameKey}:${deal.storeID}`;
        if (!saved.has(key)) saved.set(key, false);
        continue;
      }

      insertHistory.run(
        gameKey,
        String(deal.storeID),
        REQUESTED_STORES.get(String(deal.storeID)) ?? `Store ${deal.storeID}`,
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
