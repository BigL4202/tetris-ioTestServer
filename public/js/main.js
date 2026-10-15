// ============================================================================
// PROJECT A^2 CONTROLLER: HUB, LEVELING, 1:00 APM TEST, 1v1 BO3, FFA & STATS
// ============================================================================

(function () {
  // Screens & Navigation
  const authScreen = document.getElementById('auth-screen');
  const topBar = document.getElementById('top-bar');
  const hubScreen = document.getElementById('hub-screen');
  const arenaScreen = document.getElementById('arena-screen');
  const postMatchScreen = document.getElementById('post-match-screen');
  const returnHubBtn = document.getElementById('return-hub-btn');

  // Auth Elements
  const authForm = document.getElementById('auth-form');
  const authUsernameInput = document.getElementById('auth-username');
  const authPasswordInput = document.getElementById('auth-password');
  const registerSubmitBtn = document.getElementById('register-submit-btn');
  const authErrorBox = document.getElementById('auth-error-box');
  const logoutBtn = document.getElementById('logout-btn');

  // Pilot Level Strip
  const navPilotName = document.getElementById('nav-pilot-name');
  const navPilotLevel = document.getElementById('nav-pilot-level');
  const navXpFill = document.getElementById('nav-xp-fill');
  const navXpText = document.getElementById('nav-xp-text');

  // Hub Elements
  const hubTabPlay = document.getElementById('hub-tab-play');
  const hubTabStats = document.getElementById('hub-tab-stats');
  const hubPlayView = document.getElementById('hub-play-view');
  const hubStatsView = document.getElementById('hub-stats-view');

  const launchZen4Btn = document.getElementById('launch-zen-4-btn');
  const launchZen10Btn = document.getElementById('launch-zen-10-btn');
  const launchApmTestBtn = document.getElementById('launch-apm-test-btn');
  const join1v1QueueBtn = document.getElementById('join-1v1-queue-btn');
  const leave1v1QueueBtn = document.getElementById('leave-1v1-queue-btn');
  const queueWaitingBanner = document.getElementById('queue-waiting-banner');
  const joinFfaLobbyBtn = document.getElementById('join-ffa-lobby-btn');
  const hub1v1QueueStatus = document.getElementById('hub-1v1-queue-status');
  const hubFfaStatus = document.getElementById('hub-ffa-status');

  // Leaderboards & Player Stats Directory
  const lbContentEl = document.getElementById('leaderboard-content');
  const lbTabs = document.querySelectorAll('.lb-tab');
  const pilotSearchInput = document.getElementById('pilot-search-input');
  const allPilotsDirectory = document.getElementById('all-pilots-directory');
  const inspectedPilotTitle = document.getElementById('inspected-pilot-title');
  const inspectedPilotBody = document.getElementById('inspected-pilot-body');

  // Arena Elements
  const arenaModeTitle = document.getElementById('arena-mode-title');
  const arenaScoreStrip = document.getElementById('arena-score-strip');
  const arenaTimerDisplay = document.getElementById('arena-timer-display');
  const arenaRestartBtn = document.getElementById('arena-restart-btn');
  const arenaLeaveBtn = document.getElementById('arena-leave-btn');
  const opponentPreviewPanel = document.getElementById('opponent-preview-panel');

  const boardCanvas = document.getElementById('board-canvas');
  const boardCtx = boardCanvas.getContext('2d');
  const holdCanvas = document.getElementById('hold-canvas');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next-canvas');
  const nextCtx = nextCanvas.getContext('2d');
  const oppCanvas = document.getElementById('opponent-canvas');
  const oppCtx = oppCanvas.getContext('2d');

  const statApm = document.getElementById('stat-apm');
  const statPps = document.getElementById('stat-pps');
  const statLinesSent = document.getElementById('stat-lines-sent');
  const statRecv = document.getElementById('stat-recv');
  const statCombo = document.getElementById('stat-combo');
  const statB2b = document.getElementById('stat-b2b');
  const garbageMeterFill = document.getElementById('garbage-meter-fill');
  const actionCallout = document.getElementById('action-callout');
  const overlayBanner = document.getElementById('overlay-banner');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySubtitle = document.getElementById('overlay-subtitle');

  // Chat Drawer Elements ("Chat" + top-right X button)
  const chatDrawer = document.getElementById('chat-drawer');
  const toggleChatBtn = document.getElementById('toggle-chat-btn');
  const closeChatBtn = document.getElementById('close-chat-btn');
  const chatMessagesEl = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  const handling = {
    das: Number(localStorage.getItem('a2_das') || 115),
    arr: Number(localStorage.getItem('a2_arr') || 10),
    sdf: Number(localStorage.getItem('a2_sdf') || 40)
  };

  let myId = null;
  let myUserObj = null;
  let isAuthenticated = false;
  let activeScreen = 'auth'; // 'auth', 'hub', 'arena'
  let currentMode = 'hub'; // 'zen4', 'zen10', 'apm_test', 'duel', 'ffa'
  let currentCols = 4;
  let canControlBoard = false; // False during 3s countdown or waiting for FFA players

  let countdownInterval = null;
  let apmTestRemainingMs = 60000;
  let lastReportedZenLines = 0;

  let activeLeaderboardTab = 'byApm';
  let cachedLeaderboards = { byApm: [], byZen: [], byWins: [], byCombo: [], byDuels: [] };
  let cachedAllPlayers = [];
  let ws = null;

  const engine = new window.StackerEngine(4, 26, 20, {
    onSfx: (name, comboIdx) => window.AudioController.playSFX(name, comboIdx),
    onCallout: (text) => showCallout(text),
    onSendGarbage: (lines) => {
      if (ws && ws.readyState === WebSocket.OPEN && (currentMode === 'duel' || currentMode === 'ffa')) {
        ws.send(JSON.stringify({ type: 'send_garbage', lines }));
      }
    },
    onTopOut: (stats) => {
      canControlBoard = false;
      if (currentMode === 'duel' || currentMode === 'ffa') {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'player_topout', stats }));
        }
        showOverlay('TOP OUT', 'Waiting for match result...');
      } else if (currentMode === 'apm_test') {
        finishApmTest();
      } else {
        // Zen modes auto-report any remaining lines
        flushZenLines();
        showOverlay('TOP OUT', 'Press R or click RESTART for a new 3s countdown');
      }
    },
    onSync: () => {
      if (currentMode === 'zen4' || currentMode === 'zen10') {
        flushZenLines();
      }
      sendBoardSync();
    }
  });

  // Load Media Resources
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
  // AUTHENTICATION & LEVEL BAR HYDRATION
  // ============================================================================

  function showAuthError(msg) {
    authErrorBox.textContent = msg;
    authErrorBox.classList.remove('hidden');
  }

  async function submitAuth(endpoint) {
    authErrorBox.classList.add('hidden');
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value;
    if (!username || !password) {
      showAuthError('Enter both a Callsign and Password.');
      return;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showAuthError(data.error || 'Authentication failed.');
        return;
      }

      if (data.leaderboards) cachedLeaderboards = data.leaderboards;
      if (data.allPlayers) cachedAllPlayers = data.allPlayers;
      completeLogin(data.user);
    } catch (e) {
      showAuthError('Could not connect to Project A² server.');
    }
  }

  function updateTopLevelBar(u) {
    if (!u || !u.stats) return;
    myUserObj = u;
    navPilotName.textContent = u.username;
    const lvl = u.stats.level || 1;
    const xp = u.stats.xp || 0;
    const currentFloorXp = Math.pow(lvl - 1, 2) * 100;
    const nextFloorXp = Math.pow(lvl, 2) * 100;
    const pct = Math.min(100, Math.max(0, ((xp - currentFloorXp) / Math.max(1, nextFloorXp - currentFloorXp)) * 100));

    navPilotLevel.textContent = `LVL ${lvl}`;
    navXpFill.style.width = `${pct}%`;
    navXpText.textContent = `${xp} XP`;
  }

  function completeLogin(userObj) {
    isAuthenticated = true;
    updateTopLevelBar(userObj);

    if (userObj.settings) {
      handling.das = userObj.settings.das ?? 115;
      handling.arr = userObj.settings.arr ?? 10;
      handling.sdf = userObj.settings.sdf ?? 40;
      document.getElementById('slider-das').value = handling.das;
      document.getElementById('val-das').textContent = handling.das;
      document.getElementById('slider-arr').value = handling.arr;
      document.getElementById('val-arr').textContent = handling.arr;
      document.getElementById('slider-sdf').value = handling.sdf;
      document.getElementById('val-sdf').textContent = handling.sdf;
    }

    authScreen.classList.add('hidden');
    topBar.classList.remove('hidden');
    navigateToHub();
    window.AudioController.playCurrentMusic();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'auth_bind', username: userObj.username }));
    }
  }

  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAuth('/api/auth/login');
  });

  registerSubmitBtn.addEventListener('click', () => {
    submitAuth('/api/auth/register');
  });

  logoutBtn.addEventListener('click', () => {
    leaveCurrentArenaOrQueue();
    isAuthenticated = false;
    myUserObj = null;
    authPasswordInput.value = '';
    topBar.classList.add('hidden');
    hubScreen.classList.add('hidden');
    arenaScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
  });

  // ============================================================================
  // HUB NAVIGATION, TOP-5 LEADERBOARDS & PLAYER STATS DIRECTORY
  // ============================================================================

  function navigateToHub() {
    activeScreen = 'hub';
    currentMode = 'hub';
    canControlBoard = false;
    if (countdownInterval) clearInterval(countdownInterval);

    arenaScreen.classList.add('hidden');
    postMatchScreen.classList.add('hidden');
    returnHubBtn.classList.add('hidden');
    hubScreen.classList.remove('hidden');

    renderLeaderboard();
    renderPilotsDirectory();
  }

  hubTabPlay.addEventListener('click', () => {
    hubTabPlay.classList.add('active');
    hubTabStats.classList.remove('active');
    hubPlayView.classList.remove('hidden');
    hubStatsView.classList.add('hidden');
  });

  hubTabStats.addEventListener('click', () => {
    hubTabStats.classList.add('active');
    hubTabPlay.classList.remove('active');
    hubStatsView.classList.remove('hidden');
    hubPlayView.classList.add('hidden');
    renderPilotsDirectory();
  });

  function renderLeaderboard() {
    lbContentEl.innerHTML = '';
    const rows = (cachedLeaderboards[activeLeaderboardTab] || []).slice(0, 5);

    if (rows.length === 0) {
      lbContentEl.innerHTML = `<div class="lb-row"><span class="lb-user">No Top-5 records yet!</span></div>`;
      return;
    }

    rows.forEach((r, idx) => {
      const div = document.createElement('div');
      div.className = 'lb-row';
      let val = '';
      if (activeLeaderboardTab === 'byApm') {
        val = `${Number(r.apm || 0).toFixed(1)} APM`;
      } else if (activeLeaderboardTab === 'byZen') {
        val = `${r.zenLines || 0} Lines`;
      } else if (activeLeaderboardTab === 'byWins') {
        val = `${r.wins || 0} Wins`;
      } else if (activeLeaderboardTab === 'byCombo') {
        val = `${r.maxCombo || 0}x Combo`;
      } else if (activeLeaderboardTab === 'byDuels') {
        val = `${r.duelWins || 0}W - ${r.duelLosses || 0}L`;
      }

      div.innerHTML = `
        <span class="lb-rank">#${idx + 1}</span>
        <span class="lb-user">${escapeHtml(r.username)} <small style="color:#ffca28">LVL ${r.level || 1}</small></span>
        <span class="lb-val">${val}</span>
      `;
      lbContentEl.appendChild(div);
    });
  }

  lbTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      lbTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLeaderboardTab = btn.dataset.tab;
      renderLeaderboard();
    });
  });

  function renderPilotsDirectory() {
    const filter = (pilotSearchInput.value || '').trim().toLowerCase();
    allPilotsDirectory.innerHTML = '';

    const list = cachedAllPlayers.filter(p => p.username.toLowerCase().includes(filter));
    list.forEach(p => {
      const row = document.createElement('div');
      row.className = 'pilot-row';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(p.username)}</strong>
          <div class="sub-hint">LVL ${p.stats.level} (${p.stats.xp} XP) • ${p.stats.apmTestBest.toFixed(1)} APM</div>
        </div>
        <span class="badge">VIEW STATS ➔</span>
      `;
      row.addEventListener('click', () => inspectPilotProfile(p));
      allPilotsDirectory.appendChild(row);
    });
  }

  pilotSearchInput.addEventListener('input', renderPilotsDirectory);

  function inspectPilotProfile(p) {
    inspectedPilotTitle.textContent = `PILOT DOSSIER: ${p.username.toUpperCase()} (LVL ${p.stats.level})`;
    const s = p.stats;
    const historyHtml = (p.matchHistory || []).slice().reverse().slice(0, 10).map(m => `
      <tr>
        <td>${escapeHtml(m.mode || '-')}</td>
        <td>${escapeHtml(m.result || '-')}</td>
        <td>${Number(m.apm || 0).toFixed(1)}</td>
        <td>${m.lines || 0}</td>
        <td>${m.maxCombo || 0}x</td>
      </tr>
    `).join('') || `<tr><td colspan="5">No matches logged yet</td></tr>`;

    inspectedPilotBody.innerHTML = `
      <div class="stat-grid-boxes">
        <div class="stat-card"><span class="stat-title">ACCOUNT LEVEL</span><span class="stat-val">LVL ${s.level} (${s.xp} XP)</span></div>
        <div class="stat-card"><span class="stat-title">OFFICIAL APM (BEST)</span><span class="stat-val">${Number(s.apmTestBest || 0).toFixed(1)} APM</span></div>
        <div class="stat-card"><span class="stat-title">LAST APM TEST</span><span class="stat-val">${Number(s.apmTestLast || 0).toFixed(1)} APM</span></div>
        <div class="stat-card"><span class="stat-title">ZEN LINES CLEARED</span><span class="stat-val">${s.zenLines || 0}</span></div>
        <div class="stat-card"><span class="stat-title">1v1 BO3 RECORD</span><span class="stat-val">${s.duelWins || 0}W - ${s.duelLosses || 0}L</span></div>
        <div class="stat-card"><span class="stat-title">FFA WINS</span><span class="stat-val">${s.ffaWins || 0}</span></div>
        <div class="stat-card"><span class="stat-title">MAX COMBO</span><span class="stat-val">${s.maxCombo || 0}x</span></div>
        <div class="stat-card"><span class="stat-title">CAREER LINES / SENT</span><span class="stat-val">${s.totalLinesCleared || 0} / ${s.totalAttackSent || 0}</span></div>
      </div>
      <h4 style="color:var(--accent-cyan);font-size:0.82rem;">RECENT MATCH HISTORY</h4>
      <table class="summary-table">
        <thead>
          <tr><th>MODE</th><th>RESULT</th><th>APM</th><th>LINES</th><th>MAX COMBO</th></tr>
        </thead>
        <tbody>${historyHtml}</tbody>
      </table>
    `;
  }

  // ============================================================================
  // GAME MODE LAUNCHERS & 3-SECOND COUNTDOWN ENGINE
  // ============================================================================

  function configureBoardDimensions(cols) {
    currentCols = cols;
    const frame = document.querySelector('.board-frame');
    if (frame) {
      frame.style.aspectRatio = `${cols} / 26`;
    }
    boardCanvas.width = cols * 32;
    boardCanvas.height = 26 * 32;
  }

  function startThreeSecondCountdown(seed, cols, onGoCallback) {
    if (countdownInterval) clearInterval(countdownInterval);
    canControlBoard = false;
    configureBoardDimensions(cols);
    engine.reset(seed, cols);
    lastReportedZenLines = 0;

    let count = 3;
    showOverlay('3', 'GET READY...');
    window.AudioController.playSFX('move');

    countdownInterval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        showOverlay(String(count), 'GET READY...');
        window.AudioController.playSFX('move');
      } else if (count === 0) {
        showOverlay('GO!', '');
        window.AudioController.playSFX('rotate');
        engine.startTime = performance.now();
        canControlBoard = true;
        if (onGoCallback) onGoCallback();
      } else {
        clearInterval(countdownInterval);
        countdownInterval = null;
        hideOverlay();
      }
    }, 1000);
  }

  function enterArenaMode(modeKey, titleText, cols, seed = Date.now()) {
    activeScreen = 'arena';
    currentMode = modeKey;
    hubScreen.classList.add('hidden');
    postMatchScreen.classList.add('hidden');
    arenaScreen.classList.remove('hidden');
    returnHubBtn.classList.remove('hidden');

    arenaModeTitle.textContent = titleText;
    arenaScoreStrip.textContent = '';

    if (modeKey === 'apm_test') {
      apmTestRemainingMs = 60000;
      arenaTimerDisplay.textContent = '60.0s';
      arenaTimerDisplay.classList.remove('hidden');
    } else {
      arenaTimerDisplay.classList.add('hidden');
    }

    if (modeKey === 'duel' || modeKey === 'ffa') {
      opponentPreviewPanel.classList.remove('hidden');
      arenaRestartBtn.classList.add('hidden');
    } else {
      opponentPreviewPanel.classList.add('hidden');
      arenaRestartBtn.classList.remove('hidden');
    }

    if (modeKey === 'zen4' || modeKey === 'zen10' || modeKey === 'apm_test') {
      startThreeSecondCountdown(seed, cols);
    }
  }

  function flushZenLines() {
    if (currentMode !== 'zen4' && currentMode !== 'zen10') return;
    const delta = engine.linesCleared - lastReportedZenLines;
    if (delta > 0 && ws && ws.readyState === WebSocket.OPEN) {
      lastReportedZenLines = engine.linesCleared;
      ws.send(JSON.stringify({
        type: 'zen_lines_add',
        lines: delta,
        maxCombo: engine.maxCombo
      }));
    }
  }

  function finishApmTest() {
    if (currentMode !== 'apm_test') return;
    canControlBoard = false;
    engine.gameOver = true;
    arenaTimerDisplay.textContent = '0.0s';
    const m = engine.getLiveMetrics();
    window.AudioController.playSFX('win');
    showOverlay(`${m.apm.toFixed(1)} APM`, '1-Minute APM Test Recorded to Leaderboard! Press R to try again.');

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'apm_test_complete',
        apm: m.apm,
        linesCleared: m.linesCleared,
        maxCombo: m.maxCombo
      }));
    }
  }

  // Singleplayer Mode Buttons
  launchZen4Btn.addEventListener('click', () => {
    enterArenaMode('zen4', '4x26 ZEN MODE', 4);
  });

  launchZen10Btn.addEventListener('click', () => {
    enterArenaMode('zen10', '10x26 ZEN MODE', 10);
  });

  launchApmTestBtn.addEventListener('click', () => {
    enterArenaMode('apm_test', 'APM TEST (1:00 SPRINT)', 4);
  });

  // Multiplayer Queue & FFA Buttons
  join1v1QueueBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join_1v1_queue' }));
      queueWaitingBanner.classList.remove('hidden');
    }
  });

  leave1v1QueueBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave_1v1_queue' }));
      queueWaitingBanner.classList.add('hidden');
    }
  });

  joinFfaLobbyBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      enterArenaMode('ffa', 'FFA ARENA (4x26)', 4);
      canControlBoard = false;
      showOverlay('WAITING FOR PLAYERS TO JOIN', 'FFA starts automatically when 2 or more players are in the lobby...');
      ws.send(JSON.stringify({ type: 'join_ffa_lobby' }));
    }
  });

  function leaveCurrentArenaOrQueue() {
    flushZenLines();
    queueWaitingBanner.classList.add('hidden');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave_active_mode' }));
    }
    navigateToHub();
  }

  returnHubBtn.addEventListener('click', leaveCurrentArenaOrQueue);
  arenaLeaveBtn.addEventListener('click', leaveCurrentArenaOrQueue);

  arenaRestartBtn.addEventListener('click', () => {
    if (currentMode === 'duel' || currentMode === 'ffa') return;
    flushZenLines();
    if (currentMode === 'apm_test') apmTestRemainingMs = 60000;
    startThreeSecondCountdown(Date.now(), currentCols);
  });

  // ============================================================================
  // 5-SECOND POST-MATCH STATS SUMMARY SCREEN (1v1 & FFA)
  // ============================================================================

  function displayFiveSecondMatchSummary(msg) {
    canControlBoard = false;
    if (countdownInterval) clearInterval(countdownInterval);

    document.getElementById('summary-mode-title').textContent = msg.modeTitle || 'MATCH SUMMARY';
    document.getElementById('summary-winner-banner').textContent = `WINNER: ${msg.winnerName}`;

    const tbody = document.getElementById('summary-table-body');
    tbody.innerHTML = '';

    (msg.players || []).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(p.placement)}</strong></td>
        <td>${escapeHtml(p.username)}</td>
        <td>${Number(p.apm || 0).toFixed(1)}</td>
        <td>${Number(p.pps || 0).toFixed(2)}</td>
        <td>${p.lines || 0}</td>
        <td>${p.sent || 0}</td>
        <td>${p.recv || 0}</td>
        <td>${p.maxCombo || 0}x</td>
      `;
      tbody.appendChild(tr);
    });

    postMatchScreen.classList.remove('hidden');
    const secSpan = document.getElementById('summary-countdown-sec');
    let rem = 5;
    secSpan.textContent = String(rem);

    const sumTimer = setInterval(() => {
      rem -= 1;
      secSpan.textContent = String(Math.max(0, rem));
      if (rem <= 0) {
        clearInterval(sumTimer);
        postMatchScreen.classList.add('hidden');
        navigateToHub();
      }
    }, 1000);
  }

  // ============================================================================
  // WEBSOCKET CLIENT
  // ============================================================================

  function connectWebSocket() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}`);

    ws.addEventListener('open', () => {
      if (isAuthenticated && myUserObj) {
        ws.send(JSON.stringify({ type: 'auth_bind', username: myUserObj.username }));
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
          if (msg.leaderboards) cachedLeaderboards = msg.leaderboards;
          if (msg.allPlayers) cachedAllPlayers = msg.allPlayers;
          break;

        case 'profile_synced':
          if (msg.user) updateTopLevelBar(msg.user);
          break;

        case 'hub_sync':
          hub1v1QueueStatus.textContent = `In Queue: ${msg.queue1v1Count || 0}`;
          hubFfaStatus.textContent = `In Lobby: ${msg.ffaPlayerCount || 0}`;
          if (msg.leaderboards) {
            cachedLeaderboards = msg.leaderboards;
            if (activeScreen === 'hub') renderLeaderboard();
          }
          if (msg.allPlayers) {
            cachedAllPlayers = msg.allPlayers;
            if (activeScreen === 'hub') renderPilotsDirectory();
          }
          break;

        case 'chat':
          appendChatMessage(msg.sender, msg.text, msg.style);
          break;

        // 1v1 Best of 3 Matchmaking Events
        case 'duel_init':
          queueWaitingBanner.classList.add('hidden');
          enterArenaMode('duel', `1v1 BEST OF 3 • ${msg.p1.username} vs ${msg.p2.username}`, 4);
          arenaScoreStrip.textContent = `${msg.p1.username} (0) — (0) ${msg.p2.username} | ROUND 1`;
          break;

        case 'duel_round_countdown':
          arenaScoreStrip.textContent = `SCORE: ${msg.p1Score} — ${msg.p2Score} | ROUND ${msg.round} (BEST OF 3)`;
          startThreeSecondCountdown(msg.seed, 4);
          break;

        case 'duel_round_result':
          canControlBoard = false;
          arenaScoreStrip.textContent = `SCORE: ${msg.p1Score} — ${msg.p2Score}`;
          if (msg.roundWinnerId === myId) {
            window.AudioController.playSFX('win');
            showOverlay(`ROUND ${msg.round} WON!`, `Score: ${msg.p1Score} - ${msg.p2Score}`);
          } else {
            window.AudioController.playSFX('lose');
            showOverlay(`ROUND ${msg.round} LOST`, `${msg.roundWinnerName} won the round`);
          }
          break;

        // FFA Waiting vs Countdown Events
        case 'ffa_waiting':
          if (currentMode === 'ffa') {
            canControlBoard = false;
            showOverlay('WAITING FOR PLAYERS TO JOIN', `Players in Lobby: ${msg.playerCount} / 2+ required to start`);
          }
          break;

        case 'ffa_countdown_start':
          if (currentMode === 'ffa') {
            arenaScoreStrip.textContent = `${msg.playerCount} PILOTS ALIVE`;
            startThreeSecondCountdown(msg.seed, 4);
          }
          break;

        case 'match_summary_5s':
          if (msg.updatedUser) updateTopLevelBar(msg.updatedUser);
          if (msg.updatedUserP1 && myUserObj && msg.updatedUserP1.username === myUserObj.username) {
            updateTopLevelBar(msg.updatedUserP1);
          }
          if (msg.updatedUserP2 && myUserObj && msg.updatedUserP2.username === myUserObj.username) {
            updateTopLevelBar(msg.updatedUserP2);
          }
          displayFiveSecondMatchSummary(msg);
          break;

        case 'receive_garbage':
          if (canControlBoard) engine.queueIncomingGarbage(msg.lines);
          break;

        case 'opponent_sync':
          document.getElementById('opp-header-name').textContent = `VS: ${msg.username}`;
          document.getElementById('opp-live-metrics').textContent = `${Number(msg.apm || 0).toFixed(1)} APM`;
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
    if (!ws || ws.readyState !== WebSocket.OPEN || !isAuthenticated) return;
    if (currentMode !== 'duel' && currentMode !== 'ffa') return;
    const m = engine.getLiveMetrics();
    ws.send(JSON.stringify({
      type: 'board_sync',
      grid: engine.grid,
      activePiece: engine.activePiece,
      apm: m.apm,
      pps: m.pps,
      linesCleared: m.linesCleared,
      attackSent: m.attackSent,
      garbageReceived: m.garbageReceived,
      maxCombo: m.maxCombo
    }));
  }

  setInterval(() => {
    if (isAuthenticated && canControlBoard && (currentMode === 'duel' || currentMode === 'ffa')) {
      sendBoardSync();
    }
  }, 250);

  // ============================================================================
  // CHAT DRAWER ("Chat" + Close X Button) & SETTINGS
  // ============================================================================

  closeChatBtn.addEventListener('click', () => {
    chatDrawer.classList.add('hidden');
  });

  toggleChatBtn.addEventListener('click', () => {
    chatDrawer.classList.toggle('hidden');
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
    }, 1000);
  }

  function showOverlay(title, subtitle) {
    overlayTitle.textContent = title;
    overlaySubtitle.textContent = subtitle || '';
    overlayBanner.classList.remove('hidden');
  }

  function hideOverlay() {
    overlayBanner.classList.add('hidden');
  }

  document.getElementById('next-track-btn').addEventListener('click', () => window.AudioController.nextTrack());
  document.getElementById('next-bg-btn').addEventListener('click', () => window.BackgroundController.applyNextBackground());

  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('open-settings-btn').addEventListener('click', () => settingsModal.classList.remove('hidden'));
  document.getElementById('close-settings-btn').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    if (isAuthenticated && myUserObj) {
      fetch('/api/auth/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myUserObj.username, settings: handling })
      }).catch(() => {});
    }
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

  bindSlider('slider-das', 'val-das', handling.das, v => { handling.das = v; localStorage.setItem('a2_das', v); });
  bindSlider('slider-arr', 'val-arr', handling.arr, v => { handling.arr = v; localStorage.setItem('a2_arr', v); });
  bindSlider('slider-sdf', 'val-sdf', handling.sdf, v => { handling.sdf = v; localStorage.setItem('a2_sdf', v); });
  bindSlider('slider-music', 'val-music', 40, v => window.AudioController.setMusicVolume(v / 100));
  bindSlider('slider-sfx', 'val-sfx', 75, v => window.AudioController.setSfxVolume(v / 100));
  bindSlider('slider-bg-interval', 'val-bg-interval', 60, v => window.BackgroundController.setShuffleInterval(v));

  // ============================================================================
  // INPUT HANDLING & 60FPS GAME LOOP
  // ============================================================================

  const keysDown = new Set();
  let moveDir = 0;
  let dasTimer = 0;
  let arrTimer = 0;
  let softDropTimer = 0;

  function isTyping() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  window.addEventListener('keydown', (e) => {
    if (isTyping() || activeScreen !== 'arena') return;

    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    keysDown.add(e.code);

    if (e.code === 'KeyR' && currentMode !== 'duel' && currentMode !== 'ffa') {
      flushZenLines();
      if (currentMode === 'apm_test') apmTestRemainingMs = 60000;
      startThreeSecondCountdown(Date.now(), currentCols);
      return;
    }

    if (!canControlBoard || engine.gameOver) return;

    switch (e.code) {
      case 'ArrowLeft':
        moveDir = -1; dasTimer = 0; arrTimer = 0;
        engine.moveHorizontal(-1);
        break;
      case 'ArrowRight':
        moveDir = 1; dasTimer = 0; arrTimer = 0;
        engine.moveHorizontal(1);
        break;
      case 'ArrowUp':
      case 'KeyX':
        engine.rotate(1);
        break;
      case 'KeyZ':
      case 'ControlLeft':
      case 'ControlRight':
        engine.rotate(3);
        break;
      case 'KeyA':
        engine.rotate(2);
        break;
      case 'Space':
        engine.hardDrop();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyC':
        engine.hold();
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.code);
    if (e.code === 'ArrowLeft' && moveDir === -1) {
      moveDir = keysDown.has('ArrowRight') ? 1 : 0;
      dasTimer = 0; arrTimer = 0;
    } else if (e.code === 'ArrowRight' && moveDir === 1) {
      moveDir = keysDown.has('ArrowLeft') ? -1 : 0;
      dasTimer = 0; arrTimer = 0;
    }
  });

  function updateInput(dtMs) {
    if (!canControlBoard || engine.gameOver || isTyping()) return;

    if (moveDir !== 0) {
      dasTimer += dtMs;
      if (dasTimer >= handling.das) {
        if (handling.arr === 0) {
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

    if (keysDown.has('ArrowDown')) {
      if (handling.sdf >= 40) {
        engine.softDrop(true);
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

  function drawBlock(ctx, x, y, size, color, alpha = 1.0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, 3);
    ctx.restore();
  }

  function renderArena() {
    const cellSize = 32;
    const cols = engine.cols;
    const rows = engine.rows;

    boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

    boardCtx.fillStyle = 'rgba(255, 30, 70, 0.06)';
    boardCtx.fillRect(0, 0, cols * cellSize, engine.bufferRows * cellSize);

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

    boardCtx.strokeStyle = 'rgba(255, 61, 87, 0.75)';
    boardCtx.lineWidth = 2;
    boardCtx.beginPath();
    boardCtx.moveTo(0, engine.bufferRows * cellSize);
    boardCtx.lineTo(cols * cellSize, engine.bufferRows * cellSize);
    boardCtx.stroke();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = engine.grid[r][c];
        if (cell) drawBlock(boardCtx, c, r, cellSize, window.PIECE_COLORS[cell] || '#fff', 1.0);
      }
    }

    if (engine.activePiece && !engine.gameOver) {
      const p = engine.activePiece;
      const ghostY = engine.getGhostY();
      const pColor = window.PIECE_COLORS[p.type];

      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) drawBlock(boardCtx, p.x + c, ghostY + r, cellSize, pColor, 0.24);
        }
      }
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) drawBlock(boardCtx, p.x + c, p.y + r, cellSize, pColor, 1.0);
        }
      }
    }

    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (engine.holdPiece) {
      const mat = window.TETROMINO_MATRICES[engine.holdPiece][0];
      const col = !engine.canHold ? '#546e7a' : window.PIECE_COLORS[engine.holdPiece];
      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          if (mat[r][c]) drawBlock(holdCtx, 0.8 + c, 0.8 + r, 22, col, 1.0);
        }
      }
    }

    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    engine.nextQueue.slice(0, 5).forEach((type, idx) => {
      const mat = window.TETROMINO_MATRICES[type][0];
      const col = window.PIECE_COLORS[type];
      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          if (mat[r][c]) drawBlock(nextCtx, 0.8 + c, idx * 3.4 + 0.5 + r, 20, col, 1.0);
        }
      }
    });

    const m = engine.getLiveMetrics();
    statApm.textContent = m.apm.toFixed(1);
    statPps.textContent = m.pps.toFixed(2);
    statLinesSent.textContent = `${m.linesCleared} / ${m.attackSent}`;
    statRecv.textContent = `${m.garbageReceived}`;
    statCombo.textContent = `${m.combo}x (Max ${m.maxCombo}x)`;
    statB2b.textContent = `${m.b2b}x`;
    garbageMeterFill.style.height = `${Math.min(100, (m.pendingGarbage / 20) * 100)}%`;
  }

  function drawOpponentBoard(opp) {
    if (!opp || !opp.grid) return;
    const rows = opp.grid.length;
    const cols = opp.grid[0] ? opp.grid[0].length : 4;
    const cellSize = 18;
    oppCanvas.width = cols * cellSize;
    oppCanvas.height = rows * cellSize;
    oppCtx.clearRect(0, 0, oppCanvas.width, oppCanvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = opp.grid[r][c];
        if (cell) drawBlock(oppCtx, c, r, cellSize, window.PIECE_COLORS[cell] || '#fff', 1.0);
      }
    }
  }

  let lastFrameTime = performance.now();
  function gameLoop(now) {
    const dtMs = Math.min(100, now - lastFrameTime);
    lastFrameTime = now;

    if (activeScreen === 'arena') {
      if (canControlBoard && !engine.gameOver) {
        updateInput(dtMs);
        engine.update(dtMs);

        if (currentMode === 'apm_test') {
          apmTestRemainingMs -= dtMs;
          arenaTimerDisplay.textContent = `${Math.max(0, apmTestRemainingMs / 1000).toFixed(1)}s`;
          if (apmTestRemainingMs <= 0) {
            finishApmTest();
          }
        }
      }
      renderArena();
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
})();
