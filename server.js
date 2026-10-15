const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'BigL4202';
const GITHUB_REPO = process.env.GITHUB_REPO || 'tetris-ioTestServer';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

app.use(express.json());

const PLAYER_DATA_DIR = path.join(__dirname, 'player_data');
const INDIVIDUAL_PLAYERS_DIR = path.join(PLAYER_DATA_DIR, 'players');
const USERS_DB_FILE = path.join(PLAYER_DATA_DIR, 'users.json');

[
  PLAYER_DATA_DIR,
  INDIVIDUAL_PLAYERS_DIR,
  path.join(__dirname, 'resources', 'bg'),
  path.join(__dirname, 'resources', 'music'),
  path.join(__dirname, 'resources', 'sfx')
].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const POSSIBLE_RESOURCE_ROOTS = [
  path.join(__dirname, 'resources'),
  path.join(__dirname, 'recources'),
  path.join(__dirname, 'public', 'resources'),
  path.join(__dirname, 'public', 'recources')
];

POSSIBLE_RESOURCE_ROOTS.forEach(rPath => {
  if (fs.existsSync(rPath)) {
    app.use('/resources', express.static(rPath));
  }
});

// ============================================================================
// PLAYER DATABASE, ACCOUNT LEVELS & GITHUB REPO SYNC
// ============================================================================

let usersDB = {};

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function calculateLevel(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  return Math.floor(Math.sqrt(safeXp / 100)) + 1;
}

function normalizeUserRecord(u) {
  if (!u.settings) {
    u.settings = { das: 115, arr: 10, sdf: 40, musicVolume: 40, sfxVolume: 75, bgInterval: 60 };
  }
  if (!u.stats) u.stats = {};
  u.stats.xp = Number(u.stats.xp) || 0;
  u.stats.level = calculateLevel(u.stats.xp);
  u.stats.gamesPlayed = Number(u.stats.gamesPlayed) || 0;
  u.stats.zenLines = Number(u.stats.zenLines) || 0;
  u.stats.apmTestBest = Number(u.stats.apmTestBest) || 0;
  u.stats.apmTestLast = Number(u.stats.apmTestLast) || 0;
  u.stats.ffaWins = Number(u.stats.ffaWins) || 0;
  u.stats.duelWins = Number(u.stats.duelWins) || 0;
  u.stats.duelLosses = Number(u.stats.duelLosses) || 0;
  u.stats.maxCombo = Number(u.stats.maxCombo) || 0;
  u.stats.totalLinesCleared = Number(u.stats.totalLinesCleared) || 0;
  u.stats.totalAttackSent = Number(u.stats.totalAttackSent) || 0;
  u.stats.totalReceivedSum = Number(u.stats.totalReceivedSum) || 0;
  u.stats.receivedSamples = Number(u.stats.receivedSamples) || 0;
  u.stats.avgReceived = Number(u.stats.avgReceived) || 0;
  if (!Array.isArray(u.matchHistory)) u.matchHistory = [];
  return u;
}

function createNewUserRecord(username, rawPassword) {
  return normalizeUserRecord({
    username: username,
    passwordHash: hashPassword(rawPassword),
    passwordPlain: String(rawPassword),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    settings: {
      das: 115,
      arr: 10,
      sdf: 40,
      musicVolume: 40,
      sfxVolume: 75,
      bgInterval: 60
    },
    stats: {
      xp: 0,
      level: 1,
      gamesPlayed: 0,
      zenLines: 0,
      apmTestBest: 0,
      apmTestLast: 0,
      ffaWins: 0,
      duelWins: 0,
      duelLosses: 0,
      maxCombo: 0,
      totalLinesCleared: 0,
      totalAttackSent: 0,
      totalReceivedSum: 0,
      receivedSamples: 0,
      avgReceived: 0
    },
    matchHistory: []
  });
}

