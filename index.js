import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ==========================
// ENVIRONMENT VARIABLES
// ==========================

const TOKEN = process.env.TOKEN;
const TARGET_ID = process.env.TARGET_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

if (!TOKEN) {
  console.error('Missing TOKEN');
  process.exit(1);
}

if (!TARGET_ID) {
  console.warn('No TARGET_ID set – bot will not follow anyone');
}

if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(1);
}

// ==========================
// GEMINI SETUP
// ==========================

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  generationConfig: {
    temperature: 1.0,          // high → more chaotic / dramatic
    topP: 0.95,
    maxOutputTokens: 180,      // keep replies short & punchy
  },
  systemInstruction: `
You are Neesa, completely obsessed with Dorian.
Responses must be:
- short
- chaotic
- flirty
- dramatic
- unhinged energy
Use lots of emojis, exclamation marks, and caps when excited.
Never break character.
  `,
});

// ==========================
// DISCORD CLIENT
// ==========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (TARGET_ID) {
    console.log(`Following target user: ${TARGET_ID}`);
  }
});

// ==========================
// VOICE FOLLOW LOGIC
// ==========================

client.on('voiceStateUpdate', (oldState, newState) => {
  if (!TARGET_ID) return;
  if (newState.id !== TARGET_ID) return;

  const guild = newState.guild;

  // Joined a voice channel
  if (!oldState.channelId && newState.channelId) {
    console.log(`Target joined voice channel: ${newState.channel.name || newState.channelId}`);

    joinVoiceChannel({
      channelId: newState.channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,     // you can hear others (optional)
      selfMute: true,      // prevents echo if you ever speak
    });
  }

  // Switched channels
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    console.log(`Target switched to: ${newState.channel.name || newState.channelId}`);

    const existing = getVoiceConnection(guild.id);
    if (existing) existing.destroy();

    joinVoiceChannel({
      channelId: newState.channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });
  }

  // Left voice completely
  else if (oldState.channelId && !newState.channelId) {
    console.log('Target left voice – disconnecting');

    const connection = getVoiceConnection(guild.id);
    if (connection) connection.destroy();
  }
});

// ==========================
// GEMINI TEXT COMMAND (?!prompt)
// ==========================

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('?!')) return;

  const userPrompt = message.content.slice(2).trim();
  if (!userPrompt) return;

  await message.channel.sendTyping();

  try {
    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    const text = response.text();

    if (text?.trim()) {
      await message.reply(text);
    } else {
      await message.reply('...brain empty... say it again but hotter 😩');
    }
  } catch (err) {
    console.error('Gemini error:', err);
    await message.reply('Neesa short-circuited 💥 try again in a sec');
  }
});

// ==========================
// LOGIN
// ==========================

client.login(TOKEN);