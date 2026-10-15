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

// GitHub Repo Sync Configuration (For pushing player_data back to GitHub from Render)
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'BigL4202';
const GITHUB_REPO = process.env.GITHUB_REPO || 'tetris-ioTestServer';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // Add in Render Environment Variables for auto-commits

app.use(express.json());

// Ensure required directories exist on boot
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

// Serve static assets from public, root, and any resource folders
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
// PLAYER DATABASE & GITHUB REPOSITORY SYNC ENGINE (player_data/ folder)
// ============================================================================

let usersDB = {}; // lowerUsername -> UserObject

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

// Load local player_data/users.json on startup
function loadLocalUsersDB() {
  try {
    if (fs.existsSync(USERS_DB_FILE)) {
      const raw = fs.readFileSync(USERS_DB_FILE, 'utf8');
      usersDB = JSON.parse(raw);
      console.log(`[Project A^2] Loaded ${Object.keys(usersDB).length} player profiles from player_data/users.json`);
    } else {
      fs.writeFileSync(USERS_DB_FILE, JSON.stringify({}, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[Project A^2] Error reading users.json:', err.message);
    usersDB = {};
  }
}

loadLocalUsersDB();

// Push updated JSON files directly to the GitHub repository's player_data/ folder
async function syncFileToGitHub(repoRelativePath, contentString, commitMessage) {
  if (!GITHUB_TOKEN) return; // Silently skip remote push if no token is configured
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

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(bodyPayload)
    });

    if (putRes.ok) {
      console.log(`[GitHub Sync] Synced ${repoRelativePath} to ${GITHUB_OWNER}/${GITHUB_REPO}`);
    } else {
      const errText = await putRes.text();
      console.warn(`[GitHub Sync Warning] ${putRes.status}: ${errText}`);
    }
  } catch (err) {
    console.warn(`[GitHub Sync Error] ${err.message}`);
  }
}

