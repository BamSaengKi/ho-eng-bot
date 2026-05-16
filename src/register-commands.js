import "dotenv/config";
import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { commandPayloads } from "./commands.js";

const token = process.env.DISCORD_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;

const missing = [];
if (!token) missing.push("DISCORD_TOKEN");

if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

async function inferRegistrationTarget() {
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_GUILD_ID) {
    return {
      clientId: process.env.DISCORD_CLIENT_ID,
      guildId: process.env.DISCORD_GUILD_ID,
    };
  }

  if (!channelId) {
    throw new Error("DISCORD_CHANNEL_ID is required when DISCORD_CLIENT_ID or DISCORD_GUILD_ID is not set.");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  return new Promise((resolve, reject) => {
    client.once(Events.ClientReady, async () => {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.guildId) {
          throw new Error("DISCORD_CHANNEL_ID does not point to a guild channel.");
        }

        resolve({
          clientId: client.user.id,
          guildId: channel.guildId,
        });
      } catch (error) {
        reject(error);
      } finally {
        await client.destroy();
      }
    });

    client.login(token).catch(reject);
  });
}

const { clientId, guildId } = await inferRegistrationTarget();
const rest = new REST({ version: "10" }).setToken(token);

await rest.put(
  Routes.applicationGuildCommands(clientId, guildId),
  { body: commandPayloads },
);

console.log(`[info] Registered ${commandPayloads.length} guild slash commands for guild ${guildId}.`);
