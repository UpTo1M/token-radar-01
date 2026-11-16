// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol
// detail view with the model's own inputs and the protocol's farm plan, and
// a model sandbox that re-ranks the board live. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = {
    q: '', category: 'all', chain: 'all', tab: 'pre-token',
    sort: 'implied', dir: -1, selected: null,
    model: {
      base_multiple: DATA.model.base_multiple,
      growth_weight: DATA.model.growth_weight,
      maturity_floor: DATA.model.maturity_floor,
    },
  };

  // ---------- formatting ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // ---------- the model, recomputed in the page ----------
  // Same arithmetic as lib/model.ts: the page recomputes a row from the
  // snapshot figures and checks the number board.json carries, so the
  // page's code and the board's data are visibly the same function.
  function categoryMultiplier(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 1.12;
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 1.1;
    if (c.indexOf('leveraged farm') >= 0) return 1.08;
    if (c.indexOf('dex') >= 0) return 1.08;
    if (c.indexOf('yield') >= 0) return 1.05;
    if (c.indexOf('prediction') >= 0) return 1.05;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 1.05;
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('liquid restaking') >= 0) return 0.92;
    if (c.indexOf('restaked btc') >= 0) return 0.9;
    if (c.indexOf('bridge') >= 0) return 0.85;
    return 1.0;
  }
  function impliedOf(row, m) {
    var model = m || DATA.model;
    var base = state.model.base_multiple;
    var gw = state.model.growth_weight;
    var mf = state.model.maturity_floor;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d == null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days == null ? model.unknown_age_days : row.age_days;
    var maturity = mf + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + model.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_cap);
    var catMult = categoryMultiplier(row.category);
    return {
      value: Math.max(1, Math.round(row.tvl_usd * base * growthMult * maturity * chainMult * catMult)),
      growthMult: growthMult, maturity: maturity, chainMult: chainMult, catMult: catMult, growthPct: growth,
    };
  }

  // ---------- the farm plan, same derivation as lib/plan.ts ----------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and borrow a small amount against it so both sides count.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('leveraged farm') >= 0) return 'Open a $' + capital + ' leveraged farming position on ' + name + ' on ' + chain + ' and keep it within a safe health factor.';
    if (c.indexOf('dex') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and hold the LP receipt.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position in a live market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Allocate $' + capital + ' to a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Repay a little, re-borrow a little, or add collateral so the account shows fresh activity.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Claim or compound the yield once, or move a small amount between pools.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close and reopen a small trade, or add a little margin.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount back or across again so the route stays active.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the staking rewards and restake them.';
    return 'Make one small qualifying action: a deposit, a swap, a vote, or a claim.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Keep the position and check the protocol\u2019s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: 'Before you deposit, open ' + p.name + ' from its own site or its own X account and check the contract address on ' + chain + '\u2019s explorer, so you are not farming a look-alike.', cost: 'nothing to check', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p) + ' Do it once a week so the activity spans more than one snapshot.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted across several snapshots.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, so you can repeat the position or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' },
    ].map(stepText);
  }

  // ---------- filtering + sorting ----------
  function currentRows() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    // The sandbox may have moved the model: re-score and re-rank live.
    var scored = list.map(function (r) {
      var v = impliedOf(r);
      return { row: r, value: v.value };
    });
    scored.sort(function (a, b) {
      return b.value - a.value || (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0);
    });
    return scored;
  }
  function sortedScored(scored) {
    var key = state.sort;
    return scored.slice().sort(function (a, b) {
      var ra = a.row, rb = b.row, av, bv;
      if (key === 'name') { av = ra.name.toLowerCase(); bv = rb.name.toLowerCase(); }
      else if (key === 'tvl') { av = ra.tvl_usd; bv = rb.tvl_usd; }
      else if (key === 'growth') { av = ra.change_7d == null ? -Infinity : ra.change_7d; bv = rb.change_7d == null ? -Infinity : rb.change_7d; }
      else if (key === 'age') { av = ra.age_days == null ? Infinity : ra.age_days; bv = rb.age_days == null ? Infinity : rb.age_days; }
      else { av = a.value; bv = b.value; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return ra.slug < rb.slug ? -1 : ra.slug > rb.slug ? 1 : 0;
    });
  }

  // ---------- rendering ----------
  function headerHtml() {
    return '<header class="top">' +
      '<div class="brand"><span class="mark"></span><span>Token Radar</span></div>' +
      '<div class="top-meta"><span>Snapshot ' + esc(DATA.as_of) + '</span>' +
      '<span>DefiLlama protocol index</span>' +
      '<span>' + esc(DATA.model_version) + ' model</span></div>' +
      '</header>';
  }
  function ledeHtml() {
    return '<section class="lede"><div>' +
      '<h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by implied value</h1>' +
      '<p>The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL</b> and no token on record. ' +
      'The early radar adds <b>' + DATA.early_size + ' pre-token protocols</b> below that floor. ' +
      'Implied value is a model, not a promise: it says what a launch would be worth if the protocol\u2019s record stayed as it is.</p>' +
      '</div><div class="facts">' +
      '<div class="fact"><span>Watchlist covered</span><b class="gold">' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="fact"><span>Pre-token rows scored</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="fact"><span>Early rows below the floor</span><b>' + DATA.early_size + '</b></div>' +
      '<div class="fact"><span>Live-token set aside</span><b>' + DATA.live_size + '</b></div>' +
      '</div></section>';
  }
  function spotHtml(scored) {
    var items = (scored || []).slice(0, 5);
    if (items.length === 0) items = DATA.rows.slice(0, 5).map(function (r) { return { row: r, value: r.implied_value_usd }; });
    var cards = items.map(function (item) {
      var r = item.row;
      return '<button type="button" class="card" data-slug="' + esc(r.slug) + '">' +
        '<span class="rank">#' + r.rank + '</span>' +
        '<span class="name">' + esc(r.name) + '</span>' +
        '<span class="val">' + esc(fmtUsd(item.value)) + '</span>' +
        '<span class="sig">' + esc(r.signal) + '</span>' +
        '</button>';
    }).join('');
    return '<section class="spot"><h2>Top 5 to farm next</h2><div class="spot-grid">' + cards + '</div></section>';
  }
  function controlsHtml() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var catOpts = '<option value="all">All categories</option>' + categories.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="all">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + catOpts + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + chainOpts + '</select></div>' +
      '<div class="field"><span class="sub">Token status</span><div class="tabs">' +
      '<button type="button" id="tab-pre" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
      '<button type="button" id="tab-live" aria-pressed="' + (state.tab === 'live') + '">Live token</button>' +
      '</div></div>' +
      '<span class="count" id="count"></span>' +
      '</div>';
  }
  function sortTh(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' \u25bc' : ' \u25b2') : '';
    return '<th scope="col"><button type="button" class="th-btn" data-sort="' + key + '">' + esc(label) + arrow + '</button></th>';
  }
  function boardHtml(scored) {
    var list = sortedScored(scored);
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p>Clear the search or pick another category or chain to see the board again.</p>' +
        '<button class="button primary" type="button" id="clear-filters">Clear filters</button></div></div>';
    }
    var max = list[0].value || 1;
    var rowsHtml = list.map(function (item) {
      var r = item.row;
      var growth = r.change_7d == null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var width = Math.max(3, Math.round((item.value / max) * 100));
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0" data-selected="' + (state.selected === r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + esc(fmtUsd(r.tvl_usd)) + '</td>' +
        '<td class="num ' + gc + '">' + esc(growth) + '</td>' +
        '<td class="num">' + esc(fmtAge(r.age_days)) + '</td>' +
        '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + width + '%"></i></div><span class="num">' + esc(fmtUsd(item.value)) + '</span></div></td>' +
        '<td><span class="status">no token</span></td>' +
        '</tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + sortTh('implied', 'Rank') + sortTh('name', 'Protocol') + sortTh('tvl', 'TVL') + sortTh('growth', '7d') + sortTh('age', 'Age') + sortTh('implied', 'Implied value') + '<th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }
  function liveHtml() {
    var rowsHtml = DATA.live.map(function (r) {
      return '<tr>' +
        '<td class="num">live</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + esc(fmtUsd(r.tvl_usd)) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + esc(fmtPct(r.change_7d)) + '</td>' +
        '<td class="num">' + esc(fmtUsd(r.mcap_usd)) + '</td>' +
        '<td><span class="status live">already trades</span></td>' +
        '</tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }
  function modelHtml() {
    var m = DATA.model;
    return '<section class="panel model"><h2>How implied value is computed</h2>' +
      '<p class="sub">Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. ' +
      'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. ' +
      'Chain breadth counts because more chains mean more places to farm, and the category multiplier reads the snapshot\u2019s category field: categories where a user can take more distinct actions carry a larger farmable surface.</p>' +
      '<div class="formula">implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x chain x category )</div>' +
      '<div class="sandbox">' +
      '<div class="slider"><label>Base multiple <b id="v-base">' + state.model.base_multiple.toFixed(2) + '</b></label><input type="range" id="s-base" min="0.10" max="0.40" step="0.01" value="' + state.model.base_multiple + '"></div>' +
      '<div class="slider"><label>Growth weight <b id="v-growth">' + state.model.growth_weight.toFixed(2) + '</b></label><input type="range" id="s-growth" min="0" max="1" step="0.05" value="' + state.model.growth_weight + '"></div>' +
      '<div class="slider"><label>Maturity floor <b id="v-mat">' + state.model.maturity_floor.toFixed(2) + '</b></label><input type="range" id="s-mat" min="0.30" max="0.80" step="0.05" value="' + state.model.maturity_floor + '"></div>' +
      '<p class="note">Move a slider and the board re-ranks live, with the same function board.json was built from. ' +
      'The sandbox changes only this page: the submitted board keeps the constants above. <b id="sandbox-note"></b></p>' +
      '</div></section>';
  }
  function footHtml() {
    return '<footer class="foot">' +
      '<p>A protocol is called pre-token because its DefiLlama record carries no token — no market cap, no CoinGecko id, no symbol. That is the record, not proof: a protocol on this board may still have a token its record does not carry.</p>' +
      '<p>Implied value is this entry\u2019s own claim, never make.fun\u2019s. Snapshot ' + esc(DATA.as_of) + ', DefiLlama protocol index, ' + DATA.board_size + ' rows.</p>' +
      '</footer>';
  }

  // ---------- detail dialog ----------
  var dialog = document.createElement('dialog');
  dialog.className = 'detail';
  dialog.id = 'detail';
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    state.selected = slug;
    writeHash();
    var v = impliedOf(row);
    var steps = farmSteps(row);
    var match = v.value === row.implied_value_usd;
    var stepsHtml = steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    dialog.innerHTML =
      '<div class="detail-head"><div><span class="brand-name">Rank ' + row.rank + ' of ' + DATA.board_size + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') + ' · ' + esc(row.signal) + '</p></div>' +
      '<button class="close" type="button" id="detail-close">Close</button></div>' +
      '<section class="detail-section"><h3>Implied value</h3>' +
      '<div class="equation">' +
      '<div><span>TVL</span><b>' + esc(fmtUsd(row.tvl_usd)) + '</b></div>' +
      '<div><span>Seven-day growth</span><b>' + esc(fmtPct(row.change_7d)) + '</b></div>' +
      '<div><span>Age with no token</span><b>' + esc(fmtAge(row.age_days)) + '</b></div>' +
      '<div><span>Growth multiplier</span><b>' + v.growthMult.toFixed(4) + '</b></div>' +
      '<div><span>Maturity multiplier</span><b>' + v.maturity.toFixed(4) + '</b></div>' +
      '<div><span>Chain x category</span><b>' + v.chainMult.toFixed(2) + ' x ' + v.catMult.toFixed(2) + '</b></div>' +
      '<div><span>Implied value</span><b>' + esc(fmtUsd(row.implied_value_usd)) + '</b></div>' +
      '</div>' +
      '<p class="' + (match ? 'check' : 'warn') + '">Model ' + esc(DATA.model_version) + ': the page recomputes this row as ' + esc(fmtUsd(v.value)) +
      (match ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.</p>' +
      '</section>' +
      '<section class="detail-section"><h3>Farm plan</h3><ol class="steps">' + stepsHtml + '</ol></section>';
    var closeBtn = dialog.querySelector('#detail-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { dialog.close(); });
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  // ---------- hash routing ----------
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---------- render + events ----------
  // The shell (header, lede, controls, model, footer) is built once. The
  // spotlight and the board table live in #dynamic and are refreshed by
  // updateBoard(), so typing in the search box or dragging a sandbox
  // slider never destroys the control being used.
  function render() {
    var html = '<div class="shell">' + headerHtml() + ledeHtml() + controlsHtml() +
      '<div id="dynamic"></div>';
    html += modelHtml();
    html += footHtml() + '</div>';
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    updateBoard();
    bindControls();
    bindSandbox();
    if (state.selected) openDetail(state.selected);
  }
  function updateBoard() {
    var scored = currentRows();
    var dyn = document.getElementById('dynamic');
    if (!dyn) return;
    var html = spotHtml(scored);
    html += state.tab === 'pre-token' ? boardHtml(scored) : liveHtml();
    dyn.innerHTML = html;
    var count = document.getElementById('count');
    if (count) count.textContent = state.tab === 'pre-token' ? scored.length + ' rows shown' : DATA.live.length + ' live-token protocols';
    var pre = document.getElementById('tab-pre');
    var live = document.getElementById('tab-live');
    if (pre) pre.setAttribute('aria-pressed', String(state.tab === 'pre-token'));
    if (live) live.setAttribute('aria-pressed', String(state.tab === 'live'));
    bindBoard();
  }
  function bindBoard() {
    var thBtns = app.querySelectorAll('.th-btn');
    thBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        updateBoard();
      });
    });
    var rows = app.querySelectorAll('tr[data-slug]');
    rows.forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
      });
    });
    var cards = app.querySelectorAll('.card[data-slug]');
    cards.forEach(function (c) {
      c.addEventListener('click', function () { openDetail(c.getAttribute('data-slug')); });
    });
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); });
  }
  function bindControls() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); updateBoard(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); updateBoard(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); updateBoard(); });
    var pre = document.getElementById('tab-pre');
    if (pre) pre.addEventListener('click', function () { state.tab = 'pre-token'; updateBoard(); });
    var live = document.getElementById('tab-live');
    if (live) live.addEventListener('click', function () { state.tab = 'live'; updateBoard(); });
  }
  function bindSandbox() {
    var base = document.getElementById('s-base');
    var growth = document.getElementById('s-growth');
    var mat = document.getElementById('s-mat');
    if (!base || !growth || !mat) return;
    function update() {
      state.model.base_multiple = parseFloat(base.value);
      state.model.growth_weight = parseFloat(growth.value);
      state.model.maturity_floor = parseFloat(mat.value);
      document.getElementById('v-base').textContent = state.model.base_multiple.toFixed(2);
      document.getElementById('v-growth').textContent = state.model.growth_weight.toFixed(2);
      document.getElementById('v-mat').textContent = state.model.maturity_floor.toFixed(2);
      var note = document.getElementById('sandbox-note');
      var moved = state.model.base_multiple !== DATA.model.base_multiple ||
        state.model.growth_weight !== DATA.model.growth_weight ||
        state.model.maturity_floor !== DATA.model.maturity_floor;
      if (note) note.textContent = moved ? 'Sandbox active: the board below is re-ranked with your constants.' : '';
      updateBoard();
    }
    base.addEventListener('input', update);
    growth.addEventListener('input', update);
    mat.addEventListener('input', update);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
