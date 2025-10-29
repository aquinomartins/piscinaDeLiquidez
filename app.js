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
    poolShares: 0
  }));
  return {
    round: 1,
    turnIndex: 0,
    awaitingRoundEnd: false,
    pendingAction: null,
    teams,
    pool: { nfts:0, shares:0 },
    history: []
  };
}

function viewLiquidityGame(){
  const view = document.getElementById('view');
  const teamCount = liquidityGame ? liquidityGame.teams.length : 4;
  const html = `
    <div class="section game-setup">
      <h1>Jogo Piscina de Liquidez</h1>
      <p>Gerencie as rodadas, ações disponíveis e distribuições de uma turma jogando com NFTs, Bitcoin e cotas da piscina de liquidez.</p>
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
  const team = state.awaitingRoundEnd ? null : state.teams[state.turnIndex];
  const dividendTotal = state.pool.nfts * 2000 * 0.10;
  const perShare = state.pool.shares ? dividendTotal / state.pool.shares : 0;
  const semifinalReady = state.teams.filter(t=>t.nftHand>0);
  const leaderCash = state.teams.slice().sort((a,b)=>b.cash - a.cash);

  const rows = state.teams.map(t=>{
    const semifinalClass = t.nftHand>0 ? 'ready-semifinal' : 'awaiting-semifinal';
    const semifinalTxt = t.nftHand>0 ? 'Sim' : 'Não';
    return `
      <tr class="${semifinalClass}">
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
    return `<li><time>R${h.round} • ${when}</time>${who}${esc(h.message)}</li>`;
  }).join('');

  const leaderTxt = leaderCash.length ? `${leaderCash[0].name} (${formatBRL(leaderCash[0].cash)})` : '—';

  const actionSection = state.awaitingRoundEnd
    ? `
    <section class="section game-actions">
      <h2>Ações da rodada</h2>
      <p>Todos os times já realizaram uma ação nesta rodada.</p>
      <p>Finalize para cobrar a taxa de R$100 e distribuir 10% do valor das NFTs da piscina entre as cotas.</p>
      <div class="action-buttons">
        <button id="endRoundBtn">Encerrar rodada ${state.round}</button>
      </div>
    </section>`
    : renderLiquidityActionSection(state, team);

  container.innerHTML = `
    <div class="game-summary">
      <div class="summary-card">
        <h4>Rodada atual</h4>
        <p>${state.round}</p>
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
    ${actionSection}
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
  if (!state.awaitingRoundEnd){
    const turnTeam = team;
    container.querySelectorAll('.action-buttons button[data-act]').forEach(btn=>{
      const act = btn.dataset.act;
      if (!act) return;
      if (act === 'pass'){
        btn.addEventListener('click', ()=>{ if (!turnTeam) return; liquidityPass(turnTeam); });
      } else {
        btn.addEventListener('click', ()=>{ if (!turnTeam) return; selectLiquidityAction(act); });
      }
    });
    const actionForm = container.querySelector('.action-form');
    if (actionForm) actionForm.addEventListener('submit', submitLiquidityActionForm);
  } else {
    const endBtn = container.querySelector('#endRoundBtn');
    if (endBtn) endBtn.addEventListener('click', endLiquidityRound);
  }
}

function renderLiquidityActionSection(state, team){
  const selected = state.pendingAction;
  const canDeposit = team.nftHand > 0;
  const canWithdraw = team.poolShares > 0 && state.pool.nfts > 0;
  const canBuyBTC = team.cash > 0;
  const canSellBTC = team.btc > 0;
  const canSellNFT = team.nftHand > 0;
  const canSellShare = team.poolShares > 0;

  const actions = [
    { act:'deposit', label:'Depositar NFT na piscina', disabled:!canDeposit },
    { act:'withdraw', label:'Retirar NFT da piscina', disabled:!canWithdraw },
    { act:'buy_btc', label:'Comprar Bitcoin', disabled:!canBuyBTC },
    { act:'sell_btc', label:'Vender Bitcoin', disabled:!canSellBTC },
    { act:'sell_nft', label:'Vender NFT em mãos', disabled:!canSellNFT },
    { act:'sell_share', label:'Vender cota', disabled:!canSellShare }
  ];

  const buttonsHtml = actions.map(action => {
    const classes = [];
    if (selected === action.act) classes.push('active');
    const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
    const disabledAttr = action.disabled ? ' disabled' : '';
    return `<button data-act="${action.act}"${classAttr}${disabledAttr}>${action.label}</button>`;
  }).join('');

  return `
    <section class="section game-actions">
      <h2>Ações da rodada</h2>
      <p>Vez do <strong>${esc(team.name)}</strong>. Escolha uma ação:</p>
      <div class="action-buttons">
        ${buttonsHtml}
        <button data-act="pass">Passar a vez</button>
      </div>
      ${renderLiquidityActionForm(state, team, selected)}
    </section>`;
}

function renderLiquidityActionForm(state, team, action){
  if (!action) {
    return '<p class="action-hint">Selecione uma ação para ver os detalhes.</p>';
  }

  if (action === 'deposit'){
    if (team.nftHand <= 0){
      return '<p class="action-hint error">Este time não possui NFT em mãos para depositar.</p>';
    }
    return `
      <form class="action-form" data-act="deposit">
        <p class="action-hint">O depósito adiciona a NFT à piscina, concede 10 BTC e gera 1 nova cota.</p>
        <button type="submit">Confirmar depósito</button>
      </form>`;
  }

  if (action === 'withdraw'){
    if (team.poolShares <= 0){
      return '<p class="action-hint error">Este time não possui cotas suficientes para resgatar uma NFT.</p>';
    }
    if (state.pool.nfts <= 0){
      return '<p class="action-hint error">Não há NFTs disponíveis na piscina para resgate.</p>';
    }
    const canPayBTC = team.btc + 1e-9 >= 11;
    const canPayBRL = team.cash + 1e-9 >= 2000;
    if (!canPayBTC && !canPayBRL){
      return '<p class="action-hint error">Saldo insuficiente para pagar o resgate (11 BTC ou R$2.000).</p>';
    }
    const options = [
      canPayBTC ? `<option value="BTC">Pagar 11 BTC (saldo atual: ${formatBTC(team.btc)} BTC)</option>` : '',
      canPayBRL ? `<option value="BRL">Pagar ${formatBRL(2000)} (saldo atual: ${formatBRL(team.cash)})</option>` : ''
    ].join('');
    return `
      <form class="action-form" data-act="withdraw">
        <div class="field">
          <label for="action_payment">Forma de pagamento</label>
          <select id="action_payment" name="payment" required>
            ${options}
          </select>
        </div>
        <p class="action-hint">A retirada devolve 1 NFT ao time e remove 1 cota.</p>
        <button type="submit">Resgatar NFT</button>
      </form>`;
  }

  if (action === 'buy_btc'){
    if (team.cash <= 0){
      return '<p class="action-hint error">Este time não possui caixa disponível para comprar BTC.</p>';
    }
    return `
      <form class="action-form" data-act="buy_btc">
        <div class="field">
          <label for="action_qty">Quantidade de BTC</label>
          <input type="number" id="action_qty" name="qty" step="0.00000001" min="0" placeholder="0" required />
        </div>
        <div class="field">
          <label for="action_price">Preço por BTC (R$)</label>
          <input type="number" id="action_price" name="price" step="0.01" min="0" placeholder="100000" required />
        </div>
        <p class="action-hint">O valor total será descontado do caixa do time.</p>
        <button type="submit">Comprar BTC</button>
      </form>`;
  }

  if (action === 'sell_btc'){
    if (team.btc <= 0){
      return '<p class="action-hint error">Este time não possui BTC suficiente para vender.</p>';
    }
    return `
      <form class="action-form" data-act="sell_btc">
        <div class="field">
          <label for="action_qty">Quantidade de BTC</label>
          <input type="number" id="action_qty" name="qty" step="0.00000001" min="0" max="${team.btc}" value="${Math.min(team.btc,1)}" required />
        </div>
        <div class="field">
          <label for="action_price">Preço por BTC (R$)</label>
          <input type="number" id="action_price" name="price" step="0.01" min="0" placeholder="100000" required />
        </div>
        <p class="action-hint">O valor total será creditado no caixa do time.</p>
        <button type="submit">Vender BTC</button>
      </form>`;
  }

  if (action === 'sell_nft'){
    if (team.nftHand <= 0){
      return '<p class="action-hint error">Este time não possui NFT disponível para venda.</p>';
    }
    const buyers = state.teams.filter(t=>t.id !== team.id);
    if (!buyers.length){
      return '<p class="action-hint error">É necessário ter pelo menos outro time para vender a NFT.</p>';
    }
    const options = buyers.map(t=>`<option value="${t.id}">#${t.id} ${esc(t.name)} — Caixa ${formatBRL(t.cash)}</option>`).join('');
    return `
      <form class="action-form" data-act="sell_nft">
        <div class="field">
          <label for="action_price">Preço de venda (R$)</label>
          <input type="number" id="action_price" name="price" step="0.01" min="0" value="2000" required />
        </div>
        <div class="field">
          <label for="action_buyer">Time comprador</label>
          <select id="action_buyer" name="buyer" required>
            <option value="">Selecione</option>
            ${options}
          </select>
        </div>
        <p class="action-hint">O comprador paga em caixa e recebe a NFT.</p>
        <button type="submit">Vender NFT</button>
      </form>`;
  }

  if (action === 'sell_share'){
    if (team.poolShares <= 0){
      return '<p class="action-hint error">Este time não possui cotas disponíveis para venda.</p>';
    }
    const buyers = state.teams.filter(t=>t.id !== team.id);
    if (!buyers.length){
      return '<p class="action-hint error">É necessário ter outro time para comprar as cotas.</p>';
    }
    const options = buyers.map(t=>`<option value="${t.id}">#${t.id} ${esc(t.name)} — Caixa ${formatBRL(t.cash)}</option>`).join('');
    return `
      <form class="action-form" data-act="sell_share">
        <div class="field">
          <label for="action_qty">Quantidade de cotas</label>
          <input type="number" id="action_qty" name="qty" min="1" max="${team.poolShares}" step="1" value="1" required />
        </div>
        <div class="field">
          <label for="action_price">Preço total (R$)</label>
          <input type="number" id="action_price" name="price" step="0.01" min="0" value="${team.poolShares>0 ? 500 : 0}" required />
        </div>
        <div class="field">
          <label for="action_buyer">Time comprador</label>
          <select id="action_buyer" name="buyer" required>
            <option value="">Selecione</option>
            ${options}
          </select>
        </div>
        <p class="action-hint">A venda transfere as cotas selecionadas e adiciona o valor ao caixa.</p>
        <button type="submit">Vender cotas</button>
      </form>`;
  }

  return '';
}

