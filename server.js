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
const MASTER_ADMIN_USERNAME = 'bigl_';

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'BigL4202';
const GITHUB_REPO = process.env.GITHUB_REPO || 'tetris-ioTestServer';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

app.use(express.json({ limit: '2mb' }));

const PLAYER_DATA_DIR = path.join(__dirname, 'player_data');
const INDIVIDUAL_PLAYERS_DIR = path.join(PLAYER_DATA_DIR, 'players');
const USERS_DB_FILE = path.join(PLAYER_DATA_DIR, 'users.json');
const MODERATION_REGISTRY_FILE = path.join(PLAYER_DATA_DIR, 'moderation_registry.json');

const TOURNAMENT_DATA_DIR = path.join(__dirname, 'tournament_data');
const TOURNAMENTS_DB_FILE = path.join(TOURNAMENT_DATA_DIR, 'tournaments.json');

[
  PLAYER_DATA_DIR,
  INDIVIDUAL_PLAYERS_DIR,
  TOURNAMENT_DATA_DIR,
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
// DEFAULT KEYBINDS, COLORS, MODERATION REGISTRY & PLAYER DATABASE
// ============================================================================

const DEFAULT_KEYBINDS = {
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  rotateCW: 'ArrowUp',
  rotateCCW: 'KeyZ',
  rotate180: 'KeyA',
  softDrop: 'ArrowDown',
  hardDrop: 'Space',
  hold: 'ShiftLeft',
  restart: 'KeyR'
};

const DEFAULT_CUSTOM_COLORS = {
  accentR: 0,   accentG: 229, accentB: 255,
  menuR: 12,    menuG: 19,    menuB: 33,
  btnBgR: 25,   btnBgG: 40,   btnBgB: 68,
  btnTxtR: 230, btnTxtG: 241, btnTxtB: 255
};

let usersDB = {};
let moderationRegistry = {};
let tournamentsDB = [];

function isAdminUser(username) {
  return String(username || '').trim().toLowerCase() === MASTER_ADMIN_USERNAME;
}

function isModeratorUser(username) {
  const low = String(username || '').trim().toLowerCase();
  if (low === MASTER_ADMIN_USERNAME) return true;
  const u = usersDB[low];
  return Boolean(u && u.isModerator);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function calculateLevel(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  return Math.min(100, Math.floor(Math.sqrt(safeXp / 80)) + 1);
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function createDefaultDailyChallenges(dateStr = getTodayDateKey()) {
  return {
    date: dateStr,
    challenges: [
      { id: 'lines_40', title: 'Clear 40 Lines in Any Mode', progress: 0, target: 40, rewardXp: 200, claimed: false },
      { id: 'combo_6',  title: 'Reach a 6x Combo or Higher', progress: 0, target: 6,  rewardXp: 250, claimed: false },
      { id: 'matches_2',title: 'Finish 2 Multiplayer, Sprint or APM Matches', progress: 0, target: 2, rewardXp: 300, claimed: false }
    ]
  };
}

function normalizeUserRecord(u) {
  if (!u || typeof u !== 'object') u = {};
  u.isModerator = Boolean(u.isModerator);

  if (!u.settings) u.settings = {};
  u.settings.musicVolume = typeof u.settings.musicVolume === 'number' ? u.settings.musicVolume : 40;
  u.settings.sfxVolume = typeof u.settings.sfxVolume === 'number' ? u.settings.sfxVolume : 75;
  u.settings.bgInterval = typeof u.settings.bgInterval === 'number' ? u.settings.bgInterval : 180;
  u.settings.boardShake = typeof u.settings.boardShake === 'boolean' ? u.settings.boardShake : true;
  u.settings.lockFlash = typeof u.settings.lockFlash === 'boolean' ? u.settings.lockFlash : true;
  u.settings.blockSkin = u.settings.blockSkin || 'bevel';
  u.settings.ghostStyle = u.settings.ghostStyle || 'fill';
  u.settings.lockedBg = u.settings.lockedBg || 'shuffle';
  u.settings.customColors = { ...DEFAULT_CUSTOM_COLORS, ...(u.settings.customColors || {}) };
  u.settings.keybinds = { ...DEFAULT_KEYBINDS, ...(u.settings.keybinds || {}) };

  if (!u.moderation) u.moderation = {};
  u.moderation.banned = Boolean(u.moderation.banned);
  u.moderation.banReason = u.moderation.banReason || '';
  u.moderation.timeoutUntil = Number(u.moderation.timeoutUntil) || 0;
  u.moderation.mutedUntil = Number(u.moderation.mutedUntil) || 0;
  u.moderation.updatedAt = Number(u.moderation.updatedAt) || 0;

  const lowKey = String(u.username || '').toLowerCase();
  if (lowKey && moderationRegistry[lowKey]) {
    const reg = moderationRegistry[lowKey];
    if ((reg.updatedAt || 0) >= (u.moderation.updatedAt || 0)) {
      u.isModerator = Boolean(reg.isModerator);
      u.moderation.banned = Boolean(reg.banned);
      u.moderation.banReason = reg.banReason || '';
      u.moderation.timeoutUntil = Number(reg.timeoutUntil) || 0;
      u.moderation.mutedUntil = Number(reg.mutedUntil) || 0;
      u.moderation.updatedAt = Number(reg.updatedAt) || Date.now();
    }
  }

  if (!u.stats) u.stats = {};
  u.stats.xp = Math.max(0, Number(u.stats.xp) || 0);
  u.stats.level = calculateLevel(u.stats.xp);
  u.stats.gamesPlayed = Math.max(0, Number(u.stats.gamesPlayed) || 0);
  u.stats.zenLines = Math.max(0, Number(u.stats.zenLines) || 0);
  u.stats.apmTestBest = Math.max(0, Number(u.stats.apmTestBest) || 0);
  u.stats.apmTestLast = Math.max(0, Number(u.stats.apmTestLast) || 0);
  u.stats.sprint40Best = Number(u.stats.sprint40Best) > 0 ? Number(u.stats.sprint40Best) : 0; // 0 = no record yet, lower is better
  u.stats.sprint40Last = Number(u.stats.sprint40Last) > 0 ? Number(u.stats.sprint40Last) : 0;
  u.stats.ffaWins = Math.max(0, Number(u.stats.ffaWins) || 0);
  u.stats.duelWins = Math.max(0, Number(u.stats.duelWins) || 0);
  u.stats.duelLosses = Math.max(0, Number(u.stats.duelLosses) || 0);
  u.stats.teamWins = Math.max(0, Number(u.stats.teamWins) || 0);
  u.stats.teamLosses = Math.max(0, Number(u.stats.teamLosses) || 0);
  u.stats.tournamentWins = Math.max(0, Number(u.stats.tournamentWins) || 0);
  u.stats.maxCombo = Math.max(0, Number(u.stats.maxCombo) || 0);
  u.stats.totalLinesCleared = Math.max(0, Number(u.stats.totalLinesCleared) || 0);
  u.stats.totalAttackSent = Math.max(0, Number(u.stats.totalAttackSent) || 0);
  u.stats.totalReceivedSum = Math.max(0, Number(u.stats.totalReceivedSum) || 0);
  u.stats.receivedSamples = Math.max(0, Number(u.stats.receivedSamples) || 0);
  u.stats.avgReceived = Math.max(0, Number(u.stats.avgReceived) || 0);

  if (!u.replays || typeof u.replays !== 'object') {
    u.replays = { apmTest: null, sprint40: null };
  }

  if (!u.headToHead || typeof u.headToHead !== 'object') {
    u.headToHead = {};
  }

  const today = getTodayDateKey();
  if (!u.dailyChallenges || u.dailyChallenges.date !== today || !Array.isArray(u.dailyChallenges.challenges)) {
    u.dailyChallenges = createDefaultDailyChallenges(today);
  }

  if (!Array.isArray(u.matchHistory)) u.matchHistory = [];
  return u;
}

function createNewUserRecord(username, rawPassword) {
  return normalizeUserRecord({
    username: username,
    isModerator: false,
    passwordHash: hashPassword(rawPassword),
    passwordPlain: String(rawPassword),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    moderation: {
      banned: false,
      banReason: '',
      timeoutUntil: 0,
      mutedUntil: 0,
      updatedAt: Date.now()
    },
    settings: {
      musicVolume: 40,
      sfxVolume: 75,
      bgInterval: 180,
      boardShake: true,
      lockFlash: true,
      blockSkin: 'bevel',
      ghostStyle: 'fill',
      lockedBg: 'shuffle',
      customColors: { ...DEFAULT_CUSTOM_COLORS },
      keybinds: { ...DEFAULT_KEYBINDS }
    },
    stats: {
      xp: 0,
      level: 1,
      gamesPlayed: 0,
      zenLines: 0,
      apmTestBest: 0,
      apmTestLast: 0,
      sprint40Best: 0,
      sprint40Last: 0,
      ffaWins: 0,
      duelWins: 0,
      duelLosses: 0,
      teamWins: 0,
      teamLosses: 0,
      tournamentWins: 0,
      maxCombo: 0,
      totalLinesCleared: 0,
      totalAttackSent: 0,
      totalReceivedSum: 0,
      receivedSamples: 0,
      avgReceived: 0
    },
    replays: { apmTest: null, sprint40: null },
    headToHead: {},
    dailyChallenges: createDefaultDailyChallenges(),
    matchHistory: []
  });
}

// ============================================================================
// BULLETPROOF GITHUB REPOSITORY PERSISTENCE
// ============================================================================

function mergeTwoUserRecords(a, b) {
  if (!a) return normalizeUserRecord(b);
  if (!b) return normalizeUserRecord(a);
  const normA = normalizeUserRecord(a);
  const normB = normalizeUserRecord(b);

  const timeA = Date.parse(normA.updatedAt || 0) || 0;
  const timeB = Date.parse(normB.updatedAt || 0) || 0;
  const newer = timeB >= timeA ? normB : normA;
  const older = timeB >= timeA ? normA : normB;

  const modTimeA = normA.moderation.updatedAt || timeA;
  const modTimeB = normB.moderation.updatedAt || timeB;
  const newerMod = modTimeB >= modTimeA ? normB.moderation : normA.moderation;
  const newerIsMod = modTimeB >= modTimeA ? normB.isModerator : normA.isModerator;

  let bestSprint = 0;
  if (normA.stats.sprint40Best > 0 && normB.stats.sprint40Best > 0) {
    bestSprint = Math.min(normA.stats.sprint40Best, normB.stats.sprint40Best);
  } else {
    bestSprint = normA.stats.sprint40Best || normB.stats.sprint40Best || 0;
  }

  const merged = {
    ...older,
    ...newer,
    isModerator: Boolean(newerIsMod),
    moderation: { ...newerMod },
    stats: {
      ...newer.stats,
      xp: Math.max(normA.stats.xp || 0, normB.stats.xp || 0),
      gamesPlayed: Math.max(normA.stats.gamesPlayed || 0, normB.stats.gamesPlayed || 0),
      zenLines: Math.max(normA.stats.zenLines || 0, normB.stats.zenLines || 0),
      apmTestBest: Math.max(normA.stats.apmTestBest || 0, normB.stats.apmTestBest || 0),
      sprint40Best: bestSprint,
      ffaWins: Math.max(normA.stats.ffaWins || 0, normB.stats.ffaWins || 0),
      duelWins: Math.max(normA.stats.duelWins || 0, normB.stats.duelWins || 0),
      duelLosses: Math.max(normA.stats.duelLosses || 0, normB.stats.duelLosses || 0),
      teamWins: Math.max(normA.stats.teamWins || 0, normB.stats.teamWins || 0),
      teamLosses: Math.max(normA.stats.teamLosses || 0, normB.stats.teamLosses || 0),
      tournamentWins: Math.max(normA.stats.tournamentWins || 0, normB.stats.tournamentWins || 0),
      maxCombo: Math.max(normA.stats.maxCombo || 0, normB.stats.maxCombo || 0)
    },
    replays: {
      apmTest: (newer.replays && newer.replays.apmTest) || (older.replays && older.replays.apmTest) || null,
      sprint40: (newer.replays && newer.replays.sprint40) || (older.replays && older.replays.sprint40) || null
    },
    headToHead: { ...(older.headToHead || {}), ...(newer.headToHead || {}) }
  };
  return normalizeUserRecord(merged);
}

function loadLocalDatabases() {
  try {
    if (fs.existsSync(MODERATION_REGISTRY_FILE)) {
      moderationRegistry = JSON.parse(fs.readFileSync(MODERATION_REGISTRY_FILE, 'utf8') || '{}');
    }
  } catch (e) {
    moderationRegistry = {};
  }

  try {
    if (fs.existsSync(USERS_DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(USERS_DB_FILE, 'utf8') || '{}');
      for (const k of Object.keys(parsed)) {
        usersDB[k.toLowerCase()] = normalizeUserRecord(parsed[k]);
      }
    }
    if (fs.existsSync(INDIVIDUAL_PLAYERS_DIR)) {
      const files = fs.readdirSync(INDIVIDUAL_PLAYERS_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const singleObj = normalizeUserRecord(JSON.parse(fs.readFileSync(path.join(INDIVIDUAL_PLAYERS_DIR, file), 'utf8')));
          if (singleObj && singleObj.username) {
            const key = singleObj.username.toLowerCase();
            usersDB[key] = mergeTwoUserRecords(usersDB[key], singleObj);
          }
        } catch (e) {}
      }
    }
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify(usersDB, null, 2), 'utf8');
  } catch (err) {
    console.error('[Project A^2] Error loading users.json:', err.message);
  }

  try {
    if (fs.existsSync(TOURNAMENTS_DB_FILE)) {
      const rawT = JSON.parse(fs.readFileSync(TOURNAMENTS_DB_FILE, 'utf8') || '[]');
      if (Array.isArray(rawT)) tournamentsDB = rawT;
    } else {
      fs.writeFileSync(TOURNAMENTS_DB_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (err) {
    tournamentsDB = [];
  }
}

let githubPushQueue = Promise.resolve();

function syncFileToGitHub(repoRelativePath, contentString, commitMessage) {
  if (!GITHUB_TOKEN) return Promise.resolve();
  githubPushQueue = githubPushQueue.then(async () => {
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
  });
  return githubPushQueue;
}

async function fetchJsonFromGitHubRepo(repoRelativePath) {
  const headers = { 'User-Agent': 'Project-A2-Server' };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    headers['Accept'] = 'application/vnd.github+json';
  }
  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoRelativePath}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(apiUrl, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data && data.content) {
        const decoded = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(decoded);
      }
    }
  } catch (e) {}

  try {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${repoRelativePath}?t=${Date.now()}`;
    const res2 = await fetch(rawUrl);
    if (res2.ok) return await res2.json();
  } catch (e) {}
  return null;
}

async function pullDatabasesFromGitHubOnBoot() {
  const remoteModReg = await fetchJsonFromGitHubRepo('player_data/moderation_registry.json');
  if (remoteModReg && typeof remoteModReg === 'object') {
    for (const k of Object.keys(remoteModReg)) {
      const low = k.toLowerCase();
      if (!moderationRegistry[low] || (remoteModReg[k].updatedAt || 0) >= (moderationRegistry[low].updatedAt || 0)) {
        moderationRegistry[low] = remoteModReg[k];
      }
    }
    try {
      fs.writeFileSync(MODERATION_REGISTRY_FILE, JSON.stringify(moderationRegistry, null, 2), 'utf8');
    } catch (e) {}
  }

  const remoteUsers = await fetchJsonFromGitHubRepo('player_data/users.json');
  if (remoteUsers && typeof remoteUsers === 'object') {
    for (const k of Object.keys(remoteUsers)) {
      const low = k.toLowerCase();
      usersDB[low] = mergeTwoUserRecords(usersDB[low], remoteUsers[k]);
    }
  }

  for (const k of Object.keys(usersDB)) {
    usersDB[k] = normalizeUserRecord(usersDB[k]);
  }
  try {
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify(usersDB, null, 2), 'utf8');
  } catch (e) {}

  const remoteTourneys = await fetchJsonFromGitHubRepo('tournament_data/tournaments.json');
  if (Array.isArray(remoteTourneys) && remoteTourneys.length >= tournamentsDB.length) {
    tournamentsDB = remoteTourneys;
    try {
      fs.writeFileSync(TOURNAMENTS_DB_FILE, JSON.stringify(tournamentsDB, null, 2), 'utf8');
    } catch (e) {}
  }
}

let githubUserSyncTimeout = null;
function saveUserAndSync(userObj, triggerReason = 'Update player data', immediateModerationSync = false) {
  if (!userObj || !userObj.username) return;
  const key = userObj.username.toLowerCase();

  moderationRegistry[key] = {
    username: userObj.username,
    isModerator: Boolean(userObj.isModerator),
    banned: Boolean(userObj.moderation && userObj.moderation.banned),
    banReason: (userObj.moderation && userObj.moderation.banReason) || '',
    timeoutUntil: Number(userObj.moderation && userObj.moderation.timeoutUntil) || 0,
    mutedUntil: Number(userObj.moderation && userObj.moderation.mutedUntil) || 0,
    updatedAt: (userObj.moderation && userObj.moderation.updatedAt) || Date.now()
  };

  normalizeUserRecord(userObj);
  userObj.updatedAt = new Date().toISOString();
  usersDB[key] = userObj;

  const masterJson = JSON.stringify(usersDB, null, 2);
  const modJson = JSON.stringify(moderationRegistry, null, 2);
  try {
    fs.writeFileSync(USERS_DB_FILE, masterJson, 'utf8');
    fs.writeFileSync(MODERATION_REGISTRY_FILE, modJson, 'utf8');
  } catch (e) {}

  const safeFile = key.replace(/[^a-z0-9_\-]/g, '_');
  const individualPath = path.join(INDIVIDUAL_PLAYERS_DIR, `${safeFile}.json`);
  const singleJson = JSON.stringify(userObj, null, 2);
  try {
    fs.writeFileSync(individualPath, singleJson, 'utf8');
  } catch (e) {}

  if (immediateModerationSync) {
    syncFileToGitHub(`player_data/moderation_registry.json`, modJson, `[Project A^2 Moderation] ${triggerReason}: ${userObj.username}`);
    syncFileToGitHub(`player_data/users.json`, masterJson, `[Project A^2] Sync users.json (${userObj.username})`);
    syncFileToGitHub(`player_data/players/${safeFile}.json`, singleJson, `[Project A^2] ${triggerReason}: ${userObj.username}`);
  } else {
    if (githubUserSyncTimeout) clearTimeout(githubUserSyncTimeout);
    githubUserSyncTimeout = setTimeout(() => {
      syncFileToGitHub(`player_data/players/${safeFile}.json`, singleJson, `[Project A^2] ${triggerReason}: ${userObj.username}`);
      syncFileToGitHub(`player_data/users.json`, JSON.stringify(usersDB, null, 2), `[Project A^2] Sync users.json (${userObj.username})`);
    }, 1000);
  }
}

let githubTourneySyncTimeout = null;
function saveTournamentsAndSync(reason = 'Update tournament data') {
  const jsonStr = JSON.stringify(tournamentsDB, null, 2);
  try {
    fs.writeFileSync(TOURNAMENTS_DB_FILE, jsonStr, 'utf8');
  } catch (e) {}

  if (githubTourneySyncTimeout) clearTimeout(githubTourneySyncTimeout);
  githubTourneySyncTimeout = setTimeout(() => {
    syncFileToGitHub(`tournament_data/tournaments.json`, jsonStr, `[Project A^2 Tournament] ${reason}`);
  }, 1000);
}

function updateDailyChallengesForUser(userRec, { linesAdded = 0, maxCombo = 0, matchCompleted = false }) {
  normalizeUserRecord(userRec);
  let bonusXp = 0;

  for (const ch of userRec.dailyChallenges.challenges) {
    if (ch.id === 'lines_40' && linesAdded > 0) {
      ch.progress = Math.min(ch.target, ch.progress + linesAdded);
    } else if (ch.id === 'combo_6' && maxCombo > ch.progress) {
      ch.progress = Math.min(ch.target, maxCombo);
    } else if (ch.id === 'matches_2' && matchCompleted) {
      ch.progress = Math.min(ch.target, ch.progress + 1);
    }

    if (ch.progress >= ch.target && !ch.claimed) {
      ch.claimed = true;
      bonusXp += ch.rewardXp;
    }
  }

  if (bonusXp > 0) {
    userRec.stats.xp += bonusXp;
    userRec.stats.level = calculateLevel(userRec.stats.xp);
  }
  return bonusXp;
}

function recordHeadToHeadResult(winnerUsername, loserUsername) {
  const winUser = ensureUserRecord(winnerUsername);
  const loseUser = ensureUserRecord(loserUsername);
  const winKey = winnerUsername.toLowerCase();
  const loseKey = loserUsername.toLowerCase();

  if (!winUser.headToHead[loseKey]) {
    winUser.headToHead[loseKey] = { opponentName: loseUser.username, wins: 0, losses: 0 };
  }
  winUser.headToHead[loseKey].wins += 1;

  if (!loseUser.headToHead[winKey]) {
    loseUser.headToHead[winKey] = { opponentName: winUser.username, wins: 0, losses: 0 };
  }
  loseUser.headToHead[winKey].losses += 1;
}

function sanitizeUserForClient(u, includeAdminPassword = false) {
  normalizeUserRecord(u);
  const base = {
    username: u.username,
    isAdmin: isAdminUser(u.username),
    isModerator: Boolean(u.isModerator),
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
    moderation: u.moderation,
    settings: u.settings,
    stats: u.stats,
    hasApmReplay: Boolean(u.replays && u.replays.apmTest),
    hasSprintReplay: Boolean(u.replays && u.replays.sprint40),
    headToHead: u.headToHead || {},
    dailyChallenges: u.dailyChallenges,
    matchHistory: (u.matchHistory || []).slice(-20)
  };
  if (includeAdminPassword) {
    base.passwordPlain = u.passwordPlain || '(hidden)';
  }
  return base;
}

function getAllPublicPlayerProfiles(includePasswordsForBigL = false) {
  return Object.values(usersDB)
    .map(u => sanitizeUserForClient(u, includePasswordsForBigL))
    .sort((a, b) => b.stats.xp - a.stats.xp);
}

function getCompiledLeaderboards() {
  const allUsers = Object.values(usersDB)
    .filter(u => !u.moderation || !u.moderation.banned)
    .map(u => {
      normalizeUserRecord(u);
      return {
        username: u.username,
        level: u.stats.level,
        xp: u.stats.xp,
        apm: u.stats.apmTestBest || 0,
        hasApmReplay: Boolean(u.replays && u.replays.apmTest),
        sprint40: u.stats.sprint40Best || 0,
        hasSprintReplay: Boolean(u.replays && u.replays.sprint40),
        zenLines: u.stats.zenLines || 0,
        wins: (u.stats.ffaWins || 0) + (u.stats.duelWins || 0) + (u.stats.teamWins || 0),
        ffaWins: u.stats.ffaWins || 0,
        duelWins: u.stats.duelWins || 0,
        duelLosses: u.stats.duelLosses || 0,
        maxCombo: u.stats.maxCombo || 0
      };
    });

  return {
    byApm: [...allUsers].sort((a, b) => b.apm - a.apm),
    bySprint: [...allUsers].filter(u => u.sprint40 > 0).sort((a, b) => a.sprint40 - b.sprint40),
    byZen: [...allUsers].sort((a, b) => b.zenLines - a.zenLines),
    byWins: [...allUsers].sort((a, b) => b.wins - a.wins),
    byCombo: [...allUsers].sort((a, b) => b.maxCombo - a.maxCombo),
    byDuels: [...allUsers].sort((a, b) => {
      if (b.duelWins !== a.duelWins) return b.duelWins - a.duelWins;
      return a.duelLosses - b.duelLosses;
    })
  };
}

function checkAccountModerationBlock(userObj) {
  if (!userObj) return null;
  normalizeUserRecord(userObj);
  if (userObj.moderation.banned) {
    return `ACCOUNT BANNED${userObj.moderation.banReason ? ': ' + userObj.moderation.banReason : '.'}`;
  }
  if (userObj.moderation.timeoutUntil && userObj.moderation.timeoutUntil > Date.now()) {
    const remMin = Math.ceil((userObj.moderation.timeoutUntil - Date.now()) / 60000);
    return `ACCOUNT TIMED OUT (${remMin} min remaining).`;
  }
  return null;
}

// ============================================================================
// AUTH, REPLAY FETCH, SETTINGS & RESOURCE ENDPOINTS
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
  saveUserAndSync(newUser, 'New Player Registered');

  const isBigL = isAdminUser(newUser.username);
  return res.json({
    ok: true,
    user: sanitizeUserForClient(newUser, isBigL),
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles(isBigL),
    tournaments: tournamentsDB
  });
});

app.post('/api/auth/login', (req, res) => {
  const rawName = String(req.body.username || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 18);
  const rawPass = String(req.body.password || '');
  const key = rawName.toLowerCase();

  const existing = usersDB[key];
  if (!existing) {
    return res.status(404).json({ error: 'Player not found. Click REGISTER to create account.' });
  }

  normalizeUserRecord(existing);
  const incomingHash = hashPassword(rawPass);
  if (existing.passwordHash !== incomingHash && existing.passwordPlain !== rawPass) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const modBlock = checkAccountModerationBlock(existing);
  if (modBlock && !isAdminUser(existing.username)) {
    return res.status(403).json({ error: modBlock });
  }

  existing.lastLogin = new Date().toISOString();
  saveUserAndSync(existing, 'Player Login');

  const isBigL = isAdminUser(existing.username);
  return res.json({
    ok: true,
    user: sanitizeUserForClient(existing, isBigL),
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles(isBigL),
    tournaments: tournamentsDB
  });
});

app.get('/api/auth/profile/:username', (req, res) => {
  const key = String(req.params.username || '').trim().toLowerCase();
  const u = usersDB[key];
  if (!u) return res.status(404).json({ error: 'Player not found' });

  normalizeUserRecord(u);
  const modBlock = checkAccountModerationBlock(u);
  if (modBlock && !isAdminUser(u.username)) {
    return res.status(403).json({ error: modBlock });
  }

  const isBigL = isAdminUser(u.username);
  res.json({
    ok: true,
    user: sanitizeUserForClient(u, isBigL),
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles(isBigL),
    tournaments: tournamentsDB
  });
});

// Endpoint to fetch a player's saved APM Test or 40-Line Sprint replay
app.get('/api/replay/:username/:mode', (req, res) => {
  const key = String(req.params.username || '').trim().toLowerCase();
  const modeKey = req.params.mode === 'sprint40' ? 'sprint40' : 'apmTest';
  const u = usersDB[key];
  if (!u || !u.replays || !u.replays[modeKey]) {
    return res.status(404).json({ error: 'Replay not found for this player.' });
  }
  return res.json({
    ok: true,
    username: u.username,
    mode: modeKey,
    replay: u.replays[modeKey]
  });
});

app.post('/api/auth/settings', (req, res) => {
  const rawName = String(req.body.username || '').trim().toLowerCase();
  const user = usersDB[rawName];
  if (!user) return res.status(404).json({ error: 'Player not found' });

  if (req.body.settings && typeof req.body.settings === 'object') {
    user.settings = {
      ...user.settings,
      ...req.body.settings,
      customColors: {
        ...user.settings.customColors,
        ...(req.body.settings.customColors || {})
      },
      keybinds: {
        ...user.settings.keybinds,
        ...(req.body.settings.keybinds || {})
      }
    };
    saveUserAndSync(user, 'Updated Settings & Customization');
  }
  return res.json({ ok: true, settings: user.settings });
});

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
// TOURNAMENT BRACKET ENGINE
// ============================================================================

function nextPowerOf2(n) {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

function createTournamentObject(params, creatorName) {
  const now = Date.now();
  const regDays = Math.max(0.01, Number(params.registrationDays) || 1);
  const matchDays = Math.max(0.01, Number(params.daysPerMatch) || 1);
  const bestOf = [1, 3, 5].includes(Number(params.bestOf)) ? Number(params.bestOf) : 3;
  const maxPlayers = Math.max(2, Math.min(64, Number(params.maxPlayers) || 16));
  const format = params.format === 'double' ? 'double' : 'single';
  const seeding = params.seeding === 'apm' ? 'apm' : 'random';

  return {
    id: `tourney_${now}_${Math.random().toString(36).substring(2, 6)}`,
    name: String(params.name || `Project A² Championship`).slice(0, 40),
    createdBy: creatorName,
    createdAt: new Date(now).toISOString(),
    bestOf,
    winsNeeded: Math.ceil(bestOf / 2),
    maxPlayers,
    registrationDays: regDays,
    registrationEndsAt: now + Math.round(regDays * 86400000),
    daysPerMatch: matchDays,
    format,
    seeding,
    status: 'registration',
    registeredPlayers: [],
    matches: [],
    champion: null
  };
}

function generateBracketForTournament(tourney) {
  if (tourney.status !== 'registration') return;
  const participants = [...tourney.registeredPlayers];
  if (participants.length < 2) {
    tourney.status = 'completed';
    tourney.champion = participants[0] || 'No Players';
    saveTournamentsAndSync(`Tournament ${tourney.name} ended (insufficient players)`);
    return;
  }

  if (tourney.seeding === 'apm') {
    participants.sort((a, b) => {
      const ua = ensureUserRecord(a);
      const ub = ensureUserRecord(b);
      return (ub.stats.apmTestBest || 0) - (ua.stats.apmTestBest || 0);
    });
  } else {
    for (let i = participants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }
  }

  const bracketSize = nextPowerOf2(participants.length);
  const totalWinnerRounds = Math.log2(bracketSize);
  const matchDurationMs = Math.round(tourney.daysPerMatch * 86400000);
  const now = Date.now();

  tourney.matches = [];
  tourney.status = 'active';

  for (let r = 1; r <= totalWinnerRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r);
    for (let m = 0; m < matchesInRound; m++) {
      tourney.matches.push({
        id: `W_R${r}_M${m}`,
        bracket: 'winners',
        round: r,
        index: m,
        p1: null,
        p2: null,
        p1Queued: false,
        p2Queued: false,
        score1: 0,
        score2: 0,
        winner: null,
        loser: null,
        status: 'pending',
        liveRoomId: null,
        deadlineAt: now + r * matchDurationMs
      });
    }
  }

  if (tourney.format === 'double' && bracketSize >= 4) {
    const totalLoserRounds = (totalWinnerRounds - 1) * 2;
    for (let lr = 1; lr <= totalLoserRounds; lr++) {
      const matchesInLR = bracketSize / Math.pow(2, Math.floor((lr + 1) / 2) + 1);
      for (let m = 0; m < Math.max(1, matchesInLR); m++) {
        tourney.matches.push({
          id: `L_R${lr}_M${m}`,
          bracket: 'losers',
          round: lr,
          index: m,
          p1: null,
          p2: null,
          p1Queued: false,
          p2Queued: false,
          score1: 0,
          score2: 0,
          winner: null,
          loser: null,
          status: 'pending',
          liveRoomId: null,
          deadlineAt: now + (lr + 1) * matchDurationMs
        });
      }
    }

    tourney.matches.push({
      id: `GF_1`,
      bracket: 'grand_finals',
      round: 1,
      index: 0,
      p1: null,
      p2: null,
      p1Queued: false,
      p2Queued: false,
      score1: 0,
      score2: 0,
      winner: null,
      loser: null,
      status: 'pending',
      liveRoomId: null,
      deadlineAt: now + (totalWinnerRounds + 2) * matchDurationMs
    });

    tourney.matches.push({
      id: `GF_RESET`,
      bracket: 'grand_finals',
      round: 2,
      index: 0,
      p1: null,
      p2: null,
      p1Queued: false,
      p2Queued: false,
      score1: 0,
      score2: 0,
      winner: null,
      loser: null,
      status: 'pending',
      liveRoomId: null,
      deadlineAt: now + (totalWinnerRounds + 3) * matchDurationMs
    });
  } else if (tourney.format === 'double' && bracketSize === 2) {
    tourney.matches.push({
      id: `GF_1`,
      bracket: 'grand_finals',
      round: 1,
      index: 0,
      p1: null,
      p2: null,
      p1Queued: false,
      p2Queued: false,
      score1: 0,
      score2: 0,
      winner: null,
      loser: null,
      status: 'pending',
      liveRoomId: null,
      deadlineAt: now + 2 * matchDurationMs
    });
    tourney.matches.push({
      id: `GF_RESET`,
      bracket: 'grand_finals',
      round: 2,
      index: 0,
      p1: null,
      p2: null,
      p1Queued: false,
      p2Queued: false,
      score1: 0,
      score2: 0,
      winner: null,
      loser: null,
      status: 'pending',
      liveRoomId: null,
      deadlineAt: now + 3 * matchDurationMs
    });
  }

  const r1Matches = tourney.matches.filter(m => m.bracket === 'winners' && m.round === 1);
  for (let i = 0; i < r1Matches.length; i++) {
    const p1 = participants[i] || 'BYE';
    const p2 = participants[bracketSize - 1 - i] || 'BYE';
    r1Matches[i].p1 = p1;
    r1Matches[i].p2 = p2;

    if (p1 !== 'BYE' && p2 === 'BYE') {
      advanceTournamentMatchWinner(tourney, r1Matches[i].id, p1, 1, 0, 'AUTO BYE');
    } else if (p2 !== 'BYE' && p1 === 'BYE') {
      advanceTournamentMatchWinner(tourney, r1Matches[i].id, p2, 0, 1, 'AUTO BYE');
    } else if (p1 !== 'BYE' && p2 !== 'BYE') {
      r1Matches[i].status = 'ready';
      r1Matches[i].deadlineAt = Date.now() + matchDurationMs;
    }
  }

  saveTournamentsAndSync(`Generated bracket for ${tourney.name}`);
}

function placePlayerIntoMatchSlot(tourney, targetMatchId, slotNum, playerName) {
  const m = tourney.matches.find(x => x.id === targetMatchId);
  if (!m || m.status === 'completed') return;
  if (slotNum === 1) m.p1 = playerName;
  else m.p2 = playerName;

  if (m.p1 && m.p2) {
    if (m.p1 === 'BYE' && m.p2 !== 'BYE') {
      advanceTournamentMatchWinner(tourney, m.id, m.p2, 0, 1, 'AUTO BYE');
    } else if (m.p2 === 'BYE' && m.p1 !== 'BYE') {
      advanceTournamentMatchWinner(tourney, m.id, m.p1, 1, 0, 'AUTO BYE');
    } else if (m.p1 === 'BYE' && m.p2 === 'BYE') {
      m.status = 'completed';
    } else {
      m.status = 'ready';
      m.deadlineAt = Date.now() + Math.round(tourney.daysPerMatch * 86400000);
    }
  }
}

function advanceTournamentMatchWinner(tourney, matchId, winnerName, score1 = 1, score2 = 0, reason = 'COMPLETED') {
  const m = tourney.matches.find(x => x.id === matchId);
  if (!m || m.status === 'completed') return;

  const isP1Winner = m.p1 === winnerName;
  const loserName = isP1Winner ? m.p2 : m.p1;

  m.winner = winnerName;
  m.loser = loserName;
  m.score1 = score1;
  m.score2 = score2;
  m.status = 'completed';
  m.liveRoomId = null;

  const wMatches = tourney.matches.filter(x => x.bracket === 'winners');
  const maxWRound = Math.max(...wMatches.map(x => x.round));

  if (m.bracket === 'winners') {
    if (m.round < maxWRound) {
      const nextWId = `W_R${m.round + 1}_M${Math.floor(m.index / 2)}`;
      const slot = (m.index % 2 === 0) ? 1 : 2;
      placePlayerIntoMatchSlot(tourney, nextWId, slot, winnerName);
    } else {
      if (tourney.format === 'single') {
        completeEntireTournament(tourney, winnerName, loserName);
        return;
      } else {
        placePlayerIntoMatchSlot(tourney, 'GF_1', 1, winnerName);
      }
    }

    if (tourney.format === 'double' && loserName && loserName !== 'BYE') {
      const lMatches = tourney.matches.filter(x => x.bracket === 'losers');
      if (lMatches.length === 0) {
        placePlayerIntoMatchSlot(tourney, 'GF_1', 2, loserName);
      } else if (m.round === 1) {
        const targetLId = `L_R1_M${Math.floor(m.index / 2)}`;
        const slot = (m.index % 2 === 0) ? 1 : 2;
        placePlayerIntoMatchSlot(tourney, targetLId, slot, loserName);
      } else {
        const targetLRound = (m.round - 1) * 2;
        const targetLId = `L_R${targetLRound}_M${m.index}`;
        placePlayerIntoMatchSlot(tourney, targetLId, 2, loserName);
      }
    }
  } else if (m.bracket === 'losers') {
    const lMatches = tourney.matches.filter(x => x.bracket === 'losers');
    const maxLRound = Math.max(...lMatches.map(x => x.round));
    if (m.round < maxLRound) {
      const nextLRound = m.round + 1;
      if (m.round % 2 === 1) {
        placePlayerIntoMatchSlot(tourney, `L_R${nextLRound}_M${m.index}`, 1, winnerName);
      } else {
        const nextIdx = Math.floor(m.index / 2);
        const slot = (m.index % 2 === 0) ? 1 : 2;
        placePlayerIntoMatchSlot(tourney, `L_R${nextLRound}_M${nextIdx}`, slot, winnerName);
      }
    } else {
      placePlayerIntoMatchSlot(tourney, 'GF_1', 2, winnerName);
    }
  } else if (m.bracket === 'grand_finals') {
    if (m.id === 'GF_1') {
      if (winnerName === m.p1) {
        const resetNode = tourney.matches.find(x => x.id === 'GF_RESET');
        if (resetNode) resetNode.status = 'completed';
        completeEntireTournament(tourney, winnerName, loserName);
        return;
      } else {
        systemChatBroadcast(`[TOURNAMENT BRACKET RESET] ${winnerName} (Losers Bracket) won Set 1 of Grand Finals! Moving to Deciding Set 2!`, 'duel-announce');
        placePlayerIntoMatchSlot(tourney, 'GF_RESET', 1, m.p1);
        placePlayerIntoMatchSlot(tourney, 'GF_RESET', 2, m.p2);
      }
    } else if (m.id === 'GF_RESET') {
      completeEntireTournament(tourney, winnerName, loserName);
      return;
    }
  }

  saveTournamentsAndSync(`Match ${matchId} won by ${winnerName} (${reason})`);
  broadcastHubState();
}

function completeEntireTournament(tourney, championName, runnerUpName) {
  tourney.status = 'completed';
  tourney.champion = championName;

  if (championName && championName !== 'BYE') {
    const champRec = ensureUserRecord(championName);
    champRec.stats.tournamentWins = (champRec.stats.tournamentWins || 0) + 1;
    champRec.matchHistory.push({
      date: new Date().toISOString(),
      mode: `TOURNAMENT: ${tourney.name}`,
      result: 'CHAMPION (1ST)',
      apm: champRec.stats.apmTestBest || 0,
      lines: 0,
      maxCombo: champRec.stats.maxCombo || 0
    });
    awardXpAndSave(champRec, 1000, `Won Tournament: ${tourney.name}`);
  }

  if (runnerUpName && runnerUpName !== 'BYE') {
    const ruRec = ensureUserRecord(runnerUpName);
    ruRec.matchHistory.push({
      date: new Date().toISOString(),
      mode: `TOURNAMENT: ${tourney.name}`,
      result: 'RUNNER-UP (2ND)',
      apm: ruRec.stats.apmTestBest || 0,
      lines: 0,
      maxCombo: ruRec.stats.maxCombo || 0
    });
    awardXpAndSave(ruRec, 500, `Runner-Up Tournament: ${tourney.name}`);
  }

  systemChatBroadcast(`[TOURNAMENT CHAMPION] ${championName} has won ${tourney.name} (+1,000 XP)!`, 'duel-win');
  saveTournamentsAndSync(`Tournament ${tourney.name} won by ${championName}`);
  broadcastHubState();
}

setInterval(() => {
  const now = Date.now();
  let changed = false;

  for (const t of tournamentsDB) {
    if (t.status === 'registration' && now >= t.registrationEndsAt) {
      generateBracketForTournament(t);
      changed = true;
    } else if (t.status === 'active') {
      for (const m of t.matches) {
        if (m.status === 'ready' && now >= m.deadlineAt && m.p1 && m.p2) {
          if (m.p1Queued && !m.p2Queued) {
            advanceTournamentMatchWinner(t, m.id, m.p1, t.winsNeeded, 0, 'OPPONENT NO-SHOW');
            changed = true;
          } else if (m.p2Queued && !m.p1Queued) {
            advanceTournamentMatchWinner(t, m.id, m.p2, 0, t.winsNeeded, 'OPPONENT NO-SHOW');
            changed = true;
          } else if (!m.p1Queued && !m.p2Queued) {
            const coinWinner = Math.random() < 0.5 ? m.p1 : m.p2;
            systemChatBroadcast(`[TOURNAMENT COIN FLIP] Match ${m.p1} vs ${m.p2} deadline expired — ${coinWinner} advances via Coin Flip!`, 'system');
            advanceTournamentMatchWinner(t, m.id, coinWinner, 1, 0, 'COIN FLIP');
            changed = true;
          }
        }
      }
    }
  }

  if (changed) broadcastHubState();
}, 5000);

// ============================================================================
// MULTIPLAYER QUEUES: 1v1, BLIND 1v1 (INVISIBLE BOARD), 2v2 & FFA LOBBY
// ============================================================================

const players = new Map();
const queue1v1 = [];
const queueBlind1v1 = []; // Blind / Invisible Board 1v1 Queue
const queue2v2 = [];
const duelRooms = new Map();
const teamRooms = new Map();
const directChallenges = new Map();

const ffaLobby = {
  players: new Map(),
  spectators: new Set(),
  state: 'waiting',
  activeSeed: 12345,
  countdownEndsAt: 0,
  countdownTimer: null,
  restartTimer: null,
  roundStartTime: 0
};

function computeSuddenDeathMultiplier(startTimeMs) {
  if (!startTimeMs || startTimeMs <= 0) return 1.0;
  const elapsedSec = (Date.now() - startTimeMs) / 1000;
  if (elapsedSec < 60) return 1.0;
  const steps = Math.floor((elapsedSec - 60) / 15) + 1;
  return Math.min(3.0, Number((1.0 + steps * 0.2).toFixed(1)));
}

function computeHighestOccupiedRowHeight(grid) {
  if (!Array.isArray(grid)) return 0;
  const totalRows = grid.length;
  for (let r = 0; r < totalRows; r++) {
    if (Array.isArray(grid[r]) && grid[r].some(cell => cell !== null)) {
      return totalRows - r;
    }
  }
  return 0;
}

function ensureUserRecord(username) {
  const key = username.toLowerCase();
  if (!usersDB[key]) {
    usersDB[key] = createNewUserRecord(username, 'default123');
    saveUserAndSync(usersDB[key], 'Auto-Created Player Profile');
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

function getPlayerByUsername(username) {
  const low = String(username || '').trim().toLowerCase();
  for (const [, p] of players.entries()) {
    if (p.authenticated && p.username.toLowerCase() === low) return p;
  }
  return null;
}

function clearPlayerDirectChallenges(playerId) {
  for (const [cid, ch] of directChallenges.entries()) {
    if (ch.fromId === playerId || ch.toId === playerId) {
      clearTimeout(ch.timer);
      directChallenges.delete(cid);
      sendToPlayer(ch.fromId, { type: 'challenge_cleared', challengeId: cid });
      sendToPlayer(ch.toId, { type: 'challenge_cleared', challengeId: cid });
    }
  }
}

function getActiveSpectatableMatches() {
  const list = [];
  for (const [roomId, room] of duelRooms.entries()) {
    if (room.active) {
      list.push({
        id: roomId,
        type: 'duel',
        label: `${room.isBlind ? '[BLIND 1v1] ' : (room.tourneyId ? '[TOURNEY] ' : '')}1v1 BO${room.bestOf}: ${room.p1.username} (${room.p1.score}) vs (${room.p2.score}) ${room.p2.username}`,
        spectatorCount: room.spectators.size
      });
    }
  }
  for (const [roomId, tRoom] of teamRooms.entries()) {
    if (tRoom.active) {
      list.push({
        id: roomId,
        type: 'team2v2',
        label: `2v2 BO3: Team Alpha (${tRoom.alphaScore}) vs (${tRoom.bravoScore}) Team Bravo`,
        spectatorCount: tRoom.spectators.size
      });
    }
  }
  if (ffaLobby.players.size >= 1 || ffaLobby.state === 'playing') {
    list.push({
      id: 'ffa_main',
      type: 'ffa',
      label: `FFA Arena (${ffaLobby.players.size} Players • ${ffaLobby.state.toUpperCase()})`,
      spectatorCount: ffaLobby.spectators.size
    });
  }
  return list;
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
      isModerator: Boolean(u.isModerator),
      mode: p.mode,
      inDuel: p.mode === 'duel' || p.mode === 'team2v2',
      apm: u.stats.apmTestBest,
      zenLines: u.stats.zenLines,
      duelWins: u.stats.duelWins,
      duelLosses: u.stats.duelLosses
    });
  }

  for (const [clientWs, p] of players.entries()) {
    if (clientWs.readyState !== WebSocket.OPEN) continue;
    const isBigL = isAdminUser(p.username);
    clientWs.send(JSON.stringify({
      type: 'hub_sync',
      onlinePlayers: onlineList,
      queue1v1Count: queue1v1.length,
      queueBlind1v1Count: queueBlind1v1.length,
      queue2v2Count: queue2v2.length,
      ffaPlayerCount: ffaLobby.players.size,
      ffaState: ffaLobby.state,
      activeMatches: getActiveSpectatableMatches(),
      leaderboards: getCompiledLeaderboards(),
      allPlayers: getAllPublicPlayerProfiles(isBigL),
      tournaments: tournamentsDB
    }));
  }
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

function eliminateOrRemoveFromActiveModes(p) {
  if (!p) return;
  const playerId = p.id;

  const q1 = queue1v1.indexOf(playerId);
  if (q1 !== -1) queue1v1.splice(q1, 1);

  const qb = queueBlind1v1.indexOf(playerId);
  if (qb !== -1) queueBlind1v1.splice(qb, 1);

  const q2 = queue2v2.indexOf(playerId);
  if (q2 !== -1) queue2v2.splice(q2, 1);

  if (p.mode === 'duel' && p.duelRoomId) {
    const room = duelRooms.get(p.duelRoomId);
    if (room && room.active) {
      const winnerSlot = room.p1.id === playerId ? room.p2 : room.p1;
      const loserSlot = room.p1.id === playerId ? room.p1 : room.p2;
      concludeDuelMatch(room, winnerSlot, loserSlot, 'FORFEIT_ELIMINATED');
    }
  } else if (p.mode === 'team2v2' && p.teamRoomId) {
    const tRoom = teamRooms.get(p.teamRoomId);
    if (tRoom && tRoom.active) {
      const slot = tRoom.slots.get(playerId);
      if (slot && slot.alive) {
        slot.alive = false;
        evaluateTeam2v2RoundState(tRoom.id);
      }
      tRoom.slots.delete(playerId);
      if (tRoom.active && tRoom.slots.size < 2) {
        concludeTeam2v2Match(tRoom, slot && slot.team === 'alpha' ? 'bravo' : 'alpha', 'FORFEIT');
      }
    }
  } else if (ffaLobby.players.has(playerId)) {
    const slot = ffaLobby.players.get(playerId);
    if (ffaLobby.state === 'playing' && slot && slot.role === 'active' && slot.alive) {
      slot.alive = false;
      checkFfaMatchEnd();
      ffaLobby.players.delete(playerId);
    } else {
      ffaLobby.players.delete(playerId);
      evaluateFfaLobbyState();
    }
  }

  ffaLobby.spectators.delete(playerId);
  for (const [, room] of duelRooms.entries()) {
    room.spectators.delete(playerId);
  }
  for (const [, tRoom] of teamRooms.entries()) {
    tRoom.spectators.delete(playerId);
  }

  p.mode = 'hub';
  p.duelRoomId = null;
  p.teamRoomId = null;
}

// ============================================================================
// 1v1 DUEL ENGINE (Supports Standard Bo3, Blind/Invisible 1v1 & Tourney Bo1/3/5)
// ============================================================================

function tryMatchmake1v1() {
  for (let i = queue1v1.length - 1; i >= 0; i--) {
    if (!getPlayerById(queue1v1[i])) queue1v1.splice(i, 1);
  }
  while (queue1v1.length >= 2) {
    const id1 = queue1v1.shift();
    const id2 = queue1v1.shift();
    const p1 = getPlayerById(id1);
    const p2 = getPlayerById(id2);
    if (p1 && p2) startDuelRoom(p1, p2, 3, null, null, false);
  }
  broadcastHubState();
}

function tryMatchmakeBlind1v1() {
  for (let i = queueBlind1v1.length - 1; i >= 0; i--) {
    if (!getPlayerById(queueBlind1v1[i])) queueBlind1v1.splice(i, 1);
  }
  while (queueBlind1v1.length >= 2) {
    const id1 = queueBlind1v1.shift();
    const id2 = queueBlind1v1.shift();
    const p1 = getPlayerById(id1);
    const p2 = getPlayerById(id2);
    if (p1 && p2) startDuelRoom(p1, p2, 3, null, null, true);
  }
  broadcastHubState();
}

function startDuelRoom(p1, p2, bestOf = 3, tourneyId = null, tourneyMatchId = null, isBlind = false) {
  eliminateOrRemoveFromActiveModes(p1);
  eliminateOrRemoveFromActiveModes(p2);
  clearPlayerDirectChallenges(p1.id);
  clearPlayerDirectChallenges(p2.id);

  const roomId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const winsNeeded = Math.ceil(bestOf / 2);

  p1.mode = 'duel';
  p1.duelRoomId = roomId;
  p2.mode = 'duel';
  p2.duelRoomId = roomId;

  const room = {
    id: roomId,
    bestOf,
    winsNeeded,
    isBlind: Boolean(isBlind),
    tourneyId,
    tourneyMatchId,
    p1: { id: p1.id, username: p1.username, score: 0, alive: true, apm: 0, pps: 0, linesCleared: 0, attackSent: 0, garbageReceived: 0, maxCombo: 0, grid: null, activePiece: null, pendingGarbage: 0, apmHistory: [] },
    p2: { id: p2.id, username: p2.username, score: 0, alive: true, apm: 0, pps: 0, linesCleared: 0, attackSent: 0, garbageReceived: 0, maxCombo: 0, grid: null, activePiece: null, pendingGarbage: 0, apmHistory: [] },
    spectators: new Set(),
    round: 1,
    active: true,
    roundInProgress: false,
    roundStartTime: 0
  };

  duelRooms.set(roomId, room);

  if (tourneyId && tourneyMatchId) {
    const t = tournamentsDB.find(x => x.id === tourneyId);
    if (t) {
      const m = t.matches.find(x => x.id === tourneyMatchId);
      if (m) {
        m.status = 'live';
        m.liveRoomId = roomId;
      }
    }
  }

  broadcastHubState();

  systemChatBroadcast(`[${isBlind ? 'BLIND ' : ''}1v1 BO${bestOf} MATCH] ${p1.username} vs ${p2.username} started!`, 'duel-announce');

  const initPayload = {
    type: 'duel_init',
    roomId: room.id,
    bestOf,
    isBlind: room.isBlind,
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
  room.roundStartTime = 0;
  const seed = Math.floor(Math.random() * 2147483647);

  const cdPayload = {
    type: 'duel_round_countdown',
    roomId: room.id,
    bestOf: room.bestOf,
    isBlind: room.isBlind,
    round: room.round,
    seed,
    countdownMs: 3000,
    p1Score: room.p1.score,
    p2Score: room.p2.score
  };

  sendToPlayer(room.p1.id, cdPayload);
  sendToPlayer(room.p2.id, cdPayload);
  for (const specId of room.spectators) {
    sendToPlayer(specId, cdPayload);
  }

  setTimeout(() => {
    const r = duelRooms.get(roomId);
    if (r && r.active) {
      r.roundInProgress = true;
      r.roundStartTime = Date.now();
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

  if (winnerSlot.score >= room.winsNeeded) {
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
    for (const specId of room.spectators) {
      sendToPlayer(specId, roundMsg);
    }

    room.round += 1;
    setTimeout(() => startDuelRoundWithCountdown(room.id), 2500);
  }
}

function concludeDuelMatch(room, winnerSlot, loserSlot, reason) {
  if (!room.active) return;
  room.active = false;
  room.roundInProgress = false;

  const scoreStr = `${winnerSlot.score}-${loserSlot.score}`;
  const modeLabel = room.isBlind ? `BLIND 1v1 BO${room.bestOf}` : (room.tourneyId ? `TOURNEY BO${room.bestOf}` : `1v1 BO${room.bestOf}`);

  recordHeadToHeadResult(winnerSlot.username, loserSlot.username);

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
    mode: modeLabel,
    result: 'WIN',
    score: scoreStr,
    opponent: loserSlot.username,
    apm: winnerSlot.apm,
    lines: winnerSlot.linesCleared,
    maxCombo: winnerSlot.maxCombo
  });
  updateDailyChallengesForUser(winUser, { linesAdded: winnerSlot.linesCleared, maxCombo: winnerSlot.maxCombo, matchCompleted: true });
  awardXpAndSave(winUser, 150 + winnerSlot.linesCleared * 5, '1v1 Win');

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
    mode: modeLabel,
    result: 'ELIMINATED / LOSS',
    score: scoreStr,
    opponent: winnerSlot.username,
    apm: loserSlot.apm,
    lines: loserSlot.linesCleared,
    maxCombo: loserSlot.maxCombo
  });
  updateDailyChallengesForUser(loseUser, { linesAdded: loserSlot.linesCleared, maxCombo: loserSlot.maxCombo, matchCompleted: true });
  awardXpAndSave(loseUser, 60 + loserSlot.linesCleared * 5, '1v1 Loss');

  if (room.tourneyId && room.tourneyMatchId) {
    const t = tournamentsDB.find(x => x.id === room.tourneyId);
    if (t) {
      const s1 = room.p1.username === winnerSlot.username ? winnerSlot.score : loserSlot.score;
      const s2 = room.p2.username === winnerSlot.username ? winnerSlot.score : loserSlot.score;
      advanceTournamentMatchWinner(t, room.tourneyMatchId, winnerSlot.username, s1, s2, reason);
    }
  }

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
      placement: 'ELIMINATED (2ND)',
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
    returnToHub: true,
    modeTitle: `${modeLabel} RESULT (${scoreStr})`,
    winnerName: winnerSlot.username,
    players: summaryPlayers,
    graphSeries: [
      { label: room.p1.username, color: '#00e5ff', data: room.p1.apmHistory || [] },
      { label: room.p2.username, color: '#ff3d57', data: room.p2.apmHistory || [] }
    ],
    updatedUserP1: sanitizeUserForClient(ensureUserRecord(room.p1.username), isAdminUser(room.p1.username)),
    updatedUserP2: sanitizeUserForClient(ensureUserRecord(room.p2.username), isAdminUser(room.p2.username))
  };

  sendToPlayer(room.p1.id, overPayload);
  sendToPlayer(room.p2.id, overPayload);
  for (const specId of room.spectators) {
    const sp = getPlayerById(specId);
    if (sp) sp.mode = 'hub';
    sendToPlayer(specId, overPayload);
  }

  systemChatBroadcast(`[${modeLabel} VICTORY] ${winnerSlot.username} defeated ${loserSlot.username} (${scoreStr})!`, 'duel-win');

  duelRooms.delete(room.id);
  broadcastHubState();
}

// ============================================================================
// 2v2 TEAM BATTLES ENGINE
// ============================================================================

function tryMatchmake2v2() {
  for (let i = queue2v2.length - 1; i >= 0; i--) {
    if (!getPlayerById(queue2v2[i])) queue2v2.splice(i, 1);
  }

  while (queue2v2.length >= 4) {
    const pIds = [queue2v2.shift(), queue2v2.shift(), queue2v2.shift(), queue2v2.shift()];
    const pObjs = pIds.map(id => getPlayerById(id)).filter(Boolean);
    if (pObjs.length === 4) {
      startTeam2v2Room(pObjs[0], pObjs[1], pObjs[2], pObjs[3]);
    }
  }
  broadcastHubState();
}

function startTeam2v2Room(a1, a2, b1, b2) {
  [a1, a2, b1, b2].forEach(p => {
    eliminateOrRemoveFromActiveModes(p);
    clearPlayerDirectChallenges(p.id);
  });

  const roomId = `team2v2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const slots = new Map();

  const makeSlot = (p, teamName) => {
    p.mode = 'team2v2';
    p.teamRoomId = roomId;
    slots.set(p.id, {
      id: p.id,
      username: p.username,
      team: teamName,
      alive: true,
      apm: 0,
      pps: 0,
      linesCleared: 0,
      attackSent: 0,
      garbageReceived: 0,
      maxCombo: 0,
      grid: null,
      activePiece: null,
      pendingGarbage: 0,
      apmHistory: []
    });
  };

  makeSlot(a1, 'alpha');
  makeSlot(a2, 'alpha');
  makeSlot(b1, 'bravo');
  makeSlot(b2, 'bravo');

  const tRoom = {
    id: roomId,
    slots,
    alphaNames: `${a1.username} & ${a2.username}`,
    bravoNames: `${b1.username} & ${b2.username}`,
    alphaScore: 0,
    bravoScore: 0,
    round: 1,
    active: true,
    roundInProgress: false,
    roundStartTime: 0,
    spectators: new Set()
  };

  teamRooms.set(roomId, tRoom);
  broadcastHubState();

  systemChatBroadcast(`[2v2 TEAM MATCH] Team Alpha (${tRoom.alphaNames}) vs Team Bravo (${tRoom.bravoNames}) started!`, 'duel-announce');

  for (const [pid, slot] of tRoom.slots.entries()) {
    sendToPlayer(pid, {
      type: 'team2v2_init',
      roomId: tRoom.id,
      myTeam: slot.team,
      alphaNames: tRoom.alphaNames,
      bravoNames: tRoom.bravoNames,
      alphaScore: 0,
      bravoScore: 0,
      round: 1
    });
  }

  startTeam2v2RoundWithCountdown(roomId);
}

function startTeam2v2RoundWithCountdown(roomId) {
  const tRoom = teamRooms.get(roomId);
  if (!tRoom || !tRoom.active) return;

  tRoom.roundInProgress = false;
  tRoom.roundStartTime = 0;
  const seed = Math.floor(Math.random() * 2147483647);

  for (const [, slot] of tRoom.slots.entries()) {
    slot.alive = true;
  }

  const cdPayload = {
    type: 'team2v2_round_countdown',
    roomId: tRoom.id,
    round: tRoom.round,
    seed,
    countdownMs: 3000,
    alphaScore: tRoom.alphaScore,
    bravoScore: tRoom.bravoScore
  };

  for (const [pid] of tRoom.slots.entries()) sendToPlayer(pid, cdPayload);
  for (const specId of tRoom.spectators) sendToPlayer(specId, cdPayload);

  setTimeout(() => {
    const r = teamRooms.get(roomId);
    if (r && r.active) {
      r.roundInProgress = true;
      r.roundStartTime = Date.now();
    }
  }, 3000);
}

function evaluateTeam2v2RoundState(roomId) {
  const tRoom = teamRooms.get(roomId);
  if (!tRoom || !tRoom.active || !tRoom.roundInProgress) return;

  let alphaAlive = 0;
  let bravoAlive = 0;
  for (const [, slot] of tRoom.slots.entries()) {
    if (slot.alive) {
      if (slot.team === 'alpha') alphaAlive += 1;
      else bravoAlive += 1;
    }
  }

  if (alphaAlive === 0 || bravoAlive === 0) {
    tRoom.roundInProgress = false;
    const winningTeam = alphaAlive > 0 ? 'alpha' : 'bravo';
    if (winningTeam === 'alpha') tRoom.alphaScore += 1;
    else tRoom.bravoScore += 1;

    if (tRoom.alphaScore >= 2 || tRoom.bravoScore >= 2) {
      concludeTeam2v2Match(tRoom, winningTeam, 'COMPLETED');
    } else {
      const roundMsg = {
        type: 'duel_round_result',
        roomId: tRoom.id,
        round: tRoom.round,
        roundWinnerId: null,
        roundWinnerName: winningTeam === 'alpha' ? `TEAM ALPHA (${tRoom.alphaNames})` : `TEAM BRAVO (${tRoom.bravoNames})`,
        p1Score: tRoom.alphaScore,
        p2Score: tRoom.bravoScore
      };
      for (const [pid] of tRoom.slots.entries()) sendToPlayer(pid, roundMsg);
      for (const specId of tRoom.spectators) sendToPlayer(specId, roundMsg);

      tRoom.round += 1;
      setTimeout(() => startTeam2v2RoundWithCountdown(tRoom.id), 2500);
    }
  }
}

function concludeTeam2v2Match(tRoom, winningTeam, reason) {
  if (!tRoom.active) return;
  tRoom.active = false;
  tRoom.roundInProgress = false;

  const scoreStr = `${tRoom.alphaScore}-${tRoom.bravoScore}`;
  const winnerLabel = winningTeam === 'alpha' ? `TEAM ALPHA (${tRoom.alphaNames})` : `TEAM BRAVO (${tRoom.bravoNames})`;

  const summaryPlayers = [];
  for (const [pid, slot] of tRoom.slots.entries()) {
    const isWin = slot.team === winningTeam;
    const u = ensureUserRecord(slot.username);
    u.stats.gamesPlayed += 1;
    if (isWin) u.stats.teamWins += 1;
    else u.stats.teamLosses += 1;
    u.stats.totalLinesCleared += slot.linesCleared;
    u.stats.totalAttackSent += slot.attackSent;
    u.stats.maxCombo = Math.max(u.stats.maxCombo, slot.maxCombo);
    u.matchHistory.push({
      date: new Date().toISOString(),
      mode: '2v2 TEAM BO3',
      result: isWin ? 'WIN' : 'ELIMINATED / LOSS',
      score: scoreStr,
      apm: slot.apm,
      lines: slot.linesCleared,
      maxCombo: slot.maxCombo
    });
    updateDailyChallengesForUser(u, { linesAdded: slot.linesCleared, maxCombo: slot.maxCombo, matchCompleted: true });
    awardXpAndSave(u, (isWin ? 160 : 65) + slot.linesCleared * 5, '2v2 Match Complete');

    summaryPlayers.push({
      username: `[${slot.team.toUpperCase()}] ${slot.username}`,
      placement: isWin ? 'WINNING TEAM' : 'ELIMINATED',
      score: isWin ? 1 : 0,
      apm: slot.apm,
      pps: slot.pps,
      lines: slot.linesCleared,
      sent: slot.attackSent,
      recv: slot.garbageReceived,
      maxCombo: slot.maxCombo
    });

    const pObj = getPlayerById(pid);
    if (pObj) {
      pObj.mode = 'hub';
      pObj.teamRoomId = null;
    }
  }

  for (const [pid, slot] of tRoom.slots.entries()) {
    const pObj = getPlayerById(pid);
    sendToPlayer(pid, {
      type: 'match_summary_5s',
      returnToHub: true,
      modeTitle: `2v2 TEAM BATTLE RESULT (${scoreStr})`,
      winnerName: winnerLabel,
      players: summaryPlayers,
      graphSeries: [{ label: slot.username, color: '#00e5ff', data: slot.apmHistory || [] }],
      updatedUser: pObj ? sanitizeUserForClient(ensureUserRecord(pObj.username), isAdminUser(pObj.username)) : null
    });
  }

  for (const specId of tRoom.spectators) {
    const sp = getPlayerById(specId);
    if (sp) sp.mode = 'hub';
    sendToPlayer(specId, {
      type: 'match_summary_5s',
      returnToHub: true,
      modeTitle: `2v2 TEAM BATTLE RESULT (${scoreStr})`,
      winnerName: winnerLabel,
      players: summaryPlayers,
      graphSeries: []
    });
  }

  systemChatBroadcast(`[2v2 VICTORY] ${winnerLabel} won the 2v2 Team Battle (${scoreStr})!`, 'duel-win');
  teamRooms.delete(tRoom.id);
  broadcastHubState();
}

// ============================================================================
// FFA LOBBY ENGINE
// ============================================================================

function broadcastFfaRoom(payload) {
  for (const [pid] of ffaLobby.players.entries()) {
    sendToPlayer(pid, payload);
  }
  for (const specId of ffaLobby.spectators) {
    sendToPlayer(specId, payload);
  }
}

function startFfaCountdown() {
  if (ffaLobby.players.size < 2) {
    ffaLobby.state = 'waiting';
    broadcastFfaRoom({ type: 'ffa_waiting', playerCount: ffaLobby.players.size });
    broadcastHubState();
    return;
  }

  ffaLobby.state = 'countdown';
  ffaLobby.roundStartTime = 0;
  ffaLobby.activeSeed = Math.floor(Math.random() * 2147483647);
  ffaLobby.countdownEndsAt = Date.now() + 3000;

  for (const [, slot] of ffaLobby.players.entries()) {
    slot.role = 'active';
    slot.alive = true;
    slot.apm = 0;
    slot.pps = 0;
    slot.linesCleared = 0;
    slot.attackSent = 0;
    slot.garbageReceived = 0;
    slot.maxCombo = 0;
    slot.stackHeight = 0;
    slot.lastAttackerId = null;
    slot.grid = null;
    slot.activePiece = null;
    slot.pendingGarbage = 0;
    slot.apmHistory = [];
  }

  broadcastFfaRoom({
    type: 'ffa_countdown_start',
    seed: ffaLobby.activeSeed,
    countdownMs: 3000,
    playerCount: ffaLobby.players.size
  });

  if (ffaLobby.countdownTimer) clearTimeout(ffaLobby.countdownTimer);
  ffaLobby.countdownTimer = setTimeout(() => {
    if (ffaLobby.players.size >= 2) {
      ffaLobby.state = 'playing';
      ffaLobby.roundStartTime = Date.now();
      broadcastHubState();
    } else {
      ffaLobby.state = 'waiting';
      broadcastFfaRoom({ type: 'ffa_waiting', playerCount: ffaLobby.players.size });
      broadcastHubState();
    }
  }, 3000);
  broadcastHubState();
}

function evaluateFfaLobbyState() {
  const count = ffaLobby.players.size;

  if (ffaLobby.state === 'waiting') {
    if (count >= 2) {
      startFfaCountdown();
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

function selectFfaTarget(senderSlot, targetMode, manualTargetId) {
  const aliveOpponents = [];
  for (const [, slot] of ffaLobby.players.entries()) {
    if (slot.id !== senderSlot.id && slot.role === 'active' && slot.alive) {
      aliveOpponents.push(slot);
    }
  }
  if (aliveOpponents.length === 0) return null;

  if (manualTargetId) {
    const manual = aliveOpponents.find(o => o.id === manualTargetId);
    if (manual) return manual;
  }

  switch (targetMode) {
    case 'payback': {
      if (senderSlot.lastAttackerId) {
        const attacker = aliveOpponents.find(o => o.id === senderSlot.lastAttackerId);
        if (attacker) return attacker;
      }
      return aliveOpponents[Math.floor(Math.random() * aliveOpponents.length)];
    }
    case 'ko':
      return [...aliveOpponents].sort((a, b) => (b.stackHeight || 0) - (a.stackHeight || 0))[0];
    case 'apm':
      return [...aliveOpponents].sort((a, b) => (b.apm || 0) - (a.apm || 0))[0];
    case 'random':
    default:
      return aliveOpponents[Math.floor(Math.random() * aliveOpponents.length)];
  }
}

function checkFfaMatchEnd() {
  if (ffaLobby.state !== 'playing') return;
  const activeSlots = [];
  const aliveSlots = [];
  for (const [, slot] of ffaLobby.players.entries()) {
    if (slot.role === 'active') {
      activeSlots.push(slot);
      if (slot.alive) aliveSlots.push(slot);
    }
  }

  if (aliveSlots.length <= 1) {
    ffaLobby.state = 'summary';
    ffaLobby.roundStartTime = 0;
    const winnerSlot = aliveSlots[0] || activeSlots[0];

    const summaryPlayers = activeSlots.map(s => {
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
        result: isWin ? '1ST (WIN)' : 'ELIMINATED',
        apm: s.apm,
        lines: s.linesCleared,
        maxCombo: s.maxCombo
      });
      updateDailyChallengesForUser(u, { linesAdded: s.linesCleared, maxCombo: s.maxCombo, matchCompleted: true });
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

    for (const [pid, slot] of ffaLobby.players.entries()) {
      const pObj = getPlayerById(pid);
      sendToPlayer(pid, {
        type: 'match_summary_5s',
        returnToHub: false,
        modeTitle: 'FFA MATCH RESULTS (NEXT ROUND IN 5S)',
        winnerName: winnerSlot ? winnerSlot.username : 'NONE',
        players: summaryPlayers,
        graphSeries: [
          { label: `${slot.username} (YOU)`, color: '#00e5ff', data: slot.apmHistory || [] }
        ],
        updatedUser: pObj ? sanitizeUserForClient(ensureUserRecord(pObj.username), isAdminUser(pObj.username)) : null
      });
    }

    for (const specId of ffaLobby.spectators) {
      sendToPlayer(specId, {
        type: 'match_summary_5s',
        returnToHub: false,
        modeTitle: 'FFA MATCH RESULTS (NEXT ROUND IN 5S)',
        winnerName: winnerSlot ? winnerSlot.username : 'NONE',
        players: summaryPlayers,
        graphSeries: []
      });
    }

    if (winnerSlot) {
      systemChatBroadcast(`[FFA VICTORY] ${winnerSlot.username} is the last player standing and wins the FFA match!`, 'duel-win');
    }

    broadcastHubState();

    if (ffaLobby.restartTimer) clearTimeout(ffaLobby.restartTimer);
    ffaLobby.restartTimer = setTimeout(() => {
      for (const [pid] of ffaLobby.players.entries()) {
        const pObj = getPlayerById(pid);
        if (!pObj || pObj.mode !== 'ffa') {
          ffaLobby.players.delete(pid);
        }
      }
      if (ffaLobby.players.size >= 2) {
        startFfaCountdown();
      } else {
        ffaLobby.state = 'waiting';
        broadcastFfaRoom({ type: 'ffa_waiting', playerCount: ffaLobby.players.size });
        broadcastHubState();
      }
    }, 5000);
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
    username: `Player_${Math.floor(1000 + Math.random() * 9000)}`,
    authenticated: false,
    mode: 'hub',
    duelRoomId: null,
    teamRoomId: null,
    ffaTargetMode: 'random',
    manualTargetId: null
  };

  players.set(ws, session);

  ws.send(JSON.stringify({
    type: 'welcome',
    id: playerId,
    leaderboards: getCompiledLeaderboards(),
    allPlayers: getAllPublicPlayerProfiles(false),
    activeMatches: getActiveSpectatableMatches(),
    tournaments: tournamentsDB
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
          const uRec = ensureUserRecord(cleanName);
          const modBlock = checkAccountModerationBlock(uRec);
          if (modBlock && !isAdminUser(cleanName)) {
            ws.send(JSON.stringify({ type: 'force_logout', reason: modBlock }));
            return;
          }
          p.username = cleanName;
          p.authenticated = true;
          ws.send(JSON.stringify({
            type: 'profile_synced',
            user: sanitizeUserForClient(uRec, isAdminUser(p.username))
          }));
          broadcastHubState();
        }
        break;
      }

      case 'chat': {
        if (!p.authenticated) return;
        const uRec = ensureUserRecord(p.username);
        if (uRec.moderation && uRec.moderation.mutedUntil > Date.now() && !isAdminUser(p.username)) {
          const remMin = Math.ceil((uRec.moderation.mutedUntil - Date.now()) / 60000);
          ws.send(JSON.stringify({
            type: 'chat',
            sender: 'MODERATION',
            text: `You are muted from chat (${remMin} min remaining).`,
            style: 'duel-win'
          }));
          return;
        }

        const text = String(msg.text || '').trim().slice(0, 240);
        if (!text) return;
        broadcastAll({
          type: 'chat',
          sender: p.username,
          senderId: p.id,
          text,
          style: isAdminUser(p.username) ? 'duel-announce' : (p.mode === 'duel' ? 'duel-chat' : 'user'),
          timestamp: Date.now()
        });
        break;
      }

      case 'send_direct_challenge': {
        if (!p.authenticated || p.mode === 'duel' || p.mode === 'team2v2') return;
        const target = getPlayerById(msg.targetId);
        if (!target || target.id === p.id || !target.authenticated || target.mode === 'duel' || target.mode === 'team2v2') return;

        for (const [, ch] of directChallenges.entries()) {
          if (ch.fromId === p.id) return;
        }

        const cid = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const timer = setTimeout(() => {
          if (directChallenges.has(cid)) {
            directChallenges.delete(cid);
            sendToPlayer(p.id, { type: 'challenge_cleared', challengeId: cid });
            sendToPlayer(target.id, { type: 'challenge_cleared', challengeId: cid });
          }
        }, 60000);

        directChallenges.set(cid, {
          id: cid,
          fromId: p.id,
          fromName: p.username,
          toId: target.id,
          toName: target.username,
          timer
        });

        sendToPlayer(target.id, {
          type: 'direct_challenge_received',
          challengeId: cid,
          fromId: p.id,
          fromName: p.username
        });
        break;
      }

      case 'respond_direct_challenge': {
        const ch = directChallenges.get(msg.challengeId);
        if (!ch || ch.toId !== p.id) return;
        clearTimeout(ch.timer);
        directChallenges.delete(ch.id);

        const challenger = getPlayerById(ch.fromId);
        if (!challenger || !msg.accept || challenger.mode === 'duel' || p.mode === 'duel') {
          if (challenger) sendToPlayer(challenger.id, { type: 'challenge_cleared', challengeId: ch.id });
          return;
        }

        startDuelRoom(challenger, p, 3, null, null, false);
        break;
      }

      case 'join_1v1_queue': {
        if (!p.authenticated || p.mode === 'duel' || p.mode === 'team2v2') return;
        eliminateOrRemoveFromActiveModes(p);
        p.mode = 'queue_1v1';
        queue1v1.push(p.id);
        ws.send(JSON.stringify({ type: 'queued_1v1', count: queue1v1.length }));
        tryMatchmake1v1();
        break;
      }

      case 'leave_1v1_queue': {
        eliminateOrRemoveFromActiveModes(p);
        broadcastHubState();
        break;
      }

      // Blind / Invisible Board 1v1 Queue
      case 'join_blind_1v1_queue': {
        if (!p.authenticated || p.mode === 'duel' || p.mode === 'team2v2') return;
        eliminateOrRemoveFromActiveModes(p);
        p.mode = 'queue_blind_1v1';
        queueBlind1v1.push(p.id);
        ws.send(JSON.stringify({ type: 'queued_blind_1v1', count: queueBlind1v1.length }));
        tryMatchmakeBlind1v1();
        break;
      }

      case 'leave_blind_1v1_queue': {
        eliminateOrRemoveFromActiveModes(p);
        broadcastHubState();
        break;
      }

      case 'join_2v2_queue': {
        if (!p.authenticated || p.mode === 'duel' || p.mode === 'team2v2') return;
        eliminateOrRemoveFromActiveModes(p);
        p.mode = 'queue_2v2';
        queue2v2.push(p.id);
        ws.send(JSON.stringify({ type: 'queued_2v2', count: queue2v2.length }));
        tryMatchmake2v2();
        break;
      }

      case 'leave_2v2_queue': {
        eliminateOrRemoveFromActiveModes(p);
        broadcastHubState();
        break;
      }

      case 'join_ffa_lobby': {
        if (!p.authenticated || p.mode === 'duel' || p.mode === 'team2v2') return;
        eliminateOrRemoveFromActiveModes(p);
        p.mode = 'ffa';
        p.ffaTargetMode = 'random';
        p.manualTargetId = null;

        if (ffaLobby.state === 'playing' || ffaLobby.state === 'summary') {
          ffaLobby.players.set(p.id, {
            id: p.id,
            username: p.username,
            role: 'waiting_next',
            alive: false,
            apm: 0,
            pps: 0,
            linesCleared: 0,
            attackSent: 0,
            garbageReceived: 0,
            maxCombo: 0,
            stackHeight: 0,
            lastAttackerId: null,
            grid: null,
            activePiece: null,
            pendingGarbage: 0,
            apmHistory: []
          });
          ws.send(JSON.stringify({
            type: 'ffa_temp_spectator',
            playerCount: ffaLobby.players.size
          }));
          broadcastHubState();
        } else if (ffaLobby.state === 'countdown') {
          const remMs = Math.max(400, ffaLobby.countdownEndsAt - Date.now());
          ffaLobby.players.set(p.id, {
            id: p.id,
            username: p.username,
            role: 'active',
            alive: true,
            apm: 0,
            pps: 0,
            linesCleared: 0,
            attackSent: 0,
            garbageReceived: 0,
            maxCombo: 0,
            stackHeight: 0,
            lastAttackerId: null,
            grid: null,
            activePiece: null,
            pendingGarbage: 0,
            apmHistory: []
          });
          ws.send(JSON.stringify({
            type: 'ffa_countdown_start',
            seed: ffaLobby.activeSeed,
            countdownMs: remMs,
            playerCount: ffaLobby.players.size
          }));
          broadcastHubState();
        } else {
          ffaLobby.players.set(p.id, {
            id: p.id,
            username: p.username,
            role: 'active',
            alive: true,
            apm: 0,
            pps: 0,
            linesCleared: 0,
            attackSent: 0,
            garbageReceived: 0,
            maxCombo: 0,
            stackHeight: 0,
            lastAttackerId: null,
            grid: null,
            activePiece: null,
            pendingGarbage: 0,
            apmHistory: []
          });
          evaluateFfaLobbyState();
        }
        break;
      }

      case 'set_ffa_target': {
        if (msg.targetMode && ['payback', 'ko', 'apm', 'random'].includes(msg.targetMode)) {
          p.ffaTargetMode = msg.targetMode;
          p.manualTargetId = null;
        }
        if (msg.manualTargetId) {
          p.manualTargetId = String(msg.manualTargetId);
        }
        break;
      }

      case 'spectate_match': {
        if (!p.authenticated) return;
        eliminateOrRemoveFromActiveModes(p);
        const matchId = String(msg.matchId || '');
        if (matchId === 'ffa_main') {
          p.mode = 'spectate_ffa';
          ffaLobby.spectators.add(p.id);
          ws.send(JSON.stringify({
            type: 'spectate_init',
            matchType: 'ffa',
            matchId: 'ffa_main',
            title: `SPECTATING FFA ARENA (${ffaLobby.players.size} PLAYERS)`
          }));
          broadcastHubState();
        } else if (duelRooms.has(matchId)) {
          const room = duelRooms.get(matchId);
          p.mode = 'spectate_duel';
          room.spectators.add(p.id);
          ws.send(JSON.stringify({
            type: 'spectate_init',
            matchType: 'duel',
            matchId: room.id,
            roomId: room.id,
            title: `SPECTATING 1v1: ${room.p1.username} (${room.p1.score}) vs (${room.p2.score}) ${room.p2.username}`,
            p1: { id: room.p1.id, username: room.p1.username, score: room.p1.score },
            p2: { id: room.p2.id, username: room.p2.username, score: room.p2.score },
            round: room.round
          }));
          broadcastHubState();
        } else if (teamRooms.has(matchId)) {
          const tRoom = teamRooms.get(matchId);
          p.mode = 'spectate_team2v2';
          tRoom.spectators.add(p.id);
          ws.send(JSON.stringify({
            type: 'spectate_init',
            matchType: 'team2v2',
            matchId: tRoom.id,
            title: `SPECTATING 2v2: Team Alpha (${tRoom.alphaScore}) vs (${tRoom.bravoScore}) Team Bravo`
          }));
          broadcastHubState();
        }
        break;
      }

      case 'afk_timeout_kick': {
        systemChatBroadcast(`[IDLE KICK] ${p.username} was eliminated/kicked for being AFK for 15 seconds.`, 'system');
        eliminateOrRemoveFromActiveModes(p);
        broadcastHubState();
        break;
      }

      case 'leave_active_mode': {
        eliminateOrRemoveFromActiveModes(p);
        broadcastHubState();
        break;
      }

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
        updateDailyChallengesForUser(uRec, { linesAdded: added, maxCombo: msg.maxCombo || 0, matchCompleted: false });
        awardXpAndSave(uRec, added * 6, 'Zen Lines Progress');
        ws.send(JSON.stringify({
          type: 'profile_synced',
          user: sanitizeUserForClient(uRec, isAdminUser(p.username))
        }));
        broadcastHubState();
        break;
      }

      // 1-Minute APM Test Completion + Replay Saving
      case 'apm_test_complete': {
        if (!p.authenticated) return;
        const recordedApm = Number(Number(msg.apm || 0).toFixed(1));
        const lines = Number(msg.linesCleared) || 0;
        const combo = Number(msg.maxCombo) || 0;

        const uRec = ensureUserRecord(p.username);
        uRec.stats.gamesPlayed += 1;
        uRec.stats.apmTestLast = recordedApm;

        const isNewBest = recordedApm >= (uRec.stats.apmTestBest || 0);
        if (isNewBest) {
          uRec.stats.apmTestBest = recordedApm;
          if (msg.replay && Array.isArray(msg.replay.events)) {
            uRec.replays.apmTest = {
              seed: msg.replay.seed,
              cols: 4,
              metricLabel: `${recordedApm} APM`,
              recordedAt: new Date().toISOString(),
              events: msg.replay.events.slice(0, 6000)
            };
          }
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

        updateDailyChallengesForUser(uRec, { linesAdded: lines, maxCombo: combo, matchCompleted: true });
        awardXpAndSave(uRec, 100 + Math.round(recordedApm * 2), '1-Minute APM Test Completed');

        ws.send(JSON.stringify({
          type: 'profile_synced',
          user: sanitizeUserForClient(uRec, isAdminUser(p.username))
        }));
        systemChatBroadcast(`[APM TEST] ${p.username} recorded ${recordedApm} APM in the 1-Minute APM Test!`, 'system');
        broadcastHubState();
        break;
      }

      // 40-Line Sprint Completion + Replay Saving
      case 'sprint_40_complete': {
        if (!p.authenticated) return;
        const timeSec = Number(Number(msg.timeSec || 0).toFixed(2));
        if (timeSec <= 0) return;
        const apm = Number(Number(msg.apm || 0).toFixed(1));
        const combo = Number(msg.maxCombo) || 0;

        const uRec = ensureUserRecord(p.username);
        uRec.stats.gamesPlayed += 1;
        uRec.stats.sprint40Last = timeSec;

        const isNewBest = !uRec.stats.sprint40Best || uRec.stats.sprint40Best <= 0 || timeSec <= uRec.stats.sprint40Best;
        if (isNewBest) {
          uRec.stats.sprint40Best = timeSec;
          if (msg.replay && Array.isArray(msg.replay.events)) {
            uRec.replays.sprint40 = {
              seed: msg.replay.seed,
              cols: 4,
              metricLabel: `${timeSec.toFixed(2)}s`,
              recordedAt: new Date().toISOString(),
              events: msg.replay.events.slice(0, 6000)
            };
          }
        }

        uRec.stats.totalLinesCleared += 40;
        uRec.stats.maxCombo = Math.max(uRec.stats.maxCombo, combo);
        uRec.matchHistory.push({
          date: new Date().toISOString(),
          mode: '40 LINES SPRINT',
          result: `${timeSec.toFixed(2)}s`,
          apm,
          lines: 40,
          maxCombo: combo
        });

        updateDailyChallengesForUser(uRec, { linesAdded: 40, maxCombo: combo, matchCompleted: true });
        awardXpAndSave(uRec, 140, '40-Line Sprint Completed');

        ws.send(JSON.stringify({
          type: 'profile_synced',
          user: sanitizeUserForClient(uRec, isAdminUser(p.username))
        }));
        systemChatBroadcast(`[40 LINES] ${p.username} completed 40-Line Sprint in ${timeSec.toFixed(2)}s!`, 'system');
        broadcastHubState();
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
            slot.linesCleared = msg.linesCleared || 0;
            slot.attackSent = msg.attackSent || 0;
            slot.garbageReceived = msg.garbageReceived || 0;
            slot.maxCombo = Math.max(slot.maxCombo, msg.maxCombo || 0);
            slot.grid = msg.grid;
            slot.activePiece = msg.activePiece;
            slot.pendingGarbage = msg.pendingGarbage || 0;
            if (Array.isArray(msg.apmHistory)) slot.apmHistory = msg.apmHistory.slice(-120);

            const sdMult = computeSuddenDeathMultiplier(room.roundStartTime);

            const syncPayload = {
              type: 'multi_opponent_sync',
              suddenDeathMultiplier: sdMult,
              tugOfWar: {
                p1Name: room.p1.username,
                p1Apm: room.p1.apm,
                p2Name: room.p2.username,
                p2Apm: room.p2.apm
              },
              opponents: [
                {
                  id: slot.id,
                  username: slot.username,
                  alive: slot.alive,
                  grid: slot.grid,
                  activePiece: slot.activePiece,
                  apm: slot.apm,
                  pps: slot.pps,
                  pendingGarbage: slot.pendingGarbage
                }
              ]
            };

            sendToPlayer(oppSlot.id, syncPayload);

            if (room.spectators.size > 0) {
              const specPayload = {
                type: 'spectator_boards_sync',
                suddenDeathMultiplier: sdMult,
                tugOfWar: {
                  p1Name: room.p1.username,
                  p1Apm: room.p1.apm,
                  p2Name: room.p2.username,
                  p2Apm: room.p2.apm
                },
                boards: [room.p1, room.p2].map(b => ({
                  id: b.id,
                  username: b.username,
                  alive: b.alive,
                  grid: b.grid,
                  activePiece: b.activePiece,
                  apm: b.apm,
                  pps: b.pps,
                  pendingGarbage: b.pendingGarbage
                }))
              };
              for (const specId of room.spectators) {
                sendToPlayer(specId, specPayload);
              }
            }
          }
        } else if (p.mode === 'team2v2' && p.teamRoomId) {
          const tRoom = teamRooms.get(p.teamRoomId);
          if (tRoom && tRoom.active && tRoom.slots.has(p.id)) {
            const slot = tRoom.slots.get(p.id);
            slot.apm = msg.apm || 0;
            slot.pps = msg.pps || 0;
            slot.linesCleared = msg.linesCleared || 0;
            slot.attackSent = msg.attackSent || 0;
            slot.garbageReceived = msg.garbageReceived || 0;
            slot.maxCombo = Math.max(slot.maxCombo, msg.maxCombo || 0);
            slot.grid = msg.grid;
            slot.activePiece = msg.activePiece;
            slot.pendingGarbage = msg.pendingGarbage || 0;
            if (Array.isArray(msg.apmHistory)) slot.apmHistory = msg.apmHistory.slice(-120);

            const sdMult = computeSuddenDeathMultiplier(tRoom.roundStartTime);
            const allSlots = Array.from(tRoom.slots.values());
            const alphaApm = allSlots.filter(s => s.team === 'alpha').reduce((acc, s) => acc + s.apm, 0);
            const bravoApm = allSlots.filter(s => s.team === 'bravo').reduce((acc, s) => acc + s.apm, 0);

            for (const [otherId] of tRoom.slots.entries()) {
              const others = allSlots.filter(s => s.id !== otherId).map(s => ({
                id: s.id,
                username: `[${s.team.toUpperCase()}] ${s.username}`,
                alive: s.alive,
                grid: s.grid,
                activePiece: s.activePiece,
                apm: s.apm,
                pps: s.pps,
                pendingGarbage: s.pendingGarbage
              }));

              sendToPlayer(otherId, {
                type: 'multi_opponent_sync',
                suddenDeathMultiplier: sdMult,
                tugOfWar: { p1Name: 'TEAM ALPHA', p1Apm: alphaApm, p2Name: 'TEAM BRAVO', p2Apm: bravoApm },
                opponents: others
              });
            }

            if (tRoom.spectators.size > 0) {
              const specPayload = {
                type: 'spectator_boards_sync',
                suddenDeathMultiplier: sdMult,
                tugOfWar: { p1Name: 'TEAM ALPHA', p1Apm: alphaApm, p2Name: 'TEAM BRAVO', p2Apm: bravoApm },
                boards: allSlots.map(s => ({
                  id: s.id,
                  username: `[${s.team.toUpperCase()}] ${s.username}`,
                  alive: s.alive,
                  grid: s.grid,
                  activePiece: s.activePiece,
                  apm: s.apm,
                  pps: s.pps,
                  pendingGarbage: s.pendingGarbage
                }))
              };
              for (const specId of tRoom.spectators) sendToPlayer(specId, specPayload);
            }
          }
        } else if (p.mode === 'ffa' && ffaLobby.players.has(p.id)) {
          const slot = ffaLobby.players.get(p.id);
          if (slot.role === 'active') {
            slot.apm = msg.apm || 0;
            slot.pps = msg.pps || 0;
            slot.linesCleared = msg.linesCleared || 0;
            slot.attackSent = msg.attackSent || 0;
            slot.garbageReceived = msg.garbageReceived || 0;
            slot.maxCombo = Math.max(slot.maxCombo, msg.maxCombo || 0);
            slot.grid = msg.grid;
            slot.activePiece = msg.activePiece;
            slot.pendingGarbage = msg.pendingGarbage || 0;
            slot.stackHeight = computeHighestOccupiedRowHeight(msg.grid);
            if (Array.isArray(msg.apmHistory)) slot.apmHistory = msg.apmHistory.slice(-120);
          }

          const sdMult = computeSuddenDeathMultiplier(ffaLobby.roundStartTime);
          const activeSlots = Array.from(ffaLobby.players.values()).filter(s => s.role === 'active');

          for (const [otherId, otherSlot] of ffaLobby.players.entries()) {
            const others = activeSlots
              .filter(s => s.id !== otherId)
              .map(s => ({
                id: s.id,
                username: s.username,
                alive: s.alive,
                grid: s.grid,
                activePiece: s.activePiece,
                apm: s.apm,
                pps: s.pps,
                pendingGarbage: s.pendingGarbage
              }));

            if (otherSlot.role === 'waiting_next') {
              sendToPlayer(otherId, {
                type: 'spectator_boards_sync',
                suddenDeathMultiplier: sdMult,
                boards: others
              });
            } else {
              sendToPlayer(otherId, {
                type: 'multi_opponent_sync',
                suddenDeathMultiplier: sdMult,
                opponents: others
              });
            }
          }

          if (ffaLobby.spectators.size > 0) {
            const specPayload = {
              type: 'spectator_boards_sync',
              suddenDeathMultiplier: sdMult,
              boards: activeSlots.map(s => ({
                id: s.id,
                username: s.username,
                alive: s.alive,
                grid: s.grid,
                activePiece: s.activePiece,
                apm: s.apm,
                pps: s.pps,
                pendingGarbage: s.pendingGarbage
              }))
            };
            for (const specId of ffaLobby.spectators) {
              sendToPlayer(specId, specPayload);
            }
          }
        }
        break;
      }

      case 'send_garbage': {
        const baseLines = Number(msg.lines) || 0;
        if (baseLines <= 0) return;

        if (p.mode === 'duel' && p.duelRoomId) {
          const room = duelRooms.get(p.duelRoomId);
          if (room && room.active && room.roundInProgress) {
            const mult = computeSuddenDeathMultiplier(room.roundStartTime);
            const scaledLines = Math.max(1, Math.round(baseLines * mult));
            const targetId = room.p1.id === p.id ? room.p2.id : room.p1.id;
            sendToPlayer(targetId, {
              type: 'receive_garbage',
              lines: scaledLines,
              fromName: p.username,
              multiplier: mult
            });
          }
        } else if (p.mode === 'team2v2' && p.teamRoomId) {
          const tRoom = teamRooms.get(p.teamRoomId);
          if (tRoom && tRoom.active && tRoom.roundInProgress && tRoom.slots.has(p.id)) {
            const senderSlot = tRoom.slots.get(p.id);
            if (!senderSlot.alive) return;
            const mult = computeSuddenDeathMultiplier(tRoom.roundStartTime);
            const scaledLines = Math.max(1, Math.round(baseLines * mult));
            const enemySlots = Array.from(tRoom.slots.values()).filter(s => s.team !== senderSlot.team && s.alive);
            if (enemySlots.length > 0) {
              const target = enemySlots[Math.floor(Math.random() * enemySlots.length)];
              sendToPlayer(target.id, {
                type: 'receive_garbage',
                lines: scaledLines,
                fromName: p.username,
                multiplier: mult
              });
            }
          }
        } else if (p.mode === 'ffa' && ffaLobby.state === 'playing' && ffaLobby.players.has(p.id)) {
          const senderSlot = ffaLobby.players.get(p.id);
          if (senderSlot.role !== 'active' || !senderSlot.alive) return;
          const mult = computeSuddenDeathMultiplier(ffaLobby.roundStartTime);
          const scaledLines = Math.max(1, Math.round(baseLines * mult));
          const targetSlot = selectFfaTarget(senderSlot, p.ffaTargetMode, p.manualTargetId);

          if (targetSlot) {
            targetSlot.lastAttackerId = p.id;
            sendToPlayer(targetSlot.id, {
              type: 'receive_garbage',
              lines: scaledLines,
              fromName: p.username,
              multiplier: mult
            });
          }
        }
        break;
      }

      case 'player_topout': {
        if (p.mode === 'duel' && p.duelRoomId) {
          handleDuelTopOut(p.duelRoomId, p.id, msg.stats || {});
        } else if (p.mode === 'team2v2' && p.teamRoomId) {
          const tRoom = teamRooms.get(p.teamRoomId);
          if (tRoom && tRoom.active && tRoom.slots.has(p.id)) {
            const slot = tRoom.slots.get(p.id);
            slot.alive = false;
            if (msg.stats) {
              slot.apm = msg.stats.apm || slot.apm;
              slot.pps = msg.stats.pps || slot.pps;
              slot.linesCleared = msg.stats.linesCleared || slot.linesCleared;
              slot.attackSent = msg.stats.attackSent || slot.attackSent;
              slot.garbageReceived = msg.stats.garbageReceived || slot.garbageReceived;
              slot.maxCombo = Math.max(slot.maxCombo, msg.stats.maxCombo || 0);
            }
            evaluateTeam2v2RoundState(tRoom.id);
          }
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

      case 'tourney_register': {
        if (!p.authenticated) return;
        const t = tournamentsDB.find(x => x.id === msg.tourneyId);
        if (!t || t.status !== 'registration') return;
        if (!t.registeredPlayers.includes(p.username) && t.registeredPlayers.length < t.maxPlayers) {
          t.registeredPlayers.push(p.username);
          saveTournamentsAndSync(`${p.username} registered for ${t.name}`);
          broadcastHubState();
        }
        break;
      }

      case 'tourney_queue_match': {
        if (!p.authenticated || p.mode === 'duel' || p.mode === 'team2v2') return;
        const t = tournamentsDB.find(x => x.id === msg.tourneyId);
        if (!t || t.status !== 'active') return;
        const m = t.matches.find(x => x.id === msg.matchId);
        if (!m || m.status !== 'ready') return;

        if (m.p1 === p.username) m.p1Queued = true;
        else if (m.p2 === p.username) m.p2Queued = true;
        else return;

        const p1Online = getPlayerByUsername(m.p1);
        const p2Online = getPlayerByUsername(m.p2);

        if (m.p1Queued && m.p2Queued && p1Online && p2Online && p1Online.mode !== 'duel' && p2Online.mode !== 'duel') {
          startDuelRoom(p1Online, p2Online, t.bestOf, t.id, m.id, false);
        } else {
          saveTournamentsAndSync(`${p.username} queued for match ${m.id}`);
          broadcastHubState();
        }
        break;
      }

      case 'admin_action': {
        if (!p.authenticated) return;
        const callerIsBigL = isAdminUser(p.username);
        const callerIsMod = isModeratorUser(p.username);
        if (!callerIsBigL && !callerIsMod) return;

        const act = msg.action;
        if (!callerIsBigL && act !== 'moderate_user') return;

        if (act === 'moderate_user') {
          const targetKey = String(msg.targetUsername || '').trim().toLowerCase();
          const u = usersDB[targetKey];
          if (!u || isAdminUser(u.username)) return;
          if (!callerIsBigL && u.isModerator) return;

          const sub = msg.subAction;
          const minutes = Math.max(1, Number(msg.minutes) || 10);
          u.moderation.updatedAt = Date.now();

          if (sub === 'ban') {
            u.moderation.banned = true;
            u.moderation.banReason = String(msg.reason || `Banned by ${p.username}`);
            const onlineTarget = getPlayerByUsername(u.username);
            if (onlineTarget) {
              sendToPlayer(onlineTarget.id, { type: 'force_logout', reason: u.moderation.banReason });
            }
          } else if (sub === 'unban') {
            u.moderation.banned = false;
            u.moderation.banReason = '';
          } else if (sub === 'timeout') {
            u.moderation.timeoutUntil = Date.now() + minutes * 60000;
            const onlineTarget = getPlayerByUsername(u.username);
            if (onlineTarget) {
              sendToPlayer(onlineTarget.id, { type: 'force_logout', reason: `Timed out for ${minutes} minutes by ${p.username}.` });
            }
          } else if (sub === 'end_timeout') {
            u.moderation.timeoutUntil = 0;
          } else if (sub === 'mute') {
            u.moderation.mutedUntil = Date.now() + minutes * 60000;
          } else if (sub === 'unmute') {
            u.moderation.mutedUntil = 0;
          }

          saveUserAndSync(u, `Moderation (${sub}) by ${p.username}`, true);
          broadcastHubState();
        } else if (act === 'toggle_moderator' && callerIsBigL) {
          const targetKey = String(msg.targetUsername || '').trim().toLowerCase();
          const u = usersDB[targetKey];
          if (!u || isAdminUser(u.username)) return;
          u.isModerator = !u.isModerator;
          u.moderation.updatedAt = Date.now();
          saveUserAndSync(u, `Moderator Role Toggled (${u.isModerator}) by BigL_`, true);
          const onlineTarget = getPlayerByUsername(u.username);
          if (onlineTarget) {
            sendToPlayer(onlineTarget.id, {
              type: 'profile_synced',
              user: sanitizeUserForClient(u, false)
            });
          }
          broadcastHubState();
        } else if (act === 'shout' && callerIsBigL) {
          const text = String(msg.text || '').trim().slice(0, 120);
          if (text) {
            broadcastAll({
              type: 'admin_shout',
              text,
              from: p.username
            });
            systemChatBroadcast(`[ADMIN SHOUT] ${text}`, 'duel-announce');
          }
        } else if (act === 'send_spectator_garbage' && callerIsBigL) {
          const targetId = String(msg.targetId || '');
          const lines = Math.max(1, Math.min(26, Number(msg.lines) || 4));
          sendToPlayer(targetId, {
            type: 'receive_garbage',
            lines,
            fromName: 'ADMIN BigL_'
          });
        } else if (act === 'restart_lobby' && callerIsBigL) {
          const lobbyId = String(msg.lobbyId || '');
          if (lobbyId === 'ffa_main') {
            if (ffaLobby.players.size >= 2) {
              startFfaCountdown();
            } else {
              ffaLobby.state = 'waiting';
              broadcastFfaRoom({ type: 'ffa_waiting', playerCount: ffaLobby.players.size });
            }
            systemChatBroadcast(`[ADMIN] BigL_ force-restarted the FFA Lobby.`, 'system');
          } else if (duelRooms.has(lobbyId)) {
            const room = duelRooms.get(lobbyId);
            room.p1.score = 0;
            room.p2.score = 0;
            room.round = 1;
            startDuelRoundWithCountdown(room.id);
            systemChatBroadcast(`[ADMIN] BigL_ force-restarted 1v1 lobby (${room.p1.username} vs ${room.p2.username}).`, 'system');
          } else if (teamRooms.has(lobbyId)) {
            const tRoom = teamRooms.get(lobbyId);
            tRoom.alphaScore = 0;
            tRoom.bravoScore = 0;
            tRoom.round = 1;
            startTeam2v2RoundWithCountdown(tRoom.id);
          }
          broadcastHubState();
        } else if (act === 'edit_stats' && callerIsBigL) {
          const targetKey = String(msg.targetUsername || '').trim().toLowerCase();
          const u = usersDB[targetKey];
          if (!u) return;

          if (typeof msg.xp === 'number') u.stats.xp = Math.max(0, msg.xp);
          if (typeof msg.level === 'number' && typeof msg.xp !== 'number') {
            u.stats.xp = Math.pow(Math.max(1, Math.min(100, msg.level)) - 1, 2) * 80;
          }
          u.stats.level = calculateLevel(u.stats.xp);
          if (typeof msg.apmTestBest === 'number') u.stats.apmTestBest = Math.max(0, msg.apmTestBest);
          if (typeof msg.zenLines === 'number') u.stats.zenLines = Math.max(0, msg.zenLines);
          if (typeof msg.duelWins === 'number') u.stats.duelWins = Math.max(0, msg.duelWins);
          if (typeof msg.ffaWins === 'number') u.stats.ffaWins = Math.max(0, msg.ffaWins);
          if (typeof msg.maxCombo === 'number') u.stats.maxCombo = Math.max(0, msg.maxCombo);

          saveUserAndSync(u, `Admin Stat Edit by BigL_`, true);
          const onlineTarget = getPlayerByUsername(u.username);
          if (onlineTarget) {
            sendToPlayer(onlineTarget.id, {
              type: 'profile_synced',
              user: sanitizeUserForClient(u, isAdminUser(u.username))
            });
          }
          broadcastHubState();
        } else if (act === 'create_tournament' && callerIsBigL) {
          const newT = createTournamentObject(msg.params || {}, p.username);
          tournamentsDB.unshift(newT);
          saveTournamentsAndSync(`Created tournament ${newT.name}`);
          systemChatBroadcast(`[NEW TOURNAMENT] Admin BigL_ created "${newT.name}" (${newT.format.toUpperCase()} ELIM | BO${newT.bestOf})! Register in the Tournaments tab!`, 'duel-announce');
          broadcastHubState();
        } else if (act === 'force_start_tournament' && callerIsBigL) {
          const t = tournamentsDB.find(x => x.id === msg.tourneyId);
          if (t && t.status === 'registration') {
            generateBracketForTournament(t);
            systemChatBroadcast(`[TOURNAMENT STARTED] Admin BigL_ closed registration and generated the bracket for "${t.name}"!`, 'duel-announce');
            broadcastHubState();
          }
        } else if (act === 'force_advance_match' && callerIsBigL) {
          const t = tournamentsDB.find(x => x.id === msg.tourneyId);
          if (t && t.status === 'active') {
            advanceTournamentMatchWinner(t, msg.matchId, msg.winnerName, t.winsNeeded, 0, 'ADMIN OVERRIDE');
          }
        } else if (act === 'delete_tournament' && callerIsBigL) {
          tournamentsDB = tournamentsDB.filter(x => x.id !== msg.tourneyId);
          saveTournamentsAndSync(`Deleted tournament ${msg.tourneyId}`);
          broadcastHubState();
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const p = players.get(ws);
    if (!p) return;

    clearPlayerDirectChallenges(p.id);
    eliminateOrRemoveFromActiveModes(p);

    players.delete(ws);
    broadcastHubState();
  });
});

loadLocalDatabases();
pullDatabasesFromGitHubOnBoot().finally(() => {
  server.listen(PORT, () => {
    console.log(`Project A^2 Server running on http://localhost:${PORT}`);
  });
});
