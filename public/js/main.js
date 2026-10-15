// ============================================================================
// MAIN APPLICATION CONTROLLER: RENDERER, INPUT (DAS/ARR/SDF), & WEBSOCKET UI
// ============================================================================

(function () {
  // DOM Elements
  const boardCanvas = document.getElementById('board-canvas');
  const boardCtx = boardCanvas.getContext('2d');
  const holdCanvas = document.getElementById('hold-canvas');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next-canvas');
  const nextCtx = nextCanvas.getContext('2d');
  const oppCanvas = document.getElementById('opponent-canvas');
  const oppCtx = oppCanvas.getContext('2d');

  const matrixBadge = document.getElementById('matrix-badge');
  const matrixSelect = document.getElementById('matrix-select');
  const usernameInput = document.getElementById('username-input');
  const saveProfileBtn = document.getElementById('save-profile-btn');
  const modeZenBtn = document.getElementById('mode-zen-btn');
  const modeFfaBtn = document.getElementById('mode-ffa-btn');
  const restartBtn = document.getElementById('restart-btn');
  const forfeitDuelBtn = document.getElementById('forfeit-duel-btn');

  // Duel Banner Elements
  const duelBanner = document.getElementById('duel-banner');
  const duelP1Name = document.getElementById('duel-p1-name');
  const duelP1Score = document.getElementById('duel-p1-score');
  const duelP2Name = document.getElementById('duel-p2-name');
  const duelP2Score = document.getElementById('duel-p2-score');
  const duelRoundLabel = document.getElementById('duel-round-label');

  // Telemetry Stat Elements
  const statApm = document.getElementById('stat-apm');
  const statPps = document.getElementById('stat-pps');
  const statVs = document.getElementById('stat-vs');
  const statLinesSent = document.getElementById('stat-lines-sent');
  const statRecv = document.getElementById('stat-recv');
  const statCombo = document.getElementById('stat-combo');
  const statB2b = document.getElementById('stat-b2b');
  const garbageMeterFill = document.getElementById('garbage-meter-fill');
  const actionCallout = document.getElementById('action-callout');
  const overlayBanner = document.getElementById('overlay-banner');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySubtitle = document.getElementById('overlay-subtitle');

  // Online List, Challenges & Leaderboards
  const onlineCountEl = document.getElementById('online-count');
  const onlineListEl = document.getElementById('online-players-list');
  const lbContentEl = document.getElementById('leaderboard-content');
  const lbTabs = document.querySelectorAll('.lb-tab');

  const challengeAlertBox = document.getElementById('challenge-alert-box');
  const challengeAlertText = document.getElementById('challenge-alert-text');
  const challengeTimerBar = document.getElementById('challenge-timer-bar');
  const acceptChallengeBtn = document.getElementById('accept-challenge-btn');
  const declineChallengeBtn = document.getElementById('decline-challenge-btn');

  const outgoingChallengeBox = document.getElementById('outgoing-challenge-box');
  const outgoingChallengeText = document.getElementById('outgoing-challenge-text');
  const cancelChallengeBtn = document.getElementById('cancel-challenge-btn');

  // Chat Elements
  const chatMessagesEl = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  // Handling & Settings
  const handling = {
    das: Number(localStorage.getItem('tetrio_das') || 115),
    arr: Number(localStorage.getItem('tetrio_arr') || 10),
    sdf: Number(localStorage.getItem('tetrio_sdf') || 40)
  };

  let myId = null;
  let myUsername = localStorage.getItem('tetrio_username') || '';
  let currentMode = 'zen'; // 'zen', 'ffa', 'duel'
  let currentCols = 4; // Defaults to 4x26 per prompt
  let activeLeaderboardTab = 'byApm';
  let cachedLeaderboards = { byApm: [], byWins: [], byCombo: [], byDuels: [] };
  let sessionGamesCount = 0;
  let sessionTotalReceived = 0;

  let activeIncomingChallenge = null;
  let challengeCountdownTimer = null;
  let opponentState = null;
  let ws = null;

  // Instantiate Core Engine
  const engine = new window.StackerEngine(currentCols, 26, 20, {
    onSfx: (name, comboIdx) => window.AudioController.playSFX(name, comboIdx),
    onCallout: (text) => showCallout(text),
    onSendGarbage: (lines) => {
      if (ws && ws.readyState === WebSocket.OPEN && (currentMode === 'duel' || currentMode === 'ffa')) {
        ws.send(JSON.stringify({ type: 'send_garbage', lines }));
      }
    },
    onTopOut: (stats) => {
      sessionGamesCount += 1;
      sessionTotalReceived += stats.garbageReceived;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'player_topout', stats }));
      }
      if (currentMode !== 'duel') {
        showOverlay('TOP OUT', 'Press R or click RESTART to play again');
      } else {
        showOverlay('ROUND LOST', 'Waiting for next round...');
      }
    },
    onSync: () => sendBoardSync()
  });

  // Fetch /api/resources to initialize dynamic music, SFX, and backgrounds
  fetch('/api/resources')
    .then(r => r.json())
    .then(manifest => {
      window.AudioController.init(manifest);
      window.BackgroundController.init(manifest);
    })
    .catch(() => {
      window.AudioController.init({ bg: [], music: [], sfx: [] });
      window.BackgroundController.init({ bg: [], music: [], sfx: [] });
    });

  // ============================================================================
  // WEBSOCKET CLIENT SETUP
  // ============================================================================

  function connectWebSocket() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}`);

    ws.addEventListener('open', () => {
      if (myUsername) {
        ws.send(JSON.stringify({
          type: 'set_profile',
          username: myUsername,
          boardCols: currentCols,
          mode: currentMode
        }));
      }
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }

      switch (msg.type) {
        case 'welcome':
          myId = msg.id;
          if (!myUsername) {
            myUsername = msg.username;
            usernameInput.value = myUsername;
          } else {
            usernameInput.value = myUsername;
          }
          if (msg.leaderboards) {
            cachedLeaderboards = msg.leaderboards;
            renderLeaderboard();
          }
          break;

        case 'profile_updated':
          myUsername = msg.username;
          usernameInput.value = myUsername;
          localStorage.setItem('tetrio_username', myUsername);
          break;

        case 'online_list':
          renderOnlinePlayers(msg.players || []);
          if (msg.leaderboards) {
            cachedLeaderboards = msg.leaderboards;
            renderLeaderboard();
          }
          break;

        case 'chat':
          appendChatMessage(msg.sender, msg.text, msg.style);
          break;

        case 'error_msg':
          appendChatMessage('ALERT', msg.text, 'duel-win');
          break;

        case 'challenge_sent':
          outgoingChallengeBox.classList.remove('hidden');
          outgoingChallengeText.textContent = `Challenging ${msg.challenge.toName} (${msg.challenge.boardCols}x26)...`;
          break;

        case 'challenge_received':
          activeIncomingChallenge = msg.challenge;
          challengeAlertBox.classList.remove('hidden');
          challengeAlertText.textContent = `${msg.challenge.fromName} challenged you to a ${msg.challenge.boardCols}x26 1v1 Duel!`;
          startChallengeBarTimer(msg.challenge.expiresAt);
          window.AudioController.playSFX('garbage_in');
          break;

        case 'challenge_expired':
        case 'challenge_cleared':
          clearChallengeUI();
          if (msg.text) appendChatMessage('SYSTEM', msg.text, 'system');
          break;

        case 'challenge_declined':
          clearChallengeUI();
          appendChatMessage('SYSTEM', `${msg.byName} declined your 1v1 challenge.`, 'system');
          break;

        case 'duel_init':
          clearChallengeUI();
          currentMode = 'duel';
          currentCols = msg.boardCols;
          matrixSelect.value = String(currentCols);
          matrixSelect.disabled = true;
          modeZenBtn.classList.remove('active');
          modeFfaBtn.classList.remove('active');
          forfeitDuelBtn.classList.remove('hidden');
          updateMatrixBadge();

          duelBanner.classList.remove('hidden');
          duelP1Name.textContent = msg.p1.username;
          duelP1Score.textContent = msg.p1.score;
          duelP2Name.textContent = msg.p2.username;
          duelP2Score.textContent = msg.p2.score;
          duelRoundLabel.textContent = `ROUND ${msg.round} STARTING...`;
          showOverlay('1v1 DUEL READY', `${msg.p1.username} vs ${msg.p2.username} • Get Ready!`);
          break;

        case 'duel_round_start':
          currentCols = msg.boardCols;
          duelP1Score.textContent = msg.p1Score;
          duelP2Score.textContent = msg.p2Score;
          duelRoundLabel.textContent = `ROUND ${msg.round}`;
          hideOverlay();
          engine.reset(msg.seed, currentCols);
          window.BackgroundController.applyNextBackground();
          sendBoardSync();
          break;

        case 'duel_round_result':
          duelP1Score.textContent = msg.p1Score;
          duelP2Score.textContent = msg.p2Score;
          if (msg.roundWinnerId === myId) {
            window.AudioController.playSFX('win');
            showOverlay(`ROUND ${msg.round} VICTORY!`, `Next round starting shortly...`);
          } else {
            showOverlay(`ROUND ${msg.round} LOST`, `${msg.roundWinnerName} took the point`);
          }
          break;

        case 'duel_match_over':
          currentMode = 'zen';
          matrixSelect.disabled = false;
          forfeitDuelBtn.classList.add('hidden');
          modeZenBtn.classList.add('active');
          duelBanner.classList.add('hidden');

          if (msg.winnerId === myId) {
            window.AudioController.playSFX('win');
            showOverlay('1v1 SET VICTORY!', `You defeated ${msg.loserName} (${msg.p1Score}-${msg.p2Score})!`);
          } else {
            window.AudioController.playSFX('lose');
            showOverlay('1v1 SET DEFEAT', `${msg.winnerName} won the set (${msg.p1Score}-${msg.p2Score})`);
          }
          break;

        case 'receive_garbage':
          engine.queueIncomingGarbage(msg.lines);
          break;

        case 'opponent_sync':
          opponentState = msg;
          document.getElementById('opp-header-name').textContent = `VS: ${msg.username}`;
          document.getElementById('opp-live-metrics').textContent = `${msg.apm || 0} APM | ${msg.pps || 0} PPS`;
          drawOpponentBoard(msg);
          break;
      }
    });

    ws.addEventListener('close', () => {
      setTimeout(connectWebSocket, 2500);
    });
  }

  connectWebSocket();

  function sendBoardSync() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (currentMode !== 'duel' && currentMode !== 'ffa') return;
    const metrics = engine.getLiveMetrics();
    ws.send(JSON.stringify({
      type: 'board_sync',
      grid: engine.grid,
      activePiece: engine.activePiece,
      holdPiece: engine.holdPiece,
      nextQueue: engine.nextQueue.slice(0, 5),
      garbageQueue: engine.getPendingGarbageCount(),
      apm: metrics.apm,
      pps: metrics.pps,
      vsScore: metrics.vsScore,
      garbageReceived: metrics.garbageReceived,
      b2b: metrics.b2b,
      combo: metrics.combo,
      maxCombo: metrics.maxCombo
    }));
  }

  // Periodic telemetry sync during multiplayer
  setInterval(() => {
    if (!engine.gameOver && (currentMode === 'duel' || currentMode === 'ffa')) {
      sendBoardSync();
    }
  }, 250);

  // ============================================================================
  // UI HELPERS: ONLINE LIST, CHALLENGES, LEADERBOARDS, CHAT
  // ============================================================================

  function clearChallengeUI() {
    activeIncomingChallenge = null;
    challengeAlertBox.classList.add('hidden');
    outgoingChallengeBox.classList.add('hidden');
    if (challengeCountdownTimer) {
      clearInterval(challengeCountdownTimer);
      challengeCountdownTimer = null;
    }
  }

  function startChallengeBarTimer(expiresAt) {
    if (challengeCountdownTimer) clearInterval(challengeCountdownTimer);
    const total = 60000;
    challengeCountdownTimer = setInterval(() => {
      const rem = Math.max(0, expiresAt - Date.now());
      challengeTimerBar.style.width = `${(rem / total) * 100}%`;
      if (rem <= 0) clearChallengeUI();
    }, 200);
  }

  function renderOnlinePlayers(list) {
    onlineCountEl.textContent = list.length;
    onlineListEl.innerHTML = '';

    list.forEach(p => {
      const row = document.createElement('div');
      row.className = 'pilot-row';

      const info = document.createElement('div');
      info.className = 'pilot-info';
      const isMe = p.id === myId;
      info.innerHTML = `
        <span class="pilot-name">${escapeHtml(p.username)} ${isMe ? '(YOU)' : ''}</span>
        <span class="pilot-meta">${p.mode.toUpperCase()} • ${p.boardCols}x26 • ${p.avgApm} APM • ${p.duelWins}W-${p.duelLosses}L</span>
      `;
      row.appendChild(info);

      if (!isMe && !p.inDuel && currentMode !== 'duel') {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = `⚔ 1v1 (${currentCols}x26)`;
        btn.addEventListener('click', () => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'send_challenge',
              targetId: p.id,
              boardCols: currentCols
            }));
          }
        });
        row.appendChild(btn);
      } else if (p.inDuel) {
        const tag = document.createElement('span');
        tag.className = 'badge';
        tag.textContent = 'IN DUEL';
        row.appendChild(tag);
      }

      onlineListEl.appendChild(row);
    });
  }

  function renderLeaderboard() {
    lbContentEl.innerHTML = '';
    const rows = cachedLeaderboards[activeLeaderboardTab] || [];

    if (rows.length === 0) {
      lbContentEl.innerHTML = `<div class="lb-row"><span class="lb-user">No records yet — complete a round!</span></div>`;
      return;
    }

    rows.forEach((r, idx) => {
      const div = document.createElement('div');
      div.className = 'lb-row';
      let metricStr = '';
      if (activeLeaderboardTab === 'byApm') {
        metricStr = `${r.avgApm.toFixed(1)} APM`;
      } else if (activeLeaderboardTab === 'byWins') {
        metricStr = `${r.ffaWins + r.duelWins} Wins`;
      } else if (activeLeaderboardTab === 'byCombo') {
        metricStr = `${r.maxCombo}x Combo`;
      } else if (activeLeaderboardTab === 'byDuels') {
        metricStr = `${r.duelWins}W - ${r.duelLosses}L (${r.avgApm.toFixed(1)} APM)`;
      }

      div.innerHTML = `
        <span class="lb-rank">#${idx + 1}</span>
        <span class="lb-user">${escapeHtml(r.username)}</span>
        <span class="lb-val">${metricStr}</span>
      `;
      lbContentEl.appendChild(div);
    });
  }

  lbTabs.forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      lbTabs.forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
      activeLeaderboardTab = tabBtn.dataset.tab;
      renderLeaderboard();
    });
  });

  function appendChatMessage(sender, text, style = 'user') {
    const div = document.createElement('div');
    div.className = `chat-line ${style}`;
    div.innerHTML = `<strong>[${escapeHtml(sender)}]:</strong> ${escapeHtml(text)}`;
    chatMessagesEl.appendChild(div);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }

  let calloutTimeout = null;
  function showCallout(text) {
    actionCallout.textContent = text;
    actionCallout.style.opacity = '1';
    if (calloutTimeout) clearTimeout(calloutTimeout);
    calloutTimeout = setTimeout(() => {
      actionCallout.style.opacity = '0';
    }, 1100);
  }

  function showOverlay(title, subtitle) {
    overlayTitle.textContent = title;
    overlaySubtitle.textContent = subtitle || '';
    overlayBanner.classList.remove('hidden');
  }

  function hideOverlay() {
    overlayBanner.classList.add('hidden');
  }

  function updateMatrixBadge() {
    matrixBadge.textContent = `${currentCols}x26 MATRIX`;
    const frame = document.querySelector('.board-frame');
    if (frame) {
      frame.style.aspectRatio = `${currentCols} / 26`;
    }
    boardCanvas.width = currentCols * 32;
    boardCanvas.height = 26 * 32;
  }

  updateMatrixBadge();

  // ============================================================================
  // UI EVENT LISTENERS
  // ============================================================================

  saveProfileBtn.addEventListener('click', () => {
    const val = usernameInput.value.trim();
    if (val && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'set_profile',
        username: val,
        boardCols: currentCols,
        mode: currentMode
      }));
    }
  });

  matrixSelect.addEventListener('change', () => {
    if (currentMode === 'duel') return;
    currentCols = Number(matrixSelect.value) === 10 ? 10 : 4;
    updateMatrixBadge();
    hideOverlay();
    engine.reset(Date.now(), currentCols);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'set_profile',
        username: myUsername,
        boardCols: currentCols,
        mode: currentMode
      }));
    }
  });

  modeZenBtn.addEventListener('click', () => {
    if (currentMode === 'duel') return;
    currentMode = 'zen';
    modeZenBtn.classList.add('active');
    modeFfaBtn.classList.remove('active');
    hideOverlay();
    engine.reset(Date.now(), currentCols);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'set_profile', username: myUsername, boardCols: currentCols, mode: 'zen' }));
    }
  });

  modeFfaBtn.addEventListener('click', () => {
    if (currentMode === 'duel') return;
    currentMode = 'ffa';
    modeFfaBtn.classList.add('active');
    modeZenBtn.classList.remove('active');
    hideOverlay();
    engine.reset(Date.now(), currentCols);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'set_profile', username: myUsername, boardCols: currentCols, mode: 'ffa' }));
    }
  });

  restartBtn.addEventListener('click', () => {
    if (currentMode === 'duel') return;
    hideOverlay();
    engine.reset(Date.now(), currentCols);
  });

  forfeitDuelBtn.addEventListener('click', () => {
    if (currentMode === 'duel' && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'forfeit_duel' }));
    }
  });

  acceptChallengeBtn.addEventListener('click', () => {
    if (activeIncomingChallenge && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'respond_challenge',
        challengeId: activeIncomingChallenge.id,
        accept: true
      }));
      clearChallengeUI();
    }
  });

  declineChallengeBtn.addEventListener('click', () => {
    if (activeIncomingChallenge && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'respond_challenge',
        challengeId: activeIncomingChallenge.id,
        accept: false
      }));
      clearChallengeUI();
    }
  });

  cancelChallengeBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cancel_challenge' }));
      clearChallengeUI();
    }
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat', text }));
    }
    chatInput.value = '';
    chatInput.blur();
  });

  // Media & Settings Modal
  document.getElementById('next-track-btn').addEventListener('click', () => {
    window.AudioController.nextTrack();
  });

  document.getElementById('next-bg-btn').addEventListener('click', () => {
    window.BackgroundController.applyNextBackground();
  });

  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('open-settings-btn').addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });
  document.getElementById('close-settings-btn').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  const bindSlider = (sliderId, labelId, initialVal, onChange) => {
    const s = document.getElementById(sliderId);
    const l = document.getElementById(labelId);
    s.value = initialVal;
    l.textContent = initialVal;
    s.addEventListener('input', () => {
      l.textContent = s.value;
      onChange(Number(s.value));
    });
  };

  bindSlider('slider-das', 'val-das', handling.das, v => {
    handling.das = v;
    localStorage.setItem('tetrio_das', v);
  });
  bindSlider('slider-arr', 'val-arr', handling.arr, v => {
    handling.arr = v;
    localStorage.setItem('tetrio_arr', v);
  });
  bindSlider('slider-sdf', 'val-sdf', handling.sdf, v => {
    handling.sdf = v;
    localStorage.setItem('tetrio_sdf', v);
  });
  bindSlider('slider-music', 'val-music', 40, v => window.AudioController.setMusicVolume(v / 100));
  bindSlider('slider-sfx', 'val-sfx', 75, v => window.AudioController.setSfxVolume(v / 100));
  bindSlider('slider-bg-interval', 'val-bg-interval', 60, v => window.BackgroundController.setShuffleInterval(v));

  // ============================================================================
  // PRECISION INPUT HANDLING (DAS, ARR, SDF)
  // ============================================================================

  const keysDown = new Set();
  let moveDir = 0; // -1 left, 1 right
  let dasTimer = 0;
  let arrTimer = 0;
  let softDropTimer = 0;

  function isTypingInInput() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  window.addEventListener('keydown', (e) => {
    if (isTypingInInput()) return;

    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    if (e.repeat) return;
    keysDown.add(e.code);

    switch (e.code) {
      case 'ArrowLeft':
        moveDir = -1;
        dasTimer = 0;
        arrTimer = 0;
        engine.moveHorizontal(-1);
        break;
      case 'ArrowRight':
        moveDir = 1;
        dasTimer = 0;
        arrTimer = 0;
        engine.moveHorizontal(1);
        break;
      case 'ArrowUp':
      case 'KeyX':
        engine.rotate(1); // CW
        break;
      case 'KeyZ':
      case 'ControlLeft':
      case 'ControlRight':
        engine.rotate(3); // CCW
        break;
      case 'KeyA':
        engine.rotate(2); // 180
        break;
      case 'Space':
        engine.hardDrop();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyC':
        engine.hold();
        break;
      case 'KeyR':
        if (currentMode !== 'duel') {
          hideOverlay();
          engine.reset(Date.now(), currentCols);
        }
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.code);
    if (e.code === 'ArrowLeft' && moveDir === -1) {
      if (keysDown.has('ArrowRight')) {
        moveDir = 1;
        dasTimer = 0;
        arrTimer = 0;
        engine.moveHorizontal(1);
      } else {
        moveDir = 0;
      }
    } else if (e.code === 'ArrowRight' && moveDir === 1) {
      if (keysDown.has('ArrowLeft')) {
        moveDir = -1;
        dasTimer = 0;
        arrTimer = 0;
        engine.moveHorizontal(-1);
      } else {
        moveDir = 0;
      }
    }
  });

  function updateInputHandling(dtMs) {
    if (engine.gameOver || isTypingInInput()) return;

    // Horizontal DAS & ARR
    if (moveDir !== 0) {
      dasTimer += dtMs;
      if (dasTimer >= handling.das) {
        if (handling.arr === 0) {
          // Instant 0ms ARR slides piece all the way to the wall
          while (engine.moveHorizontal(moveDir)) {}
        } else {
          arrTimer += dtMs;
          while (arrTimer >= handling.arr) {
            arrTimer -= handling.arr;
            if (!engine.moveHorizontal(moveDir)) break;
          }
        }
      }
    }

    // Soft Drop Factor (SDF)
    if (keysDown.has('ArrowDown')) {
      if (handling.sdf >= 40) {
        engine.softDrop(true); // Instant sonic drop
      } else {
        softDropTimer += dtMs;
        const stepMs = Math.max(8, engine.gravityInterval / handling.sdf);
        while (softDropTimer >= stepMs) {
          softDropTimer -= stepMs;
          if (!engine.softDrop(false)) break;
        }
      }
    } else {
      softDropTimer = 0;
    }
  }

  // ============================================================================
  // CANVAS RENDERING (MAIN 4x26 / 10x26 BOARD, HOLD, NEXT, OPPONENT)
  // ============================================================================

  function drawBlock(ctx, x, y, size, color, alpha = 1.0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);

    // Subtle top-left highlight for crisp TETR.IO block bevel
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, 3);
    ctx.restore();
  }

  function renderMainBoard() {
    const cellSize = 32;
    const cols = engine.cols;
    const rows = engine.rows; // 26

    boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

    // 1. Shade the 6 hidden buffer rows (y = 0..5) vs 20 visible rows (y = 6..25)
    boardCtx.fillStyle = 'rgba(255, 30, 70, 0.06)';
    boardCtx.fillRect(0, 0, cols * cellSize, engine.bufferRows * cellSize);

    // Grid lines
    boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    boardCtx.lineWidth = 1;
    for (let r = 0; r <= rows; r++) {
      boardCtx.beginPath();
      boardCtx.moveTo(0, r * cellSize);
      boardCtx.lineTo(cols * cellSize, r * cellSize);
      boardCtx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      boardCtx.beginPath();
      boardCtx.moveTo(c * cellSize, 0);
      boardCtx.lineTo(c * cellSize, rows * cellSize);
      boardCtx.stroke();
    }

    // Skyline danger divider at row 6 (separating 6 buffer rows from 20 playfield rows)
    boardCtx.strokeStyle = 'rgba(255, 61, 87, 0.75)';
    boardCtx.lineWidth = 2;
    boardCtx.beginPath();
    boardCtx.moveTo(0, engine.bufferRows * cellSize);
    boardCtx.lineTo(cols * cellSize, engine.bufferRows * cellSize);
    boardCtx.stroke();

    // 2. Locked Grid Cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = engine.grid[r][c];
        if (cell) {
          drawBlock(boardCtx, c, r, cellSize, window.PIECE_COLORS[cell] || '#ffffff', 1.0);
        }
      }
    }

    // 3. Ghost Piece & Active Piece
    if (engine.activePiece && !engine.gameOver) {
      const p = engine.activePiece;
      const ghostY = engine.getGhostY();
      const pColor = window.PIECE_COLORS[p.type];

      // Ghost Piece
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) {
            drawBlock(boardCtx, p.x + c, ghostY + r, cellSize, pColor, 0.24);
          }
        }
      }

      // Active Piece
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) {
            drawBlock(boardCtx, p.x + c, p.y + r, cellSize, pColor, 1.0);
          }
        }
      }
    }
  }

  function renderMiniPiece(ctx, type, offsetX, offsetY, cellSize = 20, dimmed = false) {
    if (!type) return;
    const mat = window.TETROMINO_MATRICES[type][0];
    const color = dimmed ? '#546e7a' : window.PIECE_COLORS[type];
    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        if (mat[r][c]) {
          drawBlock(ctx, offsetX + c, offsetY + r, cellSize, color, 1.0);
        }
      }
    }
  }

  function renderHoldAndNext() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (engine.holdPiece) {
      renderMiniPiece(holdCtx, engine.holdPiece, 0.8, 0.8, 22, !engine.canHold);
    }

    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const preview = engine.nextQueue.slice(0, 5);
    preview.forEach((type, idx) => {
      renderMiniPiece(nextCtx, type, 0.8, idx * 3.4 + 0.5, 20, false);
    });
  }

  function drawOpponentBoard(opp) {
    if (!opp || !opp.grid) return;
    const rows = opp.grid.length;
    const cols = opp.grid[0] ? opp.grid[0].length : 4;
    const cellSize = 18;
    oppCanvas.width = cols * cellSize;
    oppCanvas.height = rows * cellSize;

    oppCtx.clearRect(0, 0, oppCanvas.width, oppCanvas.height);

    // Skyline line at row 6
    oppCtx.strokeStyle = 'rgba(255, 61, 87, 0.5)';
    oppCtx.beginPath();
    oppCtx.moveTo(0, 6 * cellSize);
    oppCtx.lineTo(cols * cellSize, 6 * cellSize);
    oppCtx.stroke();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = opp.grid[r][c];
        if (cell) {
          drawBlock(oppCtx, c, r, cellSize, window.PIECE_COLORS[cell] || '#fff', 1.0);
        }
      }
    }

    if (opp.activePiece && opp.activePiece.matrix) {
      const p = opp.activePiece;
      const color = window.PIECE_COLORS[p.type] || '#fff';
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) {
            drawBlock(oppCtx, p.x + c, p.y + r, cellSize, color, 1.0);
          }
        }
      }
    }
  }

  function updateHUDTelemetry() {
    const m = engine.getLiveMetrics();
    statApm.textContent = m.apm.toFixed(1);
    statPps.textContent = m.pps.toFixed(2);
    statVs.textContent = m.vsScore.toFixed(1);
    statLinesSent.textContent = `${m.linesCleared} / ${m.attackSent}`;

    const totalGames = Math.max(1, sessionGamesCount + 1);
    const avgRecv = ((sessionTotalReceived + m.garbageReceived) / totalGames).toFixed(1);
    statRecv.textContent = `${m.garbageReceived} / ${avgRecv}`;

    statCombo.textContent = `${m.combo}x (Max ${m.maxCombo}x)`;
    statB2b.textContent = `${m.b2b}x`;

    const meterPct = Math.min(100, (m.pendingGarbage / 20) * 100);
    garbageMeterFill.style.height = `${meterPct}%`;
  }

  // ============================================================================
  // MAIN 60FPS GAME LOOP
  // ============================================================================

  let lastFrameTime = performance.now();
  function gameLoop(now) {
    const dtMs = Math.min(100, now - lastFrameTime);
    lastFrameTime = now;

    updateInputHandling(dtMs);
    engine.update(dtMs);

    renderMainBoard();
    renderHoldAndNext();
    updateHUDTelemetry();

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
})();
