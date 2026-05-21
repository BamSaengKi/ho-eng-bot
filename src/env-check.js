import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

const missing = [];
if (!token) missing.push("DISCORD_TOKEN");
if (!channelId) missing.push("DISCORD_CHANNEL_ID");
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async () => {
  try {
    console.log(`[env-check] Logged in as ${client.user.tag}`);
    if (clientId && client.user.id !== clientId) {
      console.log(`[env-check:warn] DISCORD_CLIENT_ID=${clientId} does not match logged-in bot id=${client.user.id}`);
    } else if (clientId) {
      console.log("[env-check:ok] DISCORD_CLIENT_ID matches the bot token.");
    }

    const guilds = await client.guilds.fetch();
    console.log(`[env-check] Mutual guilds: ${guilds.map((guild) => `${guild.name}(${guild.id})`).join(", ") || "none"}`);

    if (guildId) {
      const guild = await client.guilds.fetch(guildId).catch((error) => {
        console.log(`[env-check:error] Cannot access DISCORD_GUILD_ID=${guildId}: ${error.message}`);
        return null;
      });
      if (guild) console.log(`[env-check:ok] Can access guild ${guild.name}(${guild.id}).`);
    }

    const channel = await client.channels.fetch(channelId).catch((error) => {
      console.log(`[env-check:error] Cannot access DISCORD_CHANNEL_ID=${channelId}: ${error.message}`);
      return null;
    });
    if (channel) {
      console.log(`[env-check:ok] Can access channel ${channel.name ?? channel.id}(${channel.id}).`);
      if (guildId && channel.guildId !== guildId) {
        console.log(`[env-check:warn] Channel guild ${channel.guildId} does not match DISCORD_GUILD_ID=${guildId}.`);
      }
      console.log(`[env-check] Channel isTextBased=${channel.isTextBased()}`);
    }
  } finally {
    await client.destroy();
  }
});

await client.login(token);
