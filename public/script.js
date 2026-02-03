const COLS=4, ROWS=30, B_SIZE=30; 
const PIECES=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]]];
const COLORS=['#31C7EF','#F7D308','#FF69B4','#EF2029','#42B642','#9D00FF','#EF7921'];
const OFFSETS_JLSTZ = [[[0,0],[0,0],[0,0],[0,0],[0,0]],[[0,0],[1,0],[1,-1],[0,2],[1,2]],[[0,0],[0,0],[0,0],[0,0],[0,0]],[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]]];
const OFFSETS_I = [[[0,0],[-1,0],[2,0],[-1,0],[2,0]],[[0,-1],[0,-1],[0,-1],[0,1],[0,-2]],[[-1,0],[0,0],[0,0],[0,1],[0,-2]],[[0,1],[0,1],[0,1],[0,-1],[0,2]]];
const KEYS = { LEFT:'ArrowLeft', RIGHT:'ArrowRight', SOFT:'ArrowDown', HARD:'Space', ROTATE:'ArrowUp', HOLD:'ShiftLeft', HOLD2_A:'ControlLeft', HOLD2_B:'Tab' };

let socket=null, gameActive=false, inputLocked=false, isSpectator=false;
let gameMode='zen', startTime=0, apmTimer=null;
let statsCache = {}; 

