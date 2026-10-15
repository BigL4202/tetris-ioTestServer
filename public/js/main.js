// ============================================================================
// PROJECT A^2 MAIN CONTROLLER: FIXED BLOCK RENDERER, FFA LOOP, 1v1 & LEVEL 100
// ============================================================================

(function () {
  // Built-in Color & Matrix Fallbacks (Guarantees blocks are NEVER invisible)
  const FALLBACK_COLORS = {
    I: '#00e5ff', O: '#ffea00', T: '#d500f9',
    S: '#00e676', Z: '#ff1744', J: '#2979ff',
    L: '#ff9100', G: '#78909c'
  };

  // Level-Unlocked Rewards Every 10 Levels up to Level 100
  const UNLOCKABLE_SKINS = [
    { id: 'bevel',   name: 'Glossy Bevel',            reqLevel: 1,   desc: 'Classic highlighted 3D stacker blocks' },
    { id: 'flat',    name: 'Flat Minimalist',         reqLevel: 10,  desc: 'Clean solid-color tournament blocks' },
    { id: 'neon',    name: 'Neon Wireframe',          reqLevel: 20,  desc: 'Hollow glowing cyber-grid blocks' },
    { id: 'pixel',   name: 'Retro Pixel',             reqLevel: 30,  desc: '8-bit arcade inner-framed blocks' },
    { id: 'mono',    name: 'Monochrome High-Contrast',reqLevel: 40,  desc: 'Pure white/cyan high-speed blocks' },
    { id: 'carbon',  name: 'Carbon Weave',            reqLevel: 50,  desc: 'Dark core with bright corner accents' },
    { id: 'prism',   name: 'Prism Glass',             reqLevel: 60,  desc: 'Double-beveled crystal blocks' },
    { id: 'plasma',  name: 'Plasma Core',             reqLevel: 70,  desc: 'Glowing center orb blocks' },
    { id: 'goldskin',name: 'Royal Sovereign',         reqLevel: 80,  desc: 'Golden rimmed prestige blocks' },
    { id: 'cyber',   name: 'Cyber Circuit',           reqLevel: 90,  desc: 'Cross-wired digital matrix blocks' },
    { id: 'a2omega', name: 'A² Omega (Master)',       reqLevel: 100, desc: 'Level 100 Master radiant core blocks' }
  ];

  const UNLOCKABLE_GHOSTS = [
    { id: 'fill',      name: 'Translucent Fill', reqLevel: 1,   desc: 'Standard shaded ghost piece' },
    { id: 'outline',   name: 'Neon Outline',     reqLevel: 10,  desc: 'Crisp hollow border ghost piece' },
    { id: 'crosshair', name: 'Target Crosshair', reqLevel: 20,  desc: 'Corner-bracket precision ghost piece' },
    { id: 'dashed',    name: 'Tactical Dashed',  reqLevel: 30,  desc: 'Dashed perimeter laser ghost' },
    { id: 'core',      name: 'Center Dot',       reqLevel: 40,  desc: 'Minimalist center node ghost' },
    { id: 'double',    name: 'Double Frame',     reqLevel: 50,  desc: 'Twin concentric wireframe ghost' },
    { id: 'pulse',     name: 'Pulse Glow',       reqLevel: 60,  desc: 'High-visibility luminous ghost' },
    { id: 'brackets',  name: 'Corner Brackets',  reqLevel: 70,  desc: ' corner-pinned ghost' },
    { id: 'xray',      name: 'X-Ray Grid',       reqLevel: 80,  desc: 'Internal cross-hatch ghost' },
    { id: 'beacon',    name: 'Solar Beacon',     reqLevel: 90,  desc: 'Golden outlined ghost piece' },
    { id: 'omega',     name: 'Omega Phantom',    reqLevel: 100, desc: 'Level 100 Master diamond ghost' }
  ];

  const UNLOCKABLE_THEMES = [
    { id: 'cyan',      name: 'Cyan Core',        reqLevel: 1,   desc: 'Default Project A² neon cyan border' },
    { id: 'crimson',   name: 'Crimson Pulse',    reqLevel: 10,  desc: 'High-alert red arena border' },
    { id: 'emerald',   name: 'Emerald Matrix',   reqLevel: 20,  desc: 'Bioluminescent green arena border' },
    { id: 'gold',      name: 'Solar Gold',       reqLevel: 30,  desc: 'Championship gold arena border' },
    { id: 'violet',    name: 'Violet Void',      reqLevel: 40,  desc: 'Deep-space purple arena border' },
    { id: 'cobalt',    name: 'Cobalt Storm',     reqLevel: 50,  desc: 'Electric blue arena border' },
    { id: 'inferno',   name: 'Inferno Blaze',    reqLevel: 60,  desc: 'Molten orange arena border' },
    { id: 'sakura',    name: 'Neon Sakura',      reqLevel: 70,  desc: 'Cyberpunk magenta arena border' },
    { id: 'arctic',    name: 'Arctic Frost',     reqLevel: 80,  desc: 'Sub-zero ice cyan arena border' },
    { id: 'obsidian',  name: 'Obsidian Chrome',  reqLevel: 90,  desc: 'Platinum silver arena border' },
    { id: 'celestial', name: 'A² Celestial',     reqLevel: 100, desc: 'Level 100 Master gold & cyan theme' }
  ];

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

  const KEYBIND_LABELS = {
    moveLeft: 'Move Left',
    moveRight: 'Move Right',
    rotateCW: 'Rotate CW',
    rotateCCW: 'Rotate CCW',
    rotate180: 'Rotate 180',
    softDrop: 'Soft Drop',
    hardDrop: 'Hard Drop',
    hold: 'Hold Piece',
    restart: 'Quick Restart'
  };

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

  // Player Level Strip
  const navPilotName = document.getElementById('nav-pilot-name');
  const navPilotLevel = document.getElementById('nav-pilot-level');
  const navXpFill = document.getElementById('nav-xp-fill');
  const navXpText = document.getElementById('nav-xp-text');

  // Hub Elements
  const hubTabPlay = document.getElementById('hub-tab-play');
  const hubTabCustomize = document.getElementById('hub-tab-customize');
  const hubTabStats = document.getElementById('hub-tab-stats');
  const hubPlayView = document.getElementById('hub-play-view');
  const hubCustomizeView = document.getElementById('hub-customize-view');
  const hubStatsView = document.getElementById('hub-stats-view');

  const activePlayersCountEl = document.getElementById('active-players-count');
  const activePlayersBarEl = document.getElementById('active-players-bar');

  const launchZen4Btn = document.getElementById('launch-zen-4-btn');
  const launchZen10Btn = document.getElementById('launch-zen-10-btn');
  const launchApmTestBtn = document.getElementById('launch-apm-test-btn');
  const join1v1QueueBtn = document.getElementById('join-1v1-queue-btn');
  const leave1v1QueueBtn = document.getElementById('leave-1v1-queue-btn');
  const queueWaitingBanner = document.getElementById('queue-waiting-banner');
  const joinFfaLobbyBtn = document.getElementById('join-ffa-lobby-btn');
  const hub1v1QueueStatus = document.getElementById('hub-1v1-queue-status');
  const hubFfaStatus = document.getElementById('hub-ffa-status');
  const liveMatchesList = document.getElementById('live-matches-list');

  // Bottom-Left Incoming Challenge Toast
  const challengeToast = document.getElementById('challenge-toast');
  const challengeToastText = document.getElementById('challenge-toast-text');
  const acceptDirectChallengeBtn = document.getElementById('accept-direct-challenge-btn');
  const denyDirectChallengeBtn = document.getElementById('deny-direct-challenge-btn');

  // Leaderboards & Player Stats Directory
  const lbContentEl = document.getElementById('leaderboard-content');
  const lbTabs = document.querySelectorAll('.lb-tab');
  const pilotSearchInput = document.getElementById('pilot-search-input');
  const allPilotsDirectory = document.getElementById('all-pilots-directory');
  const inspectedPilotTitle = document.getElementById('inspected-pilot-title');
  const inspectedPilotBody = document.getElementById('inspected-pilot-body');

  // Arena Elements
  const arenaModeTitle = document.getElementById('arena-mode-title');
  const suddenDeathBadge = document.getElementById('sudden-death-badge');
  const arenaScoreStrip = document.getElementById('arena-score-strip');
  const tugOfWarWrap = document.getElementById('tug-of-war-wrap');
  const tugOfWarFill = document.getElementById('tug-of-war-fill');
  const arenaTimerDisplay = document.getElementById('arena-timer-display');
  const arenaRestartBtn = document.getElementById('arena-restart-btn');
  const arenaLeaveBtn = document.getElementById('arena-leave-btn');
  const ffaTargetBar = document.getElementById('ffa-target-bar');
  const targetBtns = document.querySelectorAll('.target-btn');

  const playerPlayfieldWrapper = document.getElementById('player-playfield-wrapper');
  const multiOpponentsPanel = document.getElementById('multi-opponents-panel');
  const multiOppHeader = document.getElementById('multi-opp-header');
  const multiOpponentsGrid = document.getElementById('multi-opponents-grid');

  const boardFrame = document.getElementById('board-frame');
  const boardCanvas = document.getElementById('board-canvas');
  const boardCtx = boardCanvas.getContext('2d');
  const holdCanvas = document.getElementById('hold-canvas');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next-canvas');
  const nextCtx = nextCanvas.getContext('2d');

  const statApm = document.getElementById('stat-apm');
  const statPps = document.getElementById('stat-pps');
  const statLinesSent = document.getElementById('stat-lines-sent');
  const statRecv = document.getElementById('stat-recv');
  const statCombo = document.getElementById('stat-combo');
  const statB2b = document.getElementById('stat-b2b');
  const garbageMeterFill = document.getElementById('garbage-meter-fill');
  const actionFeedCard = document.getElementById('action-feed-card');
  const actionCallout = document.getElementById('action-callout');
  const overlayBanner = document.getElementById('overlay-banner');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySubtitle = document.getElementById('overlay-subtitle');

  // Chat Drawer Elements
  const chatDrawer = document.getElementById('chat-drawer');
  const toggleChatBtn = document.getElementById('toggle-chat-btn');
  const closeChatBtn = document.getElementById('close-chat-btn');
  const chatMessagesEl = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  const handling = { das: 115, arr: 10, sdf: 40 };
  const userPrefs = {
    boardShake: true,
    lockFlash: true,
    blockSkin: 'bevel',
    ghostStyle: 'fill',
    boardTheme: 'cyan',
    lockedBg: 'shuffle',
    keybinds: { ...DEFAULT_KEYBINDS }
  };

  let listeningKeybindAction = null;
  let expandedActivePlayerId = null;
  let pendingDirectChallengeId = null;

  let shakeOffsetX = 0;
  let shakeOffsetY = 0;
  let shakeVelX = 0;
  let shakeVelY = 0;

  let myId = null;
  let myUserObj = null;
  let isAuthenticated = false;
  let activeScreen = 'auth';
  let currentMode = 'hub';
  let currentCols = 4;
  let canControlBoard = false;
  let selectedManualTargetId = null;

  let countdownInterval = null;
  let summaryInterval = null;
  let apmTestRemainingMs = 60000;
  let lastReportedZenLines = 0;

  let activeLeaderboardTab = 'byApm';
  let cachedLeaderboards = { byApm: [], byZen: [], byWins: [], byCombo: [], byDuels: [] };
  let cachedAllPlayers = [];
  let cachedOnlinePlayers = [];
  let ws = null;

  function getPieceColor(type) {
    if (window.PIECE_COLORS && window.PIECE_COLORS[type]) return window.PIECE_COLORS[type];
    return FALLBACK_COLORS[type] || '#00e5ff';
  }

  const engine = new window.StackerEngine(4, 26, 20, {
    onSfx: (name, comboIdx) => window.AudioController.playSFX(name, comboIdx),
    onCallout: (text) => showCallout(text),
    onBoardImpulse: (vx, vy, isDamage) => triggerBoardImpulse(vx, vy, isDamage),
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
        flushZenLines();
        showOverlay('TOP OUT', 'Press Restart Key or click RESTART');
      }
    },
    onSync: () => {
      if (currentMode === 'zen4' || currentMode === 'zen10') {
        flushZenLines();
      }
      sendBoardSync();
    }
  });

  // Load Media Resources & Render Background Thumbnails
  fetch('/api/resources')
    .then(r => r.json())
    .then(manifest => {
      window.AudioController.init(manifest);
      window.BackgroundController.init(manifest);
      renderBackgroundThumbnailsGrid();
    })
    .catch(() => {
      window.AudioController.init({ bg: [], music: [], sfx: [] });
      window.BackgroundController.init({ bg: [], music: [], sfx: [] });
      renderBackgroundThumbnailsGrid();
    });

  // ============================================================================
  // BOARD SHAKE PHYSICS
  // ============================================================================

  function triggerBoardImpulse(ix, iy, isDamage = false) {
    if (!userPrefs.boardShake) return;
    shakeVelX += ix;
    shakeVelY += iy;
    if (isDamage && boardFrame) {
      boardFrame.classList.add('damage-flash');
      setTimeout(() => boardFrame.classList.remove('damage-flash'), 160);
    }
  }

  function updateBoardShakePhysics(dtMs) {
    if (!userPrefs.boardShake) {
      boardFrame.style.transform = 'translate(0px, 0px)';
      return;
    }
    const dt = Math.min(0.05, dtMs / 1000);
    const stiffness = 180;
    const damping = 16;

    const ax = -stiffness * shakeOffsetX - damping * shakeVelX;
    const ay = -stiffness * shakeOffsetY - damping * shakeVelY;

    shakeVelX += ax * dt * 12;
    shakeVelY += ay * dt * 12;
    shakeOffsetX += shakeVelX * dt * 12;
    shakeOffsetY += shakeVelY * dt * 12;

    if (Math.abs(shakeOffsetX) < 0.08 && Math.abs(shakeOffsetY) < 0.08 && Math.abs(shakeVelX) < 0.08 && Math.abs(shakeVelY) < 0.08) {
      shakeOffsetX = 0;
      shakeOffsetY = 0;
      boardFrame.style.transform = 'translate(0px, 0px)';
    } else {
      boardFrame.style.transform = `translate(${shakeOffsetX.toFixed(1)}px, ${shakeOffsetY.toFixed(1)}px)`;
    }
  }

  // ============================================================================
  // AUTHENTICATION, AUTO-SESSION RESTORE & LEVEL BAR
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
      showAuthError('Enter both a Username and Password.');
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

      localStorage.setItem('a2_saved_user', data.user.username);
      if (data.leaderboards) cachedLeaderboards = data.leaderboards;
      if (data.allPlayers) cachedAllPlayers = data.allPlayers;
      completeLogin(data.user);
    } catch (e) {
      showAuthError('Could not connect to Project A² server.');
    }
  }

  // Auto-restore saved player profile on page load so player_data is always hydrated
  const savedUsername = localStorage.getItem('a2_saved_user');
  if (savedUsername) {
    authUsernameInput.value = savedUsername;
    fetch(`/api/auth/profile/${encodeURIComponent(savedUsername)}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.ok && data.user) {
          if (data.leaderboards) cachedLeaderboards = data.leaderboards;
          if (data.allPlayers) cachedAllPlayers = data.allPlayers;
          completeLogin(data.user);
        }
      })
      .catch(() => {});
  }

  function updateTopLevelBar(u) {
    if (!u || !u.stats) return;
    myUserObj = u;
    navPilotName.textContent = u.username;
    const lvl = u.stats.level || 1;
    const xp = u.stats.xp || 0;
    const currentFloorXp = Math.pow(lvl - 1, 2) * 80;
    const nextFloorXp = Math.pow(lvl, 2) * 80;
    const pct = Math.min(100, Math.max(0, ((xp - currentFloorXp) / Math.max(1, nextFloorXp - currentFloorXp)) * 100));

    navPilotLevel.textContent = `LVL ${lvl}`;
    navXpFill.style.width = `${pct}%`;
    navXpText.textContent = `${xp} XP`;
  }

  function applyUserSettingsFromProfile(settings) {
    if (!settings) return;
    if (typeof settings.bgInterval === 'number') {
      window.BackgroundController.setShuffleInterval(settings.bgInterval);
      document.getElementById('slider-bg-interval').value = settings.bgInterval;
      document.getElementById('val-bg-interval').textContent = settings.bgInterval;
    }
    if (typeof settings.musicVolume === 'number') {
      window.AudioController.setMusicVolume(settings.musicVolume / 100);
      document.getElementById('slider-music').value = settings.musicVolume;
      document.getElementById('val-music').textContent = settings.musicVolume;
    }
    if (typeof settings.sfxVolume === 'number') {
      window.AudioController.setSfxVolume(settings.sfxVolume / 100);
      document.getElementById('slider-sfx').value = settings.sfxVolume;
      document.getElementById('val-sfx').textContent = settings.sfxVolume;
    }
    userPrefs.boardShake = settings.boardShake !== false;
    userPrefs.lockFlash = settings.lockFlash !== false;
    document.getElementById('check-board-shake').checked = userPrefs.boardShake;
    document.getElementById('check-lock-flash').checked = userPrefs.lockFlash;

    userPrefs.blockSkin = settings.blockSkin || 'bevel';
    userPrefs.ghostStyle = settings.ghostStyle || 'fill';
    userPrefs.boardTheme = settings.boardTheme || 'cyan';
    userPrefs.lockedBg = settings.lockedBg || 'shuffle';
    document.body.setAttribute('data-theme', userPrefs.boardTheme);
    window.BackgroundController.setLockedBackground(userPrefs.lockedBg);

    userPrefs.keybinds = { ...DEFAULT_KEYBINDS, ...(settings.keybinds || {}) };
    renderKeybindsModalList();
    renderUnlockGrids();
    renderBackgroundThumbnailsGrid();
  }

  function saveUserSettingsToServer() {
    if (!isAuthenticated || !myUserObj) return;
    fetch('/api/auth/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: myUserObj.username,
        settings: {
          musicVolume: Math.round(window.AudioController.musicVolume * 100),
          sfxVolume: Math.round(window.AudioController.sfxVolume * 100),
          bgInterval: window.BackgroundController.intervalSec,
          boardShake: userPrefs.boardShake,
          lockFlash: userPrefs.lockFlash,
          blockSkin: userPrefs.blockSkin,
          ghostStyle: userPrefs.ghostStyle,
          boardTheme: userPrefs.boardTheme,
          lockedBg: userPrefs.lockedBg,
          keybinds: userPrefs.keybinds
        }
      })
    }).catch(() => {});
  }

  function completeLogin(userObj) {
    isAuthenticated = true;
    updateTopLevelBar(userObj);
    applyUserSettingsFromProfile(userObj.settings);

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
    localStorage.removeItem('a2_saved_user');
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
  // ACTIVE PLAYERS SIDEBAR & BOTTOM-LEFT 1v1 CHALLENGE TOAST
  // ============================================================================

  function renderActivePlayersBar() {
    if (!activePlayersBarEl) return;
    activePlayersCountEl.textContent = cachedOnlinePlayers.length;
    activePlayersBarEl.innerHTML = '';

    cachedOnlinePlayers.forEach(p => {
      const isMe = p.id === myId || (myUserObj && p.username === myUserObj.username);
      const isExpanded = expandedActivePlayerId === p.id;

      const item = document.createElement('div');
      item.className = 'active-player-item';

      const topRow = document.createElement('div');
      topRow.className = 'ap-top-row';
      topRow.innerHTML = `
        <div>
          <strong>${escapeHtml(p.username)} ${isMe ? '(YOU)' : ''}</strong>
          <div class="sub-hint">LVL ${p.level || 1} • ${Number(p.apm || 0).toFixed(1)} APM</div>
        </div>
        <span class="badge">${p.inDuel ? 'IN 1v1' : p.mode.toUpperCase()}</span>
      `;
      item.appendChild(topRow);

      // Clicking a player toggles the "CHALLENGE TO 1v1" button underneath their name
      if (!isMe && !p.inDuel) {
        item.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') return;
          expandedActivePlayerId = (expandedActivePlayerId === p.id) ? null : p.id;
          renderActivePlayersBar();
        });

        if (isExpanded) {
          const drawer = document.createElement('div');
          drawer.className = 'ap-challenge-drawer';
          const btn = document.createElement('button');
          btn.className = 'btn btn-primary btn-sm';
          btn.textContent = 'CHALLENGE TO 1v1';
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'send_direct_challenge', targetId: p.id }));
              btn.textContent = 'CHALLENGE SENT...';
              btn.disabled = true;
            }
          });
          drawer.appendChild(btn);
          item.appendChild(drawer);
        }
      }

      activePlayersBarEl.appendChild(item);
    });
  }

  acceptDirectChallengeBtn.addEventListener('click', () => {
    if (pendingDirectChallengeId && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'respond_direct_challenge',
        challengeId: pendingDirectChallengeId,
        accept: true
      }));
    }
    pendingDirectChallengeId = null;
    challengeToast.classList.add('hidden');
  });

  denyDirectChallengeBtn.addEventListener('click', () => {
    if (pendingDirectChallengeId && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'respond_direct_challenge',
        challengeId: pendingDirectChallengeId,
        accept: false
      }));
    }
    pendingDirectChallengeId = null;
    challengeToast.classList.add('hidden');
  });

  // ============================================================================
  // 4-COLUMN CUSTOMIZATION: BACKGROUND THUMBNAILS + LEVEL 100 REWARDS
  // ============================================================================

  function renderBackgroundThumbnailsGrid() {
    const grid = document.getElementById('bg-thumbnails-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 1. Default Shuffle All Option Card
    const shuffleCard = document.createElement('div');
    const isShuffleEquipped = !userPrefs.lockedBg || userPrefs.lockedBg === 'shuffle';
    shuffleCard.className = `bg-thumb-card shuffle-card ${isShuffleEquipped ? 'equipped' : ''}`;
    shuffleCard.innerHTML = `
      <div class="bg-thumb-preview" style="background: linear-gradient(135deg, #00e5ff 0%, #2979ff 50%, #d500f9 100%); display:flex; align-items:center; justify-content:center; font-weight:900; font-size:0.8rem;">
        SHUFFLE ALL (DEFAULT 3M)
      </div>
      <div class="bg-thumb-label">${isShuffleEquipped ? 'ACTIVE: SHUFFLING' : 'CLICK TO SHUFFLE ALL'}</div>
    `;
    shuffleCard.addEventListener('click', () => {
      userPrefs.lockedBg = 'shuffle';
      window.BackgroundController.setLockedBackground('shuffle');
      saveUserSettingsToServer();
      renderBackgroundThumbnailsGrid();
    });
    grid.appendChild(shuffleCard);

    // 2. Individual Background Thumbnails (Click to lock)
    const catalog = window.BackgroundController.getCatalog();
    catalog.forEach(item => {
      const isLockedToThis = userPrefs.lockedBg === item.id;
      const card = document.createElement('div');
      card.className = `bg-thumb-card ${isLockedToThis ? 'equipped' : ''}`;

      const previewDiv = document.createElement('div');
      previewDiv.className = 'bg-thumb-preview';
      previewDiv.style.backgroundImage = item.thumbPreview || item.cssValue;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'bg-thumb-label';
      labelDiv.textContent = isLockedToThis ? `LOCKED: ${item.label}` : item.label;

      card.appendChild(previewDiv);
      card.appendChild(labelDiv);

      card.addEventListener('click', () => {
        userPrefs.lockedBg = item.id;
        window.BackgroundController.setLockedBackground(item.id);
        saveUserSettingsToServer();
        renderBackgroundThumbnailsGrid();
      });

      grid.appendChild(card);
    });
  }

  function renderUnlockGrids() {
    const myLvl = (myUserObj && myUserObj.stats && myUserObj.stats.level) ? myUserObj.stats.level : 1;

    const buildGrid = (containerId, catalog, currentId, onSelect) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';

      catalog.forEach(item => {
        const unlocked = myLvl >= item.reqLevel;
        const equipped = currentId === item.id;
        const div = document.createElement('div');
        div.className = `unlock-item ${equipped ? 'equipped' : ''} ${!unlocked ? 'locked' : ''}`;
        div.innerHTML = `
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="sub-hint">${escapeHtml(item.desc)}</div>
          </div>
          <span class="badge ${equipped ? 'gold-badge' : ''}">
            ${equipped ? 'EQUIPPED' : (unlocked ? `LVL ${item.reqLevel}` : `LOCKED (LVL ${item.reqLevel})`)}
          </span>
        `;
        if (unlocked) {
          div.addEventListener('click', () => {
            onSelect(item.id);
            saveUserSettingsToServer();
            renderUnlockGrids();
          });
        }
        container.appendChild(div);
      });
    };

    buildGrid('skins-unlock-grid', UNLOCKABLE_SKINS, userPrefs.blockSkin, id => { userPrefs.blockSkin = id; });
    buildGrid('ghosts-unlock-grid', UNLOCKABLE_GHOSTS, userPrefs.ghostStyle, id => { userPrefs.ghostStyle = id; });
    buildGrid('themes-unlock-grid', UNLOCKABLE_THEMES, userPrefs.boardTheme, id => {
      userPrefs.boardTheme = id;
      document.body.setAttribute('data-theme', id);
    });
  }

  // ============================================================================
  // KEYBIND REMAPPER UI
  // ============================================================================

  function renderKeybindsModalList() {
    const listEl = document.getElementById('keybinds-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    Object.keys(KEYBIND_LABELS).forEach(actionKey => {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      const isListening = listeningKeybindAction === actionKey;
      const currentCode = userPrefs.keybinds[actionKey] || DEFAULT_KEYBINDS[actionKey];

      row.innerHTML = `
        <span>${KEYBIND_LABELS[actionKey]}</span>
        <button type="button" class="btn btn-sm keybind-btn ${isListening ? 'listening' : ''}">
          ${isListening ? 'PRESS ANY KEY...' : currentCode}
        </button>
      `;

      row.querySelector('button').addEventListener('click', () => {
        listeningKeybindAction = actionKey;
        renderKeybindsModalList();
      });

      listEl.appendChild(row);
    });
  }

  document.getElementById('reset-keybinds-btn').addEventListener('click', () => {
    userPrefs.keybinds = { ...DEFAULT_KEYBINDS };
    listeningKeybindAction = null;
    renderKeybindsModalList();
    saveUserSettingsToServer();
  });

  // ============================================================================
  // HUB NAVIGATION, FULL LEADERBOARDS & PLAYER STATS DIRECTORY
  // ============================================================================

  function navigateToHub() {
    activeScreen = 'hub';
    currentMode = 'hub';
    canControlBoard = false;
    if (countdownInterval) clearInterval(countdownInterval);
    if (summaryInterval) clearInterval(summaryInterval);

    arenaScreen.classList.add('hidden');
    postMatchScreen.classList.add('hidden');
    returnHubBtn.classList.add('hidden');
    hubScreen.classList.remove('hidden');

    renderActivePlayersBar();
    renderLeaderboard();
    renderPlayersDirectory();
    renderUnlockGrids();
    renderBackgroundThumbnailsGrid();
  }

  function switchHubTab(activeBtn, activeView) {
    [hubTabPlay, hubTabCustomize, hubTabStats].forEach(b => b.classList.remove('active'));
    [hubPlayView, hubCustomizeView, hubStatsView].forEach(v => v.classList.add('hidden'));
    activeBtn.classList.add('active');
    activeView.classList.remove('hidden');
  }

  hubTabPlay.addEventListener('click', () => switchHubTab(hubTabPlay, hubPlayView));
  hubTabCustomize.addEventListener('click', () => {
    switchHubTab(hubTabCustomize, hubCustomizeView);
    renderUnlockGrids();
    renderBackgroundThumbnailsGrid();
  });
  hubTabStats.addEventListener('click', () => {
    switchHubTab(hubTabStats, hubStatsView);
    renderPlayersDirectory();
  });

  function renderLiveSpectateMatches(matches) {
    if (!liveMatchesList) return;
    liveMatchesList.innerHTML = '';
    if (!Array.isArray(matches) || matches.length === 0) {
      liveMatchesList.innerHTML = `<div class="sub-hint">No active matches right now.</div>`;
      return;
    }

    matches.forEach(m => {
      const row = document.createElement('div');
      row.className = 'spectate-row';
      row.innerHTML = `
        <span>${escapeHtml(m.label)}</span>
        <button class="btn btn-sm btn-primary">SPECTATE (${m.spectatorCount || 0})</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'spectate_match', matchId: m.id }));
        }
      });
      liveMatchesList.appendChild(row);
    });
  }

  function renderLeaderboard() {
    lbContentEl.innerHTML = '';
    const rows = cachedLeaderboards[activeLeaderboardTab] || [];

    if (rows.length === 0) {
      lbContentEl.innerHTML = `<div class="lb-row"><span class="lb-user">No records yet.</span></div>`;
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

  function renderPlayersDirectory() {
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
        <span class="badge">VIEW STATS</span>
      `;
      row.addEventListener('click', () => inspectPlayerProfile(p));
      allPilotsDirectory.appendChild(row);
    });
  }

  pilotSearchInput.addEventListener('input', renderPlayersDirectory);

  function inspectPlayerProfile(p) {
    inspectedPilotTitle.textContent = `PLAYER STATS: ${p.username.toUpperCase()} (LVL ${p.stats.level})`;
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

  function setFfaTargetModeUI(mode) {
    selectedManualTargetId = null;
    targetBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.target === mode);
    });
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'set_ffa_target', targetMode: mode }));
    }
  }

  targetBtns.forEach(btn => {
    btn.addEventListener('click', () => setFfaTargetModeUI(btn.dataset.target));
  });

  function configureBoardDimensions(cols) {
    currentCols = cols;
    if (boardFrame) {
      boardFrame.style.aspectRatio = `${cols} / 26`;
    }
    boardCanvas.width = cols * 32;
    boardCanvas.height = 26 * 32;
  }

  function startThreeSecondCountdown(seed, cols, onGoCallback) {
    if (countdownInterval) clearInterval(countdownInterval);
    if (summaryInterval) clearInterval(summaryInterval);
    postMatchScreen.classList.add('hidden');

    canControlBoard = false;
    configureBoardDimensions(cols);
    engine.reset(seed, cols);
    lastReportedZenLines = 0;
    actionCallout.textContent = '—';
    suddenDeathBadge.classList.add('hidden');

    let count = 3;
    showOverlay('3', 'GET READY');
    window.AudioController.playSFX('move');

    countdownInterval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        showOverlay(String(count), 'GET READY');
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
    suddenDeathBadge.classList.add('hidden');
    tugOfWarWrap.classList.add('hidden');
    multiOpponentsGrid.innerHTML = '';

    if (modeKey === 'spectate') {
      playerPlayfieldWrapper.classList.add('hidden');
      multiOpponentsPanel.classList.remove('hidden');
      multiOppHeader.textContent = 'LIVE SPECTATOR FEED';
      arenaRestartBtn.classList.add('hidden');
      ffaTargetBar.classList.add('hidden');
      arenaTimerDisplay.classList.add('hidden');
      return;
    }

    playerPlayfieldWrapper.classList.remove('hidden');
    configureBoardDimensions(cols);

    if (modeKey === 'apm_test') {
      apmTestRemainingMs = 60000;
      arenaTimerDisplay.textContent = '60.0s';
      arenaTimerDisplay.classList.remove('hidden');
    } else {
      arenaTimerDisplay.classList.add('hidden');
    }

    if (modeKey === 'ffa') {
      ffaTargetBar.classList.remove('hidden');
      setFfaTargetModeUI('random');
    } else {
      ffaTargetBar.classList.add('hidden');
    }

    if (modeKey === 'duel' || modeKey === 'ffa') {
      multiOpponentsPanel.classList.remove('hidden');
      multiOppHeader.textContent = modeKey === 'ffa' ? 'FFA OPPONENTS (CLICK TO TARGET)' : 'OPPONENT MATRIX';
      arenaRestartBtn.classList.add('hidden');
    } else {
      multiOpponentsPanel.classList.add('hidden');
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
    showOverlay(`${m.apm.toFixed(1)} APM`, 'Recorded to Leaderboard. Press Restart Key to retry.');

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'apm_test_complete',
        apm: m.apm,
        linesCleared: m.linesCleared,
        maxCombo: m.maxCombo
      }));
    }
  }

  launchZen4Btn.addEventListener('click', () => enterArenaMode('zen4', '4x26 ZEN MODE', 4));
  launchZen10Btn.addEventListener('click', () => enterArenaMode('zen10', '10x26', 10));
  launchApmTestBtn.addEventListener('click', () => enterArenaMode('apm_test', 'APM TEST (1:00)', 4));

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
      enterArenaMode('ffa', 'FFA ARENA', 4);
      canControlBoard = false;
      showOverlay('WAITING FOR PLAYERS', 'FFA starts when 2+ players join');
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
    if (currentMode === 'duel' || currentMode === 'ffa' || currentMode === 'spectate') return;
    flushZenLines();
    if (currentMode === 'apm_test') apmTestRemainingMs = 60000;
    startThreeSecondCountdown(Date.now(), currentCols);
  });

  // ============================================================================
  // 5-SECOND POST-MATCH STATS SUMMARY (Stays in FFA Lobby on FFA finish!)
  // ============================================================================

  function displayFiveSecondMatchSummary(msg) {
    canControlBoard = false;
    if (countdownInterval) clearInterval(countdownInterval);
    if (summaryInterval) clearInterval(summaryInterval);

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
    const footerEl = document.getElementById('summary-footer-text');
    let rem = 5;

    const updateFooterLabel = () => {
      if (msg.returnToHub === false) {
        footerEl.innerHTML = `Next FFA round starting automatically in <span id="summary-countdown-sec">${Math.max(0, rem)}</span>s...`;
      } else {
        footerEl.innerHTML = `Returning to Project A² Hub in <span id="summary-countdown-sec">${Math.max(0, rem)}</span>s...`;
      }
    };
    updateFooterLabel();

    summaryInterval = setInterval(() => {
      rem -= 1;
      updateFooterLabel();
      if (rem <= 0) {
        clearInterval(summaryInterval);
        summaryInterval = null;
        postMatchScreen.classList.add('hidden');
        // Only return to Hub if it was a 1v1 set; FFA stays in the arena for the auto-restart!
        if (msg.returnToHub !== false) {
          navigateToHub();
        }
      }
    }, 1000);
  }

  // ============================================================================
  // WEBSOCKET CLIENT & MULTI-BOARD RENDERING
  // ============================================================================

  function updateSuddenDeathAndTugUI(sdMult, tug) {
    if (sdMult && sdMult > 1.0) {
      suddenDeathBadge.textContent = `SUDDEN DEATH ${sdMult.toFixed(1)}x`;
      suddenDeathBadge.classList.remove('hidden');
    } else {
      suddenDeathBadge.classList.add('hidden');
    }

    if (tug) {
      tugOfWarWrap.classList.remove('hidden');
      const total = (tug.p1Apm || 0) + (tug.p2Apm || 0);
      const p1Pct = total <= 0 ? 50 : Math.min(92, Math.max(8, (tug.p1Apm / total) * 100));
      tugOfWarFill.style.width = `${p1Pct}%`;
    }
  }

  function renderMultiBoardsGrid(boardsList) {
    if (!Array.isArray(boardsList)) return;
    multiOpponentsGrid.innerHTML = '';

    boardsList.forEach(b => {
      const card = document.createElement('div');
      card.className = `opp-mini-card ${selectedManualTargetId === b.id ? 'targeted' : ''}`;
      card.innerHTML = `
        <div class="opp-mini-header">${escapeHtml(b.username)} ${b.alive === false ? '(KO)' : ''}</div>
        <div class="opp-mini-sub">${Number(b.apm || 0).toFixed(1)} APM | ${Number(b.pps || 0).toFixed(2)} PPS</div>
        <canvas width="72" height="468"></canvas>
      `;

      if (currentMode === 'ffa') {
        card.addEventListener('click', () => {
          selectedManualTargetId = b.id;
          targetBtns.forEach(btn => btn.classList.remove('active'));
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'set_ffa_target', manualTargetId: b.id }));
          }
          renderMultiBoardsGrid(boardsList);
        });
      }

      const c = card.querySelector('canvas');
      const ctx = c.getContext('2d');
      if (b.grid) {
        const rows = b.grid.length;
        const cols = b.grid[0] ? b.grid[0].length : 4;
        const cellSize = 18;
        c.width = cols * cellSize;
        c.height = rows * cellSize;

        ctx.strokeStyle = 'rgba(255, 61, 87, 0.5)';
        ctx.beginPath();
        ctx.moveTo(0, 6 * cellSize);
        ctx.lineTo(cols * cellSize, 6 * cellSize);
        ctx.stroke();

        for (let r = 0; r < rows; r++) {
          for (let colIdx = 0; colIdx < cols; colIdx++) {
            const cell = b.grid[r][colIdx];
            if (cell) {
              drawStyledBlock(ctx, colIdx, r, cellSize, getPieceColor(cell), 1.0, userPrefs.blockSkin);
            }
          }
        }

        if (b.activePiece && b.activePiece.matrix) {
          const p = b.activePiece;
          const pCol = getPieceColor(p.type);
          for (let r = 0; r < p.matrix.length; r++) {
            for (let colIdx = 0; colIdx < p.matrix[r].length; colIdx++) {
              if (p.matrix[r][colIdx]) {
                drawStyledBlock(ctx, p.x + colIdx, p.y + r, cellSize, pCol, 1.0, userPrefs.blockSkin);
              }
            }
          }
        }
      }

      multiOpponentsGrid.appendChild(card);
    });
  }

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
          if (msg.activeMatches) renderLiveSpectateMatches(msg.activeMatches);
          break;

        case 'profile_synced':
          if (msg.user) {
            updateTopLevelBar(msg.user);
            renderUnlockGrids();
          }
          break;

        case 'hub_sync':
          cachedOnlinePlayers = msg.onlinePlayers || [];
          hub1v1QueueStatus.textContent = `In Queue: ${msg.queue1v1Count || 0}`;
          hubFfaStatus.textContent = `In Lobby: ${msg.ffaPlayerCount || 0}`;
          if (msg.activeMatches) renderLiveSpectateMatches(msg.activeMatches);
          if (msg.leaderboards) cachedLeaderboards = msg.leaderboards;
          if (msg.allPlayers) cachedAllPlayers = msg.allPlayers;
          if (activeScreen === 'hub') {
            renderActivePlayersBar();
            renderLeaderboard();
            renderPlayersDirectory();
          }
          break;

        case 'chat':
          appendChatMessage(msg.sender, msg.text, msg.style);
          break;

        // Bottom-Left Direct 1v1 Challenge Popup
        case 'direct_challenge_received':
          pendingDirectChallengeId = msg.challengeId;
          challengeToastText.textContent = `${msg.fromName} has challenged you to 1v1`;
          challengeToast.classList.remove('hidden');
          window.AudioController.playSFX('garbage_in');
          break;

        case 'challenge_cleared':
          if (pendingDirectChallengeId === msg.challengeId) {
            pendingDirectChallengeId = null;
            challengeToast.classList.add('hidden');
          }
          renderActivePlayersBar();
          break;

        case 'duel_init':
          queueWaitingBanner.classList.add('hidden');
          challengeToast.classList.add('hidden');
          enterArenaMode('duel', `1v1 BEST OF 3 • ${msg.p1.username} vs ${msg.p2.username}`, 4);
          arenaScoreStrip.textContent = `${msg.p1.username} (0) - (0) ${msg.p2.username} | ROUND 1`;
          tugOfWarWrap.classList.remove('hidden');
          break;

        case 'duel_round_countdown':
          arenaScoreStrip.textContent = `SCORE: ${msg.p1Score} - ${msg.p2Score} | ROUND ${msg.round} (BEST OF 3)`;
          if (currentMode === 'duel') {
            startThreeSecondCountdown(msg.seed, 4);
          }
          break;

        case 'duel_round_result':
          canControlBoard = false;
          arenaScoreStrip.textContent = `SCORE: ${msg.p1Score} - ${msg.p2Score}`;
          if (currentMode === 'duel') {
            if (msg.roundWinnerId === myId) {
              window.AudioController.playSFX('win');
              showOverlay(`ROUND ${msg.round} WON`, `Score: ${msg.p1Score} - ${msg.p2Score}`);
            } else {
              window.AudioController.playSFX('lose');
              showOverlay(`ROUND ${msg.round} LOST`, `${msg.roundWinnerName} won the round`);
            }
          }
          break;

        case 'ffa_waiting':
          if (currentMode === 'ffa') {
            canControlBoard = false;
            postMatchScreen.classList.add('hidden');
            showOverlay('WAITING FOR PLAYERS', `In Lobby: ${msg.playerCount} / 2+ required`);
          }
          break;

        case 'ffa_countdown_start':
          if (currentMode === 'ffa') {
            arenaScoreStrip.textContent = `${msg.playerCount} PLAYERS ALIVE`;
            startThreeSecondCountdown(msg.seed, 4);
          }
          break;

        case 'spectate_init':
          enterArenaMode('spectate', msg.title || 'LIVE SPECTATOR MODE', 4);
          break;

        case 'multi_opponent_sync':
          updateSuddenDeathAndTugUI(msg.suddenDeathMultiplier, msg.tugOfWar);
          renderMultiBoardsGrid(msg.opponents || []);
          break;

        case 'spectator_boards_sync':
          updateSuddenDeathAndTugUI(msg.suddenDeathMultiplier, msg.tugOfWar);
          renderMultiBoardsGrid(msg.boards || []);
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
      maxCombo: m.maxCombo,
      pendingGarbage: m.pendingGarbage
    }));
  }

  setInterval(() => {
    if (isAuthenticated && canControlBoard && (currentMode === 'duel' || currentMode === 'ffa')) {
      sendBoardSync();
    }
  }, 250);

  // ============================================================================
  // CHAT DRAWER, SIDE ACTION FEED & SETTINGS
  // ============================================================================

  closeChatBtn.addEventListener('click', () => chatDrawer.classList.add('hidden'));
  toggleChatBtn.addEventListener('click', () => chatDrawer.classList.toggle('hidden'));

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
    if (actionFeedCard) {
      actionFeedCard.classList.add('pulse');
      setTimeout(() => actionFeedCard.classList.remove('pulse'), 180);
    }
    if (calloutTimeout) clearTimeout(calloutTimeout);
    calloutTimeout = setTimeout(() => {
      actionCallout.textContent = '—';
    }, 2200);
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
  document.getElementById('open-settings-btn').addEventListener('click', () => {
    listeningKeybindAction = null;
    renderKeybindsModalList();
    settingsModal.classList.remove('hidden');
  });
  document.getElementById('close-settings-btn').addEventListener('click', () => {
    listeningKeybindAction = null;
    settingsModal.classList.add('hidden');
    saveUserSettingsToServer();
  });

  document.getElementById('check-board-shake').addEventListener('change', (e) => {
    userPrefs.boardShake = e.target.checked;
    saveUserSettingsToServer();
  });

  document.getElementById('check-lock-flash').addEventListener('change', (e) => {
    userPrefs.lockFlash = e.target.checked;
    saveUserSettingsToServer();
  });

  const bindSlider = (sliderId, labelId, initialVal, onChange) => {
    const s = document.getElementById(sliderId);
    const l = document.getElementById(labelId);
    if (!s || !l) return;
    s.value = initialVal;
    l.textContent = initialVal;
    s.addEventListener('input', () => {
      l.textContent = s.value;
      onChange(Number(s.value));
    });
  };

  bindSlider('slider-music', 'val-music', 40, v => window.AudioController.setMusicVolume(v / 100));
  bindSlider('slider-sfx', 'val-sfx', 75, v => window.AudioController.setSfxVolume(v / 100));
  bindSlider('slider-bg-interval', 'val-bg-interval', 180, v => window.BackgroundController.setShuffleInterval(v));

  // ============================================================================
  // CUSTOM KEYBIND INPUT HANDLING & 60FPS GAME LOOP
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
    if (listeningKeybindAction) {
      e.preventDefault();
      if (e.code !== 'Escape') {
        userPrefs.keybinds[listeningKeybindAction] = e.code;
        saveUserSettingsToServer();
      }
      listeningKeybindAction = null;
      renderKeybindsModalList();
      return;
    }

    if (isTyping() || activeScreen !== 'arena') return;

    const kb = userPrefs.keybinds;
    if (Object.values(kb).includes(e.code)) {
      e.preventDefault();
    }

    if (currentMode === 'ffa') {
      if (e.code === 'Digit1') { setFfaTargetModeUI('payback'); return; }
      if (e.code === 'Digit2') { setFfaTargetModeUI('ko'); return; }
      if (e.code === 'Digit3') { setFfaTargetModeUI('apm'); return; }
      if (e.code === 'Digit4') { setFfaTargetModeUI('random'); return; }
    }

    if (e.repeat) return;
    keysDown.add(e.code);

    if (e.code === kb.restart && currentMode !== 'duel' && currentMode !== 'ffa' && currentMode !== 'spectate') {
      flushZenLines();
      if (currentMode === 'apm_test') apmTestRemainingMs = 60000;
      startThreeSecondCountdown(Date.now(), currentCols);
      return;
    }

    if (!canControlBoard || engine.gameOver) return;

    if (e.code === kb.moveLeft) {
      moveDir = -1; dasTimer = 0; arrTimer = 0;
      engine.moveHorizontal(-1);
    } else if (e.code === kb.moveRight) {
      moveDir = 1; dasTimer = 0; arrTimer = 0;
      engine.moveHorizontal(1);
    } else if (e.code === kb.rotateCW) {
      engine.rotate(1);
    } else if (e.code === kb.rotateCCW) {
      engine.rotate(3);
    } else if (e.code === kb.rotate180) {
      engine.rotate(2);
    } else if (e.code === kb.hardDrop) {
      engine.hardDrop();
    } else if (e.code === kb.hold) {
      engine.hold();
    }
  });

  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.code);
    const kb = userPrefs.keybinds;
    if (e.code === kb.moveLeft && moveDir === -1) {
      moveDir = keysDown.has(kb.moveRight) ? 1 : 0;
      dasTimer = 0; arrTimer = 0;
    } else if (e.code === kb.moveRight && moveDir === 1) {
      moveDir = keysDown.has(kb.moveLeft) ? -1 : 0;
      dasTimer = 0; arrTimer = 0;
    }
  });

  function updateInput(dtMs) {
    if (!canControlBoard || engine.gameOver || isTyping()) return;
    const kb = userPrefs.keybinds;

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

    if (keysDown.has(kb.softDrop)) {
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

  // ============================================================================
  // 11-TIER SKIN & GHOST RENDERERS (GUARANTEED VISIBLE BLOCKS)
  // ============================================================================

  function drawStyledBlock(ctx, x, y, size, color, alpha = 1.0, skin = 'bevel') {
    ctx.save();
    ctx.globalAlpha = alpha;
    const px = x * size + 1;
    const py = y * size + 1;
    const w = size - 2;
    const safeColor = color || '#00e5ff';

    switch (skin) {
      case 'flat':
        ctx.fillStyle = safeColor;
        ctx.fillRect(px, py, w, w);
        break;
      case 'neon':
        ctx.fillStyle = 'rgba(8, 14, 26, 0.9)';
        ctx.fillRect(px, py, w, w);
        ctx.strokeStyle = safeColor;
        ctx.lineWidth = 2.2;
        ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
        break;
      case 'pixel':
        ctx.fillStyle = safeColor;
        ctx.fillRect(px, py, w, w);
        ctx.fillStyle = '#050a14';
        ctx.fillRect(px + 4, py + 4, w - 8, w - 8);
        ctx.fillStyle = safeColor;
        ctx.fillRect(px + 7, py + 7, w - 14, w - 14);
        break;
      case 'mono':
        ctx.fillStyle = '#e6f1ff';
        ctx.fillRect(px, py, w, w);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
        break;
      case 'carbon':
        ctx.fillStyle = '#182232';
        ctx.fillRect(px, py, w, w);
        ctx.fillStyle = safeColor;
        ctx.fillRect(px, py, w, 4);
        ctx.fillRect(px, py + w - 3, w, 3);
        break;
      case 'prism':
        ctx.fillStyle = safeColor;
        ctx.fillRect(px, py, w, w);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 3, py + 3, w - 6, w - 6);
        break;
      case 'plasma':
        ctx.fillStyle = 'rgba(10, 16, 28, 0.9)';
        ctx.fillRect(px, py, w, w);
        ctx.fillStyle = safeColor;
        ctx.beginPath();
        ctx.arc(px + w / 2, py + w / 2, w * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = safeColor;
        ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
        break;
      case 'goldskin':
        ctx.fillStyle = safeColor;
        ctx.fillRect(px, py, w, w);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
        break;
      case 'cyber':
        ctx.fillStyle = safeColor;
        ctx.fillRect(px, py, w, w);
        ctx.strokeStyle = '#050a14';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + w, py + w);
        ctx.stroke();
        break;
      case 'a2omega':
        ctx.fillStyle = safeColor;
        ctx.fillRect(px, py, w, w);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + w * 0.28, py + w * 0.28, w * 0.44, w * 0.44);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
        break;
      case 'bevel':
      default:
        ctx.fillStyle = safeColor;
        ctx.fillRect(px, py, w, w);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.fillRect(px, py, w, 3);
        break;
    }
    ctx.restore();
  }

  function drawGhostBlock(ctx, x, y, size, color, ghostStyle = 'fill') {
    ctx.save();
    const px = x * size + 1;
    const py = y * size + 1;
    const w = size - 2;
    const safeColor = color || '#00e5ff';

    if (ghostStyle === 'outline' || ghostStyle === 'pulse') {
      ctx.strokeStyle = safeColor;
      ctx.lineWidth = ghostStyle === 'pulse' ? 2.5 : 2;
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
    } else if (ghostStyle === 'crosshair' || ghostStyle === 'brackets' || ghostStyle === 'xray') {
      ctx.strokeStyle = safeColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(px + 2, py + 2, w - 4, w - 4);
      ctx.beginPath();
      ctx.moveTo(px + w / 2 - 4, py + w / 2);
      ctx.lineTo(px + w / 2 + 4, py + w / 2);
      ctx.moveTo(px + w / 2, py + w / 2 - 4);
      ctx.lineTo(px + w / 2, py + w / 2 + 4);
      ctx.stroke();
    } else if (ghostStyle === 'dashed') {
      ctx.strokeStyle = safeColor;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
    } else if (ghostStyle === 'core') {
      ctx.fillStyle = safeColor;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(px + w * 0.3, py + w * 0.3, w * 0.4, w * 0.4);
    } else if (ghostStyle === 'double') {
      ctx.strokeStyle = safeColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
      ctx.strokeRect(px + 5, py + 5, w - 10, w - 10);
    } else if (ghostStyle === 'beacon' || ghostStyle === 'omega') {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(px + 1, py + 1, w - 2, w - 2);
      drawStyledBlock(ctx, x, y, size, safeColor, 0.25, userPrefs.blockSkin);
    } else {
      drawStyledBlock(ctx, x, y, size, safeColor, 0.28, userPrefs.blockSkin);
    }
    ctx.restore();
  }

  function renderArena(now) {
    if (currentMode === 'spectate') return;
    const cellSize = 32;
    const cols = engine.cols || 4;
    const rows = engine.rows || 26;

    // Guarantee canvas dimensions match engine dimensions so blocks are never clipped or invisible
    if (boardCanvas.width !== cols * cellSize || boardCanvas.height !== rows * cellSize) {
      boardCanvas.width = cols * cellSize;
      boardCanvas.height = rows * cellSize;
    }

    boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

    boardCtx.fillStyle = 'rgba(255, 30, 70, 0.06)';
    boardCtx.fillRect(0, 0, cols * cellSize, engine.bufferRows * cellSize);

    boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
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

    boardCtx.strokeStyle = 'rgba(255, 61, 87, 0.78)';
    boardCtx.lineWidth = 2;
    boardCtx.beginPath();
    boardCtx.moveTo(0, engine.bufferRows * cellSize);
    boardCtx.lineTo(cols * cellSize, engine.bufferRows * cellSize);
    boardCtx.stroke();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = engine.grid[r][c];
        if (cell) {
          drawStyledBlock(boardCtx, c, r, cellSize, getPieceColor(cell), 1.0, userPrefs.blockSkin);
        }
      }
    }

    if (userPrefs.lockFlash && Array.isArray(engine.lockFlashCells) && engine.lockFlashCells.length > 0) {
      engine.lockFlashCells = engine.lockFlashCells.filter(f => f.expiresAt > now);
      boardCtx.save();
      boardCtx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      engine.lockFlashCells.forEach(f => {
        boardCtx.fillRect(f.x * cellSize + 1, f.y * cellSize + 1, cellSize - 2, cellSize - 2);
      });
      boardCtx.restore();
    }

    if (engine.activePiece && !engine.gameOver) {
      const p = engine.activePiece;
      const ghostY = engine.getGhostY();
      const pColor = getPieceColor(p.type);

      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) {
            drawGhostBlock(boardCtx, p.x + c, ghostY + r, cellSize, pColor, userPrefs.ghostStyle);
          }
        }
      }
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) {
            drawStyledBlock(boardCtx, p.x + c, p.y + r, cellSize, pColor, 1.0, userPrefs.blockSkin);
          }
        }
      }
    }

    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (engine.holdPiece && window.TETROMINO_MATRICES && window.TETROMINO_MATRICES[engine.holdPiece]) {
      const mat = window.TETROMINO_MATRICES[engine.holdPiece][0];
      const col = !engine.canHold ? '#546e7a' : getPieceColor(engine.holdPiece);
      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          if (mat[r][c]) drawStyledBlock(holdCtx, 0.8 + c, 0.8 + r, 22, col, 1.0, userPrefs.blockSkin);
        }
      }
    }

    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    engine.nextQueue.slice(0, 5).forEach((type, idx) => {
      if (!window.TETROMINO_MATRICES || !window.TETROMINO_MATRICES[type]) return;
      const mat = window.TETROMINO_MATRICES[type][0];
      const col = getPieceColor(type);
      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          if (mat[r][c]) drawStyledBlock(nextCtx, 0.8 + c, idx * 3.4 + 0.5 + r, 20, col, 1.0, userPrefs.blockSkin);
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

  let lastFrameTime = performance.now();
  function gameLoop(now) {
    const dtMs = Math.min(100, now - lastFrameTime);
    lastFrameTime = now;

    if (activeScreen === 'arena') {
      updateBoardShakePhysics(dtMs);
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
      renderArena(now);
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
})();
