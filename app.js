const API = (path) => `api/${path}`;
const AUTH = (path) => `auth/${path}`;

/* ========= Helpers ========= */
function table(rows, keys, labels){
  const thead = `<thead><tr>${labels.map(l=>`<th>${l}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${(r[k]??'')}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table class="tbl">${thead}${tbody}</table>`;
}
function needLogin(){
  document.getElementById('view').innerHTML = `<h1>Login necessário</h1><p>Use o formulário à esquerda (ou registre um novo usuário).</p>`;
}
async function getJSON(url, opts={}){
  const r = await fetch(url, { credentials:'include', ...opts });
  if (r.status === 401) return { __auth:false };
  const data = await r.json().catch(()=>({}));
  return data;
}

function formatBRL(value){
  const num = Number.isFinite(value) ? value : Number(value) || 0;
  return num.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}
function formatBTC(value){
  const num = Number.isFinite(value) ? value : Number(value) || 0;
  return num.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:8 });
}
function formatNumber(value, digits=2){
  const num = Number.isFinite(value) ? value : Number(value) || 0;
  return num.toLocaleString('pt-BR', { minimumFractionDigits:digits, maximumFractionDigits:digits });
}
function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, s=>({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[s]);
}

/* ========= Liquidity Game ========= */
let liquidityGame = null;

function createLiquidityGame(teamCount){
  const total = Math.min(Math.max(parseInt(teamCount,10) || 0, 2), 12);
  const teams = Array.from({length: total}).map((_, idx)=>({
    id: idx + 1,
    name: `Time ${String.fromCharCode(65 + (idx % 26))}${idx>=26 ? '-' + (Math.floor(idx/26)+1):''}`,
    cash: 1600,
    btc: 0,
    nftHand: 1,
    poolShares: 0,
    eliminated: false
  }));
  return {
    round: 1,
    turnIndex: 0,
    awaitingRoundEnd: false,
    teams,
    pool: { nfts:0, shares:0 },
    history: [],
    stage: 'regular',
    championId: null
  };
}

const LIQUIDITY_STAGE_LABELS = {
  regular: 'Fase classificatória',
  semifinal: 'Semifinal',
  final: 'Final',
  finished: 'Jogo encerrado'
};

function activeLiquidityTeams(state){
  return state.teams.filter(t=>!t.eliminated);
}

function nextActiveLiquidityIndex(state, fromIndex){
  for (let i = fromIndex + 1; i < state.teams.length; i += 1){
    if (!state.teams[i].eliminated) return i;
  }
  return -1;
}

function firstActiveLiquidityIndex(state){
  return nextActiveLiquidityIndex(state, -1);
}

function viewLiquidityGame(){
  const view = document.getElementById('view');
  const teamCount = liquidityGame ? liquidityGame.teams.length : 4;
  const html = `
    <div class="section game-setup">
      <h1>Jogo Piscina de Liquidez</h1>
      <p>Gerencie as rodadas, ações disponíveis, a semifinal (times com NFT em mãos) e a final para definir quem lidera em reais nesse jogo com NFTs, Bitcoin e cotas da piscina de liquidez.</p>
      <div class="actions">
        <label for="teamCount">Quantidade de times</label>
        <input type="number" id="teamCount" value="${teamCount}" min="2" max="12" style="max-width:120px" />
        <button id="startGameBtn">${liquidityGame ? 'Reiniciar jogo' : 'Iniciar jogo'}</button>
      </div>
      <p class="hint">Cada time inicia com R$1.600, 1 NFT em mãos e 0 BTC. Ajuste os nomes dos times no quadro abaixo quando o jogo começar.</p>
    </div>
    <div id="gameArea"></div>`;
  view.innerHTML = html;
  document.getElementById('startGameBtn').addEventListener('click', ()=>{
    const qty = document.getElementById('teamCount').value;
    liquidityGame = createLiquidityGame(qty);
    renderLiquidityGameArea();
  });
  renderLiquidityGameArea();
}

function renderLiquidityGameArea(){
  const container = document.getElementById('gameArea');
  if (!container) return;
  if (!liquidityGame){
    container.innerHTML = `<p class="hint">Configure o número de times e clique em <strong>Iniciar jogo</strong> para começar a acompanhar as rodadas.</p>`;
    return;
  }
  const state = liquidityGame;
  const active = activeLiquidityTeams(state);
  const stageLabel = LIQUIDITY_STAGE_LABELS[state.stage] || state.stage;
  const team = (!state.awaitingRoundEnd && state.stage!=='finished') ? state.teams[state.turnIndex] : null;
  const dividendTotal = state.pool.nfts * 2000 * 0.10;
  const perShare = state.pool.shares ? dividendTotal / state.pool.shares : 0;
  const semifinalReady = state.teams.filter(t=>!t.eliminated && t.nftHand>0);
  const leaderCash = active.slice().sort((a,b)=>b.cash - a.cash);

  const rows = state.teams.map(t=>{
    const classes = [];
    const semifinalClass = t.eliminated ? 'eliminated' : (t.nftHand>0 ? 'ready-semifinal' : 'awaiting-semifinal');
    classes.push(semifinalClass);
    if (state.championId === t.id) classes.push('champion');
    const semifinalTxt = t.eliminated ? 'Eliminado' : (t.nftHand>0 ? 'Sim' : 'Não');
    return `
      <tr class="${classes.join(' ')}">
        <td>${t.id}</td>
        <td>
          <span class="team-name">${esc(t.name)}</span>
          <button class="btn-inline ghost rename-btn" data-team="${t.id}">Renomear</button>
        </td>
        <td class="numeric">${formatBRL(t.cash)}</td>
        <td class="numeric">${formatBTC(t.btc)}</td>
        <td class="numeric">${t.nftHand}</td>
        <td class="numeric">${t.poolShares}</td>
        <td><span class="flag">${semifinalTxt}</span></td>
      </tr>`;
  }).join('');

  const historyItems = state.history.map(h=>{
    const when = h.timestamp ? h.timestamp.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '';
    const who = h.team ? `<strong>${esc(h.team)}</strong> — ` : '';
    return `<li><time>Rodada ${h.round}${when ? ` • ${when}` : ''}</time>${who}${esc(h.message)}</li>`;
  }).join('');

  const leaderTxt = leaderCash.length ? `${leaderCash[0].name} (${formatBRL(leaderCash[0].cash)})` : '—';
  const activeCount = active.length;
  const stageButtons = [];
  if (state.stage === 'regular') stageButtons.push('<button id="startSemifinalBtn">Iniciar semifinal</button>');
  if (state.stage === 'semifinal') stageButtons.push('<button id="startFinalBtn">Iniciar final</button>');
  if (state.stage === 'final') stageButtons.push('<button id="finishGameBtn">Encerrar jogo e definir campeão</button>');
  const stageControls = stageButtons.length ? `
    <div class="stage-controls">
      <h3>Etapas do torneio</h3>
      <div class="action-buttons">${stageButtons.join('')}</div>
    </div>` : '';

  container.innerHTML = `
    <div class="game-summary">
      <div class="summary-card">
        <h4>Rodada atual</h4>
        <p>${state.round}</p>
      </div>
      <div class="summary-card">
        <h4>Fase atual</h4>
        <p>${esc(stageLabel)}</p>
      </div>
      <div class="summary-card">
        <h4>NFTs na piscina</h4>
        <p>${state.pool.nfts} NFT(s)</p>
      </div>
      <div class="summary-card">
        <h4>Cotas em circulação</h4>
        <p>${state.pool.shares}</p>
      </div>
      <div class="summary-card">
        <h4>Dividendo projetado</h4>
        <p>${state.pool.shares ? `${formatBRL(dividendTotal)} (${formatBRL(perShare)} / cota)` : 'Sem cotas ativas'}</p>
      </div>
      <div class="summary-card">
        <h4>Aptos à semifinal</h4>
        <p>${semifinalReady.length}/${state.teams.length}</p>
      </div>
      <div class="summary-card">
        <h4>Times ativos</h4>
        <p>${activeCount}</p>
      </div>
      <div class="summary-card">
        <h4>Liderança em R$</h4>
        <p>${esc(leaderTxt)}</p>
      </div>
    </div>
    <section class="section">
      <h2>Placar dos times</h2>
      <table class="tbl game-table">
        <thead>
          <tr>
            <th>#</th><th>Time</th><th>Caixa (R$)</th><th>Bitcoin (BTC)</th><th>NFTs em mãos</th><th>Cotas</th><th>Semifinal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    <section class="section game-actions">
      <h2>Ações da rodada</h2>
      ${state.stage==='finished' ? `
        <p>O jogo foi encerrado. Reinicie a partida para jogar novamente.</p>
      ` : state.awaitingRoundEnd ? `
        <p>Todos os times ativos já realizaram uma ação nesta rodada.</p>
        <p>Finalize para cobrar a taxa de R$100 e distribuir 10% do valor das NFTs da piscina entre as cotas.</p>
        <div class="action-buttons">
          <button id="endRoundBtn">Encerrar rodada ${state.round}</button>
        </div>
      ` : team ? `
        <p>Vez do <strong>${esc(team.name)}</strong>. Escolha uma ação:</p>
        <div class="action-buttons">
          <button data-act="deposit">Depositar NFT na piscina</button>
          <button data-act="withdraw">Retirar NFT da piscina</button>
          <button data-act="buy_btc">Comprar Bitcoin</button>
          <button data-act="sell_btc">Vender Bitcoin</button>
          <button data-act="sell_nft">Vender NFT em mãos</button>
          <button data-act="sell_share">Vender cota</button>
          <button data-act="pass">Passar a vez</button>
        </div>
      ` : '<p>Nenhum time ativo disponível para jogar.</p>'}
      ${stageControls}
    </section>
    <section class="section">
      <h2>Histórico</h2>
      ${state.history.length ? `<ol class="game-history">${historyItems}</ol>` : '<p class="hint">As ações aparecem aqui conforme o jogo avança.</p>'}
    </section>`;

  container.querySelectorAll('.rename-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = parseInt(btn.dataset.team,10);
      renameLiquidityTeam(id);
    });
  });
  container.querySelectorAll('.action-buttons button[data-act]').forEach(btn=>{
    btn.addEventListener('click', ()=>handleLiquidityAction(btn.dataset.act));
  });
  const endBtn = container.querySelector('#endRoundBtn');
  if (endBtn) endBtn.addEventListener('click', endLiquidityRound);
  const semifinalBtn = container.querySelector('#startSemifinalBtn');
  if (semifinalBtn) semifinalBtn.addEventListener('click', startLiquiditySemifinal);
  const finalBtn = container.querySelector('#startFinalBtn');
  if (finalBtn) finalBtn.addEventListener('click', startLiquidityFinal);
  const finishBtn = container.querySelector('#finishGameBtn');
  if (finishBtn) finishBtn.addEventListener('click', finishLiquidityGame);
}

function renameLiquidityTeam(teamId){
  if (!liquidityGame) return;
  const team = liquidityGame.teams.find(t=>t.id===teamId);
  if (!team) return;
  const newName = prompt('Novo nome do time:', team.name);
  if (newName && newName.trim()){
    team.name = newName.trim();
    renderLiquidityGameArea();
  }
}

function addLiquidityHistory(team, message){
  if (!liquidityGame) return;
  liquidityGame.history.unshift({
    round: liquidityGame.round,
    team: team ? team.name : null,
    message,
    timestamp: new Date()
  });
  if (liquidityGame.history.length > 200){
    liquidityGame.history.length = 200;
  }
}

function handleLiquidityAction(action){
  if (!liquidityGame || liquidityGame.awaitingRoundEnd || liquidityGame.stage==='finished') return;
  const team = liquidityGame.teams[liquidityGame.turnIndex];
  if (!team || team.eliminated) return;
  if (action==='deposit') return liquidityDeposit(team);
  if (action==='withdraw') return liquidityWithdraw(team);
  if (action==='buy_btc') return liquidityBuyBTC(team);
  if (action==='sell_btc') return liquiditySellBTC(team);
  if (action==='sell_nft') return liquiditySellNFT(team);
  if (action==='sell_share') return liquiditySellShare(team);
  if (action==='pass') return liquidityPass(team);
}

function liquidityDeposit(team){
  if (team.nftHand <= 0){ alert('Este time não possui NFT em mãos para depositar.'); return; }
  team.nftHand -= 1;
  team.btc += 10;
  team.poolShares += 1;
  liquidityGame.pool.nfts += 1;
  liquidityGame.pool.shares += 1;
  addLiquidityHistory(team, 'Depositou uma NFT na piscina (+10 BTC e +1 cota).');
  advanceLiquidityTurn();
}

function liquidityWithdraw(team){
  if (team.poolShares <= 0){ alert('Este time não possui cotas para resgatar uma NFT.'); return; }
  if (liquidityGame.pool.nfts <= 0){ alert('Não há NFTs disponíveis na piscina.'); return; }
  const pay = prompt('Forma de pagamento (BTC ou BRL)?', 'BTC');
  if (!pay) return;
  const mode = pay.trim().toUpperCase();
  let paymentText = '';
  if (mode === 'BTC'){
    if (team.btc + 1e-9 < 11){ alert('BTC insuficiente para pagar 11 BTC.'); return; }
    team.btc -= 11;
    paymentText = `${formatBTC(11)} BTC`;
  } else if (mode === 'BRL' || mode === 'R$' || mode === 'DINHEIRO'){
    if (team.cash + 1e-9 < 2000){ alert('Saldo insuficiente em reais para pagar R$2.000.'); return; }
    team.cash -= 2000;
    paymentText = formatBRL(2000);
  } else {
    alert('Informe BTC ou BRL.');
    return;
  }
  team.nftHand += 1;
  team.poolShares -= 1;
  liquidityGame.pool.nfts -= 1;
  liquidityGame.pool.shares -= 1;
  addLiquidityHistory(team, `Resgatou uma NFT da piscina pagando ${paymentText}.`);
  advanceLiquidityTurn();
}

function liquidityBuyBTC(team){
  const qty = parseFloat(prompt('Quantidade de BTC a comprar:', '1'));
  if (!(qty > 0)) return;
  const price = parseFloat(prompt('Preço por BTC (R$):', '100000'));
  if (!(price >= 0)) return;
  const total = qty * price;
  if (team.cash + 1e-6 < total){ alert('Saldo insuficiente para esta compra.'); return; }
  team.cash -= total;
  team.btc += qty;
  addLiquidityHistory(team, `Comprou ${formatBTC(qty)} BTC por ${formatBRL(total)} (R$ ${formatNumber(price)} / BTC).`);
  advanceLiquidityTurn();
}

function liquiditySellBTC(team){
  const qty = parseFloat(prompt('Quantidade de BTC a vender:', '1'));
  if (!(qty > 0)) return;
  if (team.btc + 1e-6 < qty){ alert('Este time não possui essa quantidade de BTC.'); return; }
  const price = parseFloat(prompt('Preço por BTC (R$):', '100000'));
  if (!(price >= 0)) return;
  const total = qty * price;
  team.btc -= qty;
  team.cash += total;
  addLiquidityHistory(team, `Vendeu ${formatBTC(qty)} BTC por ${formatBRL(total)} (R$ ${formatNumber(price)} / BTC).`);
  advanceLiquidityTurn();
}

function liquiditySellNFT(team){
  if (team.nftHand <= 0){ alert('Este time não possui NFT disponível para venda.'); return; }
  const price = parseFloat(prompt('Preço de venda da NFT (R$):', '2000'));
  if (!(price > 0)) return;
  const buyerId = prompt('Número do time comprador (veja a coluna # na tabela):', '');
  if (!buyerId) return;
  const idx = parseInt(buyerId,10) - 1;
  const buyer = liquidityGame.teams[idx];
  if (!buyer){ alert('Time comprador inválido.'); return; }
  if (buyer === team){ alert('Não é possível vender para o próprio time.'); return; }
  if (buyer.eliminated){ alert('O comprador informado já foi eliminado do jogo.'); return; }
  if (buyer.cash + 1e-6 < price){ alert('O comprador não possui caixa suficiente.'); return; }
  buyer.cash -= price;
  buyer.nftHand = (buyer.nftHand || 0) + 1;
  team.cash += price;
  team.nftHand -= 1;
  addLiquidityHistory(team, `Vendeu uma NFT para ${buyer.name} por ${formatBRL(price)}.`);
  advanceLiquidityTurn();
}

function liquiditySellShare(team){
  if (team.poolShares <= 0){ alert('Este time não possui cotas para vender.'); return; }
  const qty = parseInt(prompt('Quantidade de cotas a vender:', '1'),10);
  if (!(qty > 0) || qty > team.poolShares){ alert('Quantidade de cotas inválida.'); return; }
  const price = parseFloat(prompt('Preço total da venda (R$):', String(qty * 500)));
  if (!(price > 0)) return;
  const buyerId = prompt('Número do time comprador (veja a coluna # na tabela):', '');
  if (!buyerId) return;
  const idx = parseInt(buyerId,10) - 1;
  const buyer = liquidityGame.teams[idx];
  if (!buyer){ alert('Time comprador inválido.'); return; }
  if (buyer === team){ alert('Não é possível vender para o próprio time.'); return; }
  if (buyer.eliminated){ alert('O comprador informado já foi eliminado do jogo.'); return; }
  if (buyer.cash + 1e-6 < price){ alert('O comprador não possui caixa suficiente.'); return; }
  buyer.cash -= price;
  buyer.poolShares = (buyer.poolShares || 0) + qty;
  team.poolShares -= qty;
  team.cash += price;
  addLiquidityHistory(team, `Vendeu ${qty} cota(s) para ${buyer.name} por ${formatBRL(price)}.`);
  advanceLiquidityTurn();
}

function liquidityPass(team){
  addLiquidityHistory(team, 'Passou a vez.');
  advanceLiquidityTurn();
}

function advanceLiquidityTurn(){
  if (!liquidityGame || liquidityGame.stage==='finished') return renderLiquidityGameArea();
  const state = liquidityGame;
  const next = nextActiveLiquidityIndex(state, state.turnIndex);
  if (next === -1){
    state.awaitingRoundEnd = true;
    const first = firstActiveLiquidityIndex(state);
    if (first !== -1) state.turnIndex = first;
  } else {
    state.turnIndex = next;
  }
  renderLiquidityGameArea();
}

function endLiquidityRound(){
  if (!liquidityGame || !liquidityGame.awaitingRoundEnd) return;
  const state = liquidityGame;
  const dividendTotal = state.pool.nfts * 2000 * 0.10;
  const perShare = state.pool.shares ? dividendTotal / state.pool.shares : 0;
  state.teams.forEach(team=>{
    if (team.eliminated) return;
    team.cash -= 100;
    if (perShare > 0 && team.poolShares > 0){
      const gain = perShare * team.poolShares;
      team.cash += gain;
    }
  });
  addLiquidityHistory(null, `Fim da rodada ${state.round}. Taxa de ${formatBRL(100)} aplicada a todos os times ativos. ${state.pool.shares ? `Dividendos totais de ${formatBRL(dividendTotal)} (${formatBRL(perShare)} por cota).` : 'Sem dividendos pois não há cotas na piscina.'}`);
  state.round += 1;
  state.awaitingRoundEnd = false;
  const next = firstActiveLiquidityIndex(state);
  if (next === -1){
    state.stage = 'finished';
  } else {
    state.turnIndex = next;
  }
  renderLiquidityGameArea();
}

function startLiquiditySemifinal(){
  if (!liquidityGame || liquidityGame.stage!=='regular') return;
  if (liquidityGame.awaitingRoundEnd){
    alert('Finalize a rodada atual antes de iniciar a semifinal.');
    return;
  }
  const qualifiers = liquidityGame.teams.filter(t=>!t.eliminated && t.nftHand>0);
  if (!qualifiers.length){
    alert('Nenhum time possui NFT em mãos para avançar à semifinal.');
    return;
  }
  const eliminated = liquidityGame.teams.filter(t=>!t.eliminated && t.nftHand<=0);
  eliminated.forEach(t=>{ t.eliminated = true; });
  liquidityGame.stage = 'semifinal';
  liquidityGame.turnIndex = firstActiveLiquidityIndex(liquidityGame);
  if (liquidityGame.turnIndex === -1){
    liquidityGame.stage = 'finished';
  }
  const elimTxt = eliminated.length ? ` Eliminados: ${eliminated.map(t=>t.name).join(', ')}.` : ' Todos os times avançaram.';
  addLiquidityHistory(null, `Semifinal iniciada. Classificados: ${qualifiers.map(t=>t.name).join(', ')}.${elimTxt}`);
  renderLiquidityGameArea();
}

function startLiquidityFinal(){
  if (!liquidityGame || liquidityGame.stage!=='semifinal') return;
  if (liquidityGame.awaitingRoundEnd){
    alert('Finalize a rodada atual antes de iniciar a final.');
    return;
  }
  const finalists = activeLiquidityTeams(liquidityGame);
  if (!finalists.length){
    alert('Nenhum time ativo para disputar a final.');
    return;
  }
  liquidityGame.stage = 'final';
  liquidityGame.turnIndex = firstActiveLiquidityIndex(liquidityGame);
  addLiquidityHistory(null, `Final iniciada com ${finalists.map(t=>t.name).join(', ')}.`);
  renderLiquidityGameArea();
}

function finishLiquidityGame(){
  if (!liquidityGame || liquidityGame.stage!=='final') return;
  const finalists = activeLiquidityTeams(liquidityGame);
  if (!finalists.length){
    liquidityGame.stage = 'finished';
    liquidityGame.championId = null;
    addLiquidityHistory(null, 'Jogo encerrado sem times ativos.');
    renderLiquidityGameArea();
    return;
  }
  const topCash = Math.max(...finalists.map(t=>t.cash));
  const winners = finalists.filter(t=>Math.abs(t.cash - topCash) < 1e-6);
  liquidityGame.stage = 'finished';
  liquidityGame.awaitingRoundEnd = true;
  if (winners.length === 1){
    liquidityGame.championId = winners[0].id;
    addLiquidityHistory(null, `Jogo encerrado! Campeão: ${winners[0].name} com ${formatBRL(winners[0].cash)}.`);
  } else {
    liquidityGame.championId = null;
    const names = winners.map(t=>t.name).join(', ');
    addLiquidityHistory(null, `Jogo encerrado com empate entre ${names} (cada um com ${formatBRL(topCash)}).`);
  }
  renderLiquidityGameArea();
}

/* ========= Auth UI ========= */
async function refreshAuthUI(){
  const s = await getJSON(API('session.php'));
  const loginForm = document.getElementById('loginForm');
  const loggedBox = document.getElementById('loggedBox');
  if (s && s.logged) {
    loginForm.style.display = 'none';
    loggedBox.style.display = 'block';
  } else {
    loginForm.style.display = 'block';
    loggedBox.style.display = 'none';
  }
}
function initAuth(){
  // login
  document.getElementById('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const res = await fetch(AUTH('login.php'), {
      method: 'POST', credentials:'include',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email,password})
    });
    const msg = document.getElementById('authMsg');
    if (res.ok) {
      msg.textContent = 'Login efetuado!';
      await refreshAuthUI();
      document.getElementById('view').innerHTML = `<h1>Bem-vindo!</h1><p>Escolha um módulo do menu.</p>`;
    } else {
      try {
        const err = await res.json();
        if (err.error === 'email_not_confirmed') {
          msg.textContent = 'Confirme seu e-mail antes de entrar.';
        } else {
          msg.textContent = 'Login inválido.';
        }
      } catch { msg.textContent = 'Falha no login.'; }
      msg.classList.add('err');
    }
  });
  // logout
  document.getElementById('logoutBtn').addEventListener('click', async ()=>{
    await fetch(AUTH('logout.php'), { credentials:'include' });
    await refreshAuthUI();
    document.getElementById('view').innerHTML = `<h1>Até mais!</h1><p>Você saiu da conta.</p>`;
  });
  // toggle register
  const toggle = document.getElementById('toggleRegister');
  const form = document.getElementById('registerForm');
  toggle.addEventListener('click', ()=>{
    form.style.display = form.style.display==='none' ? 'block':'none';
  });
  // register
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('r_name').value;
    const email = document.getElementById('r_email').value;
    const password = document.getElementById('r_password').value;
    const r = await fetch(API('register.php'), {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name,email,password})
    });
    const msg = document.getElementById('authMsg');
    if (r.ok) {
      msg.textContent = 'Conta criada! Verifique seu e-mail para confirmar.';
      form.reset(); form.style.display='none';
    } else {
      const err = await r.json().catch(()=>({}));
      msg.textContent = 'Erro ao registrar: ' + (err.detail || err.error || r.statusText);
      msg.classList.add('err');
    }
  });
  refreshAuthUI();
}

/* ========= Views ========= */
async function viewSaldo(){
  const data = await getJSON(API(`balance.php`));
  if (data.__auth===false) return needLogin();
  const acc = table(data.accounts, ['currency','purpose','balance'], ['Moeda','Finalidade','Saldo']);
  const hist = table(data.journals, ['id','occurred_at','ref_type','memo','debit','credit'],
                     ['#','Quando','Tipo','Memo','Débito','Crédito']);
  document.getElementById('view').innerHTML = `<h1>Saldo</h1>${acc}<h2>Histórico</h2>${hist}`;
}

async function viewBitcoin(){
  const d = await getJSON(API(`bitcoin.php`));
  if (d.__auth===false) return needLogin();
  document.getElementById('view').innerHTML =
    `<h1>Bitcoin</h1><p><strong>Total BTC:</strong> ${d.btc_total ?? 0}</p>
     <h2>Recebidos</h2>${table(d.recebidos,['occurred_at','ref_type','memo','amount'],['Quando','Tipo','Memo','Valor'])}
     <h2>Pagos</h2>${table(d.pagos,['occurred_at','ref_type','memo','amount'],['Quando','Tipo','Memo','Valor'])}`;
}

async function viewNFT(){
  const d = await getJSON(API(`nfts.php`));
  if (d.__auth===false) return needLogin();
  const obras = table(d.obras,['work_id','title','asset_id','instance_id'],['#','Título','Asset','Instância']);
  const chassis = table(d.chassis,['id','size','material','status'],['#','Tamanho','Material','Status']);
  const extra = `<div class="actions"><button id="mintBtn" style="margin-top:8px;width:auto">Criar NFT de Teste</button><span class="badge">demo</span></div>`;
  document.getElementById('view').innerHTML = `<h1>NFTs</h1>${extra}<h2>Obras</h2>${obras}<h2>Chassis</h2>${chassis}`;
  document.getElementById('mintBtn').addEventListener('click', async()=>{
    const r = await fetch(API('mint_test_nft.php'), { method:'POST', credentials:'include' });
    if (r.ok){ alert('NFT de teste criado! Recarregando lista.'); viewNFT(); }
    else { const e = await r.json().catch(()=>({})); alert('Erro: ' + (e.detail||e.error||r.statusText)); }
  });
}

/* === MERCADO (separado) === */
async function viewMercadoNFT(){ await renderMercado('NFT'); }
async function viewMercadoBTC(){ await renderMercado('BTC'); }

async function renderMercado(kind){
  const html = `
    <div class="section">
      <h1>Mercado ${kind} (Ofertas de Venda)</h1>
      <div class="actions" style="margin-bottom:10px;">
        <button id="reloadBtn">Atualizar</button>
      </div>
      <div id="m_list"></div>
    </div>`;
  document.getElementById('view').innerHTML = html;
  document.getElementById('reloadBtn').addEventListener('click', ()=>loadOffers(kind));
  await loadOffers(kind);
}
async function loadOffers(kind){
  const url = API(`offers.php?kind=${kind}`);
  const data = await getJSON(url);
  if (data.__auth===false) return needLogin();
  const rows = (data||[]).map(o => ({
    id:o.id, tipo:o.kind, instancia:o.asset_instance_id||'', qtd:o.qty, preco:o.price_brl, vendedor:o.seller_id
  }));
  const tbl = table(rows, ['id','tipo','instancia','qtd','preco','vendedor'], ['#','Tipo','Instância','Qtd','Preço (BRL)','Vendedor']);
  document.getElementById('m_list').innerHTML = tbl + `<p><small>Clique no <b>ID</b> para comprar.</small></p>`;

  // compra ao clicar no ID
  document.querySelectorAll('#m_list table tbody tr').forEach(tr => {
    const idCell = tr.querySelector('td'); // primeira coluna
    const offerId = parseInt(idCell.textContent,10);
    idCell.style.cursor = 'pointer';
    idCell.title = 'Comprar esta oferta';
    idCell.addEventListener('click', async ()=>{
      if (!confirm('Confirmar compra da oferta #' + offerId + '?')) return;
      const r = await fetch(API('buy_offer.php'), {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({offer_id: offerId})
      });
      if (r.ok) { alert('Compra concluída!'); await loadOffers(kind); }
      else { const e = await r.json().catch(()=>({})); alert('Erro: ' + (e.detail||e.error||r.statusText)); }
    });
  });
}

/* ========= Trades (lista geral recente) ========= */
async function viewTrades(){
  document.getElementById('view').innerHTML = `<h1>Trades (últimos)</h1><div id="tradesBox"></div>`;
  const d = await getJSON(API(`trades.php`));
  if (d.__auth===false) return needLogin();
  const arr = Array.isArray(d) ? d : [];
  const rows = arr.map(t => ({ id:t.id, qty:t.qty, price:t.price, created_at:t.created_at }));
  document.getElementById('tradesBox').innerHTML = table(rows,['id','qty','price','created_at'],['#','Qtd','Preço','Quando']);
}

/* ========= Menu ========= */
function initMenu(){
  document.querySelectorAll('a[data-view]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const v = a.dataset.view;
      if (v==='saldo') return viewSaldo();
      if (v==='bitcoin') return viewBitcoin();
      if (v==='nft') return viewNFT();
      if (v==='mercado_nft') return viewMercadoNFT();
      if (v==='mercado_btc') return viewMercadoBTC();
      if (v==='trades') return viewTrades();
      if (v==='liquidity_game') return viewLiquidityGame();
    });
  });
}

/* ========= Init ========= */
initAuth();
initMenu();
