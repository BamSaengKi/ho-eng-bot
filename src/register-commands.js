import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandPayloads } from "./commands.js";

const token = process.env.DISCORD_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;
const rest = new REST({ version: "10" }).setToken(token);

const missing = [];
if (!token) missing.push("DISCORD_TOKEN");

if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

function inferClientIdFromToken(value) {
  const [encodedClientId] = String(value ?? "").split(".");
  if (!encodedClientId) return null;

  try {
    return Buffer.from(encodedClientId, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function explainDiscordAccessError(error, context) {
  if (error?.code !== 50001 && error?.rawError?.code !== 50001) return error;

  const detail = [
    "Discord API returned Missing Access (50001).",
    "",
    `Context: ${context}`,
    "",
    "Check these items:",
    "- The bot token belongs to the Discord app you want to register commands for.",
    "- The development bot has been invited to the target test server.",
    "- DISCORD_CHANNEL_ID points to a channel the development bot can view.",
    "- If using DISCORD_CLIENT_ID and DISCORD_GUILD_ID, both IDs belong to the development app/server pair.",
    "- The invite URL includes both scopes: bot and applications.commands.",
  ].join("\n");

  return new Error(detail, { cause: error });
}

async function inferRegistrationTarget() {
  const clientId = process.env.DISCORD_CLIENT_ID || inferClientIdFromToken(token);
  const guildId = process.env.DISCORD_GUILD_ID;
  if (clientId && guildId) return { clientId, guildId };

  if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID is required because the bot client id could not be inferred from DISCORD_TOKEN.");
  }

  if (!channelId) {
    throw new Error("DISCORD_CHANNEL_ID is required when DISCORD_GUILD_ID is not set.");
  }

  try {
    const channel = await rest.get(Routes.channel(channelId));
    if (!channel?.guild_id) {
      throw new Error("DISCORD_CHANNEL_ID does not point to a guild channel.");
    }

    return {
      clientId,
      guildId: channel.guild_id,
    };
  } catch (error) {
    throw explainDiscordAccessError(error, `fetching DISCORD_CHANNEL_ID=${channelId}`);
  }
}

const { clientId, guildId } = await inferRegistrationTarget();

try {
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commandPayloads },
  );
} catch (error) {
  throw explainDiscordAccessError(error, `registering commands for guild ${guildId}`);
}

console.log(`[info] Registered ${commandPayloads.length} guild slash commands for guild ${guildId}.`);
