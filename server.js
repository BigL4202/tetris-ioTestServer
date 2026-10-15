const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Ensure resource directories exist so fs.readdir never throws ENOENT
const RESOURCE_DIRS = ['bg', 'music', 'sfx'];
RESOURCE_DIRS.forEach(dir => {
  const fullPath = path.join(__dirname, 'resources', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Serve static files from both /public and root (prevents Render deployment ENOENT issues)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use('/resources', express.static(path.join(__dirname, 'resources')));

// Dynamic asset scanner endpoint so you can drop any files into /resources/
app.get('/api/resources', (req, res) => {
  const readDirSafe = (subDir, validExts) => {
    const dirPath = path.join(__dirname, 'resources', subDir);
    try {
      if (!fs.existsSync(dirPath)) return [];
      return fs.readdirSync(dirPath)
        .filter(file => validExts.some(ext => file.toLowerCase().endsWith(ext)))
        .map(file => `/resources/${subDir}/${encodeURIComponent(file)}`);
    } catch (err) {
      return [];
    }
  };

  res.json({
    bg: readDirSafe('bg', ['.jpg', '.jpeg', '.png', '.webp', '.gif']),
    music: readDirSafe('music', ['.mp3', '.ogg', '.wav', '.m4a']),
    sfx: readDirSafe('sfx', ['.wav', '.mp3', '.ogg'])
  });
});

// Render-safe fallback route for index.html
app.get('*', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) {
    res.sendFile(publicIndex);
  } else if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else {
    res.status(404).send('index.html not found in /public or root.');
  }
});

// ============================================================================
// MULTIPLAYER & LEADERBOARD STATE
// ============================================================================

const players = new Map(); // ws -> PlayerObject
const challenges = new Map(); // challengeId -> { id, fromId, fromName, toId, toName, boardCols, createdAt, timer }
const duelRooms = new Map(); // roomId -> DuelRoomObject
const leaderboardDB = new Map(); // username -> StatsRecord

// Pre-seed leaderboard so it is never stuck on "Loading..."
function ensureLeaderboardRecord(username) {
  const key = username.toLowerCase();
  if (!leaderboardDB.has(key)) {
    leaderboardDB.set(key, {
      username: username,
      gamesPlayed: 0,
      ffaWins: 0,
      duelWins: 0,
      duelLosses: 0,
      maxCombo: 0,
      totalApmSum: 0,
      apmSamples: 0,
      avgApm: 0,
      totalReceivedSum: 0,
      receivedSamples: 0,
      avgReceived: 0
    });
  }
  return leaderboardDB.get(key);
}

function recordPlayerMatchStats(username, stats) {
  const rec = ensureLeaderboardRecord(username);
  rec.gamesPlayed += 1;
  if (stats.ffaWin) rec.ffaWins += 1;
  if (stats.duelWin) rec.duelWins += 1;
  if (stats.duelLoss) rec.duelLosses += 1;
  if (stats.maxCombo && stats.maxCombo > rec.maxCombo) {
    rec.maxCombo = stats.maxCombo;
  }
  if (typeof stats.apm === 'number' && !isNaN(stats.apm)) {
    rec.totalApmSum += stats.apm;
    rec.apmSamples += 1;
    rec.avgApm = Number((rec.totalApmSum / rec.apmSamples).toFixed(1));
  }
  if (typeof stats.garbageReceived === 'number' && !isNaN(stats.garbageReceived)) {
    rec.totalReceivedSum += stats.garbageReceived;
    rec.receivedSamples += 1;
    rec.avgReceived = Number((rec.totalReceivedSum / rec.receivedSamples).toFixed(1));
  }
}

function getCompiledLeaderboards() {
  const all = Array.from(leaderboardDB.values());
  return {
    byApm: [...all].sort((a, b) => b.avgApm - a.avgApm).slice(0, 25),
    byWins: [...all].sort((a, b) => (b.ffaWins + b.duelWins) - (a.ffaWins + a.duelWins)).slice(0, 25),
    byCombo: [...all].sort((a, b) => b.maxCombo - a.maxCombo).slice(0, 25),
    byDuels: [...all].sort((a, b) => {
      if (b.duelWins !== a.duelWins) return b.duelWins - a.duelWins;
      return a.duelLosses - b.duelLosses;
    }).slice(0, 25)
  };
}

function broadcastAll(payload) {
  const data = JSON.stringify(payload);
  for (const [clientWs] of players.entries()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
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
    const rec = ensureLeaderboardRecord(p.username);
    list.push({
      id: p.id,
      username: p.username,
      mode: p.mode, // 'zen', 'ffa', 'duel'
      boardCols: p.boardCols || 4,
      inDuel: p.mode === 'duel',
      avgApm: rec.avgApm,
      duelWins: rec.duelWins,
      duelLosses: rec.duelLosses
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
    sender: 'SYSTEM',
    text,
    style,
    timestamp: Date.now()
  });
}

// Clear any active outgoing or incoming challenge for a specific player
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

  // Clear pending challenges for both players
  clearPlayerChallenges(p1.id, 'Entered a 1v1 Duel');
  clearPlayerChallenges(p2.id, 'Entered a 1v1 Duel');

  // Remove both players from Zen / FFA and lock them into the dedicated 1v1 room
  p1.mode = 'duel';
  p1.duelRoomId = roomId;
  p1.boardCols = boardCols;

  p2.mode = 'duel';
  p2.duelRoomId = roomId;
  p2.boardCols = boardCols;

  const room = {
    id: roomId,
    boardCols: boardCols,
    p1: { id: p1.id, username: p1.username, score: 0, alive: true, apm: 0, pps: 0, garbageReceived: 0, maxCombo: 0 },
    p2: { id: p2.id, username: p2.username, score: 0, alive: true, apm: 0, pps: 0, garbageReceived: 0, maxCombo: 0 },
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
      seed: seed,
      boardCols: room.boardCols,
      p1Score: room.p1.score,
      p2Score: room.p2.score
    };

    sendToPlayer(room.p1.id, startPayload);
    sendToPlayer(room.p2.id, startPayload);
  }, delayMs);
}

