require("dotenv").config();

const { REST, Routes } = require("discord.js");
const { commands } = require("./commands");

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token) {
    throw new Error("DISCORD_TOKEN is missing in .env");
  }

  if (!clientId) {
    throw new Error("CLIENT_ID is missing in .env");
  }

  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );

  console.log("✅ Slash commands registered");
}

registerCommands().catch((err) => {
  console.error("❌ Failed to register commands:", err.message);
  process.exit(1);
});