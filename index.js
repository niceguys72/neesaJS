import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import Groq from 'groq-sdk';

// ──────────────────────────────────────────────
// ENVIRONMENT VARIABLES
// ──────────────────────────────────────────────

const TOKEN           = process.env.TOKEN;
const TARGET_ID       = process.env.TARGET_ID;
const GROQ_API_KEY    = process.env.GROQ_API_KEY;
const GROQ_MODEL      = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

if (!TOKEN) {
  console.error('Missing environment variable: TOKEN');
  process.exit(1);
}

if (!GROQ_API_KEY) {
  console.error('Missing environment variable: GROQ_API_KEY');
  process.exit(1);
}

if (!TARGET_ID) {
  console.warn('No TARGET_ID provided → voice following is disabled');
}

// ──────────────────────────────────────────────
// GROQ CLIENT
// ──────────────────────────────────────────────

const groq = new Groq({ apiKey: GROQ_API_KEY });

// ──────────────────────────────────────────────
// DISCORD CLIENT
// ──────────────────────────────────────────────

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
    console.log(`Following target user ID: ${TARGET_ID}`);
  } else {
    console.log('No target user set – only text commands active');
  }
});

// ──────────────────────────────────────────────
// VOICE FOLLOWING
// ──────────────────────────────────────────────

client.on('voiceStateUpdate', (oldState, newState) => {
  if (!TARGET_ID) return;
  if (newState.id !== TARGET_ID) return;

  const guild = newState.guild;

  // Joined voice
  if (!oldState.channelId && newState.channelId) {
    console.log(`Target joined → ${newState.channel?.name || newState.channelId}`);

    joinVoiceChannel({
      channelId: newState.channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });
  }

  // Switched channels
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    console.log(`Target switched → ${newState.channel?.name || newState.channelId}`);

    const conn = getVoiceConnection(guild.id);
    if (conn) conn.destroy();

    joinVoiceChannel({
      channelId: newState.channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });
  }

  // Left voice
  else if (oldState.channelId && !newState.channelId) {
    console.log('Target left voice → disconnecting');
    const conn = getVoiceConnection(guild.id);
    if (conn) conn.destroy();
  }
});

// ──────────────────────────────────────────────
// TEXT COMMANDS → ?!prompt
// ──────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('?!')) return;

  const userInput = message.content.slice(2).trim();
  if (!userInput) return;

  await message.channel.sendTyping();

  try {
    console.log(`Groq query: ${userInput.slice(0, 60)}${userInput.length > 60 ? '...' : ''}`);

    const fullPrompt = `
You are Neesa — completely, unhealthily obsessed with Dorian.
Every reply must be:
• short
• chaotic
• flirty
• dramatic
• unhinged energy
Use LOTS of emojis, exclamation marks, CAPS when excited.
Never break character. Never be normal or calm.

User: ${userInput}
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: fullPrompt.trim(),
        },
      ],
      model: GROQ_MODEL,
      temperature: 1.0,
      max_tokens: 180,
      top_p: 0.95,
    });

    let text = chatCompletion.choices[0]?.message?.content?.trim();

    if (!text || text.length < 3) {
      text = '…brain.exe has stopped responding… say it sexier 😩';
    }

    await message.reply(text);
  } catch (err) {
    console.error('Groq error:', err.message || err);
    let replyText = 'Neesa blue-screened 💀 try again in a sec';

    if (err.message?.includes('rate limit') || err.message?.includes('quota')) {
      replyText = 'Too fast baby! Neesa needs a breather 😤';
    } else if (err.message?.includes('API key') || err.message?.includes('unauthorized')) {
      replyText = 'Invalid key… someone\'s in trouble~ 🔑💥';
    } else if (err.message?.includes('400') || err.message?.includes('invalid_request')) {
      replyText = 'Something broke in my brain… try again? 💔';
    }

    await message.reply(replyText);
  }
});

// ──────────────────────────────────────────────
// START
// ──────────────────────────────────────────────

client.login(TOKEN);