/* script.js
   Safe, client-only simulation of abstract "malware" behaviors.
   - No networking, no file access, purely visual agents on canvas.
   - Modes: virus (contact), worm (self-replicate), trojan (disguised), mixed.
*/

(() => {
  // Helpers
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => Math.random() * (b - a) + a;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // UI refs
  const canvas = $('simCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const modeSel = $('mode');
  const startBtn = $('startBtn');
  const pauseBtn = $('pauseBtn');
  const resetBtn = $('resetBtn');
  const seedBtn = $('seedBtn');
  const agentCount = $('agentCount');
  const agentCountOut = $('agentCountOut');
  const infectivity = $('infectivity');
  const infectivityOut = $('infectivityOut');
  const replicate = $('replicate');
  const replicateOut = $('replicateOut');
  const recovery = $('recovery');
  const recoveryOut = $('recoveryOut');

  const stats = {
    tick: $('tick'),
    total: $('total'),
    healthy: $('healthy'),
    infected: $('infected'),
    recovered: $('recovered'),
  };

  // State
  let W=0,H=0, agents = [], running=false, tick=0, animationId=null;

  // Resize canvas to device pixels
  function resize(){
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Agent states: healthy, infected, recovered
  class Agent {
    constructor(id){
      this.id = id;
      this.x = rand(20, W-20);
      this.y = rand(20, H-20);
      this.vx = rand(-0.6,0.6);
      this.vy = rand(-0.6,0.6);
      this.r = rand(4,7);
      this.state = 'healthy';
      this.infectedTick = 0;
      // trojan disguise flag
      this.isTrojan = false;
      // worm replication cooldown timer
      this.repCool = 0;
      // visual wobble seed
      this.w = Math.random()*1000;
    }

    step(dt){
      // movement with bounce
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if(this.x < 10 || this.x > W-10) this.vx *= -1;
      if(this.y < 10 || this.y > H-10) this.vy *= -1;

      // cool down
      if(this.repCool > 0) this.repCool -= dt*0.01;

      // If infected, maybe recover
      if(this.state === 'infected'){
        const recR = parseFloat(recovery.value);
        // probabilistic recovery per tick
        if(Math.random() < recR * 0.01) {
          this.state = 'recovered';
          this.infectedTick = 0;
          this.isTrojan = false;
        } else {
          this.infectedTick++;
        }
      }
    }

    draw(ctx){
      // subtle pulsing based on state
      const t = Date.now()/1000 + this.w;
      let baseR = this.r + Math.sin(t*3)*0.6;

      if(this.state === 'healthy'){
        ctx.fillStyle = 'rgba(96,165,250,0.9)';
        drawDot(this.x,this.y,baseR);
      } else if (this.state === 'infected'){
        ctx.fillStyle = 'rgba(251,113,133,0.96)';
        drawGlowing(this.x,this.y,baseR);
      } else if (this.state === 'recovered'){
        ctx.fillStyle = 'rgba(52,211,153,0.95)';
        drawDot(this.x,this.y,baseR);
      }

      // trojan disguised: shows as healthy but has a faint halo when hovered (tooltip handled in UI)
      if(this.isTrojan && this.state === 'infected'){
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(251,191,36,0.18)';
        ctx.lineWidth = 2;
        ctx.arc(this.x,this.y,baseR+5,0,Math.PI*2);
        ctx.stroke();
      }
    }
  }

  function drawDot(x,y,r){
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }

  function drawGlowing(x,y,r){
    // glow
    const g = ctx.createRadialGradient(x,y,r*0.3,x,y,r*4);
    g.addColorStop(0,'rgba(251,113,133,0.35)');
    g.addColorStop(1,'rgba(251,113,133,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x,y,r*4,0,Math.PI*2); ctx.fill();
    // core
    ctx.fillStyle = 'rgba(251,113,133,0.98)';
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }

  // initialize agents
  function initAgents(n=120){
    agents = [];
    for(let i=0;i<n;i++){
      agents.push(new Agent(i));
    }
    tick = 0;
    updateStats();
    renderOnce();
  }

  // seed: infect random agents
  function seed(count=3){
    for(let i=0;i<count;i++){
      const a = agents[Math.floor(Math.random()*agents.length)];
      if(!a) continue;
      a.state = 'infected';
      a.infectedTick = 0;
      // some trojans get disguised
      if(modeSel.value === 'trojan' || (modeSel.value==='mixed' && Math.random()<0.33)){
        a.isTrojan = true;
      }
    }
    updateStats();
  }

  // Simulation logic per tick
  function stepSimulation(){
    tick++;
    const mode = modeSel.value;
    const infectR = parseFloat(infectivity.value);
    const repR = parseFloat(replicate.value);

    // agent-to-agent interactions
    for(let i=0;i<agents.length;i++){
      const A = agents[i];
      A.step(1);
      // Worm replication: infected agents may produce new infected agents (clone) if conditions met
      if((mode==='worm' || mode==='mixed') && A.state==='infected'){
        if(Math.random() < repR * 0.002 && A.repCool <= 0 && agents.length < 600){
          // replicate: create a small new agent nearby in infected state
          const baby = new Agent(agents.length + Math.random());
          baby.x = A.x + rand(-12,12);
          baby.y = A.y + rand(-12,12);
          baby.state = 'infected';
          baby.infectedTick = 0;
          baby.vx = A.vx + rand(-0.3,0.3);
          baby.vy = A.vy + rand(-0.3,0.3);
          agents.push(baby);
          A.repCool = 50 + Math.random()*50;
        }
      }

      // pairwise interactions for contact spread (virus style)
      for(let j=i+1;j<agents.length;j++){
        const B = agents[j];
        const d = dist(A,B);
        const contact = d < 14; // touching threshold
        if(contact){
          // relative velocity bump to spread out
          const push = 0.2;
          const ax = (A.x - B.x) * 0.003;
          const ay = (A.y - B.y) * 0.003;
          A.vx += ax * push; A.vy += ay * push;
          B.vx -= ax * push; B.vy -= ay * push;

          // infection rules:
          // virus: requires contact AND infected->healthy with probability infectivity
          if((mode==='virus' || mode==='mixed') ){
            if(A.state==='infected' && B.state==='healthy'){
              if(Math.random() < infectR){ B.state = 'infected'; B.infectedTick=0; }
            } else if(B.state==='infected' && A.state==='healthy'){
              if(Math.random() < infectR){ A.state = 'infected'; A.infectedTick=0; }
            }
          }
          // trojan: doesn't spread by contact as much; it hides in healthy-looking agents (we'll implement disguise seeding)
        }
      }

      // Trojan behavior: disguise healthy agents by converting them visually, but
      // Trojan spreads by social engineering: simulate as probabilistic "stealth jump" where infected trojan can infect distant target
      if((mode==='trojan' || mode==='mixed') && A.state==='infected' && A.isTrojan){
        if(Math.random() < infectR * 0.0015){
          // choose a random target far away
          const target = agents[Math.floor(Math.random()*agents.length)];
          if(target && target.state === 'healthy'){
            target.state = 'infected';
            target.infectedTick = 0;
            // mark some trojans disguised
            if(Math.random() < 0.5) target.isTrojan = true;
          }
        }
      }
    } // end pairwise

    // natural recovery: handled per agent in step()
    updateStats();
  }

  function updateStats(){
    const total = agents.length;
    const healthy = agents.filter(a=>a.state==='healthy').length;
    const infected = agents.filter(a=>a.state==='infected').length;
    const recovered = agents.filter(a=>a.state==='recovered').length;
    stats.tick.textContent = tick;
    stats.total.textContent = total;
    stats.healthy.textContent = healthy;
    stats.infected.textContent = infected;
    stats.recovered.textContent = recovered;
  }

  function renderOnce(){
    // clear
    ctx.fillStyle = '#071126';
    ctx.fillRect(0,0,W,H);
    // subtle grid
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha = 1;

    // draw connections lightly to show interactions
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.beginPath();
    for(let i=0;i<agents.length;i++){
      for(let j=i+1;j<i+6 && j<agents.length;j++){
        const d = dist(agents[i], agents[j]);
        if(d < 80){
          ctx.moveTo(agents[i].x, agents[i].y);
          ctx.lineTo(agents[j].x, agents[j].y);
        }
      }
    }
    ctx.stroke();

    for(const a of agents){ a.draw(ctx) }
  }

  // animation loop
  function loop(){
    stepSimulation();
    renderOnce();
    animationId = requestAnimationFrame(loop);
  }

  // UI wiring
  startBtn.addEventListener('click', ()=>{
    if(!running){
      running = true;
      startBtn.textContent = 'Running';
      animationId = requestAnimationFrame(loop);
    }
  });
  pauseBtn.addEventListener('click', ()=>{
    if(running){
      running = false;
      startBtn.textContent = 'Start';
      cancelAnimationFrame(animationId);
    } else {
      running = true;
      animationId = requestAnimationFrame(loop);
      startBtn.textContent = 'Running';
    }
  });
  resetBtn.addEventListener('click', ()=>{
    running = false;
    cancelAnimationFrame(animationId);
    initAgents(parseInt(agentCount.value,10));
    startBtn.textContent = 'Start';
  });
  seedBtn.addEventListener('click', ()=> seed(2 + Math.floor(Math.random()*4)));

  // sliders reflect values
  const bindOut = (el,out) => {
    out.textContent = el.value;
    el.addEventListener('input', ()=> out.textContent = el.value);
  }
  bindOut(agentCount, agentCountOut);
  bindOut(infectivity, infectivityOut);
  bindOut(replicate, replicateOut);
  bindOut(recovery, recoveryOut);

  // When agent count changes, gently reset
  agentCount.addEventListener('change', ()=> initAgents(parseInt(agentCount.value,10)));
  modeSel.addEventListener('change', ()=>{
    // if trojan mode, seed trojans disguised at reset
    for(const a of agents){
      a.isTrojan = false;
    }
  });

  // initial
  initAgents(parseInt(agentCount.value,10));
  // default seed
  seed(3);

  // small interactive tooltip: show agent details when hovered
  canvas.addEventListener('mousemove', (ev)=>{
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width) / (window.devicePixelRatio || 1);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height) / (window.devicePixelRatio || 1);

    // find nearest
    let nearest = null; let minD = 1e9;
    for(const a of agents){
      const dx = a.x - x, dy = a.y - y;
      const d = Math.hypot(dx,dy);
      if(d < minD){ minD = d; nearest = a; }
    }
    // show simple tooltip via title (quick hack)
    if(nearest && minD < 12){
      canvas.title = `Agent ${nearest.id} — ${nearest.state}${nearest.isTrojan ? ' (trojan disguised)' : ''}`;
    } else {
      canvas.title = '';
    }
  });

  // safety note in console
  console.log('Pythium simulator loaded: purely visual. No network or file operations.');
})();
