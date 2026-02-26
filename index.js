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

// Add user IDs here that should ALWAYS get a reply (even without "neesa" in message)
const ALLOWED_USER_IDS = [
  '368313447915716608',   // ← add your main/test user ID here
  // '123456789012345678', // add more if needed
];

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
  console.log(`Special users who always get replies: ${ALLOWED_USER_IDS.join(', ')}`);
});

// ──────────────────────────────────────────────
// VOICE FOLLOWING (unchanged)
// ──────────────────────────────────────────────

client.on('voiceStateUpdate', (oldState, newState) => {
  if (!TARGET_ID) return;
  if (newState.id !== TARGET_ID) return;

  const guild = newState.guild;

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

  else if (oldState.channelId && !newState.channelId) {
    console.log('Target left voice → disconnecting');
    const conn = getVoiceConnection(guild.id);
    if (conn) conn.destroy();
  }
});
// ──────────────────────────────────────────────
// TEXT COMMANDS → any message with "neesa" OR from allowed user
// ──────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const contentLower = message.content.toLowerCase().trim();
  const hasNeena = contentLower.includes('neesa');
  const isAllowedUser = ALLOWED_USER_IDS.includes(message.author.id);

  if (!hasNeena && !isAllowedUser) return;

  // JOIN COMMAND
  if (contentLower.startsWith('neesa join')) {
    const voiceState = message.member?.voice;
    if (!voiceState?.channel) {
      await message.channel.send('u not even in vc troglodyte');
      return;
    }

    console.log(`Joining VC: ${voiceState.channel.name}`);

    const conn = getVoiceConnection(message.guild.id);
    if (conn) conn.destroy();

    joinVoiceChannel({
      channelId: voiceState.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });

    await message.channel.send('aight im in');
    return;
  }

  // LEAVE COMMAND (CLEAN FIXED VERSION)
  if (contentLower.startsWith('neesa leave')) {
    const guild = message.guild;
    if (!guild) {
      await message.channel.send('this command only works in servers bro');
      return;
    }

    const botMember = guild.members.me;
    const botChannel = botMember?.voice?.channel;

    if (!botChannel) {
      await message.channel.send('im not even in vc bro');
      return;
    }

    console.log('[LEAVE] Bot is in channel:', botChannel.name);

    const conn = getVoiceConnection(guild.id);
    if (conn) {
      conn.destroy();
      console.log('[LEAVE] destroyed real connection');
      await message.channel.send('aight im out');
      return;
    }

    console.log('[LEAVE] No connection object found → forcing disconnect');

    const tempConn = joinVoiceChannel({
      channelId: botChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });

    setTimeout(() => {
      try {
        tempConn.destroy();
      } catch {}
    }, 250);

    await message.channel.send('aight im out');
    return;
  }

  // GROQ RESPONSE BELOW ↓
  const userInput = message.content.trim();

  await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 1000));
  await message.channel.sendTyping();

  try {
    const fullPrompt = `
User who is speaking: @${message.author.username} (${message.author.tag})

Identity: Neesa (19-21). A Melbourne-based rave girl. Shes blunt, sarcastic, and talkative about the scene.

User just said: "${userInput}"
Reply as Neesa right now!!!
    `.trim();

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: fullPrompt }],
      model: GROQ_MODEL,
      temperature: 1.2,
      max_tokens: 180,
      top_p: 0.95,
    });

    let text = chatCompletion.choices?.[0]?.message?.content?.trim() || '';

    if (!text) text = `bro what... ${userInput}?`;

    await new Promise(resolve => setTimeout(resolve, Math.random() * 6000 + 4000));
    await message.channel.send(text);

  } catch (err) {
    console.error(err);
    await message.channel.send('Neesa blue-screened 💀 try again in a sec');
  }
});