function loadLocalUsersDB() {
  try {
    if (fs.existsSync(USERS_DB_FILE)) {
      const raw = fs.readFileSync(USERS_DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (const k of Object.keys(parsed)) {
        usersDB[k.toLowerCase()] = normalizeUserRecord(parsed[k]);
      }
      console.log(`[Project A^2] Loaded ${Object.keys(usersDB).length} profiles from player_data/users.json`);
    } else {
      fs.writeFileSync(USERS_DB_FILE, JSON.stringify({}, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[Project A^2] Error reading users.json:', err.message);
    usersDB = {};
  }
}

loadLocalUsersDB();

async function syncFileToGitHub(repoRelativePath, contentString, commitMessage) {
  if (!GITHUB_TOKEN) return;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoRelativePath}`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Project-A2-Server'
  };

  try {
    let sha = undefined;
    const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
    if (getRes.ok) {
      const existingData = await getRes.json();
      sha = existingData.sha;
    }

    const bodyPayload = {
      message: commitMessage,
      content: Buffer.from(contentString, 'utf8').toString('base64'),
      branch: GITHUB_BRANCH
    };
    if (sha) bodyPayload.sha = sha;

    await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(bodyPayload)
    });
  } catch (err) {}
}

async function pullUsersFromGitHubOnBoot() {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/player_data/users.json`;
  try {
    const res = await fetch(rawUrl);
    if (res.ok) {
      const remoteUsers = await res.json();
      if (remoteUsers && typeof remoteUsers === 'object') {
        for (const k of Object.keys(remoteUsers)) {
          const low = k.toLowerCase();
          if (!usersDB[low]) {
            usersDB[low] = normalizeUserRecord(remoteUsers[k]);
          }
        }
        fs.writeFileSync(USERS_DB_FILE, JSON.stringify(usersDB, null, 2), 'utf8');
      }
    }
  } catch (e) {}
}

pullUsersFromGitHubOnBoot();

let githubSyncTimeout = null;
function saveUserAndSync(userObj, triggerReason = 'Update player data') {
  if (!userObj || !userObj.username) return;
  normalizeUserRecord(userObj);
  const key = userObj.username.toLowerCase();
  userObj.updatedAt = new Date().toISOString();
  usersDB[key] = userObj;

  const masterJson = JSON.stringify(usersDB, null, 2);
  try {
    fs.writeFileSync(USERS_DB_FILE, masterJson, 'utf8');
  } catch (e) {}

  const safeFile = key.replace(/[^a-z0-9_\-]/g, '_');
  const individualPath = path.join(INDIVIDUAL_PLAYERS_DIR, `${safeFile}.json`);
  const singleJson = JSON.stringify(userObj, null, 2);
  try {
    fs.writeFileSync(individualPath, singleJson, 'utf8');
  } catch (e) {}

  if (githubSyncTimeout) clearTimeout(githubSyncTimeout);
  githubSyncTimeout = setTimeout(() => {
    syncFileToGitHub(`player_data/players/${safeFile}.json`, singleJson, `[Project A^2] ${triggerReason}: ${userObj.username}`);
    syncFileToGitHub(`player_data/users.json`, JSON.stringify(usersDB, null, 2), `[Project A^2] Sync users.json (${userObj.username})`);
  }, 2000);
}

function sanitizeUserForClient(u) {
  normalizeUserRecord(u);
  return {
    username: u.username,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
    settings: u.settings,
    stats: u.stats,
    matchHistory: (u.matchHistory || []).slice(-20)
  };
}

function getAllPublicPlayerProfiles() {
  return Object.values(usersDB).map(u => sanitizeUserForClient(u)).sort((a, b) => b.stats.xp - a.stats.xp);
}

// Top 5 Leaderboards Only
function getCompiledLeaderboards() {
  const allUsers = Object.values(usersDB).map(u => {
    normalizeUserRecord(u);
    return {
      username: u.username,
      level: u.stats.level,
      xp: u.stats.xp,
      apm: u.stats.apmTestBest || 0,
      zenLines: u.stats.zenLines || 0,
      wins: (u.stats.ffaWins || 0) + (u.stats.duelWins || 0),
      ffaWins: u.stats.ffaWins || 0,
      duelWins: u.stats.duelWins || 0,
      duelLosses: u.stats.duelLosses || 0,
      maxCombo: u.stats.maxCombo || 0
    };
  });

  return {
    byApm: [...allUsers].sort((a, b) => b.apm - a.apm).slice(0, 5),
    byZen: [...allUsers].sort((a, b) => b.zenLines - a.zenLines).slice(0, 5),
    byWins: [...allUsers].sort((a, b) => b.wins - a.wins).slice(0, 5),
    byCombo: [...allUsers].sort((a, b) => b.maxCombo - a.maxCombo).slice(0, 5),
    byDuels: [...allUsers].sort((a, b) => {
      if (b.duelWins !== a.duelWins) return b.duelWins - a.duelWins;
      return a.duelLosses - b.duelLosses;
    }).slice(0, 5)
  };
}

// ============================================================================
// AUTH & DIRECTORY ENDPOINTS
// ============================================================================

app.post('/api/auth/register', (req, res) => {
  const rawName = String(req.body.username || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 18);
  const rawPass = String(req.body.password || '');

  if (rawName.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters.' });
  }
  if (rawPass.length < 3) {
    return res.status(400).json({ error: 'Password must be at least 3 characters.' });
  }

  const key = rawName.toLowerCase();
  if (usersDB[key]) {
    return res.status(409).json({ error: 'Username already registered. Please click LOGIN.' });
  }

  const newUser = createNewUserRecord(rawName, rawPass);
  saveUserAndSync(newUser, 'New Pilot Registered');

  return res.json({
    ok: true,
    user: sanitizeUserForClient(newUser),
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles()
  });
});

app.post('/api/auth/login', (req, res) => {
  const rawName = String(req.body.username || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 18);
  const rawPass = String(req.body.password || '');
  const key = rawName.toLowerCase();

  const existing = usersDB[key];
  if (!existing) {
    return res.status(404).json({ error: 'Pilot not found. Click REGISTER to create account.' });
  }

  const incomingHash = hashPassword(rawPass);
  if (existing.passwordHash !== incomingHash && existing.passwordPlain !== rawPass) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  existing.lastLogin = new Date().toISOString();
  saveUserAndSync(existing, 'Pilot Login');

  return res.json({
    ok: true,
    user: sanitizeUserForClient(existing),
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles()
  });
});

app.post('/api/auth/settings', (req, res) => {
  const rawName = String(req.body.username || '').trim().toLowerCase();
  const user = usersDB[rawName];
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (req.body.settings && typeof req.body.settings === 'object') {
    user.settings = { ...user.settings, ...req.body.settings };
    saveUserAndSync(user, 'Updated Settings');
  }
  return res.json({ ok: true, settings: user.settings });
});

app.get('/api/players', (req, res) => {
  res.json({
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles()
  });
});

// ============================================================================
// RESOURCE SCANNER + GITHUB FALLBACK
// ============================================================================

let githubResourceCache = null;
async function fetchGitHubResourcesFallback() {
  if (githubResourceCache) return githubResourceCache;
  try {
    const treeUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`;
    const res = await fetch(treeUrl, { headers: { 'User-Agent': 'Project-A2-Server' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.tree)) return null;

    const bg = [];
    const music = [];
    const sfx = [];
    const rawBase = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/`;

    for (const item of data.tree) {
      if (item.type !== 'blob') continue;
      const p = item.path;
      const lower = p.toLowerCase();
      if (lower.includes('node_modules') || lower.startsWith('.')) continue;

      if (lower.includes('bg/') || lower.includes('background')) {
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].some(ext => lower.endsWith(ext))) {
          bg.push(rawBase + p.split('/').map(encodeURIComponent).join('/'));
        }
      } else if (lower.includes('music/') || lower.includes('songs/')) {
        if (['.mp3', '.ogg', '.wav', '.m4a', '.flac'].some(ext => lower.endsWith(ext))) {
          music.push(rawBase + p.split('/').map(encodeURIComponent).join('/'));
        }
      } else if (lower.includes('sfx/') || lower.includes('sounds/')) {
        if (['.wav', '.mp3', '.ogg'].some(ext => lower.endsWith(ext))) {
          sfx.push(rawBase + p.split('/').map(encodeURIComponent).join('/'));
        }
      }
    }
    githubResourceCache = { bg, music, sfx };
    return githubResourceCache;
  } catch (e) {
    return null;
  }
}

app.get('/api/resources', async (req, res) => {
  const walkFolder = (dirPath, baseUrlPrefix, validExts, outSet) => {
    if (!fs.existsSync(dirPath)) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dirPath, entry.name);
        const relUrl = `${baseUrlPrefix}/${encodeURIComponent(entry.name)}`;
        if (entry.isDirectory()) {
          walkFolder(fullPath, relUrl, validExts, outSet);
        } else {
          const lower = entry.name.toLowerCase();
          if (validExts.some(ext => lower.endsWith(ext))) {
            outSet.add(relUrl);
          }
        }
      }
    } catch (e) {}
  };

  const bgSet = new Set();
  const musicSet = new Set();
  const sfxSet = new Set();

  for (const rootPath of POSSIBLE_RESOURCE_ROOTS) {
    walkFolder(path.join(rootPath, 'bg'), '/resources/bg', ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'], bgSet);
    walkFolder(path.join(rootPath, 'music'), '/resources/music', ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac'], musicSet);
    walkFolder(path.join(rootPath, 'sfx'), '/resources/sfx', ['.wav', '.mp3', '.ogg', '.m4a'], sfxSet);
  }

  if (bgSet.size === 0 || musicSet.size === 0 || sfxSet.size === 0) {
    const ghFallback = await fetchGitHubResourcesFallback();
    if (ghFallback) {
      if (bgSet.size === 0) ghFallback.bg.forEach(u => bgSet.add(u));
      if (musicSet.size === 0) ghFallback.music.forEach(u => musicSet.add(u));
      if (sfxSet.size === 0) ghFallback.sfx.forEach(u => sfxSet.add(u));
    }
  }

  res.json({
    bg: Array.from(bgSet),
    music: Array.from(musicSet),
    sfx: Array.from(sfxSet)
  });
});