// Pull player_data/users.json from GitHub on startup if Render restarted with a fresh disk
async function pullUsersFromGitHubOnBoot() {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/player_data/users.json`;
  try {
    const res = await fetch(rawUrl);
    if (res.ok) {
      const remoteUsers = await res.json();
      if (remoteUsers && typeof remoteUsers === 'object') {
        usersDB = { ...remoteUsers, ...usersDB };
        fs.writeFileSync(USERS_DB_FILE, JSON.stringify(usersDB, null, 2), 'utf8');
        console.log(`[Project A^2] Synced ${Object.keys(usersDB).length} accounts from GitHub player_data/users.json`);
      }
    }
  } catch (e) {}
}

pullUsersFromGitHubOnBoot();

let githubSyncTimeout = null;
function saveUserAndSync(userObj, triggerReason = 'Update player data') {
  if (!userObj || !userObj.username) return;
  const key = userObj.username.toLowerCase();
  userObj.updatedAt = new Date().toISOString();
  usersDB[key] = userObj;

  // 1. Write master player_data/users.json
  const masterJson = JSON.stringify(usersDB, null, 2);
  try {
    fs.writeFileSync(USERS_DB_FILE, masterJson, 'utf8');
  } catch (e) {}

  // 2. Write individual player_data/players/<username>.json
  const safeFile = key.replace(/[^a-z0-9_\-]/g, '_');
  const individualPath = path.join(INDIVIDUAL_PLAYERS_DIR, `${safeFile}.json`);
  const singleJson = JSON.stringify(userObj, null, 2);
  try {
    fs.writeFileSync(individualPath, singleJson, 'utf8');
  } catch (e) {}

  // 3. Push both to GitHub repository (debounced 2s so rapid updates batch cleanly)
  if (githubSyncTimeout) clearTimeout(githubSyncTimeout);
  githubSyncTimeout = setTimeout(() => {
    syncFileToGitHub(`player_data/players/${safeFile}.json`, singleJson, `[Project A^2] ${triggerReason}: ${userObj.username}`);
    syncFileToGitHub(`player_data/users.json`, JSON.stringify(usersDB, null, 2), `[Project A^2] Sync users.json (${userObj.username})`);
  }, 2000);
}

function createNewUserRecord(username, rawPassword) {
  return {
    username: username,
    passwordHash: hashPassword(rawPassword),
    passwordPlain: String(rawPassword), // Stored in player_data per request to track players & passwords
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    settings: {
      das: 115,
      arr: 10,
      sdf: 40,
      musicVolume: 40,
      sfxVolume: 75,
      bgInterval: 60,
      preferredCols: 4
    },
    stats: {
      gamesPlayed: 0,
      ffaWins: 0,
      duelWins: 0,
      duelLosses: 0,
      maxCombo: 0,
      totalLinesCleared: 0,
      totalAttackSent: 0,
      totalApmSum: 0,
      apmSamples: 0,
      avgApm: 0,
      totalReceivedSum: 0,
      receivedSamples: 0,
      avgReceived: 0
    },
    matchHistory: []
  };
}

function sanitizeUserForClient(u) {
  return {
    username: u.username,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
    settings: u.settings,
    stats: u.stats,
    matchHistory: (u.matchHistory || []).slice(-15)
  };
}

// ============================================================================
// AUTHENTICATION REST ENDPOINTS (/api/auth/register, /api/auth/login, etc.)
// ============================================================================

app.post('/api/auth/register', (req, res) => {
  const rawName = String(req.body.username || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 18);
  const rawPass = String(req.body.password || '');

  if (rawName.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters (letters, numbers, _ or -).' });
  }
  if (rawPass.length < 3) {
    return res.status(400).json({ error: 'Password must be at least 3 characters.' });
  }

  const key = rawName.toLowerCase();
  if (usersDB[key]) {
    return res.status(409).json({ error: 'Username is already registered. Please log in instead.' });
  }

  const newUser = createNewUserRecord(rawName, rawPass);
  saveUserAndSync(newUser, 'New Pilot Registered');

  return res.json({
    ok: true,
    user: sanitizeUserForClient(newUser)
  });
});

app.post('/api/auth/login', (req, res) => {
  const rawName = String(req.body.username || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 18);
  const rawPass = String(req.body.password || '');
  const key = rawName.toLowerCase();

  const existing = usersDB[key];
  if (!existing) {
    return res.status(404).json({ error: 'Pilot username not found. Click REGISTER to create this account.' });
  }

  const incomingHash = hashPassword(rawPass);
  if (existing.passwordHash !== incomingHash && existing.passwordPlain !== rawPass) {
    return res.status(401).json({ error: 'Incorrect password for this pilot.' });
  }

  existing.lastLogin = new Date().toISOString();
  saveUserAndSync(existing, 'Pilot Login');

  return res.json({
    ok: true,
    user: sanitizeUserForClient(existing)
  });
});

app.post('/api/auth/settings', (req, res) => {
  const rawName = String(req.body.username || '').trim().toLowerCase();
  const user = usersDB[rawName];
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (req.body.settings && typeof req.body.settings === 'object') {
    user.settings = {
      ...user.settings,
      ...req.body.settings
    };
    saveUserAndSync(user, 'Updated Handling/Audio Settings');
  }
  return res.json({ ok: true, settings: user.settings });
});

// ============================================================================
// DEEP RECURSIVE RESOURCE SCANNER + GITHUB FALLBACK (/api/resources)
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

  // If local folders are empty, automatically check the GitHub repository tree
  if (bgSet.size === 0 || musicSet.size === 0 || sfxSet.size === 0) {
    const ghFallback = await fetchGitHubResourcesFallback();
    if (ghFallback) {
      if (bgSet.size === 0) ghFallback.bg.forEach(u => bgSet.add(u));
      if (musicSet.size === 0) ghFallback.music.forEach(u => musicSet.add(u));
      if (sfxSet.size === 0) ghFallback.sfx.forEach(u => sfxSet.add(u));
    }
  }

  const manifest = {
    bg: Array.from(bgSet),
    music: Array.from(musicSet),
    sfx: Array.from(sfxSet)
  };

  console.log(`[Project A^2 Resources] BG: ${manifest.bg.length} | Music: ${manifest.music.length} | SFX: ${manifest.sfx.length}`);
  res.json(manifest);
});

// Fallback route for index.html (Prevents Render ENOENT errors)
app.get('*', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) {
    res.sendFile(publicIndex);
  } else if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else {
    res.status(404).send('Project A^2: index.html not found.');
  }
});

// ============================================================================
// MULTIPLAYER & PERSISTENT LEADERBOARD ENGINE
// ============================================================================

const players = new Map(); // ws -> PlayerSession
const challenges = new Map(); // challengeId -> ChallengeObj
const duelRooms = new Map(); // roomId -> DuelRoomObj

function ensurePlayerStatsRecord(username) {
  const key = username.toLowerCase();
  if (!usersDB[key]) {
    usersDB[key] = createNewUserRecord(username, 'guest_pass');
  }
  return usersDB[key];
}

function recordPlayerMatchStats(username, matchResult) {
  const userRec = ensurePlayerStatsRecord(username);
  const st = userRec.stats;

  st.gamesPlayed += 1;
  if (matchResult.ffaWin) st.ffaWins += 1;
  if (matchResult.duelWin) st.duelWins += 1;
  if (matchResult.duelLoss) st.duelLosses += 1;
  if (matchResult.linesCleared) st.totalLinesCleared += Number(matchResult.linesCleared) || 0;
  if (matchResult.attackSent) st.totalAttackSent += Number(matchResult.attackSent) || 0;

  if (matchResult.maxCombo && matchResult.maxCombo > st.maxCombo) {
    st.maxCombo = matchResult.maxCombo;
  }

  if (typeof matchResult.apm === 'number' && !isNaN(matchResult.apm)) {
    st.totalApmSum += matchResult.apm;
    st.apmSamples += 1;
    st.avgApm = Number((st.totalApmSum / st.apmSamples).toFixed(1));
  }

  if (typeof matchResult.garbageReceived === 'number' && !isNaN(matchResult.garbageReceived)) {
    st.totalReceivedSum += matchResult.garbageReceived;
    st.receivedSamples += 1;
    st.avgReceived = Number((st.totalReceivedSum / st.receivedSamples).toFixed(1));
  }

  userRec.matchHistory = userRec.matchHistory || [];
  userRec.matchHistory.push({
    date: new Date().toISOString(),
    mode: matchResult.mode || 'zen',
    opponent: matchResult.opponent || null,
    result: matchResult.duelWin ? 'WIN' : (matchResult.duelLoss ? 'LOSS' : 'COMPLETE'),
    score: matchResult.scoreStr || null,
    apm: matchResult.apm || 0,
    maxCombo: matchResult.maxCombo || 0,
    garbageReceived: matchResult.garbageReceived || 0
  });

  if (userRec.matchHistory.length > 50) {
    userRec.matchHistory = userRec.matchHistory.slice(-50);
  }

  saveUserAndSync(userRec, `Match Recorded (${matchResult.mode || 'game'})`);
}

function getCompiledLeaderboards() {
  const allUsers = Object.values(usersDB).map(u => ({
    username: u.username,
    gamesPlayed: u.stats.gamesPlayed || 0,
    ffaWins: u.stats.ffaWins || 0,
    duelWins: u.stats.duelWins || 0,
    duelLosses: u.stats.duelLosses || 0,
    maxCombo: u.stats.maxCombo || 0,
    avgApm: u.stats.avgApm || 0,
    avgReceived: u.stats.avgReceived || 0
  }));

  return {
    byApm: [...allUsers].sort((a, b) => b.avgApm - a.avgApm).slice(0, 25),
    byWins: [...allUsers].sort((a, b) => (b.ffaWins + b.duelWins) - (a.ffaWins + a.duelWins)).slice(0, 25),
    byCombo: [...allUsers].sort((a, b) => b.maxCombo - a.maxCombo).slice(0, 25),
    byDuels: [...allUsers].sort((a, b) => {
      if (b.duelWins !== a.duelWins) return b.duelWins - a.duelWins;
      return a.duelLosses - b.duelLosses;
    }).slice(0, 25)
  };
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

function broadcastOnlineList() {
  const list = [];
  for (const [, p] of players.entries()) {
    if (!p.authenticated) continue;
    const uRec = ensurePlayerStatsRecord(p.username);
    list.push({
      id: p.id,
      username: p.username,
      mode: p.mode,
      boardCols: p.boardCols || 4,
      inDuel: p.mode === 'duel',
      avgApm: uRec.stats.avgApm,
      duelWins: uRec.stats.duelWins,
      duelLosses: uRec.stats.duelLosses
    });
  }
  broadcastAll({
    type: 'online_list',
    players: list,
    leaderboards: getCompiledLeaderboards()
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

function clearPlayerChallenges(playerId, reason) {
  for (const [cid, ch] of challenges.entries()) {
    if (ch.fromId === playerId || ch.toId === playerId) {
      clearTimeout(ch.timer);
      challenges.delete(cid);
      sendToPlayer(ch.fromId, { type: 'challenge_cleared', id: cid, reason });
      sendToPlayer(ch.toId, { type: 'challenge_cleared', id: cid, reason });
    }
  }
}

// ============================================================================
// 1v1 DUEL MATCH ENGINE (First to 6, Win by 2)
// ============================================================================

function startDuelRoom(p1, p2, boardCols) {
  const roomId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  clearPlayerChallenges(p1.id, 'Entered a 1v1 Duel');
  clearPlayerChallenges(p2.id, 'Entered a 1v1 Duel');

  p1.mode = 'duel';
  p1.duelRoomId = roomId;
  p1.boardCols = boardCols;

  p2.mode = 'duel';
  p2.duelRoomId = roomId;
  p2.boardCols = boardCols;

  const room = {
    id: roomId,
    boardCols,
    p1: { id: p1.id, username: p1.username, score: 0, alive: true, apm: 0, pps: 0, garbageReceived: 0, maxCombo: 0, linesCleared: 0, attackSent: 0 },
    p2: { id: p2.id, username: p2.username, score: 0, alive: true, apm: 0, pps: 0, garbageReceived: 0, maxCombo: 0, linesCleared: 0, attackSent: 0 },
    round: 1,
    active: true,
    roundInProgress: false
  };

  duelRooms.set(roomId, room);
  broadcastOnlineList();

  systemChatBroadcast(
    `[1v1 DUEL STARTED] ${p1.username} vs ${p2.username} (${boardCols}x26 Matrix | FT6 Win-by-2)!`,
    'duel-announce'
  );

  const initPayload = {
    type: 'duel_init',
    roomId: room.id,
    boardCols: room.boardCols,
    p1: { id: p1.id, username: p1.username, score: 0 },
    p2: { id: p2.id, username: p2.username, score: 0 },
    round: 1
  };

  sendToPlayer(p1.id, initPayload);
  sendToPlayer(p2.id, initPayload);

  scheduleDuelRoundStart(roomId, 3000);
}

function scheduleDuelRoundStart(roomId, delayMs) {
  setTimeout(() => {
    const room = duelRooms.get(roomId);
    if (!room || !room.active) return;

    room.p1.alive = true;
    room.p2.alive = true;
    room.roundInProgress = true;
    const seed = Math.floor(Math.random() * 2147483647);

    const startPayload = {
      type: 'duel_round_start',
      roomId: room.id,
      round: room.round,
      seed,
      boardCols: room.boardCols,
      p1Score: room.p1.score,
      p2Score: room.p2.score
    };

    sendToPlayer(room.p1.id, startPayload);
    sendToPlayer(room.p2.id, startPayload);
  }, delayMs);
}

function checkDuelSetWin(scoreA, scoreB) {
  return scoreA >= 6 && (scoreA - scoreB) >= 2;
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
    loserSlot.apm = finalStats.apm || loserSlot.apm;
    loserSlot.garbageReceived = finalStats.garbageReceived || loserSlot.garbageReceived;
    loserSlot.maxCombo = Math.max(loserSlot.maxCombo, finalStats.maxCombo || 0);
    loserSlot.linesCleared += finalStats.linesCleared || 0;
    loserSlot.attackSent += finalStats.attackSent || 0;
  }

  if (checkDuelSetWin(winnerSlot.score, loserSlot.score)) {
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

    systemChatBroadcast(
      `[DUEL R${room.round}] ${winnerSlot.username} takes the round! Score: ${room.p1.username} (${room.p1.score}) - (${room.p2.score}) ${room.p2.username}`,
      'duel-round'
    );

    room.round += 1;
    scheduleDuelRoundStart(room.id, 3500);
  }
}

function concludeDuelMatch(room, winnerSlot, loserSlot, reason) {
  if (!room.active) return;
  room.active = false;
  room.roundInProgress = false;

  const scoreStr = `${winnerSlot.score}-${loserSlot.score}`;

  recordPlayerMatchStats(winnerSlot.username, {
    mode: '1v1_duel',
    opponent: loserSlot.username,
    scoreStr,
    duelWin: true,
    duelLoss: false,
    apm: winnerSlot.apm,
    garbageReceived: winnerSlot.garbageReceived,
    maxCombo: winnerSlot.maxCombo,
    linesCleared: winnerSlot.linesCleared,
    attackSent: winnerSlot.attackSent
  });

  recordPlayerMatchStats(loserSlot.username, {
    mode: '1v1_duel',
    opponent: winnerSlot.username,
    scoreStr,
    duelWin: false,
    duelLoss: true,
    apm: loserSlot.apm,
    garbageReceived: loserSlot.garbageReceived,
    maxCombo: loserSlot.maxCombo,
    linesCleared: loserSlot.linesCleared,
    attackSent: loserSlot.attackSent
  });

  const p1Obj = getPlayerById(room.p1.id);
  const p2Obj = getPlayerById(room.p2.id);
  if (p1Obj) {
    p1Obj.mode = 'zen';
    p1Obj.duelRoomId = null;
  }
  if (p2Obj) {
    p2Obj.mode = 'zen';
    p2Obj.duelRoomId = null;
  }

  const endPayload = {
    type: 'duel_match_over',
    roomId: room.id,
    winnerId: winnerSlot.id,
    winnerName: winnerSlot.username,
    loserId: loserSlot.id,
    loserName: loserSlot.username,
    p1Score: room.p1.score,
    p2Score: room.p2.score,
    reason
  };

  sendToPlayer(room.p1.id, endPayload);
  sendToPlayer(room.p2.id, endPayload);

  if (reason === 'DISCONNECT_FORFEIT') {
    systemChatBroadcast(
      `[1v1 DUEL FORFEIT] ${loserSlot.username} disconnected/forfeited! ${winnerSlot.username} wins the set (${room.p1.score}-${room.p2.score})!`,
      'duel-win'
    );
  } else {
    systemChatBroadcast(
      `[1v1 DUEL VICTORY] ${winnerSlot.username} defeated ${loserSlot.username} (${room.p1.score}-${room.p2.score}) in FT6 Win-by-2!`,
      'duel-win'
    );
  }

  duelRooms.delete(room.id);
  broadcastOnlineList();
}

// ============================================================================
// WEBSOCKET CONNECTION HANDLER
// ============================================================================

wss.on('connection', (ws) => {
  const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const playerState = {
    id: playerId,
    ws,
    username: `Guest_${Math.floor(1000 + Math.random() * 9000)}`,
    authenticated: false,
    mode: 'zen',
    boardCols: 4,
    duelRoomId: null
  };

  players.set(ws, playerState);

  ws.send(JSON.stringify({
    type: 'welcome',
    id: playerId,
    leaderboards: getCompiledLeaderboards()
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
          const uRec = ensurePlayerStatsRecord(p.username);
          if (msg.boardCols === 4 || msg.boardCols === 10) {
            p.boardCols = msg.boardCols;
          } else if (uRec.settings && uRec.settings.preferredCols) {
            p.boardCols = uRec.settings.preferredCols;
          }
          ws.send(JSON.stringify({
            type: 'profile_updated',
            username: p.username,
            boardCols: p.boardCols,
            mode: p.mode,
            stats: uRec.stats
          }));
          broadcastOnlineList();
        }
        break;
      }

      case 'set_profile': {
        if (msg.boardCols === 4 || msg.boardCols === 10) {
          if (p.mode !== 'duel') p.boardCols = msg.boardCols;
        }
        if (msg.mode && ['zen', 'ffa'].includes(msg.mode) && p.mode !== 'duel') {
          p.mode = msg.mode;
        }
        const uRec = ensurePlayerStatsRecord(p.username);
        uRec.settings.preferredCols = p.boardCols;
        saveUserAndSync(uRec, 'Updated Matrix Mode');

        ws.send(JSON.stringify({
          type: 'profile_updated',
          username: p.username,
          boardCols: p.boardCols,
          mode: p.mode,
          stats: uRec.stats
        }));
        broadcastOnlineList();
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

      case 'send_challenge': {
        if (!p.authenticated) return;
        if (p.mode === 'duel') {
          ws.send(JSON.stringify({ type: 'error_msg', text: 'You are already in an active 1v1 Duel.' }));
          return;
        }

        for (const [, ch] of challenges.entries()) {
          if (ch.fromId === p.id) {
            ws.send(JSON.stringify({ type: 'error_msg', text: 'You already have an active challenge pending (max 1 at a time).' }));
            return;
          }
        }

        const target = getPlayerById(msg.targetId);
        if (!target || target.id === p.id || !target.authenticated) {
          ws.send(JSON.stringify({ type: 'error_msg', text: 'Target pilot is unavailable.' }));
          return;
        }
        if (target.mode === 'duel') {
          ws.send(JSON.stringify({ type: 'error_msg', text: `${target.username} is currently in a 1v1 Duel.` }));
          return;
        }

        const chosenCols = (msg.boardCols === 10) ? 10 : 4;
        const challengeId = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        const timer = setTimeout(() => {
          if (challenges.has(challengeId)) {
            challenges.delete(challengeId);
            sendToPlayer(p.id, { type: 'challenge_expired', id: challengeId, text: `Challenge to ${target.username} expired (60s).` });
            sendToPlayer(target.id, { type: 'challenge_expired', id: challengeId, text: `Challenge from ${p.username} expired.` });
          }
        }, 60000);

        const chObj = {
          id: challengeId,
          fromId: p.id,
          fromName: p.username,
          toId: target.id,
          toName: target.username,
          boardCols: chosenCols,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          timer
        };

        challenges.set(challengeId, chObj);

        sendToPlayer(p.id, {
          type: 'challenge_sent',
          challenge: { id: chObj.id, toId: chObj.toId, toName: chObj.toName, boardCols: chObj.boardCols, expiresAt: chObj.expiresAt }
        });

        sendToPlayer(target.id, {
          type: 'challenge_received',
          challenge: { id: chObj.id, fromId: chObj.fromId, fromName: chObj.fromName, boardCols: chObj.boardCols, expiresAt: chObj.expiresAt }
        });

        systemChatBroadcast(`${p.username} challenged ${target.username} to a ${chosenCols}x26 1v1 Duel!`, 'challenge');
        break;
      }

      case 'respond_challenge': {
        const ch = challenges.get(msg.challengeId);
        if (!ch || ch.toId !== p.id) return;

        clearTimeout(ch.timer);
        challenges.delete(ch.id);

        const challenger = getPlayerById(ch.fromId);
        if (!challenger) {
          ws.send(JSON.stringify({ type: 'error_msg', text: 'Challenger went offline.' }));
          return;
        }

        if (!msg.accept) {
          sendToPlayer(challenger.id, { type: 'challenge_declined', byName: p.username });
          sendToPlayer(p.id, { type: 'challenge_cleared', id: ch.id, reason: 'Declined' });
          return;
        }

        if (challenger.mode === 'duel' || p.mode === 'duel') {
          ws.send(JSON.stringify({ type: 'error_msg', text: 'One of the pilots is already in a duel.' }));
          return;
        }

        startDuelRoom(challenger, p, ch.boardCols);
        break;
      }

      case 'cancel_challenge': {
        clearPlayerChallenges(p.id, 'Cancelled by sender');
        break;
      }

      case 'board_sync': {
        if (p.mode === 'duel' && p.duelRoomId) {
          const room = duelRooms.get(p.duelRoomId);
          if (room && room.active) {
            const slot = room.p1.id === p.id ? room.p1 : room.p2;
            const oppSlot = room.p1.id === p.id ? room.p2 : room.p1;
            slot.apm = msg.apm || 0;
            slot.pps = msg.pps || 0;
            slot.garbageReceived = msg.garbageReceived || 0;
            slot.maxCombo = Math.max(slot.maxCombo, msg.maxCombo || 0);

            sendToPlayer(oppSlot.id, {
              type: 'opponent_sync',
              fromId: p.id,
              username: p.username,
              grid: msg.grid,
              activePiece: msg.activePiece,
              holdPiece: msg.holdPiece,
              nextQueue: msg.nextQueue,
              garbageQueue: msg.garbageQueue,
              apm: msg.apm,
              pps: msg.pps,
              vsScore: msg.vsScore,
              b2b: msg.b2b,
              combo: msg.combo
            });
          }
        } else if (p.mode === 'ffa') {
          for (const [clientWs, other] of players.entries()) {
            if (other.id !== p.id && other.mode === 'ffa' && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'opponent_sync',
                fromId: p.id,
                username: p.username,
                grid: msg.grid,
                activePiece: msg.activePiece,
                holdPiece: msg.holdPiece,
                nextQueue: msg.nextQueue,
                garbageQueue: msg.garbageQueue,
                apm: msg.apm,
                pps: msg.pps,
                vsScore: msg.vsScore,
                b2b: msg.b2b,
                combo: msg.combo
              }));
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
            const targetId = (room.p1.id === p.id) ? room.p2.id : room.p1.id;
            sendToPlayer(targetId, {
              type: 'receive_garbage',
              lines,
              fromName: p.username
            });
          }
        } else if (p.mode === 'ffa') {
          const ffaTargets = [];
          for (const [, other] of players.entries()) {
            if (other.id !== p.id && other.mode === 'ffa') {
              ffaTargets.push(other);
            }
          }
          if (ffaTargets.length > 0) {
            const chosen = ffaTargets[Math.floor(Math.random() * ffaTargets.length)];
            sendToPlayer(chosen.id, {
              type: 'receive_garbage',
              lines,
              fromName: p.username
            });
          }
        }
        break;
      }

      case 'player_topout': {
        if (p.mode === 'duel' && p.duelRoomId) {
          handleDuelTopOut(p.duelRoomId, p.id, msg.stats || {});
        } else if (p.authenticated) {
          recordPlayerMatchStats(p.username, {
            mode: p.mode,
            ffaWin: Boolean(msg.stats && msg.stats.ffaWin),
            apm: msg.stats ? msg.stats.apm : 0,
            garbageReceived: msg.stats ? msg.stats.garbageReceived : 0,
            maxCombo: msg.stats ? msg.stats.maxCombo : 0,
            linesCleared: msg.stats ? msg.stats.linesCleared : 0,
            attackSent: msg.stats ? msg.stats.attackSent : 0
          });
          broadcastOnlineList();
        }
        break;
      }

      case 'forfeit_duel': {
        if (p.mode === 'duel' && p.duelRoomId) {
          const room = duelRooms.get(p.duelRoomId);
          if (room && room.active) {
            const winnerSlot = (room.p1.id === p.id) ? room.p2 : room.p1;
            const loserSlot = (room.p1.id === p.id) ? room.p1 : room.p2;
            concludeDuelMatch(room, winnerSlot, loserSlot, 'DISCONNECT_FORFEIT');
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const p = players.get(ws);
    if (!p) return;

    clearPlayerChallenges(p.id, 'Player disconnected');

    if (p.mode === 'duel' && p.duelRoomId) {
      const room = duelRooms.get(p.duelRoomId);
      if (room && room.active) {
        const winnerSlot = (room.p1.id === p.id) ? room.p2 : room.p1;
        const loserSlot = (room.p1.id === p.id) ? room.p1 : room.p2;
        concludeDuelMatch(room, winnerSlot, loserSlot, 'DISCONNECT_FORFEIT');
      }
    }

    players.delete(ws);
    broadcastOnlineList();
  });
});

server.listen(PORT, () => {
  console.log(`Project A^2 Server running on http://localhost:${PORT}`);
});