function checkDuelSetWin(scoreA, scoreB) {
  // First to 6, must win by at least 2 points
  if (scoreA >= 6 && (scoreA - scoreB) >= 2) return true;
  return false;
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
  }

  const setWon = checkDuelSetWin(winnerSlot.score, loserSlot.score);

  if (setWon) {
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

  // Record final stats into persistent leaderboard DB
  recordPlayerMatchStats(winnerSlot.username, {
    duelWin: true,
    duelLoss: false,
    apm: winnerSlot.apm,
    garbageReceived: winnerSlot.garbageReceived,
    maxCombo: winnerSlot.maxCombo
  });

  recordPlayerMatchStats(loserSlot.username, {
    duelWin: false,
    duelLoss: true,
    apm: loserSlot.apm,
    garbageReceived: loserSlot.garbageReceived,
    maxCombo: loserSlot.maxCombo
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
      `[1v1 DUEL FORFEIT] ${loserSlot.username} disconnected! ${winnerSlot.username} wins the set (${room.p1.score}-${room.p2.score})!`,
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
  const defaultUsername = `Stacker_${Math.floor(1000 + Math.random() * 9000)}`;

  const playerState = {
    id: playerId,
    ws: ws,
    username: defaultUsername,
    mode: 'zen', // 'zen', 'ffa', 'duel'
    boardCols: 4, // Defaults to 4x26 per user spec, toggleable to 10x26
    duelRoomId: null
  };

  players.set(ws, playerState);
  ensureLeaderboardRecord(defaultUsername);

  // Immediately hydrate client with its ID and full leaderboards
  ws.send(JSON.stringify({
    type: 'welcome',
    id: playerId,
    username: defaultUsername,
    leaderboards: getCompiledLeaderboards()
  }));

  broadcastOnlineList();

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
      case 'set_profile': {
        const cleanName = String(msg.username || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 18);
        if (cleanName.length >= 2) {
          p.username = cleanName;
          ensureLeaderboardRecord(p.username);
        }
        if (msg.boardCols === 4 || msg.boardCols === 10) {
          if (p.mode !== 'duel') p.boardCols = msg.boardCols;
        }
        if (msg.mode && ['zen', 'ffa'].includes(msg.mode) && p.mode !== 'duel') {
          p.mode = msg.mode;
        }
        ws.send(JSON.stringify({
          type: 'profile_updated',
          username: p.username,
          boardCols: p.boardCols,
          mode: p.mode
        }));
        broadcastOnlineList();
        break;
      }

      case 'chat': {
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

      // 1v1 Challenge System: 1 active challenge limit, 60-second expiration
      case 'send_challenge': {
        if (p.mode === 'duel') {
          ws.send(JSON.stringify({ type: 'error_msg', text: 'You are already in an active 1v1 Duel.' }));
          return;
        }

        // Enforce 1 active outgoing challenge per player
        for (const [, ch] of challenges.entries()) {
          if (ch.fromId === p.id) {
            ws.send(JSON.stringify({ type: 'error_msg', text: 'You already have an active challenge pending (max 1 at a time).' }));
            return;
          }
        }

        const target = getPlayerById(msg.targetId);
        if (!target || target.id === p.id) {
          ws.send(JSON.stringify({ type: 'error_msg', text: 'Target player is unavailable.' }));
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
          challenge: {
            id: chObj.id,
            toId: chObj.toId,
            toName: chObj.toName,
            boardCols: chObj.boardCols,
            expiresAt: chObj.expiresAt
          }
        });

        sendToPlayer(target.id, {
          type: 'challenge_received',
          challenge: {
            id: chObj.id,
            fromId: chObj.fromId,
            fromName: chObj.fromName,
            boardCols: chObj.boardCols,
            expiresAt: chObj.expiresAt
          }
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
          ws.send(JSON.stringify({ type: 'error_msg', text: 'One of the players is already in a duel.' }));
          return;
        }

        startDuelRoom(challenger, p, ch.boardCols);
        break;
      }

      case 'cancel_challenge': {
        clearPlayerChallenges(p.id, 'Cancelled by sender');
        break;
      }

      // Live Board & Stats Sync
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
          // Broadcast preview to other FFA players
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

      // Garbage Attack Routing
      case 'send_garbage': {
        const lines = Number(msg.lines) || 0;
        if (lines <= 0) return;

        if (p.mode === 'duel' && p.duelRoomId) {
          const room = duelRooms.get(p.duelRoomId);
          if (room && room.active && room.roundInProgress) {
            const targetId = (room.p1.id === p.id) ? room.p2.id : room.p1.id;
            sendToPlayer(targetId, {
              type: 'receive_garbage',
              lines: lines,
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
              lines: lines,
              fromName: p.username
            });
          }
        }
        break;
      }

      // Top-Out / Game Over Reporting
      case 'player_topout': {
        if (p.mode === 'duel' && p.duelRoomId) {
          handleDuelTopOut(p.duelRoomId, p.id, msg.stats || {});
        } else {
          // Record stats for FFA / Zen session
          recordPlayerMatchStats(p.username, {
            ffaWin: Boolean(msg.stats && msg.stats.ffaWin),
            apm: msg.stats ? msg.stats.apm : 0,
            garbageReceived: msg.stats ? msg.stats.garbageReceived : 0,
            maxCombo: msg.stats ? msg.stats.maxCombo : 0
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

    // If player disconnects during an active 1v1 Duel, award automatic win to opponent
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
  console.log(`TETR.IO 4x26 / 10x26 Server running on port ${PORT}`);
});