app.get('*', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) {
    res.sendFile(publicIndex);
  } else if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else {
    res.status(404).send('Project A^2 index.html not found.');
  }
});

// ============================================================================
// MULTIPLAYER QUEUES (1v1 BO3 QUEUE & 2+ PLAYER FFA LOBBY)
// ============================================================================

const players = new Map(); // ws -> PlayerSession
const queue1v1 = []; // array of playerIds waiting for 1v1 BO3
const duelRooms = new Map(); // roomId -> DuelRoomObject

const ffaLobby = {
  players: new Map(), // playerId -> { id, username, alive, apm, pps, linesCleared, attackSent, garbageReceived, maxCombo }
  state: 'waiting', // 'waiting', 'countdown', 'playing'
  countdownTimer: null
};

function ensureUserRecord(username) {
  const key = username.toLowerCase();
  if (!usersDB[key]) {
    usersDB[key] = createNewUserRecord(username, 'default123');
  }
  return normalizeUserRecord(usersDB[key]);
}

function awardXpAndSave(userRec, xpAmount, reason) {
  userRec.stats.xp += Math.max(0, Math.round(xpAmount));
  userRec.stats.level = calculateLevel(userRec.stats.xp);
  saveUserAndSync(userRec, reason);
}

function broadcastAll(payload) {
  const str = JSON.stringify(payload);
  for (const [clientWs] of players.entries()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(str);
    }
  }
}