function saveCreds() { localStorage.setItem('savedUser', document.getElementById('username').value); localStorage.setItem('savedPass', document.getElementById('password').value); }
function nav(id) { document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function logOut() { localStorage.removeItem('savedUser'); localStorage.removeItem('savedPass'); document.getElementById('chat-container').classList.add('hidden'); location.reload(); }
function toggleChat() { const c=document.getElementById('chat-container'); const b=document.getElementById('chat-open-btn'); if(c.classList.contains('hidden')){c.classList.remove('hidden');b.style.display='none';}else{c.classList.add('hidden');b.style.display='block';} }

function attemptLogin() {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    if(!u || !p) return alert("Enter credentials.");
    if(!socket) connect();
    socket.emit('login_attempt', { username: u, password: p });
}

function goHome() {
    gameActive = false; clearTimeout(apmTimer);
    if (socket) socket.emit('leave_lobby');
    document.getElementById('game-ui').classList.add('hidden');
    document.getElementById('home-btn').classList.add('hidden');
    document.getElementById('kill-feed').innerHTML = '';
    document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
    document.getElementById('menu-container').style.display = 'flex';
    setTheme('#00ffcc');
    nav('scr-main');
}

function openStats() { if(!socket) return alert("Login first."); socket.emit('request_all_stats'); nav('scr-stats'); }

function startZen() { 
    if(socket) socket.emit('leave_lobby'); 
    gameMode='zen'; setTheme('#a29bfe'); setupGameUI(); p1.initRNG(Math.random()*999); p1.reset(); gameActive=true; loop(); 
}

function startAPMTest() { 
    if(socket) socket.emit('leave_lobby'); 
    gameMode='apm_test'; setTheme('#ff5555'); 
    clearTimeout(apmTimer); setupGameUI(); p1.initRNG(Math.random()*999); p1.reset(); gameActive=true; loop();
    apmTimer = setTimeout(() => {
        gameActive=false; 
        document.getElementById('overlay-cnt').classList.remove('hidden'); 
        document.getElementById('cnt-txt').innerText = p1.elAPM.innerText + " APM";
        if(socket) socket.emit('submit_apm', p1.elAPM.innerText);
        setTimeout(goHome, 3000);
    }, 60000);
}

function joinFFA() { nav('scr-wait'); document.getElementById('wait-msg').innerText="JOINING FFA LOBBY..."; setTheme('#ff9900'); socket.emit('join_ffa'); }

function openPassive() { nav('scr-passive'); }
function joinMadness() { nav('scr-wait'); document.getElementById('wait-msg').innerText="JOINING MADNESS..."; socket.emit('join_madness'); } // Placeholder for v3.9.1 logic

function setupGameUI() {
    document.getElementById('menu-container').style.display='none';
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('home-btn').classList.remove('hidden');
    document.getElementById('hold-ind').style.display='none';
    document.getElementById('sniper-mag').style.display='none';
    document.getElementById('mag-label').style.display='none';
}

function setTheme(hex) {
    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    root.style.setProperty('--glow', `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty('--glow-strong', `rgba(${r}, ${g}, ${b}, 0.4)`);
}

function connect() {
    if(socket) return;
    socket = io();
    socket.on('login_response', d => { if(d.success) { nav('scr-main'); document.getElementById('disp-user').innerText=d.username.toUpperCase(); document.getElementById('disp-wins').innerText=d.wins; document.getElementById('disp-apm').innerText=d.bestAPM; document.getElementById('chat-container').classList.remove('hidden'); } else alert(d.msg); });
    socket.on('leaderboard_update', d => {
        const w = document.getElementById('lb-wins'); w.innerHTML='';
        d.wins.forEach((p,i)=> w.innerHTML+=`<div class="lb-item"><span class="rank-num">${i+1}.</span><span>${p.name}</span><span style="font-weight:bold;color:var(--accent);">${p.val} W</span></div>`);
    });
    socket.on('receive_all_stats', d => { statsCache=d; const l=document.getElementById('stats-list'); l.innerHTML=''; Object.keys(d).forEach(u=>{ const div=document.createElement('div'); div.className='player-item'; div.innerHTML=`<span>${u}</span>`; div.onclick=()=>{showStatDetails(u)}; l.appendChild(div); }); });
    
    // LOBBY FIX
    socket.on('lobby_update', d => {
        const msg = document.getElementById('wait-msg');
        if(msg) msg.innerText = `WAITING... (${d.count}/2 PLAYERS)`;
    });

    socket.on('start_countdown', d => { 
        if(gameMode==='zen'||gameMode==='apm_test')return; 
        setupGameUI(); document.getElementById('overlay-results').classList.add('hidden'); 
        const ov=document.getElementById('overlay-cnt'); ov.classList.remove('hidden'); 
        let n=d.duration; const t=document.getElementById('cnt-txt'); t.innerText=n; inputLocked=true; 
        const iv=setInterval(()=>{n--;if(n>0)t.innerText=n;else{clearInterval(iv);ov.classList.add('hidden');}},1000); 
    });
    
    socket.on('match_start', d => { 
        if(gameMode==='zen'||gameMode==='apm_test')return; 
        inputLocked=false; gameMode=d.mode; isSpectator=false; 
        setupOnlineGame(d.seed, d.players);
    });

    socket.on('receive_garbage', n => { 
        if(gameMode==='zen'||gameMode==='apm_test')return; 
        if(!isSpectator) p1.receiveGarbage(n); 
    });
    socket.on('enemy_board_update', d => { 
        if(gameMode==='zen'||gameMode==='apm_test')return; 
        drawEnemy(d.id, d.grid); 
    });
    socket.on('elimination', d => feed(`${d.username} eliminated by ${d.killer}!`));
    socket.on('request_win_stats', () => socket.emit('match_won', p1.getStats()));
    socket.on('match_summary', r => { 
        if(gameMode==='zen'||gameMode==='apm_test')return; 
        gameActive=false; const ov=document.getElementById('overlay-results'); const tb=document.getElementById('results-body'); tb.innerHTML=''; 
        r.forEach(res=>{tb.innerHTML+=`<tr><td class="${res.place===1?'rank-1':''}">${res.place}</td><td>${res.username}</td><td>${res.durationStr}</td><td>${res.apm}</td><td>${res.pps}</td><td>${res.sent}</td><td>${res.recv}</td></tr>`;}); 
        ov.classList.remove('hidden'); let t=5; const sp=document.getElementById('res-timer'); sp.innerText=t; const iv=setInterval(()=>{t--;sp.innerText=t;if(t<=0)clearInterval(iv);},1000); 
    });
    
    socket.on('lobby_reset', () => { 
        if(gameMode==='zen'||gameMode==='apm_test')return; 
        document.getElementById('overlay-results').classList.add('hidden'); 
        if(gameMode==='ffa') goHome(); 
    });
    socket.on('receive_chat', d => { const b=document.getElementById('chat-history'); b.innerHTML+=`<div class="chat-line"><span class="chat-user">${d.user}:</span> ${d.text}</div>`; b.scrollTop=b.scrollHeight; });
    socket.on('ffa_spectate', d => { 
        if(gameMode==='zen'||gameMode==='apm_test')return; 
        document.getElementById('wait-msg').innerText="SPECTATING..."; 
        setTimeout(()=>{isSpectator=true; gameMode='ffa'; setupGameUI(); setupOnlineGame(d.seed, d.players);},1000); 
    });
}

function showStatDetails(u) { const d=statsCache[u]; document.getElementById('stats-detail').innerHTML=`<div class="stat-user-title">${u}</div><div class="stat-row"><div class="stat-card"><div class="stat-card-label">WINS</div><div class="stat-card-val">${d.wins}</div></div><div class="stat-card"><div class="stat-card-label">BEST COMBO</div><div class="stat-card-val">${d.bestCombo||0}</div></div></div>`; }
function setupOnlineGame(s, p) { gameActive=true; p1.initRNG(s); p1.reset(); const g=document.getElementById('ffa-grid'); g.innerHTML=''; p.forEach(pl=>{ if(pl.id!==socket.id){ const d=document.createElement('div'); d.className='mini-card'; d.innerHTML=`<div style="font-size:10px;color:#888">${pl.username}</div><canvas id="cvs_${pl.id}" width="80" height="520"></canvas>`; g.appendChild(d); } }); document.getElementById('p1-root').style.opacity=isSpectator?'0.3':'1'; loop(); }
function drawEnemy(id, g) { const c=document.getElementById(`cvs_${id}`); if(!c)return; const ctx=c.getContext('2d'); ctx.fillStyle='#000'; ctx.fillRect(0,0,80,520); if(g) g.forEach((r,y)=>r.forEach((v,x)=>{if(v){ctx.fillStyle=v;ctx.fillRect(x*20,y*20,19,19);}})); }
function feed(m) { const f=document.getElementById('kill-feed'); const d=document.createElement('div'); d.className='feed-msg'; d.innerText=m; f.appendChild(d); setTimeout(()=>d.remove(),4000); }
function sendChat(e) { if(e.key==='Enter'){ const i=document.getElementById('chat-input'); if(i.value&&socket){socket.emit('send_chat',i.value);i.value='';} } }

window.onload = function() {
    if(localStorage.getItem('savedUser')) {
        document.getElementById('username').value = localStorage.getItem('savedUser');
        if(localStorage.getItem('savedPass')) document.getElementById('password').value = localStorage.getItem('savedPass');
        attemptLogin(); 
    }
};

class SeededRNG { constructor(s){this.s=s;} next(){this.s=(this.s*9301+49297)%233280;return this.s/233280;} }

class Player {
    constructor(){
        this.ctx=document.getElementById('cvs-b').getContext('2d');
        this.hCtx=document.getElementById('cvs-h').getContext('2d');
        this.nCtx=document.getElementById('cvs-n').getContext('2d');
        this.grid=Array.from({length:ROWS},()=>Array(COLS).fill(0));
        this.bag=[]; this.queue=[]; 
        this.holdId=null; this.canHold=true;
        this.pendingG=0; this.combo=-1; this.maxCombo=0; this.b2b=0; 
        this.dropCounter=0; this.lockTimer=0; this.dasTimer=0; this.arrTimer=0;
        this.piecesPlaced=0; this.linesSentTotal=0; this.linesRecvTotal=0;
        this.rng=new SeededRNG(1);
        this.startTime = Date.now();
    }
    getStats(){ const s=(Date.now()-this.startTime)/1000; return { apm:(s>0?Math.floor((this.linesSentTotal/s)*60):0), pps:(s>0?(this.piecesPlaced/s).toFixed(2):"0.00"), sent:this.linesSentTotal, recv:this.linesRecvTotal, maxCombo:this.maxCombo }; }
    initRNG(s){this.rng=new SeededRNG(s);}
    reset(){ this.grid.forEach(r=>r.fill(0)); this.bag=[]; this.queue=[]; this.piecesPlaced=0; this.linesSentTotal=0; this.linesRecvTotal=0; this.pendingG=0; this.startTime=Date.now(); this.holdId=null; this.canHold=true; this.maxCombo=0; this.drawSide(); for(let i=0;i<4;i++)this.queue.push(this.pull()); this.spawn(); }
    pull(){ if(!this.bag.length){this.bag=[0,1,2,3,4,5,6]; for(let i=6;i>0;i--){const j=Math.floor(this.rng.next()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}} return this.bag.pop(); }
    spawn(id=this.queue.shift()){ this.queue.push(this.pull()); this.active={pos:{x:0, y:-1}, matrix:PIECES[id], id:id, color:COLORS[id]}; this.lastMoveRotate=false; this.lockTimer=0; if(this.collide()){} this.drawSide(); this.sendBoard(); }
    collide(m=this.active.matrix, p=this.active.pos) { for(let y=0; y<m.length; y++) { for(let x=0; x<m[y].length; x++) { if(m[y][x]) { const gx=x+p.x; const gy=y+p.y; if (gx<0||gx>=COLS||gy>=ROWS||(gy>=0&&this.grid[gy][gx])) return true; }}} return false; }
    
    rotate(){
        const m=this.active.matrix[0].map((_,i)=>this.active.matrix.map(r=>r[i]).reverse());
        if(this.active.id===1)return; 
        if(!this.collide(m, this.active.pos)){ this.active.matrix=m; this.lastMoveRotate=true; if(this.isGrounded())this.lockTimer=0; this.sendBoard(); return; }
        if(!this.collide(m, {x:this.active.pos.x-1, y:this.active.pos.y})){ this.active.pos.x-=1; this.active.matrix=m; this.sendBoard(); return; }
        if(!this.collide(m, {x:this.active.pos.x+1, y:this.active.pos.y})){ this.active.pos.x+=1; this.active.matrix=m; this.sendBoard(); return; }
    }

    move(d){ this.active.pos.x+=d; if(this.collide())this.active.pos.x-=d; else { this.lastMoveRotate=false; if(this.isGrounded())this.lockTimer=0; this.sendBoard(); } }
    isGrounded(){ this.active.pos.y++; const h=this.collide(); this.active.pos.y--; return h; }
    hardDrop(){ while(!this.collide())this.active.pos.y++; this.active.pos.y--; this.lock(); }
    
    hold(slot=1){ 
        if(!this.canHold)return;
        const cur = this.active.id;
        if (slot===1) { 
            if(this.holdId===null){this.holdId=cur;this.spawn();}
            else{const t=this.holdId;this.holdId=cur;this.active.id=t;this.active.matrix=PIECES[t];this.active.color=COLORS[t];this.active.pos={x:0,y:-1};} 
        } 
        this.canHold=false; this.drawSide(); 
    }
    
    lock(){
        let dead=true; 
        this.active.matrix.forEach((r,y)=>r.forEach((v,x)=>{ if(v){ const gy=y+this.active.pos.y; if(gy>=0){this.grid[gy][x+this.active.pos.x]=this.active.color; if(gy>=4)dead=false;} } }));
        this.piecesPlaced++;
        if(dead){ if(gameMode!=='zen'&&gameMode!=='apm_test'&&socket){ socket.emit('player_died', this.getStats()); isSpectator=true; document.getElementById('p1-root').style.opacity='0.3'; return;} else { this.reset(); return; } }
        this.sweep(); this.canHold=true; this.spawn();
    }

    sweep(){
        let lines=0;
        for(let y=ROWS-1;y>=0;y--){ if(this.grid[y].every(v=>v!==0)){this.grid.splice(y,1);this.grid.unshift(Array(COLS).fill(0));lines++;y++;} }
        
        if(lines>0){
            this.combo++;
            if(this.combo > this.maxCombo) this.maxCombo = this.combo;
            let atk=0;
            if(lines==4) atk=4; else atk=lines-1;
            if(lines==4){ this.b2b++; if(this.b2b>1) atk+=1; } else this.b2b=0;
            if(this.combo>0) atk+=Math.floor((this.combo-1)/2); 

            if(atk > 0) showFloat(`+${atk}`);
            if(this.pendingG>0){ let c=Math.min(this.pendingG,atk); this.pendingG-=c; atk-=c; }
            this.linesSentTotal+=atk; 
            if(atk>0 && (gameMode === 'ffa')){ if(socket && !isSpectator) socket.emit('send_garbage', {mode:gameMode, amount:atk}); }
        } else {
            this.combo=-1;
            while(this.pendingG>0){ this.pendingG--; const r=Array(COLS).fill('#555'); r[Math.floor(Math.random()*COLS)]=0; this.grid.shift(); this.grid.push(r); }
        }
        document.getElementById('g-bar').style.height=(this.pendingG*30)+'px'; this.updateStats();
    }

    receiveGarbage(n){ this.pendingG=Math.min(this.pendingG+n, 10); this.linesRecvTotal+=n; document.getElementById('g-bar').style.height=(this.pendingG*30)+'px'; this.updateStats(); }
    updateStats(){ const s=(Date.now()-this.startTime)/1000; document.getElementById('s-sent').innerText=this.linesSentTotal; document.getElementById('s-recv').innerText=this.linesRecvTotal; document.getElementById('s-pps').innerText=(s>0?(this.piecesPlaced/s).toFixed(2):"0.00"); document.getElementById('s-apm').innerText=(s>0?Math.floor((this.linesSentTotal/s)*60):0); let ds=s; if(gameMode==='apm_test') ds=60-s; if(ds<0)ds=0; document.getElementById('s-time').innerText=`${Math.floor(ds/60).toString().padStart(2,'0')}:${Math.floor(ds%60).toString().padStart(2,'0')}`; }
    
    drawSide(){ 
        [this.hCtx, this.nCtx].forEach(c=>{c.clearRect(0,0,150,400); c.fillStyle='#000';c.fillRect(0,0,150,400);});
        if(this.holdId!==null){
            this.hCtx.fillStyle=COLORS[this.holdId]; const p=PIECES[this.holdId];
            p.forEach((r,y)=>r.forEach((v,x)=>{if(v)this.hCtx.fillRect(40+x*20, 20+y*20, 19,19);}));
        }
        this.queue.slice(0,3).forEach((id,i)=>{
            this.nCtx.fillStyle=COLORS[id]; const p=PIECES[id];
            p.forEach((r,y)=>r.forEach((v,x)=>{if(v)this.nCtx.fillRect(40+x*20, 20+i*80+y*20, 19,19);}));
        });
    }

    sendBoard(){ if(socket&&!isSpectator){const d=JSON.parse(JSON.stringify(this.grid));this.active.matrix.forEach((r,y)=>r.forEach((v,x)=>{if(v&&d[y+this.active.pos.y])d[y+this.active.pos.y][x+this.active.pos.x]=this.active.color;}));socket.emit('update_board',d);} }
    
    update(dt){
        let speed=700;
        if(gameMode==='ffa'){ const p=(Date.now()-this.startTime)/1000; speed=Math.max(100, 700-(Math.floor(p/30)*70)); }
        this.dropCounter+=dt; if(this.dropCounter>speed){this.active.pos.y++; if(this.collide())this.active.pos.y--; else{this.lockTimer=0;this.lastMoveRotate=false;} this.dropCounter=0;}
        if(this.isGrounded()){this.lockTimer+=dt;if(this.lockTimer>500)this.lock();}
        this.sendBoard();
    }
    draw(){
        this.ctx.fillStyle='#000'; this.ctx.fillRect(0,0,120,900);
        this.ctx.fillStyle='rgba(255,0,0,0.2)'; this.ctx.fillRect(0,0,120,120);
        this.ctx.strokeStyle='rgba(255,255,255,0.1)';this.ctx.lineWidth=1;this.ctx.beginPath();for(let x=1;x<COLS;x++){this.ctx.moveTo(x*B_SIZE,4*B_SIZE);this.ctx.lineTo(x*B_SIZE,ROWS*B_SIZE);}for(let y=4;y<ROWS;y++){this.ctx.moveTo(0,y*B_SIZE);this.ctx.lineTo(COLS*B_SIZE,y*B_SIZE);}this.ctx.stroke();
        
        this.grid.forEach((r,y)=>r.forEach((v,x)=>{if(v){this.ctx.fillStyle=v;this.ctx.fillRect(x*B_SIZE,y*B_SIZE,B_SIZE-1,B_SIZE-1);}}));
        if(this.active&&!isSpectator){
            let g={...this.active.pos}; while(!this.collide(this.active.matrix,g))g.y++; g.y--;
            this.ctx.fillStyle='rgba(255,255,255,0.15)'; this.active.matrix.forEach((r,y)=>r.forEach((v,x)=>{if(v)this.ctx.fillRect((g.x+x)*B_SIZE,(g.y+y)*B_SIZE,B_SIZE-1,B_SIZE-1);}));
            this.ctx.fillStyle=this.active.color; this.active.matrix.forEach((r,y)=>r.forEach((v,x)=>{if(v)this.ctx.fillRect((this.active.pos.x+x)*B_SIZE,(this.active.pos.y+y)*B_SIZE,B_SIZE-1,B_SIZE-1);}));
        }
    }
}

function showFloat(msg) {
    const el = document.getElementById('pop-action');
    el.innerText = msg;
    el.style.opacity = 1;
    setTimeout(()=>el.style.opacity=0, 1000);
}

const p1 = new Player();
const keys = new Set();
const ctrl = {left:'ArrowLeft',right:'ArrowRight',rotate:'ArrowUp',soft:'ArrowDown',hard:'Space',hold:'ShiftLeft'};

window.addEventListener('keydown', e=>{
    if(gameMode === 'zen' || gameMode === 'apm_test') { if(document.activeElement.tagName !== 'INPUT' && e.code === 'KeyR') { if(gameMode === 'zen') startZen(); if(gameMode === 'apm_test') startAPMTest(); return; } }
    if(!inputLocked && gameActive && !isSpectator){
        if(["Space","ArrowUp","ArrowDown"].includes(e.code)) e.preventDefault();
        if(!keys.has(e.code)){
            keys.add(e.code);
            if(e.code==ctrl.rotate)p1.rotate();
            if(e.code==ctrl.hold)p1.hold(1);
            if(e.code==ctrl.hard)p1.hardDrop();
            if(e.code==ctrl.left || e.code==ctrl.right){ p1.dasTimer=0; p1.arrTimer=0; p1.move(e.code==ctrl.left?-1:1); }
        }
    }
});
window.addEventListener('keyup', e=>keys.delete(e.code));

let lastT=0;
function loop(t=0){
    const dt=t-lastT; lastT=t;
    if(gameActive) {
        if(!isSpectator && !inputLocked){
            if(keys.has(ctrl.soft)){ p1.active.pos.y++; if(p1.collide())p1.active.pos.y--; else { p1.lastMoveRotate=false; p1.lockTimer=0; } }
            if(keys.has(ctrl.left)||keys.has(ctrl.right)){
                const d=keys.has(ctrl.left)?-1:1;
                p1.dasTimer+=dt;
                if(p1.dasTimer>130){ p1.arrTimer+=dt; if(p1.arrTimer>0){ p1.move(d); p1.arrTimer=0; } }
            }
            p1.update(dt);
            p1.updateStats();
        }
        p1.draw();
    }
    requestAnimationFrame(loop);
}
</script>
