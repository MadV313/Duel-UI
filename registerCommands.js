// registerCommands.js
// Standalone script to (re)register the /practice slash command.
// Uses GUILD registration if GUILD_ID is present (appears instantly),
// otherwise registers globally (can take up to an hour to propagate).

import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const token   = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId  = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('❌ Missing required env: DISCORD_TOKEN or CLIENT_ID');
  process.exit(1);
}

// Define just the /practice command here so this script is self-contained.
// (Your runtime bot still loads the full handler from cogs/practice.js.)
const commands = [
  new SlashCommandBuilder()
    .setName('practice')
    .setDescription('(Admin only) Start a practice duel vs the bot and get a private link to open the Duel UI.')
    .setDMPermission(false)
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🛠️ Registering slash commands…', {
      mode: guildId ? 'guild' : 'global',
      clientId,
      guildId: guildId || '(none)',
    });

    if (guildId) {
      // Fast propagation during development
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log('✅ Registered GUILD commands to', guildId);
    } else {
      // Global: can take up to an hour to appear
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('✅ Registered GLOBAL commands (may take up to 1h to appear)');
    }
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
    process.exit(1);
  }
})();