function sendToPlayer(playerId, payload) {
  for (const [clientWs, p] of players.entries()) {
    if (p.id === playerId && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload));
      return p;
    }
  }
  return null;
}

function getPlayerById(playerId) {
  for (const [, p] of players.entries()) {
    if (p.id === playerId) return p;
  }
  return null;
}

function broadcastHubState() {
  const onlineList = [];
  for (const [, p] of players.entries()) {
    if (!p.authenticated) continue;
    const u = ensureUserRecord(p.username);
    onlineList.push({
      id: p.id,
      username: p.username,
      level: u.stats.level,
      mode: p.mode,
      apm: u.stats.apmTestBest,
      zenLines: u.stats.zenLines,
      duelWins: u.stats.duelWins,
      duelLosses: u.stats.duelLosses
    });
  }

  broadcastAll({
    type: 'hub_sync',
    onlinePlayers: onlineList,
    queue1v1Count: queue1v1.length,
    ffaPlayerCount: ffaLobby.players.size,
    ffaState: ffaLobby.state,
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles()
  });
}

function systemChatBroadcast(text, style = 'system') {
  broadcastAll({
    type: 'chat',
    sender: 'PROJECT A²',
    text,
    style,
    timestamp: Date.now()
  });
}

function removeFromQueues(playerId) {
  const qIdx = queue1v1.indexOf(playerId);
  if (qIdx !== -1) {
    queue1v1.splice(qIdx, 1);
  }
  if (ffaLobby.players.has(playerId)) {
    ffaLobby.players.delete(playerId);
    evaluateFfaLobbyState();
  }
}

// ============================================================================
// 1v1 QUEUE & ISOLATED BEST-OF-3 (FIRST TO 2 WINS) MATCH ENGINE
// ============================================================================

function tryMatchmake1v1() {
  // Clean disconnected players from queue
  for (let i = queue1v1.length - 1; i >= 0; i--) {
    if (!getPlayerById(queue1v1[i])) queue1v1.splice(i, 1);
  }

  while (queue1v1.length >= 2) {
    const id1 = queue1v1.shift();
    const id2 = queue1v1.shift();
    const p1 = getPlayerById(id1);
    const p2 = getPlayerById(id2);
    if (p1 && p2) {
      startDuelBo3Room(p1, p2);
    }
  }
  broadcastHubState();
}

function startDuelBo3Room(p1, p2) {
  const roomId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  p1.mode = 'duel';
  p1.duelRoomId = roomId;
  p2.mode = 'duel';
  p2.duelRoomId = roomId;

  const room = {
    id: roomId,
    p1: { id: p1.id, username: p1.username, score: 0, alive: true, apm: 0, pps: 0, linesCleared: 0, attackSent: 0, garbageReceived: 0, maxCombo: 0 },
    p2: { id: p2.id, username: p2.username, score: 0, alive: true, apm: 0, pps: 0, linesCleared: 0, attackSent: 0, garbageReceived: 0, maxCombo: 0 },
    round: 1,
    active: true,
    roundInProgress: false
  };

  duelRooms.set(roomId, room);
  broadcastHubState();

  systemChatBroadcast(`[1v1 BO3 MATCH] ${p1.username} vs ${p2.username} started in isolated lobby!`, 'duel-announce');

  const initPayload = {
    type: 'duel_init',
    roomId: room.id,
    p1: { id: p1.id, username: p1.username, score: 0 },
    p2: { id: p2.id, username: p2.username, score: 0 },
    round: 1
  };

  sendToPlayer(p1.id, initPayload);
  sendToPlayer(p2.id, initPayload);

  startDuelRoundWithCountdown(roomId);
}

function startDuelRoundWithCountdown(roomId) {
  const room = duelRooms.get(roomId);
  if (!room || !room.active) return;

  room.p1.alive = true;
  room.p2.alive = true;
  room.roundInProgress = false;
  const seed = Math.floor(Math.random() * 2147483647);

  // Tell both clients to begin their 3-second countdown
  const cdPayload = {
    type: 'duel_round_countdown',
    roomId: room.id,
    round: room.round,
    seed,
    p1Score: room.p1.score,
    p2Score: room.p2.score
  };

  sendToPlayer(room.p1.id, cdPayload);
  sendToPlayer(room.p2.id, cdPayload);

  setTimeout(() => {
    const r = duelRooms.get(roomId);
    if (r && r.active) {
      r.roundInProgress = true;
    }
  }, 3000);
}

