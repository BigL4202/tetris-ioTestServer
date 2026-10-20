// ============================================================================
// PROJECT A^2 CONTROLLER: 2v2, DAILY XP, H2H, RGB COLORS, TRAILS & MOD ROLES
// ============================================================================

(function () {
  const FALLBACK_COLORS = {
    I: '#00e5ff', O: '#ffea00', T: '#d500f9',
    S: '#00e676', Z: '#ff1744', J: '#2979ff',
    L: '#ff9100', G: '#78909c'
  };

  const DEFAULT_CUSTOM_COLORS = {
    accentR: 0,   accentG: 229, accentB: 255,
    menuR: 12,    menuG: 19,    menuB: 33,
    btnBgR: 25,   btnBgG: 40,   btnBgB: 68,
    btnTxtR: 230, btnTxtG: 241, btnTxtB: 255
  };

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
    { id: 'brackets',  name: 'Corner Brackets',  reqLevel: 70,  desc: 'Corner-pinned ghost' },
    { id: 'xray',      name: 'X-Ray Grid',       reqLevel: 80,  desc: 'Internal cross-hatch ghost' },
    { id: 'beacon',    name: 'Solar Beacon',     reqLevel: 90,  desc: 'Golden outlined ghost piece' },
    { id: 'omega',     name: 'Omega Phantom',    reqLevel: 100, desc: 'Level 100 Master diamond ghost' }
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

  // DOM References
  const adminShoutBanner = document.getElementById('admin-shout-banner');
  const adminShoutText = document.getElementById('admin-shout-text');

  const authScreen = document.getElementById('auth-screen');
  const topBar = document.getElementById('top-bar');
  const hubScreen = document.getElementById('hub-screen');
  const arenaScreen = document.getElementById('arena-screen');
  const postMatchScreen = document.getElementById('post-match-screen');
  const returnHubBtn = document.getElementById('return-hub-btn');

  const authForm = document.getElementById('auth-form');
  const authUsernameInput = document.getElementById('auth-username');
  const authPasswordInput = document.getElementById('auth-password');
  const registerSubmitBtn = document.getElementById('register-submit-btn');
  const authErrorBox = document.getElementById('auth-error-box');
  const logoutBtn = document.getElementById('logout-btn');

  const navPilotName = document.getElementById('nav-pilot-name');
  const navAdminTag = document.getElementById('nav-admin-tag');
  const navPilotLevel = document.getElementById('nav-pilot-level');
  const navXpFill = document.getElementById('nav-xp-fill');
  const navXpText = document.getElementById('nav-xp-text');

  // Hub Tabs & Views
  const hubTabPlay = document.getElementById('hub-tab-play');
  const hubTabTourney = document.getElementById('hub-tab-tourney');
  const hubTabCustomize = document.getElementById('hub-tab-customize');
  const hubTabStats = document.getElementById('hub-tab-stats');
  const hubTabAdmin = document.getElementById('hub-tab-admin');

  const hubPlayView = document.getElementById('hub-play-view');
  const hubTourneyView = document.getElementById('hub-tourney-view');
  const hubCustomizeView = document.getElementById('hub-customize-view');
  const hubStatsView = document.getElementById('hub-stats-view');
  const hubAdminView = document.getElementById('hub-admin-view');

  const activePlayersCountEl = document.getElementById('active-players-count');
  const activePlayersBarEl = document.getElementById('active-players-bar');
  const dailyChallengesListEl = document.getElementById('daily-challenges-list');

  const launchZen4Btn = document.getElementById('launch-zen-4-btn');
  const launchZen10Btn = document.getElementById('launch-zen-10-btn');
  const launchApmTestBtn = document.getElementById('launch-apm-test-btn');

  const join1v1QueueBtn = document.getElementById('join-1v1-queue-btn');
  const leave1v1QueueBtn = document.getElementById('leave-1v1-queue-btn');
  const queueWaitingBanner = document.getElementById('queue-waiting-banner');
  const hub1v1QueueStatus = document.getElementById('hub-1v1-queue-status');

  const join2v2QueueBtn = document.getElementById('join-2v2-queue-btn');
  const leave2v2QueueBtn = document.getElementById('leave-2v2-queue-btn');
  const queue2v2WaitingBanner = document.getElementById('queue-2v2-waiting-banner');
  const hub2v2QueueStatus = document.getElementById('hub-2v2-queue-status');

  const joinFfaLobbyBtn = document.getElementById('join-ffa-lobby-btn');
  const hubFfaStatus = document.getElementById('hub-ffa-status');
  const liveMatchesList = document.getElementById('live-matches-list');

  // Challenge Toast
  const challengeToast = document.getElementById('challenge-toast');
  const challengeToastText = document.getElementById('challenge-toast-text');
  const acceptDirectChallengeBtn = document.getElementById('accept-direct-challenge-btn');
  const denyDirectChallengeBtn = document.getElementById('deny-direct-challenge-btn');

  // Leaderboards & Stats Directory
  const lbContentEl = document.getElementById('leaderboard-content');
  const lbTabs = document.querySelectorAll('.lb-tab');
  const pilotSearchInput = document.getElementById('pilot-search-input');
  const allPilotsDirectory = document.getElementById('all-pilots-directory');
  const inspectedPilotTitle = document.getElementById('inspected-pilot-title');
  const inspectedPilotBody = document.getElementById('inspected-pilot-body');

  // Tournament Elements
  const adminTourneyCreator = document.getElementById('admin-tourney-creator');
  const tournamentsListEl = document.getElementById('tournaments-list');
  const selectedTourneyTitle = document.getElementById('selected-tourney-title');
  const selectedTourneyActions = document.getElementById('selected-tourney-actions');
  const selectedTourneyBody = document.getElementById('selected-tourney-body');

  // Admin / Moderator Console Elements
  const adminOnlyGlobalBox = document.getElementById('admin-only-global-box');
  const adminShoutInput = document.getElementById('admin-shout-input');
  const adminShoutBtn = document.getElementById('admin-shout-btn');
  const adminRestartFfaBtn = document.getElementById('admin-restart-ffa-btn');
  const adminPlayersList = document.getElementById('admin-players-list');
  const adminSelectedUserTitle = document.getElementById('admin-selected-user-title');
  const adminSelectedUserBody = document.getElementById('admin-selected-user-body');

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

  const liveApmGraphBox = document.getElementById('live-apm-graph-box');
  const liveApmCanvas = document.getElementById('live-apm-canvas');
  const liveApmCtx = liveApmCanvas.getContext('2d');
  const summaryApmCanvas = document.getElementById('summary-apm-canvas');
  const summaryApmCtx = summaryApmCanvas.getContext('2d');

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
    lockedBg: 'shuffle',
    customColors: { ...DEFAULT_CUSTOM_COLORS },
    keybinds: { ...DEFAULT_KEYBINDS }
  };

  let listeningKeybindAction = null;
  let expandedActivePlayerId = null;
  let pendingDirectChallengeId = null;
  let selectedTourneyId = null;

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

  let lastInputTimestamp = performance.now();
  let myApmHistory = [];
  let opponentApmHistory = [];
  let apmSampleTimer = 0;

  let countdownInterval = null;
  let summaryInterval = null;
  let apmTestRemainingMs = 60000;
  let lastReportedZenLines = 0;

  let activeLeaderboardTab = 'byApm';
  let cachedLeaderboards = { byApm: [], byZen: [], byWins: [], byCombo: [], byDuels: [] };
  let cachedAllPlayers = [];
  let cachedOnlinePlayers = [];
  let cachedTournaments = [];
  let ws = null;

  function isBigLAdmin() {
    return Boolean(myUserObj && (myUserObj.isAdmin || String(myUserObj.username || '').toLowerCase() === 'bigl_'));
  }

  function isStaffModerator() {
    return Boolean(isBigLAdmin() || (myUserObj && myUserObj.isModerator));
  }

  function getPieceColor(type) {
    if (window.PIECE_COLORS && window.PIECE_COLORS[type]) return window.PIECE_COLORS[type];
    return FALLBACK_COLORS[type] || '#00e5ff';
  }

  const engine = new window.StackerEngine(4, 26, 20, {
    onSfx: (name, comboIdx) => window.AudioController.playSFX(name, comboIdx),
    onCallout: (text) => showCallout(text),
    onBoardImpulse: (vx, vy, isDamage) => triggerBoardImpulse(vx, vy, isDamage),
    onSendGarbage: (lines) => {
      if (ws && ws.readyState === WebSocket.OPEN && (currentMode === 'duel' || currentMode === 'team2v2' || currentMode === 'ffa')) {
        ws.send(JSON.stringify({ type: 'send_garbage', lines }));
      }
    },
    onTopOut: (stats) => {
      canControlBoard = false;
      if (currentMode === 'duel' || currentMode === 'team2v2' || currentMode === 'ffa') {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'player_topout', stats }));
        }
        showOverlay('ELIMINATED', 'Waiting for match result...');
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
  // UNLOCKED RGB "COLORS" SLIDERS APPLICATION
  // ============================================================================

  function applyCustomColorsToCSS() {
    const c = userPrefs.customColors || DEFAULT_CUSTOM_COLORS;
    const root = document.documentElement;
    root.style.setProperty('--accent-cyan', `rgb(${c.accentR}, ${c.accentG}, ${c.accentB})`);
    root.style.setProperty('--board-border', `rgb(${c.accentR}, ${c.accentG}, ${c.accentB})`);
    root.style.setProperty('--panel-border', `rgba(${c.accentR}, ${c.accentG}, ${c.accentB}, 0.32)`);
    root.style.setProperty('--panel-bg', `rgba(${c.menuR}, ${c.menuG}, ${c.menuB}, 0.88)`);
    root.style.setProperty('--btn-bg', `rgb(${c.btnBgR}, ${c.btnBgG}, ${c.btnBgB})`);
    root.style.setProperty('--btn-text', `rgb(${c.btnTxtR}, ${c.btnTxtG}, ${c.btnTxtB})`);
  }

  function syncColorSlidersFromPrefs() {
    const c = userPrefs.customColors || DEFAULT_CUSTOM_COLORS;
    const map = [
      ['col-accent-r', 'lbl-accent-r', 'accentR'],
      ['col-accent-g', 'lbl-accent-g', 'accentG'],
      ['col-accent-b', 'lbl-accent-b', 'accentB'],
      ['col-menu-r',   'lbl-menu-r',   'menuR'],
      ['col-menu-g',   'lbl-menu-g',   'menuG'],
      ['col-menu-b',   'lbl-menu-b',   'menuB'],
      ['col-btnbg-r',  'lbl-btnbg-r',  'btnBgR'],
      ['col-btnbg-g',  'lbl-btnbg-g',  'btnBgG'],
      ['col-btnbg-b',  'lbl-btnbg-b',  'btnBgB'],
      ['col-btntxt-r', 'lbl-btntxt-r', 'btnTxtR'],
      ['col-btntxt-g', 'lbl-btntxt-g', 'btnTxtG'],
      ['col-btntxt-b', 'lbl-btntxt-b', 'btnTxtB']
    ];
    map.forEach(([sliderId, lblId, key]) => {
      const s = document.getElementById(sliderId);
      const l = document.getElementById(lblId);
      if (s && l) {
        s.value = c[key];
        l.textContent = c[key];
      }
    });
    applyCustomColorsToCSS();
  }

  function wireColorSliders() {
    const map = [
      ['col-accent-r', 'lbl-accent-r', 'accentR'],
      ['col-accent-g', 'lbl-accent-g', 'accentG'],
      ['col-accent-b', 'lbl-accent-b', 'accentB'],
      ['col-menu-r',   'lbl-menu-r',   'menuR'],
      ['col-menu-g',   'lbl-menu-g',   'menuG'],
      ['col-menu-b',   'lbl-menu-b',   'menuB'],
      ['col-btnbg-r',  'lbl-btnbg-r',  'btnBgR'],
      ['col-btnbg-g',  'lbl-btnbg-g',  'btnBgG'],
      ['col-btnbg-b',  'lbl-btnbg-b',  'btnBgB'],
      ['col-btntxt-r', 'lbl-btntxt-r', 'btnTxtR'],
      ['col-btntxt-g', 'lbl-btntxt-g', 'btnTxtG'],
      ['col-btntxt-b', 'lbl-btntxt-b', 'btnTxtB']
    ];
    map.forEach(([sliderId, lblId, key]) => {
      const s = document.getElementById(sliderId);
      const l = document.getElementById(lblId);
      if (!s || !l) return;
      s.addEventListener('input', () => {
        const val = Number(s.value);
        l.textContent = val;
        userPrefs.customColors[key] = val;
        applyCustomColorsToCSS();
      });
      s.addEventListener('change', () => {
        saveUserSettingsToServer();
      });
    });

    const resetBtn = document.getElementById('reset-colors-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        userPrefs.customColors = { ...DEFAULT_CUSTOM_COLORS };
        syncColorSlidersFromPrefs();
        saveUserSettingsToServer();
      });
    }
  }

  wireColorSliders();

  // ============================================================================
  // LIVE APM LINE GRAPH RENDERER
  // ============================================================================

  function drawApmChartOnCanvas(ctx, width, height, seriesList) {
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    let maxVal = 60;
    seriesList.forEach(s => {
      (s.data || []).forEach(v => {
        if (v > maxVal) maxVal = v;
      });
    });
    maxVal = Math.ceil(maxVal * 1.15);

    seriesList.forEach(s => {
      const pts = s.data || [];
      if (pts.length === 0) return;

      ctx.strokeStyle = s.color || '#00e5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();

      pts.forEach((val, idx) => {
        const x = pts.length === 1 ? width / 2 : (idx / (pts.length - 1)) * (width - 8) + 4;
        const y = height - 6 - (Math.min(maxVal, Math.max(0, val)) / maxVal) * (height - 14);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

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
  // AUTHENTICATION, AUTO-SESSION RESTORE, DAILY CHALLENGES & LEVEL BAR
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
      if (data.tournaments) cachedTournaments = data.tournaments;
      completeLogin(data.user);
    } catch (e) {
      showAuthError('Could not connect to Project A² server.');
    }
  }

  const savedUsername = localStorage.getItem('a2_saved_user');
  if (savedUsername) {
    authUsernameInput.value = savedUsername;
    fetch(`/api/auth/profile/${encodeURIComponent(savedUsername)}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.ok && data.user) {
          if (data.leaderboards) cachedLeaderboards = data.leaderboards;
          if (data.allPlayers) cachedAllPlayers = data.allPlayers;
          if (data.tournaments) cachedTournaments = data.tournaments;
          completeLogin(data.user);
        }
      })
      .catch(() => {});
  }

  function renderDailyChallengesBox() {
    if (!dailyChallengesListEl || !myUserObj || !myUserObj.dailyChallenges) return;
    dailyChallengesListEl.innerHTML = '';
    const chList = myUserObj.dailyChallenges.challenges || [];

    chList.forEach(ch => {
      const pct = Math.min(100, Math.round((ch.progress / Math.max(1, ch.target)) * 100));
      const div = document.createElement('div');
      div.className = `daily-challenge-item ${ch.claimed ? 'completed' : ''}`;
      div.innerHTML = `
        <div class="dc-top">
          <span>${escapeHtml(ch.title)}</span>
          <span style="color:var(--accent-gold);">${ch.claimed ? 'COMPLETED' : `${ch.progress}/${ch.target}`} (+${ch.rewardXp} XP)</span>
        </div>
        <div class="dc-bar-bg">
          <div class="dc-bar-fill" style="width:${pct}%;"></div>
        </div>
      `;
      dailyChallengesListEl.appendChild(div);
    });
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

    renderDailyChallengesBox();

    if (isBigLAdmin()) {
      navAdminTag.textContent = 'ADMIN';
      navAdminTag.classList.remove('hidden');
      hubTabAdmin.textContent = 'ADMIN CONSOLE (BigL_)';
      hubTabAdmin.classList.remove('hidden');
      adminTourneyCreator.classList.remove('hidden');
      adminOnlyGlobalBox.classList.remove('hidden');
    } else if (isStaffModerator()) {
      navAdminTag.textContent = 'MOD';
      navAdminTag.classList.remove('hidden');
      hubTabAdmin.textContent = 'MODERATION CONSOLE';
      hubTabAdmin.classList.remove('hidden');
      adminTourneyCreator.classList.add('hidden');
      adminOnlyGlobalBox.classList.add('hidden');
    } else {
      navAdminTag.classList.add('hidden');
      hubTabAdmin.classList.add('hidden');
      adminTourneyCreator.classList.add('hidden');
      adminOnlyGlobalBox.classList.add('hidden');
    }
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
    userPrefs.lockedBg = settings.lockedBg || 'shuffle';
    userPrefs.customColors = { ...DEFAULT_CUSTOM_COLORS, ...(settings.customColors || {}) };
    window.BackgroundController.setLockedBackground(userPrefs.lockedBg);

    userPrefs.keybinds = { ...DEFAULT_KEYBINDS, ...(settings.keybinds || {}) };
    syncColorSlidersFromPrefs();
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
          lockedBg: userPrefs.lockedBg,
          customColors: userPrefs.customColors,
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

  function forceLogoutToScreen(reasonMsg) {
    localStorage.removeItem('a2_saved_user');
    leaveCurrentArenaOrQueue();
    isAuthenticated = false;
    myUserObj = null;
    authPasswordInput.value = '';
    topBar.classList.add('hidden');
    hubScreen.classList.add('hidden');
    arenaScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    if (reasonMsg) showAuthError(reasonMsg);
  }

  logoutBtn.addEventListener('click', () => forceLogoutToScreen());

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
        <span class="badge">${p.inDuel ? 'IN MATCH' : p.mode.toUpperCase()}</span>
      `;
      item.appendChild(topRow);

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
  // 4-COLUMN CUSTOMIZATION: 2-PER-COLUMN SQUARE THUMBNAILS (NO PICTURE NAMES)
  // ============================================================================

  function renderBackgroundThumbnailsGrid() {
    const grid = document.getElementById('bg-thumbnails-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 1. Square Shuffle Default Tile
    const shuffleCard = document.createElement('div');
    const isShuffleEquipped = !userPrefs.lockedBg || userPrefs.lockedBg === 'shuffle';
    shuffleCard.className = `bg-thumb-card ${isShuffleEquipped ? 'equipped' : ''}`;
    shuffleCard.style.backgroundImage = 'linear-gradient(135deg, #00e5ff 0%, #2979ff 50%, #d500f9 100%)';
    shuffleCard.title = 'Shuffle All Backgrounds (Default)';
    shuffleCard.innerHTML = `<span class="shuffle-icon-symbol">SHUFFLE</span>`;
    shuffleCard.addEventListener('click', () => {
      userPrefs.lockedBg = 'shuffle';
      window.BackgroundController.setLockedBackground('shuffle');
      saveUserSettingsToServer();
      renderBackgroundThumbnailsGrid();
    });
    grid.appendChild(shuffleCard);

    // 2. Square Picture Thumbnails (2 per row, NO text names, scrollable)
    const catalog = window.BackgroundController.getCatalog();
    catalog.forEach(item => {
      const isLockedToThis = userPrefs.lockedBg === item.id;
      const card = document.createElement('div');
      card.className = `bg-thumb-card ${isLockedToThis ? 'equipped' : ''}`;
      card.style.backgroundImage = item.cssValue;
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
    const adminBypass = isBigLAdmin();

    const buildGrid = (containerId, catalog, currentId, onSelect) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';

      catalog.forEach(item => {
        const unlocked = adminBypass || myLvl >= item.reqLevel;
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
  }

  // ============================================================================
  // TOURNAMENT SYSTEM UI
  // ============================================================================

  document.getElementById('t-create-submit-btn').addEventListener('click', () => {
    if (!isBigLAdmin() || !ws || ws.readyState !== WebSocket.OPEN) return;
    const params = {
      name: document.getElementById('t-create-name').value.trim() || 'Project A² Championship',
      format: document.getElementById('t-create-format').value,
      bestOf: Number(document.getElementById('t-create-bo').value) || 3,
      seeding: document.getElementById('t-create-seeding').value,
      maxPlayers: Number(document.getElementById('t-create-max').value) || 8,
      registrationDays: Number(document.getElementById('t-create-regdays').value) || 1,
      daysPerMatch: Number(document.getElementById('t-create-matchdays').value) || 1
    };
    ws.send(JSON.stringify({
      type: 'admin_action',
      action: 'create_tournament',
      params
    }));
    document.getElementById('t-create-name').value = '';
  });

  function renderTournamentsView() {
    if (!tournamentsListEl) return;
    tournamentsListEl.innerHTML = '';

    if (cachedTournaments.length === 0) {
      tournamentsListEl.innerHTML = `<div class="sub-hint">No tournaments created yet.</div>`;
      selectedTourneyTitle.textContent = 'NO ACTIVE TOURNAMENT';
      selectedTourneyActions.innerHTML = '';
      selectedTourneyBody.innerHTML = `<p class="sub-hint">When Admin BigL_ creates a tournament, it will appear here.</p>`;
      return;
    }

    if (!selectedTourneyId || !cachedTournaments.some(t => t.id === selectedTourneyId)) {
      selectedTourneyId = cachedTournaments[0].id;
    }

    cachedTournaments.forEach(t => {
      const row = document.createElement('div');
      row.className = 'pilot-row';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(t.name)}</strong>
          <div class="sub-hint">${t.format.toUpperCase()} ELIM • BO${t.bestOf} • ${t.registeredPlayers.length}/${t.maxPlayers} Players</div>
        </div>
        <span class="badge ${t.status === 'completed' ? 'gold-badge' : ''}">${t.status.toUpperCase()}</span>
      `;
      row.addEventListener('click', () => {
        selectedTourneyId = t.id;
        renderTournamentsView();
      });
      tournamentsListEl.appendChild(row);
    });

    const activeT = cachedTournaments.find(t => t.id === selectedTourneyId);
    if (activeT) renderSelectedTournamentDetail(activeT);
  }

  function renderSelectedTournamentDetail(t) {
    selectedTourneyTitle.textContent = `${t.name.toUpperCase()} (${t.format.toUpperCase()} ELIM | BO${t.bestOf})`;
    selectedTourneyActions.innerHTML = '';
    selectedTourneyBody.innerHTML = '';

    const myName = myUserObj ? myUserObj.username : '';
    const isRegistered = t.registeredPlayers.includes(myName);

    if (t.status === 'registration') {
      if (!isRegistered && t.registeredPlayers.length < t.maxPlayers) {
        const regBtn = document.createElement('button');
        regBtn.className = 'btn btn-success btn-sm';
        regBtn.textContent = 'REGISTER FOR TOURNAMENT';
        regBtn.addEventListener('click', () => {
          ws.send(JSON.stringify({ type: 'tourney_register', tourneyId: t.id }));
        });
        selectedTourneyActions.appendChild(regBtn);
      } else if (isRegistered) {
        const badge = document.createElement('span');
        badge.className = 'badge gold-badge';
        badge.textContent = 'REGISTERED';
        selectedTourneyActions.appendChild(badge);
      }

      if (isBigLAdmin()) {
        const forceStartBtn = document.createElement('button');
        forceStartBtn.className = 'btn btn-warning btn-sm';
        forceStartBtn.textContent = 'FORCE-START BRACKET NOW';
        forceStartBtn.addEventListener('click', () => {
          ws.send(JSON.stringify({
            type: 'admin_action',
            action: 'force_start_tournament',
            tourneyId: t.id
          }));
        });
        selectedTourneyActions.appendChild(forceStartBtn);
      }
    }

    if (isBigLAdmin()) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.textContent = 'DELETE';
      delBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'admin_action', action: 'delete_tournament', tourneyId: t.id }));
      });
      selectedTourneyActions.appendChild(delBtn);
    }

    if (t.status === 'registration') {
      const remHrs = Math.max(0, (t.registrationEndsAt - Date.now()) / 3600000).toFixed(1);
      selectedTourneyBody.innerHTML = `
        <div class="stat-grid-boxes">
          <div class="stat-card"><span class="stat-title">STATUS</span><span class="stat-val">REGISTRATION OPEN</span></div>
          <div class="stat-card"><span class="stat-title">SEEDING</span><span class="stat-val">${t.seeding.toUpperCase()}</span></div>
          <div class="stat-card"><span class="stat-title">REGISTERED</span><span class="stat-val">${t.registeredPlayers.length} / ${t.maxPlayers}</span></div>
          <div class="stat-card"><span class="stat-title">CLOSES IN</span><span class="stat-val">${remHrs} Hours</span></div>
        </div>
        <h4 class="bracket-section-title">REGISTERED PLAYERS</h4>
        <div>${t.registeredPlayers.map(p => `<span class="badge" style="margin:3px;">${escapeHtml(p)}</span>`).join('') || '<span class="sub-hint">No players registered yet.</span>'}</div>
      `;
      return;
    }

    if (t.champion) {
      const champBanner = document.createElement('div');
      champBanner.className = 'challenge-box';
      champBanner.innerHTML = `<strong>TOURNAMENT CHAMPION: ${escapeHtml(t.champion)}</strong>`;
      selectedTourneyBody.appendChild(champBanner);
    }

    const myReadyMatch = t.matches.find(m => m.status === 'ready' && (m.p1 === myName || m.p2 === myName));
    if (myReadyMatch) {
      const oppName = myReadyMatch.p1 === myName ? myReadyMatch.p2 : myReadyMatch.p1;
      const alreadyQueued = (myReadyMatch.p1 === myName && myReadyMatch.p1Queued) || (myReadyMatch.p2 === myName && myReadyMatch.p2Queued);
      const qBox = document.createElement('div');
      qBox.className = 'challenge-box';
      qBox.innerHTML = `
        <div>
          <strong>YOUR NEXT TOURNAMENT MATCH: ${escapeHtml(myName)} vs ${escapeHtml(oppName)} (BO${t.bestOf})</strong>
          <div class="sub-hint">When both you and ${escapeHtml(oppName)} click Queue, your 1v1 starts immediately.</div>
        </div>
        <button class="btn ${alreadyQueued ? 'btn-warning' : 'btn-success'} btn-sm" id="queue-my-tourney-match-btn">
          ${alreadyQueued ? 'WAITING FOR OPPONENT...' : 'QUEUE TOURNAMENT MATCH'}
        </button>
      `;
      qBox.querySelector('#queue-my-tourney-match-btn').addEventListener('click', () => {
        ws.send(JSON.stringify({
          type: 'tourney_queue_match',
          tourneyId: t.id,
          matchId: myReadyMatch.id
        }));
      });
      selectedTourneyBody.appendChild(qBox);
    }

    const renderBracketGroup = (title, bracketKey) => {
      const groupMatches = t.matches.filter(m => m.bracket === bracketKey);
      if (groupMatches.length === 0) return;

      const secTitle = document.createElement('div');
      secTitle.className = 'bracket-section-title';
      secTitle.textContent = title;
      selectedTourneyBody.appendChild(secTitle);

      const roundsRow = document.createElement('div');
      roundsRow.className = 'bracket-rounds-row';

      const roundsSet = Array.from(new Set(groupMatches.map(m => m.round))).sort((a, b) => a - b);
      roundsSet.forEach(rNum => {
        const col = document.createElement('div');
        col.className = 'bracket-round-col';
        const rHeader = document.createElement('div');
        rHeader.className = 'bracket-round-header';
        rHeader.textContent = bracketKey === 'grand_finals' ? (rNum === 1 ? 'GRAND FINALS SET 1' : 'GF BRACKET RESET (IF NEEDED)') : `ROUND ${rNum}`;
        col.appendChild(rHeader);

        const rMatches = groupMatches.filter(m => m.round === rNum);
        rMatches.forEach(m => {
          const node = document.createElement('div');
          node.className = `bracket-match-node ${m.status === 'live' ? 'live-match' : ''}`;

          const p1Label = m.p1 || 'TBD';
          const p2Label = m.p2 || 'TBD';
          const remHours = m.deadlineAt ? Math.max(0, (m.deadlineAt - Date.now()) / 3600000).toFixed(1) : '0.0';

          node.innerHTML = `
            <div class="sub-hint">${m.id} • ${m.status.toUpperCase()} ${m.status === 'ready' ? `(${remHours}h left)` : ''}</div>
            <div class="bracket-slot ${m.winner && m.winner === m.p1 ? 'winner-slot' : ''}">
              <span>${escapeHtml(p1Label)} ${m.p1Queued ? '[QUEUED]' : ''}</span>
              <span>${m.score1}</span>
            </div>
            <div class="bracket-slot ${m.winner && m.winner === m.p2 ? 'winner-slot' : ''}">
              <span>${escapeHtml(p2Label)} ${m.p2Queued ? '[QUEUED]' : ''}</span>
              <span>${m.score2}</span>
            </div>
          `;

          if (m.status === 'live' && m.liveRoomId) {
            const specBtn = document.createElement('button');
            specBtn.className = 'btn btn-primary btn-sm';
            specBtn.textContent = 'LIVE - SPECTATE';
            specBtn.addEventListener('click', () => {
              ws.send(JSON.stringify({ type: 'spectate_match', matchId: m.liveRoomId }));
            });
            node.appendChild(specBtn);
          }

          if (isBigLAdmin() && (m.status === 'ready' || m.status === 'live') && m.p1 && m.p2 && m.p1 !== 'BYE' && m.p2 !== 'BYE') {
            const adminRow = document.createElement('div');
            adminRow.className = 'admin-inject-row';
            const adv1 = document.createElement('button');
            adv1.className = 'btn btn-warning btn-sm';
            adv1.textContent = `WIN: ${m.p1}`;
            adv1.addEventListener('click', () => {
              ws.send(JSON.stringify({
                type: 'admin_action',
                action: 'force_advance_match',
                tourneyId: t.id,
                matchId: m.id,
                winnerName: m.p1
              }));
            });

            const adv2 = document.createElement('button');
            adv2.className = 'btn btn-warning btn-sm';
            adv2.textContent = `WIN: ${m.p2}`;
            adv2.addEventListener('click', () => {
              ws.send(JSON.stringify({
                type: 'admin_action',
                action: 'force_advance_match',
                tourneyId: t.id,
                matchId: m.id,
                winnerName: m.p2
              }));
            });

            adminRow.appendChild(adv1);
            adminRow.appendChild(adv2);
            node.appendChild(adminRow);
          }

          col.appendChild(node);
        });

        roundsRow.appendChild(col);
      });

      selectedTourneyBody.appendChild(roundsRow);
    };

    renderBracketGroup('WINNERS BRACKET', 'winners');
    if (t.format === 'double') {
      renderBracketGroup('LOSERS BRACKET', 'losers');
      renderBracketGroup('GRAND FINALS (LOSERS BRACKET MUST WIN TWICE)', 'grand_finals');
    }
  }

  // ============================================================================
  // BigL_ ADMIN & MODERATOR CONSOLE UI
  // Moderators ONLY see Ban / Unban / Timeout / End Timeout / Mute / Dismiss Mute.
  // Passwords, Stat Editors, Moderator Promotion, Shout & Lobby Reset are ONLY for BigL_!
  // ============================================================================

  if (adminShoutBtn) {
    adminShoutBtn.addEventListener('click', () => {
      if (!isBigLAdmin()) return;
      const text = adminShoutInput.value.trim();
      if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'admin_action',
        action: 'shout',
        text
      }));
      adminShoutInput.value = '';
    });
  }

  if (adminRestartFfaBtn) {
    adminRestartFfaBtn.addEventListener('click', () => {
      if (!isBigLAdmin() || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'admin_action',
        action: 'restart_lobby',
        lobbyId: 'ffa_main'
      }));
    });
  }

  function renderAdminConsole() {
    if (!isStaffModerator() || !adminPlayersList) return;
    adminPlayersList.innerHTML = '';

    cachedAllPlayers.forEach(p => {
      const row = document.createElement('div');
      row.className = 'pilot-row';
      const modFlags = [];
      if (p.isModerator) modFlags.push('MODERATOR');
      if (p.moderation && p.moderation.banned) modFlags.push('BANNED');
      if (p.moderation && p.moderation.timeoutUntil > Date.now()) modFlags.push('TIMED OUT');
      if (p.moderation && p.moderation.mutedUntil > Date.now()) modFlags.push('MUTED');

      row.innerHTML = `
        <div>
          <strong>${escapeHtml(p.username)}</strong>
          <div class="sub-hint">LVL ${p.stats.level} • ${p.stats.apmTestBest.toFixed(1)} APM ${modFlags.length ? '• [' + modFlags.join(', ') + ']' : ''}</div>
        </div>
        <span class="badge gold-badge">MANAGE</span>
      `;
      row.addEventListener('click', () => renderAdminUserEditor(p));
      adminPlayersList.appendChild(row);
    });
  }

  function renderAdminUserEditor(p) {
    adminSelectedUserTitle.textContent = `MANAGE ACCOUNT: ${p.username.toUpperCase()}`;
    const s = p.stats;
    const mod = p.moderation || {};
    const callerIsBigL = isBigLAdmin();

    // Build HTML based on whether caller is BigL_ (full powers) or a Moderator (strictly Ban/Timeout/Mute)
    let html = `
      <div class="stat-grid-boxes">
        ${callerIsBigL ? `
        <div class="stat-card">
          <span class="stat-title">SAVED PASSWORD (BigL_ ONLY)</span>
          <span class="stat-val" style="color:var(--accent-gold);">${escapeHtml(p.passwordPlain || '(hidden)')}</span>
        </div>
        ` : ''}
        <div class="stat-card">
          <span class="stat-title">ACCOUNT ROLE</span>
          <span class="stat-val">${p.isAdmin ? 'MASTER ADMIN (BigL_)' : (p.isModerator ? 'MODERATOR' : 'PLAYER')}</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">MODERATION STATUS</span>
          <span class="stat-val">${mod.banned ? 'BANNED' : (mod.timeoutUntil > Date.now() ? 'TIMED OUT' : (mod.mutedUntil > Date.now() ? 'MUTED' : 'ACTIVE'))}</span>
        </div>
      </div>

      ${callerIsBigL && !p.isAdmin ? `
      <div class="t-form-row">
        <button class="btn ${p.isModerator ? 'btn-danger' : 'btn-primary'} btn-sm" id="adm-toggle-mod-btn">
          ${p.isModerator ? 'REVOKE MODERATOR ROLE' : 'GRANT MODERATOR ROLE'}
        </button>
      </div>
      ` : ''}

      <h4 style="color:var(--accent-cyan);font-size:0.8rem;">MODERATION CONTROLS (BAN / TIMEOUT / MUTE)</h4>
      <div class="t-form-row" style="gap:8px;flex-wrap:wrap;">
        <label>Duration (Minutes):</label>
        <input type="number" id="adm-mod-mins" value="15" min="1" max="10080" style="width:90px;" />
        <button class="btn btn-danger btn-sm" id="adm-ban-btn">BAN ACCOUNT</button>
        <button class="btn btn-success btn-sm" id="adm-unban-btn">UNBAN</button>
        <button class="btn btn-warning btn-sm" id="adm-timeout-btn">TIMEOUT</button>
        <button class="btn btn-primary btn-sm" id="adm-untimeout-btn">END TIMEOUT</button>
        <button class="btn btn-warning btn-sm" id="adm-mute-btn">MUTE CHAT</button>
        <button class="btn btn-primary btn-sm" id="adm-unmute-btn">DISMISS MUTE</button>
      </div>
    `;

    if (callerIsBigL) {
      html += `
        <h4 style="color:var(--accent-cyan);font-size:0.8rem;">ACCOUNT, STAT & LEADERBOARD EDITOR (BigL_ ONLY)</h4>
        <div class="stat-grid-boxes">
          <div class="stat-card">
            <span class="stat-title">XP</span>
            <input type="number" id="adm-edit-xp" value="${s.xp}" />
          </div>
          <div class="stat-card">
            <span class="stat-title">OFFICIAL APM</span>
            <input type="number" step="0.1" id="adm-edit-apm" value="${s.apmTestBest}" />
          </div>
          <div class="stat-card">
            <span class="stat-title">ZEN LINES</span>
            <input type="number" id="adm-edit-zen" value="${s.zenLines}" />
          </div>
          <div class="stat-card">
            <span class="stat-title">1v1 WINS</span>
            <input type="number" id="adm-edit-duelwins" value="${s.duelWins}" />
          </div>
          <div class="stat-card">
            <span class="stat-title">FFA WINS</span>
            <input type="number" id="adm-edit-ffawins" value="${s.ffaWins}" />
          </div>
          <div class="stat-card">
            <span class="stat-title">MAX COMBO</span>
            <input type="number" id="adm-edit-combo" value="${s.maxCombo}" />
          </div>
        </div>
        <button class="btn btn-success" id="adm-save-stats-btn">SAVE EDITED STATS TO LEADERBOARD & GITHUB</button>
      `;
    }

    adminSelectedUserBody.innerHTML = html;

    const sendMod = (subAction) => {
      const minutes = Number(document.getElementById('adm-mod-mins').value) || 15;
      ws.send(JSON.stringify({
        type: 'admin_action',
        action: 'moderate_user',
        targetUsername: p.username,
        subAction,
        minutes
      }));
    };

    document.getElementById('adm-ban-btn').addEventListener('click', () => sendMod('ban'));
    document.getElementById('adm-unban-btn').addEventListener('click', () => sendMod('unban'));
    document.getElementById('adm-timeout-btn').addEventListener('click', () => sendMod('timeout'));
    document.getElementById('adm-untimeout-btn').addEventListener('click', () => sendMod('end_timeout'));
    document.getElementById('adm-mute-btn').addEventListener('click', () => sendMod('mute'));
    document.getElementById('adm-unmute-btn').addEventListener('click', () => sendMod('unmute'));

    const toggleModBtn = document.getElementById('adm-toggle-mod-btn');
    if (toggleModBtn && callerIsBigL) {
      toggleModBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({
          type: 'admin_action',
          action: 'toggle_moderator',
          targetUsername: p.username
        }));
      });
    }

    const saveStatsBtn = document.getElementById('adm-save-stats-btn');
    if (saveStatsBtn && callerIsBigL) {
      saveStatsBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({
          type: 'admin_action',
          action: 'edit_stats',
          targetUsername: p.username,
          xp: Number(document.getElementById('adm-edit-xp').value),
          apmTestBest: Number(document.getElementById('adm-edit-apm').value),
          zenLines: Number(document.getElementById('adm-edit-zen').value),
          duelWins: Number(document.getElementById('adm-edit-duelwins').value),
          ffaWins: Number(document.getElementById('adm-edit-ffawins').value),
          maxCombo: Number(document.getElementById('adm-edit-combo').value)
        }));
      });
    }
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
  // HUB NAVIGATION, LEADERBOARDS & HEAD-TO-HEAD RIVALRY INSPECTOR
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
    renderDailyChallengesBox();
    renderLeaderboard();
    renderPlayersDirectory();
    renderUnlockGrids();
    renderBackgroundThumbnailsGrid();
    renderTournamentsView();
    renderAdminConsole();
  }

  function switchHubTab(activeBtn, activeView) {
    [hubTabPlay, hubTabTourney, hubTabCustomize, hubTabStats, hubTabAdmin].forEach(b => b.classList.remove('active'));
    [hubPlayView, hubTourneyView, hubCustomizeView, hubStatsView, hubAdminView].forEach(v => v.classList.add('hidden'));
    activeBtn.classList.add('active');
    activeView.classList.remove('hidden');
  }

  hubTabPlay.addEventListener('click', () => switchHubTab(hubTabPlay, hubPlayView));
  hubTabTourney.addEventListener('click', () => {
    switchHubTab(hubTabTourney, hubTourneyView);
    renderTournamentsView();
  });
  hubTabCustomize.addEventListener('click', () => {
    switchHubTab(hubTabCustomize, hubCustomizeView);
    renderUnlockGrids();
    renderBackgroundThumbnailsGrid();
    syncColorSlidersFromPrefs();
  });
  hubTabStats.addEventListener('click', () => {
    switchHubTab(hubTabStats, hubStatsView);
    renderPlayersDirectory();
  });
  hubTabAdmin.addEventListener('click', () => {
    switchHubTab(hubTabAdmin, hubAdminView);
    renderAdminConsole();
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
        <div class="duel-side">
          <button class="btn btn-sm btn-primary spec-btn">SPECTATE (${m.spectatorCount || 0})</button>
          ${isBigLAdmin() ? `<button class="btn btn-sm btn-warning rst-btn">RESTART</button>` : ''}
        </div>
      `;
      row.querySelector('.spec-btn').addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'spectate_match', matchId: m.id }));
        }
      });
      const rstBtn = row.querySelector('.rst-btn');
      if (rstBtn) {
        rstBtn.addEventListener('click', () => {
          ws.send(JSON.stringify({ type: 'admin_action', action: 'restart_lobby', lobbyId: m.id }));
        });
      }
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

    // Calculate Head-to-Head Record between logged-in player and inspected player
    let h2hBannerHtml = '';
    if (myUserObj && myUserObj.username.toLowerCase() !== p.username.toLowerCase()) {
      const myH2H = (myUserObj.headToHead && myUserObj.headToHead[p.username.toLowerCase()]) || { wins: 0, losses: 0 };
      h2hBannerHtml = `
        <div class="h2h-banner">
          <span>HEAD-TO-HEAD RIVALRY RECORD</span>
          <span style="color:var(--accent-gold);">${escapeHtml(myUserObj.username)} ${myH2H.wins}W — ${myH2H.losses}L ${escapeHtml(p.username)}</span>
        </div>
      `;
    }

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
      ${h2hBannerHtml}
      <div class="stat-grid-boxes">
        <div class="stat-card"><span class="stat-title">ACCOUNT LEVEL</span><span class="stat-val">LVL ${s.level} (${s.xp} XP)</span></div>
        <div class="stat-card"><span class="stat-title">OFFICIAL APM (BEST)</span><span class="stat-val">${Number(s.apmTestBest || 0).toFixed(1)} APM</span></div>
        <div class="stat-card"><span class="stat-title">ZEN LINES CLEARED</span><span class="stat-val">${s.zenLines || 0}</span></div>
        <div class="stat-card"><span class="stat-title">1v1 RECORD</span><span class="stat-val">${s.duelWins || 0}W - ${s.duelLosses || 0}L</span></div>
        <div class="stat-card"><span class="stat-title">2v2 TEAM RECORD</span><span class="stat-val">${s.teamWins || 0}W - ${s.teamLosses || 0}L</span></div>
        <div class="stat-card"><span class="stat-title">FFA WINS</span><span class="stat-val">${s.ffaWins || 0}</span></div>
        <div class="stat-card"><span class="stat-title">TOURNEY WINS</span><span class="stat-val">${s.tournamentWins || 0}</span></div>
        <div class="stat-card"><span class="stat-title">MAX COMBO</span><span class="stat-val">${s.maxCombo || 0}x</span></div>
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
  // GAME MODE LAUNCHERS & COUNTDOWN ENGINE
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

  function startCountdownWithDuration(seed, cols, durationMs = 3000, onGoCallback = null) {
    if (countdownInterval) clearInterval(countdownInterval);
    if (summaryInterval) clearInterval(summaryInterval);
    postMatchScreen.classList.add('hidden');

    canControlBoard = false;
    playerPlayfieldWrapper.classList.remove('hidden');
    configureBoardDimensions(cols);
    engine.reset(seed, cols);
    lastReportedZenLines = 0;
    myApmHistory = [0];
    opponentApmHistory = [0];
    apmSampleTimer = 0;
    actionCallout.textContent = '—';
    suddenDeathBadge.classList.add('hidden');

    let remSec = Math.max(1, Math.ceil(durationMs / 1000));
    showOverlay(String(remSec), 'GET READY');
    window.AudioController.playSFX('move');

    countdownInterval = setInterval(() => {
      remSec -= 1;
      if (remSec > 0) {
        showOverlay(String(remSec), 'GET READY');
        window.AudioController.playSFX('move');
      } else if (remSec === 0) {
        showOverlay('GO!', '');
        window.AudioController.playSFX('rotate');
        engine.startTime = performance.now();
        lastInputTimestamp = performance.now();
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

    if (modeKey === 'duel' || modeKey === 'team2v2' || modeKey === 'ffa' || modeKey === 'apm_test') {
      liveApmGraphBox.classList.remove('hidden');
    } else {
      liveApmGraphBox.classList.add('hidden');
    }

    if (modeKey === 'spectate') {
      playerPlayfieldWrapper.classList.add('hidden');
      multiOpponentsPanel.classList.remove('hidden');
      multiOppHeader.textContent = isBigLAdmin() ? 'LIVE SPECTATOR FEED (ADMIN GARBAGE INJECTOR ACTIVE)' : 'LIVE SPECTATOR FEED';
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

    if (modeKey === 'duel' || modeKey === 'team2v2' || modeKey === 'ffa') {
      multiOpponentsPanel.classList.remove('hidden');
      multiOppHeader.textContent = modeKey === 'ffa' ? 'FFA OPPONENTS (CLICK TO TARGET)' : 'LIVE MATRICES';
      arenaRestartBtn.classList.add('hidden');
    } else {
      multiOpponentsPanel.classList.add('hidden');
      arenaRestartBtn.classList.remove('hidden');
    }

    if (modeKey === 'zen4' || modeKey === 'zen10' || modeKey === 'apm_test') {
      startCountdownWithDuration(seed, cols, 3000);
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
      queue2v2WaitingBanner.classList.add('hidden');
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

  join2v2QueueBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      queueWaitingBanner.classList.add('hidden');
      ws.send(JSON.stringify({ type: 'join_2v2_queue' }));
      queue2v2WaitingBanner.classList.remove('hidden');
    }
  });

  leave2v2QueueBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave_2v2_queue' }));
      queue2v2WaitingBanner.classList.add('hidden');
    }
  });

  joinFfaLobbyBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      enterArenaMode('ffa', 'FFA ARENA', 4);
      canControlBoard = false;
      showOverlay('JOINING FFA LOBBY...', 'Syncing lobby state...');
      ws.send(JSON.stringify({ type: 'join_ffa_lobby' }));
    }
  });

  function leaveCurrentArenaOrQueue() {
    flushZenLines();
    queueWaitingBanner.classList.add('hidden');
    queue2v2WaitingBanner.classList.add('hidden');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave_active_mode' }));
    }
    navigateToHub();
  }

  returnHubBtn.addEventListener('click', leaveCurrentArenaOrQueue);
  arenaLeaveBtn.addEventListener('click', leaveCurrentArenaOrQueue);

  arenaRestartBtn.addEventListener('click', () => {
    if (currentMode === 'duel' || currentMode === 'team2v2' || currentMode === 'ffa' || currentMode === 'spectate') return;
    flushZenLines();
    if (currentMode === 'apm_test') apmTestRemainingMs = 60000;
    startCountdownWithDuration(Date.now(), currentCols, 3000);
  });

  // ============================================================================
  // 5-SECOND POST-MATCH STATS SUMMARY + APM GRAPH
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

    const series = Array.isArray(msg.graphSeries) && msg.graphSeries.length > 0
      ? msg.graphSeries
      : [{ label: 'YOU', color: '#00e5ff', data: myApmHistory }];
    drawApmChartOnCanvas(summaryApmCtx, summaryApmCanvas.width, summaryApmCanvas.height, series);

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

    if (currentMode === 'duel' && boardsList[0]) {
      opponentApmHistory.push(Number(boardsList[0].apm || 0));
      if (opponentApmHistory.length > 80) opponentApmHistory.shift();
    }

    boardsList.forEach(b => {
      const card = document.createElement('div');
      card.className = `opp-mini-card ${selectedManualTargetId === b.id ? 'targeted' : ''}`;
      card.innerHTML = `
        <div class="opp-mini-header">${escapeHtml(b.username)} ${b.alive === false ? '(KO)' : ''}</div>
        <div class="opp-mini-sub">${Number(b.apm || 0).toFixed(1)} APM | ${Number(b.pps || 0).toFixed(2)} PPS</div>
        <canvas width="72" height="468"></canvas>
      `;

      // Admin BigL_ Spectator Garbage Injector Buttons (Reserved strictly for BigL_)
      if (isBigLAdmin() && (currentMode === 'spectate' || currentMode === 'ffa' || currentMode === 'duel' || currentMode === 'team2v2')) {
        const injectRow = document.createElement('div');
        injectRow.className = 'admin-inject-row';
        [1, 4, 10].forEach(lineAmt => {
          const btn = document.createElement('button');
          btn.className = 'btn btn-danger btn-sm';
          btn.textContent = `+${lineAmt}L`;
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'admin_action',
                action: 'send_spectator_garbage',
                targetId: b.id,
                lines: lineAmt
              }));
            }
          });
          injectRow.appendChild(btn);
        });
        card.appendChild(injectRow);
      }

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

  let shoutHideTimer = null;
  function displayAdminShout(text) {
    adminShoutText.textContent = text;
    adminShoutBanner.classList.remove('hidden');
    window.AudioController.playSFX('tspin');
    if (shoutHideTimer) clearTimeout(shoutHideTimer);
    shoutHideTimer = setTimeout(() => {
      adminShoutBanner.classList.add('hidden');
    }, 5500);
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
          if (msg.tournaments) cachedTournaments = msg.tournaments;
          break;

        case 'force_logout':
          forceLogoutToScreen(msg.reason || 'Disconnected by Moderation.');
          break;

        case 'admin_shout':
          displayAdminShout(msg.text);
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
          if (hub2v2QueueStatus) hub2v2QueueStatus.textContent = `In Queue: ${msg.queue2v2Count || 0} / 4`;
          hubFfaStatus.textContent = `In Lobby: ${msg.ffaPlayerCount || 0}`;
          if (msg.activeMatches) renderLiveSpectateMatches(msg.activeMatches);
          if (msg.leaderboards) cachedLeaderboards = msg.leaderboards;
          if (msg.allPlayers) cachedAllPlayers = msg.allPlayers;
          if (msg.tournaments) cachedTournaments = msg.tournaments;
          if (activeScreen === 'hub') {
            renderActivePlayersBar();
            renderLeaderboard();
            renderPlayersDirectory();
            renderTournamentsView();
            renderAdminConsole();
          }
          break;

        case 'chat':
          appendChatMessage(msg.sender, msg.text, msg.style);
          break;

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
          queue2v2WaitingBanner.classList.add('hidden');
          challengeToast.classList.add('hidden');
          enterArenaMode('duel', `1v1 BEST OF ${msg.bestOf || 3} • ${msg.p1.username} vs ${msg.p2.username}`, 4);
          arenaScoreStrip.textContent = `${msg.p1.username} (0) - (0) ${msg.p2.username} | ROUND 1`;
          tugOfWarWrap.classList.remove('hidden');
          break;

        case 'duel_round_countdown':
          arenaScoreStrip.textContent = `SCORE: ${msg.p1Score} - ${msg.p2Score} | ROUND ${msg.round} (BEST OF ${msg.bestOf || 3})`;
          if (currentMode === 'duel') {
            startCountdownWithDuration(msg.seed, 4, msg.countdownMs || 3000);
          }
          break;

        case 'team2v2_init':
          queueWaitingBanner.classList.add('hidden');
          queue2v2WaitingBanner.classList.add('hidden');
          enterArenaMode('team2v2', `2v2 TEAM BATTLE (YOU: TEAM ${msg.myTeam.toUpperCase()})`, 4);
          arenaScoreStrip.textContent = `ALPHA (${msg.alphaScore}) — (${msg.bravoScore}) BRAVO | ROUND 1`;
          tugOfWarWrap.classList.remove('hidden');
          break;

        case 'team2v2_round_countdown':
          arenaScoreStrip.textContent = `ALPHA (${msg.alphaScore}) — (${msg.bravoScore}) BRAVO | ROUND ${msg.round} (BO3)`;
          if (currentMode === 'team2v2') {
            startCountdownWithDuration(msg.seed, 4, msg.countdownMs || 3000);
          }
          break;

        case 'duel_round_result':
          canControlBoard = false;
          arenaScoreStrip.textContent = `SCORE: ${msg.p1Score} - ${msg.p2Score}`;
          if (currentMode === 'duel' || currentMode === 'team2v2') {
            if (msg.roundWinnerId === myId) {
              window.AudioController.playSFX('win');
              showOverlay(`ROUND ${msg.round} WON`, `Score: ${msg.p1Score} - ${msg.p2Score}`);
            } else {
              window.AudioController.playSFX('lose');
              showOverlay(`ROUND ${msg.round} OVER`, `${msg.roundWinnerName} won the round`);
            }
          }
          break;

        case 'ffa_waiting':
          if (currentMode === 'ffa') {
            canControlBoard = false;
            postMatchScreen.classList.add('hidden');
            playerPlayfieldWrapper.classList.remove('hidden');
            showOverlay('WAITING FOR PLAYERS', `In Lobby: ${msg.playerCount} / 2+ required`);
          }
          break;

        case 'ffa_temp_spectator':
          if (currentMode === 'ffa') {
            canControlBoard = false;
            playerPlayfieldWrapper.classList.add('hidden');
            multiOpponentsPanel.classList.remove('hidden');
            multiOppHeader.textContent = 'MATCH IN PROGRESS — YOU WILL AUTO-JOIN NEXT ROUND!';
            arenaScoreStrip.textContent = `SPECTATING UNTIL CURRENT FFA ROUND ENDS`;
          }
          break;

        case 'ffa_countdown_start':
          if (currentMode === 'ffa') {
            arenaScoreStrip.textContent = `${msg.playerCount} PLAYERS ALIVE`;
            multiOppHeader.textContent = 'FFA OPPONENTS (CLICK TO TARGET)';
            startCountdownWithDuration(msg.seed, 4, msg.countdownMs || 3000);
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
    if (currentMode !== 'duel' && currentMode !== 'team2v2' && currentMode !== 'ffa') return;
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
      pendingGarbage: m.pendingGarbage,
      apmHistory: myApmHistory
    }));
  }

  setInterval(() => {
    if (isAuthenticated && canControlBoard && (currentMode === 'duel' || currentMode === 'team2v2' || currentMode === 'ffa')) {
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
  // CUSTOM KEYBIND INPUT, 15s AFK TRACKER & 60FPS GAME LOOP
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

    lastInputTimestamp = performance.now();

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

    if (e.code === kb.restart && currentMode !== 'duel' && currentMode !== 'team2v2' && currentMode !== 'ffa' && currentMode !== 'spectate') {
      flushZenLines();
      if (currentMode === 'apm_test') apmTestRemainingMs = 60000;
      startCountdownWithDuration(Date.now(), currentCols, 3000);
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
  // 11-TIER SKIN, GHOST, MOTION TRAILS & PARTICLE SHATTER RENDERERS
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

    // Render Hard-Drop Motion Trails behind pieces
    if (Array.isArray(engine.hardDropTrails) && engine.hardDropTrails.length > 0) {
      engine.hardDropTrails = engine.hardDropTrails.filter(t => t.expiresAt > now);
      engine.hardDropTrails.forEach(t => {
        const life = Math.max(0, (t.expiresAt - now) / 180);
        const topPx = t.startY * cellSize;
        const heightPx = Math.max(cellSize, (t.endY - t.startY) * cellSize);
        const grad = boardCtx.createLinearGradient(0, topPx, 0, topPx + heightPx);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(1, t.color);
        boardCtx.save();
        boardCtx.globalAlpha = life * 0.42;
        boardCtx.fillStyle = grad;
        boardCtx.fillRect(t.x * cellSize + 3, topPx, cellSize - 6, heightPx);
        boardCtx.restore();
      });
    }

    // Locked blocks
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = engine.grid[r][c];
        if (cell) {
          drawStyledBlock(boardCtx, c, r, cellSize, getPieceColor(cell), 1.0, userPrefs.blockSkin);
        }
      }
    }

    // Lock Flash
    if (userPrefs.lockFlash && Array.isArray(engine.lockFlashCells) && engine.lockFlashCells.length > 0) {
      engine.lockFlashCells = engine.lockFlashCells.filter(f => f.expiresAt > now);
      boardCtx.save();
      boardCtx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      engine.lockFlashCells.forEach(f => {
        boardCtx.fillRect(f.x * cellSize + 1, f.y * cellSize + 1, cellSize - 2, cellSize - 2);
      });
      boardCtx.restore();
    }

    // Ghost & Active Piece
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

    // Render Line-Clear Shatter Particles
    if (Array.isArray(engine.clearParticles) && engine.clearParticles.length > 0) {
      boardCtx.save();
      engine.clearParticles.forEach(pt => {
        boardCtx.globalAlpha = Math.max(0, pt.alpha);
        boardCtx.fillStyle = pt.color;
        boardCtx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      });
      boardCtx.restore();
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

    if (currentMode === 'duel') {
      drawApmChartOnCanvas(liveApmCtx, liveApmCanvas.width, liveApmCanvas.height, [
        { label: 'YOU', color: '#00e5ff', data: myApmHistory },
        { label: 'OPP', color: '#ff3d57', data: opponentApmHistory }
      ]);
    } else if (currentMode === 'team2v2' || currentMode === 'ffa' || currentMode === 'apm_test') {
      drawApmChartOnCanvas(liveApmCtx, liveApmCanvas.width, liveApmCanvas.height, [
        { label: 'YOU', color: '#00e5ff', data: myApmHistory }
      ]);
    }
  }

  let lastFrameTime = performance.now();
  function gameLoop(now) {
    const dtMs = Math.min(100, now - lastFrameTime);
    lastFrameTime = now;

    if (activeScreen === 'arena') {
      updateBoardShakePhysics(dtMs);
      if (canControlBoard && !engine.gameOver) {
        if (now - lastInputTimestamp >= 15000) {
          canControlBoard = false;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'afk_timeout_kick' }));
          }
          navigateToHub();
          requestAnimationFrame(gameLoop);
          return;
        }

        updateInput(dtMs);
        engine.update(dtMs);

        apmSampleTimer += dtMs;
        if (apmSampleTimer >= 500) {
          apmSampleTimer = 0;
          const m = engine.getLiveMetrics();
          myApmHistory.push(m.apm);
          if (myApmHistory.length > 80) myApmHistory.shift();
        }

        if (currentMode === 'apm_test') {
          apmTestRemainingMs -= dtMs;
          arenaTimerDisplay.textContent = `${Math.max(0, apmTestRemainingMs / 1000).toFixed(1)}s`;
          if (apmTestRemainingMs <= 0) {
            finishApmTest();
          }
        }
      } else {
        engine.updateParticles(dtMs);
      }
      renderArena(now);
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
})();
