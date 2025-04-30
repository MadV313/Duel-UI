// registerCommands.js

import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import practiceCommand from './commands/practice.js';

config(); // Loads from .env or Replit secrets

const commands = [
  {
    name: practiceCommand.name,
    description: practiceCommand.description,
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Successfully registered commands.');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
})();