function selectLiquidityAction(action){
  if (!liquidityGame || liquidityGame.awaitingRoundEnd) return;
  liquidityGame.pendingAction = liquidityGame.pendingAction === action ? null : action;
  renderLiquidityGameArea();
}

function submitLiquidityActionForm(e){
  e.preventDefault();
  if (!liquidityGame || liquidityGame.awaitingRoundEnd) return;
  const team = liquidityGame.teams[liquidityGame.turnIndex];
  if (!team) return;
  const form = e.currentTarget;
  const action = form.dataset.act;

  const parseNumber = (value) => {
    if (value === undefined || value === null) return NaN;
    return parseFloat(String(value).replace(',', '.'));
  };

  if (action === 'deposit') {
    liquidityDeposit(team);
    return;
  }

  if (action === 'withdraw') {
    const mode = form.elements['payment'] ? form.elements['payment'].value : '';
    if (!mode) { alert('Escolha a forma de pagamento.'); return; }
    liquidityWithdraw(team, mode);
    return;
  }

  if (action === 'buy_btc') {
    const qty = parseNumber(form.elements['qty']?.value);
    const price = parseNumber(form.elements['price']?.value);
    if (!(qty > 0)) { alert('Informe a quantidade de BTC a comprar.'); return; }
    if (!(price >= 0)) { alert('Informe o preço por BTC.'); return; }
    liquidityBuyBTC(team, qty, price);
    return;
  }

  if (action === 'sell_btc') {
    const qty = parseNumber(form.elements['qty']?.value);
    const price = parseNumber(form.elements['price']?.value);
    if (!(qty > 0)) { alert('Informe a quantidade de BTC a vender.'); return; }
    if (!(price >= 0)) { alert('Informe o preço por BTC.'); return; }
    liquiditySellBTC(team, qty, price);
    return;
  }

  if (action === 'sell_nft') {
    const price = parseNumber(form.elements['price']?.value);
    const buyerId = parseInt(form.elements['buyer']?.value, 10);
    if (!(price > 0)) { alert('Informe o preço da NFT.'); return; }
    if (!buyerId) { alert('Selecione um time comprador.'); return; }
    liquiditySellNFT(team, price, buyerId);
    return;
  }

  if (action === 'sell_share') {
    const qty = parseInt(form.elements['qty']?.value, 10);
    const price = parseNumber(form.elements['price']?.value);
    const buyerId = parseInt(form.elements['buyer']?.value, 10);
    if (!(qty > 0)) { alert('Informe a quantidade de cotas.'); return; }
    if (!(price > 0)) { alert('Informe o preço total.'); return; }
    if (!buyerId) { alert('Selecione um time comprador.'); return; }
    liquiditySellShare(team, qty, price, buyerId);
    return;
  }
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

function liquidityWithdraw(team, mode){
  if (team.poolShares <= 0){ alert('Este time não possui cotas para resgatar uma NFT.'); return; }
  if (liquidityGame.pool.nfts <= 0){ alert('Não há NFTs disponíveis na piscina.'); return; }
  const modeNormalized = (mode || '').trim().toUpperCase();
  let paymentText = '';
  if (modeNormalized === 'BTC'){
    if (team.btc + 1e-9 < 11){ alert('BTC insuficiente para pagar 11 BTC.'); return; }
    team.btc -= 11;
    paymentText = `${formatBTC(11)} BTC`;
  } else if (modeNormalized === 'BRL' || modeNormalized === 'R$' || modeNormalized === 'DINHEIRO'){
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

function liquidityBuyBTC(team, qty, price){
  if (!(qty > 0)) { alert('Quantidade de BTC inválida.'); return; }
  if (!(price >= 0)) { alert('Preço inválido.'); return; }
  const total = qty * price;
  if (team.cash + 1e-6 < total){ alert('Saldo insuficiente para esta compra.'); return; }
  team.cash -= total;
  team.btc += qty;
  addLiquidityHistory(team, `Comprou ${formatBTC(qty)} BTC por ${formatBRL(total)} (R$ ${formatNumber(price)} / BTC).`);
  advanceLiquidityTurn();
}

function liquiditySellBTC(team, qty, price){
  if (!(qty > 0)) { alert('Quantidade de BTC inválida.'); return; }
  if (team.btc + 1e-6 < qty){ alert('Este time não possui essa quantidade de BTC.'); return; }
  if (!(price >= 0)) { alert('Preço inválido.'); return; }
  const total = qty * price;
  team.btc -= qty;
  team.cash += total;
  addLiquidityHistory(team, `Vendeu ${formatBTC(qty)} BTC por ${formatBRL(total)} (R$ ${formatNumber(price)} / BTC).`);
  advanceLiquidityTurn();
}

function liquiditySellNFT(team, price, buyerId){
  if (team.nftHand <= 0){ alert('Este time não possui NFT disponível para venda.'); return; }
  if (!(price > 0)){ alert('Preço inválido.'); return; }
  const idx = liquidityGame.teams.findIndex(t=>t.id === buyerId);
  const buyer = liquidityGame.teams[idx];
  if (!buyer){ alert('Time comprador inválido.'); return; }
  if (buyer === team){ alert('Não é possível vender para o próprio time.'); return; }
  if (buyer.cash + 1e-6 < price){ alert('O comprador não possui caixa suficiente.'); return; }
  buyer.cash -= price;
  buyer.nftHand = (buyer.nftHand || 0) + 1;
  team.cash += price;
  team.nftHand -= 1;
  addLiquidityHistory(team, `Vendeu uma NFT para ${buyer.name} por ${formatBRL(price)}.`);
  advanceLiquidityTurn();
}

function liquiditySellShare(team, qty, price, buyerId){
  if (team.poolShares <= 0){ alert('Este time não possui cotas para vender.'); return; }
  if (!(qty > 0) || qty > team.poolShares){ alert('Quantidade de cotas inválida.'); return; }
  if (!(price > 0)){ alert('Preço inválido.'); return; }
  const idx = liquidityGame.teams.findIndex(t=>t.id === buyerId);
  const buyer = liquidityGame.teams[idx];
  if (!buyer){ alert('Time comprador inválido.'); return; }
  if (buyer === team){ alert('Não é possível vender para o próprio time.'); return; }
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
  if (!liquidityGame) return;
  liquidityGame.pendingAction = null;
  liquidityGame.turnIndex += 1;
  if (liquidityGame.turnIndex >= liquidityGame.teams.length){
    liquidityGame.turnIndex = 0;
    liquidityGame.awaitingRoundEnd = true;
  }
  renderLiquidityGameArea();
}

function endLiquidityRound(){
  if (!liquidityGame || !liquidityGame.awaitingRoundEnd) return;
  const state = liquidityGame;
  const dividendTotal = state.pool.nfts * 2000 * 0.10;
  const perShare = state.pool.shares ? dividendTotal / state.pool.shares : 0;
  state.teams.forEach(team=>{
    team.cash -= 100;
    if (perShare > 0 && team.poolShares > 0){
      const gain = perShare * team.poolShares;
      team.cash += gain;
    }
  });
  addLiquidityHistory(null, `Fim da rodada ${state.round}. Taxa de ${formatBRL(100)} aplicada a todos os times. ${state.pool.shares ? `Dividendos totais de ${formatBRL(dividendTotal)} (${formatBRL(perShare)} por cota).` : 'Sem dividendos pois não há cotas na piscina.'}`);
  state.round += 1;
  state.awaitingRoundEnd = false;
  state.pendingAction = null;
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