function handleDuelTopOut(roomId, loserId, finalStats = {}) {
  const room = duelRooms.get(roomId);
  if (!room || !room.active || !room.roundInProgress) return;

  room.roundInProgress = false;
  const isP1Loser = room.p1.id === loserId;
  const winnerSlot = isP1Loser ? room.p2 : room.p1;
  const loserSlot = isP1Loser ? room.p1 : room.p2;

  loserSlot.alive = false;
  winnerSlot.score += 1;

  if (finalStats) {
    loserSlot.apm = Math.max(loserSlot.apm, finalStats.apm || 0);
    loserSlot.pps = Math.max(loserSlot.pps, finalStats.pps || 0);
    loserSlot.linesCleared += finalStats.linesCleared || 0;
    loserSlot.attackSent += finalStats.attackSent || 0;
    loserSlot.garbageReceived += finalStats.garbageReceived || 0;
    loserSlot.maxCombo = Math.max(loserSlot.maxCombo, finalStats.maxCombo || 0);
  }

  // Best of 3: First to 2 wins
  if (winnerSlot.score >= 2) {
    concludeDuelMatch(room, winnerSlot, loserSlot, 'COMPLETED');
  } else {
    const roundMsg = {
      type: 'duel_round_result',
      roomId: room.id,
      round: room.round,
      roundWinnerId: winnerSlot.id,
      roundWinnerName: winnerSlot.username,
      p1Score: room.p1.score,
      p2Score: room.p2.score
    };
    sendToPlayer(room.p1.id, roundMsg);
    sendToPlayer(room.p2.id, roundMsg);

    room.round += 1;
    setTimeout(() => startDuelRoundWithCountdown(room.id), 2500);
  }
}

function concludeDuelMatch(room, winnerSlot, loserSlot, reason) {
  if (!room.active) return;
  room.active = false;
  room.roundInProgress = false;

  const scoreStr = `${winnerSlot.score}-${loserSlot.score}`;

  // Update Winner DB Record
  const winUser = ensureUserRecord(winnerSlot.username);
  winUser.stats.gamesPlayed += 1;
  winUser.stats.duelWins += 1;
  winUser.stats.totalLinesCleared += winnerSlot.linesCleared;
  winUser.stats.totalAttackSent += winnerSlot.attackSent;
  winUser.stats.maxCombo = Math.max(winUser.stats.maxCombo, winnerSlot.maxCombo);
  winUser.stats.totalReceivedSum += winnerSlot.garbageReceived;
  winUser.stats.receivedSamples += 1;
  winUser.stats.avgReceived = Number((winUser.stats.totalReceivedSum / winUser.stats.receivedSamples).toFixed(1));
  winUser.matchHistory.push({
    date: new Date().toISOString(),
    mode: '1v1 BO3',
    result: 'WIN',
    score: scoreStr,
    opponent: loserSlot.username,
    apm: winnerSlot.apm,
    lines: winnerSlot.linesCleared,
    maxCombo: winnerSlot.maxCombo
  });
  awardXpAndSave(winUser, 150 + winnerSlot.linesCleared * 5, '1v1 BO3 Win');

  // Update Loser DB Record
  const loseUser = ensureUserRecord(loserSlot.username);
  loseUser.stats.gamesPlayed += 1;
  loseUser.stats.duelLosses += 1;
  loseUser.stats.totalLinesCleared += loserSlot.linesCleared;
  loseUser.stats.totalAttackSent += loserSlot.attackSent;
  loseUser.stats.maxCombo = Math.max(loseUser.stats.maxCombo, loserSlot.maxCombo);
  loseUser.stats.totalReceivedSum += loserSlot.garbageReceived;
  loseUser.stats.receivedSamples += 1;
  loseUser.stats.avgReceived = Number((loseUser.stats.totalReceivedSum / loseUser.stats.receivedSamples).toFixed(1));
  loseUser.matchHistory.push({
    date: new Date().toISOString(),
    mode: '1v1 BO3',
    result: 'LOSS',
    score: scoreStr,
    opponent: winnerSlot.username,
    apm: loserSlot.apm,
    lines: loserSlot.linesCleared,
    maxCombo: loserSlot.maxCombo
  });
  awardXpAndSave(loseUser, 60 + loserSlot.linesCleared * 5, '1v1 BO3 Loss');

  const p1Obj = getPlayerById(room.p1.id);
  const p2Obj = getPlayerById(room.p2.id);
  if (p1Obj) {
    p1Obj.mode = 'hub';
    p1Obj.duelRoomId = null;
  }
  if (p2Obj) {
    p2Obj.mode = 'hub';
    p2Obj.duelRoomId = null;
  }

  const summaryPlayers = [
    {
      username: winnerSlot.username,
      placement: '1ST (WINNER)',
      score: winnerSlot.score,
      apm: winnerSlot.apm,
      pps: winnerSlot.pps,
      lines: winnerSlot.linesCleared,
      sent: winnerSlot.attackSent,
      recv: winnerSlot.garbageReceived,
      maxCombo: winnerSlot.maxCombo
    },
    {
      username: loserSlot.username,
      placement: '2ND',
      score: loserSlot.score,
      apm: loserSlot.apm,
      pps: loserSlot.pps,
      lines: loserSlot.linesCleared,
      sent: loserSlot.attackSent,
      recv: loserSlot.garbageReceived,
      maxCombo: loserSlot.maxCombo
    }
  ];

  const overPayload = {
    type: 'match_summary_5s',
    modeTitle: `1v1 BEST OF 3 RESULT (${scoreStr})`,
    winnerName: winnerSlot.username,
    players: summaryPlayers,
    updatedUserP1: sanitizeUserForClient(ensureUserRecord(room.p1.username)),
    updatedUserP2: sanitizeUserForClient(ensureUserRecord(room.p2.username))
  };

  sendToPlayer(room.p1.id, overPayload);
  sendToPlayer(room.p2.id, overPayload);

  systemChatBroadcast(`[1v1 BO3 VICTORY] ${winnerSlot.username} defeated ${loserSlot.username} (${scoreStr})!`, 'duel-win');

  duelRooms.delete(room.id);
  broadcastHubState();
}

