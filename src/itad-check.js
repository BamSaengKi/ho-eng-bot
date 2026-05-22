import "dotenv/config";
import { fetchItadDealExpiry } from "./itad.js";
import { normalizeRegion } from "./region.js";

const steamAppId = process.argv[2] || "1174180";
const title = process.argv.slice(3).join(" ") || `Steam app ${steamAppId}`;
const apiKey = process.env.ITAD_API_KEY || "";

console.log(apiKey ? `[itad-check] ITAD_API_KEY=${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "[itad-check] ITAD_API_KEY=(empty)");

const expiry = await fetchItadDealExpiry(
  {
    title,
    steamAppID: steamAppId,
  },
  {
    itadApiKey: apiKey,
    region: normalizeRegion(process.env.REGION),
  },
);

console.log(`[itad-check] appid=${steamAppId} title="${title}" expiry=${JSON.stringify(expiry)}`);