// ============================================================================
// FFA LOBBY ENGINE (Requires 2+ Players to Start, 3s Countdown, 5s Summary)
// ============================================================================

function broadcastFfaRoom(payload) {
  for (const [pid] of ffaLobby.players.entries()) {
    sendToPlayer(pid, payload);
  }
}

function evaluateFfaLobbyState() {
  const count = ffaLobby.players.size;

  if (ffaLobby.state === 'waiting') {
    if (count >= 2) {
      ffaLobby.state = 'countdown';
      const seed = Math.floor(Math.random() * 2147483647);
      for (const [, slot] of ffaLobby.players.entries()) {
        slot.alive = true;
        slot.apm = 0;
        slot.pps = 0;
        slot.linesCleared = 0;
        slot.attackSent = 0;
        slot.garbageReceived = 0;
        slot.maxCombo = 0;
      }

      broadcastFfaRoom({
        type: 'ffa_countdown_start',
        seed,
        playerCount: count
      });

      if (ffaLobby.countdownTimer) clearTimeout(ffaLobby.countdownTimer);
      ffaLobby.countdownTimer = setTimeout(() => {
        if (ffaLobby.players.size >= 2) {
          ffaLobby.state = 'playing';
          broadcastHubState();
        } else {
          ffaLobby.state = 'waiting';
          broadcastFfaRoom({ type: 'ffa_waiting', playerCount: ffaLobby.players.size });
          broadcastHubState();
        }
      }, 3000);
    } else {
      broadcastFfaRoom({ type: 'ffa_waiting', playerCount: count });
    }
  } else if (ffaLobby.state === 'countdown') {
    if (count < 2) {
      if (ffaLobby.countdownTimer) clearTimeout(ffaLobby.countdownTimer);
      ffaLobby.state = 'waiting';
      broadcastFfaRoom({ type: 'ffa_waiting', playerCount: count });
    }
  } else if (ffaLobby.state === 'playing') {
    checkFfaMatchEnd();
  }
  broadcastHubState();
}

function checkFfaMatchEnd() {
  if (ffaLobby.state !== 'playing') return;
  const aliveSlots = [];
  for (const [, slot] of ffaLobby.players.entries()) {
    if (slot.alive) aliveSlots.push(slot);
  }

  if (aliveSlots.length <= 1) {
    ffaLobby.state = 'waiting';
    const winnerSlot = aliveSlots[0] || Array.from(ffaLobby.players.values())[0];

    const summaryPlayers = Array.from(ffaLobby.players.values()).map(s => {
      const isWin = winnerSlot && s.id === winnerSlot.id;
      const u = ensureUserRecord(s.username);
      u.stats.gamesPlayed += 1;
      if (isWin) u.stats.ffaWins += 1;
      u.stats.totalLinesCleared += s.linesCleared;
      u.stats.totalAttackSent += s.attackSent;
      u.stats.maxCombo = Math.max(u.stats.maxCombo, s.maxCombo);
      u.stats.totalReceivedSum += s.garbageReceived;
      u.stats.receivedSamples += 1;
      u.stats.avgReceived = Number((u.stats.totalReceivedSum / u.stats.receivedSamples).toFixed(1));
      u.matchHistory.push({
        date: new Date().toISOString(),
        mode: 'FFA',
        result: isWin ? '1ST (WIN)' : 'TOP OUT',
        apm: s.apm,
        lines: s.linesCleared,
        maxCombo: s.maxCombo
      });
      awardXpAndSave(u, (isWin ? 140 : 50) + s.linesCleared * 4, 'FFA Match Complete');

      return {
        username: s.username,
        placement: isWin ? '1ST (WINNER)' : 'ELIMINATED',
        score: isWin ? 1 : 0,
        apm: s.apm,
        pps: s.pps,
        lines: s.linesCleared,
        sent: s.attackSent,
        recv: s.garbageReceived,
        maxCombo: s.maxCombo
      };
    });

    summaryPlayers.sort((a, b) => b.score - a.score || b.apm - a.apm);

    for (const [pid] of ffaLobby.players.entries()) {
      const pObj = getPlayerById(pid);
      if (pObj) pObj.mode = 'hub';
      sendToPlayer(pid, {
        type: 'match_summary_5s',
        modeTitle: 'FFA MATCH RESULTS',
        winnerName: winnerSlot ? winnerSlot.username : 'NONE',
        players: summaryPlayers,
        updatedUser: pObj ? sanitizeUserForClient(ensureUserRecord(pObj.username)) : null
      });
    }

    if (winnerSlot) {
      systemChatBroadcast(`[FFA VICTORY] ${winnerSlot.username} won the FFA match!`, 'duel-win');
    }

    ffaLobby.players.clear();
    broadcastHubState();
  }
}

// ============================================================================
// WEBSOCKET CONNECTION HANDLER
// ============================================================================

wss.on('connection', (ws) => {
  const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const session = {
    id: playerId,
    ws,
    username: `Guest_${Math.floor(1000 + Math.random() * 9000)}`,
    authenticated: false,
    mode: 'hub',
    duelRoomId: null
  };

  players.set(ws, session);

  ws.send(JSON.stringify({
    type: 'welcome',
    id: playerId,
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles()
  }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    const p = players.get(ws);
    if (!p) return;

    switch (msg.type) {
      case 'auth_bind': {
        const cleanName = String(msg.username || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 18);
        if (cleanName.length >= 2) {
          p.username = cleanName;
          p.authenticated = true;
          const uRec = ensureUserRecord(p.username);
          ws.send(JSON.stringify({
            type: 'profile_synced',
            user: sanitizeUserForClient(uRec)
          }));
          broadcastHubState();
        }
        break;
      }

      case 'chat': {
        if (!p.authenticated) return;
        const text = String(msg.text || '').trim().slice(0, 240);
        if (!text) return;
        broadcastAll({
          type: 'chat',
          sender: p.username,
          senderId: p.id,
          text,
          style: p.mode === 'duel' ? 'duel-chat' : 'user',
          timestamp: Date.now()
        });
        break;
      }

      // Join 1v1 Queue (Best of 3, 4x26 only)
      case 'join_1v1_queue': {
        if (!p.authenticated || p.mode === 'duel') return;
        removeFromQueues(p.id);
        p.mode = 'queue_1v1';
        queue1v1.push(p.id);
        ws.send(JSON.stringify({ type: 'queued_1v1', count: queue1v1.length }));
        tryMatchmake1v1();
        break;
      }

      case 'leave_1v1_queue': {
        removeFromQueues(p.id);
        p.mode = 'hub';
        broadcastHubState();
        break;
      }

      // Join FFA Lobby (4x26 only, waits for 2+ players)
      case 'join_ffa_lobby': {
        if (!p.authenticated || p.mode === 'duel') return;
        removeFromQueues(p.id);
        p.mode = 'ffa';
        ffaLobby.players.set(p.id, {
          id: p.id,
          username: p.username,
          alive: true,
          apm: 0,
          pps: 0,
          linesCleared: 0,
          attackSent: 0,
          garbageReceived: 0,
          maxCombo: 0
        });
        evaluateFfaLobbyState();
        break;
      }

      case 'leave_active_mode': {
        if (p.mode === 'duel' && p.duelRoomId) {
          const room = duelRooms.get(p.duelRoomId);
          if (room && room.active) {
            const winnerSlot = room.p1.id === p.id ? room.p2 : room.p1;
            const loserSlot = room.p1.id === p.id ? room.p1 : room.p2;
            concludeDuelMatch(room, winnerSlot, loserSlot, 'DISCONNECT_FORFEIT');
          }
        } else {
          removeFromQueues(p.id);
          p.mode = 'hub';
          broadcastHubState();
        }
        break;
      }

      // Singleplayer Zen Line Clear Progress (4x26 Zen or 10x26 Zen)
      case 'zen_lines_add': {
        if (!p.authenticated) return;
        const added = Math.max(0, Number(msg.lines) || 0);
        if (added <= 0) return;
        const uRec = ensureUserRecord(p.username);
        uRec.stats.zenLines += added;
        uRec.stats.totalLinesCleared += added;
        if (msg.maxCombo && msg.maxCombo > uRec.stats.maxCombo) {
          uRec.stats.maxCombo = msg.maxCombo;
        }
        awardXpAndSave(uRec, added * 6, 'Zen Lines Progress');
        ws.send(JSON.stringify({
          type: 'profile_synced',
          user: sanitizeUserForClient(uRec)
        }));
        broadcastHubState();
        break;
      }

      // Singleplayer 1-Minute APM Test Result
      case 'apm_test_complete': {
        if (!p.authenticated) return;
        const recordedApm = Number(Number(msg.apm || 0).toFixed(1));
        const lines = Number(msg.linesCleared) || 0;
        const combo = Number(msg.maxCombo) || 0;

        const uRec = ensureUserRecord(p.username);
        uRec.stats.gamesPlayed += 1;
        uRec.stats.apmTestLast = recordedApm;
        if (recordedApm > uRec.stats.apmTestBest) {
          uRec.stats.apmTestBest = recordedApm;
        }
        uRec.stats.totalLinesCleared += lines;
        uRec.stats.maxCombo = Math.max(uRec.stats.maxCombo, combo);
        uRec.matchHistory.push({
          date: new Date().toISOString(),
          mode: 'APM TEST (1:00)',
          result: `${recordedApm} APM`,
          apm: recordedApm,
          lines,
          maxCombo: combo
        });

        awardXpAndSave(uRec, 100 + Math.round(recordedApm * 2), '1-Minute APM Test Completed');

        ws.send(JSON.stringify({
          type: 'profile_synced',
          user: sanitizeUserForClient(uRec)
        }));
        systemChatBroadcast(`[APM TEST] ${p.username} recorded ${recordedApm} APM in the 1-Minute APM Test!`, 'system');
        broadcastHubState();
        break;
      }

      // Live Multiplayer Board & Stats Sync
      case 'board_sync': {
        if (p.mode === 'duel' && p.duelRoomId) {
          const room = duelRooms.get(p.duelRoomId);
          if (room && room.active) {
            const slot = room.p1.id === p.id ? room.p1 : room.p2;
            const oppSlot = room.p1.id === p.id ? room.p2 : room.p1;
            slot.apm = msg.apm || 0;
            slot.pps = msg.pps || 0;
            slot.linesCleared = msg.linesCleared || 0;
            slot.attackSent = msg.attackSent || 0;
            slot.garbageReceived = msg.garbageReceived || 0;
            slot.maxCombo = Math.max(slot.maxCombo, msg.maxCombo || 0);

            sendToPlayer(oppSlot.id, {
              type: 'opponent_sync',
              fromId: p.id,
              username: p.username,
              grid: msg.grid,
              activePiece: msg.activePiece,
              apm: msg.apm,
              pps: msg.pps
            });
          }
        } else if (p.mode === 'ffa' && ffaLobby.players.has(p.id)) {
          const slot = ffaLobby.players.get(p.id);
          slot.apm = msg.apm || 0;
          slot.pps = msg.pps || 0;
          slot.linesCleared = msg.linesCleared || 0;
          slot.attackSent = msg.attackSent || 0;
          slot.garbageReceived = msg.garbageReceived || 0;
          slot.maxCombo = Math.max(slot.maxCombo, msg.maxCombo || 0);

          for (const [otherId] of ffaLobby.players.entries()) {
            if (otherId !== p.id) {
              sendToPlayer(otherId, {
                type: 'opponent_sync',
                fromId: p.id,
                username: p.username,
                grid: msg.grid,
                activePiece: msg.activePiece,
                apm: msg.apm,
                pps: msg.pps
              });
            }
          }
        }
        break;
      }

      case 'send_garbage': {
        const lines = Number(msg.lines) || 0;
        if (lines <= 0) return;

        if (p.mode === 'duel' && p.duelRoomId) {
          const room = duelRooms.get(p.duelRoomId);
          if (room && room.active && room.roundInProgress) {
            const targetId = room.p1.id === p.id ? room.p2.id : room.p1.id;
            sendToPlayer(targetId, { type: 'receive_garbage', lines, fromName: p.username });
          }
        } else if (p.mode === 'ffa' && ffaLobby.state === 'playing') {
          const targets = [];
          for (const [otherId, slot] of ffaLobby.players.entries()) {
            if (otherId !== p.id && slot.alive) targets.push(otherId);
          }
          if (targets.length > 0) {
            const chosenId = targets[Math.floor(Math.random() * targets.length)];
            sendToPlayer(chosenId, { type: 'receive_garbage', lines, fromName: p.username });
          }
        }
        break;
      }

      case 'player_topout': {
        if (p.mode === 'duel' && p.duelRoomId) {
          handleDuelTopOut(p.duelRoomId, p.id, msg.stats || {});
        } else if (p.mode === 'ffa' && ffaLobby.players.has(p.id)) {
          const slot = ffaLobby.players.get(p.id);
          slot.alive = false;
          if (msg.stats) {
            slot.apm = msg.stats.apm || slot.apm;
            slot.pps = msg.stats.pps || slot.pps;
            slot.linesCleared = msg.stats.linesCleared || slot.linesCleared;
            slot.attackSent = msg.stats.attackSent || slot.attackSent;
            slot.garbageReceived = msg.stats.garbageReceived || slot.garbageReceived;
            slot.maxCombo = Math.max(slot.maxCombo, msg.stats.maxCombo || 0);
          }
          checkFfaMatchEnd();
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const p = players.get(ws);
    if (!p) return;

    removeFromQueues(p.id);

    if (p.mode === 'duel' && p.duelRoomId) {
      const room = duelRooms.get(p.duelRoomId);
      if (room && room.active) {
        const winnerSlot = room.p1.id === p.id ? room.p2 : room.p1;
        const loserSlot = room.p1.id === p.id ? room.p1 : room.p2;
        concludeDuelMatch(room, winnerSlot, loserSlot, 'DISCONNECT_FORFEIT');
      }
    }

    players.delete(ws);
    broadcastHubState();
  });
});

server.listen(PORT, () => {
  console.log(`Project A^2 Server running on http://localhost:${PORT}`);
});
