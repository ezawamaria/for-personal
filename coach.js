// ============================================================
// 教练课程查询系统 - Cloudflare Worker 单文件部署版
// KV Binding 名称: COACH_KV
// ============================================================

const RECORDS_KEY = 'records';
const USERS_KEY = 'users';
const ADMIN_PASSWORD_KEY = 'admin_password';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const SESSION_TTL = 86400; // 24小时

// ─── 工具函数 ──────────────────────────────────────────────

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  });
}

function html(content) {
  return new Response(content, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function setCookieHeader(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Max-Age=${maxAge}; SameSite=Strict`;
}

async function getAdminPwd(env) {
  return (await env.COACH_KV.get(ADMIN_PASSWORD_KEY)) || DEFAULT_ADMIN_PASSWORD;
}

async function checkAdmin(request, env) {
  const token = getCookie(request, 'adm_tok');
  if (!token) return false;
  return (await env.COACH_KV.get(`adm:${token}`)) === '1';
}

async function checkCoach(request, env) {
  const token = getCookie(request, 'cch_tok');
  if (!token) return null;
  return await env.COACH_KV.get(`cch:${token}`);
}

// ─── 教练端 HTML ───────────────────────────────────────────

function coachHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>教练课程查询</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#F0F4FF;min-height:100vh;color:#1e293b;-webkit-tap-highlight-color:transparent}
:root{--pri:#4F46E5;--pri2:#818CF8;--bg:#F0F4FF;--card:#fff;--muted:#64748b;--border:#E2E8F0;--success:#10b981;--danger:#ef4444}

/* ── 登录页 ── */
#loginPage{display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:20px}
.login-box{background:#fff;border-radius:24px;padding:48px 40px;width:100%;max-width:400px;box-shadow:0 25px 60px rgba(0,0,0,.2)}
.login-logo{text-align:center;margin-bottom:32px}
.login-logo .icon{width:64px;height:64px;background:linear-gradient(135deg,var(--pri),var(--pri2));border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px}
.login-logo h1{font-size:22px;font-weight:700;color:#1e293b}
.login-logo p{color:var(--muted);font-size:14px;margin-top:4px}
.form-group{margin-bottom:18px}
.form-group label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
.form-group input{width:100%;padding:14px 16px;border:1.5px solid var(--border);border-radius:10px;font-size:15px;transition:border-color .2s;outline:none;background:#FAFBFF;appearance:none}
.form-group input:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(79,70,229,.1)}
.btn-primary{width:100%;padding:14px;background:linear-gradient(135deg,var(--pri),#7C3AED);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;transition:transform .1s,opacity .2s;margin-top:8px}
.btn-primary:hover{opacity:.92}
.btn-primary:active{transform:scale(.98)}
.error-msg{background:#FEF2F2;border:1px solid #FECACA;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:12px;display:none}

/* ── 仪表盘 ── */
#dashboard{display:none}
.navbar{background:#fff;border-bottom:1px solid var(--border);padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.navbar-brand{display:flex;align-items:center;gap:10px}
.nav-icon{width:36px;height:36px;background:linear-gradient(135deg,var(--pri),#7C3AED);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px}
.navbar-brand span{font-size:16px;font-weight:700;color:#1e293b}
.nav-right{display:flex;align-items:center;gap:12px}
.coach-badge{background:#EEF2FF;color:var(--pri);padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600}
.btn-sm{padding:8px 14px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid var(--border);background:#fff;color:#374151;transition:all .15s}
.btn-sm:hover{background:#F1F5F9;border-color:#CBD5E1}

.main{padding:28px 24px;max-width:1200px;margin:0 auto}

/* ── 统计卡片 ── */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:28px}
.stat-card{background:#fff;border-radius:16px;padding:22px 24px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid var(--border);display:flex;align-items:center;gap:16px}
.stat-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.stat-icon.blue{background:#EEF2FF}
.stat-icon.green{background:#ECFDF5}
.stat-icon.teal{background:#F0FDFA}
.stat-icon.purple{background:#F5F3FF}
.stat-icon.orange{background:#FFF7ED}
.stat-info label{font-size:12px;color:var(--muted);font-weight:500}
.stat-info .val{font-size:24px;font-weight:700;color:#1e293b;margin-top:2px}

/* ── 筛选栏 ── */
.filter-bar{background:#fff;border-radius:14px;padding:16px 20px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid var(--border)}
.filter-bar select,.filter-bar input{padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:#FAFBFF;outline:none;color:#374151;cursor:pointer;transition:border-color .15s;appearance:none}
.filter-bar select{background-image:url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");background-repeat:no-repeat;background-position:right .7rem top 50%;background-size:.65rem auto;padding-right:1.5rem}
.filter-bar select:focus,.filter-bar input:focus{border-color:var(--pri)}
.filter-bar input{min-width:200px}
.filter-label{font-size:13px;color:var(--muted);font-weight:500;margin-right:4px}
.filter-group{display:flex;align-items:center;}
.record-count{margin-left:auto;font-size:13px;color:var(--muted)}
.record-count span{font-weight:700;color:var(--pri)}

/* ── 数据表格 ── */
.table-wrap{background:#fff;border-radius:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid var(--border)}
.table-wrap table{width:100%;border-collapse:collapse;font-size:14px;min-width:600px}
.table-wrap thead{background:linear-gradient(135deg,#F8FAFF,#F1F0FF)}
.table-wrap th{padding:14px 16px;text-align:left;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid var(--border);white-space:nowrap}
.table-wrap td{padding:14px 16px;border-bottom:1px solid #F1F5F9;color:#374151;vertical-align:middle;white-space:nowrap}
.table-wrap tr:last-child td{border-bottom:none}
.table-wrap tr:hover td{background:#FAFBFF}
.badge{display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600}
.badge-blue{background:#EEF2FF;color:#4F46E5}
.badge-green{background:#ECFDF5;color:#059669}
.badge-orange{background:#FFF7ED;color:#D97706}
.badge-gray{background:#F1F5F9;color:#64748b}

.empty-state{text-align:center;padding:60px 20px;color:var(--muted)}
.empty-state .empty-icon{font-size:48px;margin-bottom:12px}
.empty-state p{font-size:15px}

/* 移动端深度优化 */
@media(max-width:640px){
  .login-box{padding:40px 24px}
  .navbar{padding:0 16px}
  .main{padding:16px 12px}
  .stats-grid{grid-template-columns:1fr 1fr;gap:12px}
  .stat-card{padding:16px 14px;gap:12px;flex-direction:column;align-items:flex-start}
  .stat-icon{width:40px;height:40px;font-size:20px}
  .stat-info .val{font-size:20px}
  
  .filter-bar{flex-direction:column;align-items:stretch;padding:16px;gap:12px}
  .filter-group{width:100%;flex-direction:column;align-items:flex-start;gap:6px}
  .filter-group select, .filter-group input, .filter-bar input{width:100%;min-width:0}
  .record-count{margin-left:0;text-align:right;width:100%}
  
  .table-wrap th, .table-wrap td{padding:12px 14px}
}
</style>
</head>
<body>

<div id="loginPage">
  <div class="login-box">
    <div class="login-logo">
      <div class="icon">🏆</div>
      <h1>教练课程查询系统</h1>
      <p>请输入您的账号登录</p>
    </div>
    <div class="form-group">
      <label>教练姓名</label>
      <input type="text" id="loginName" placeholder="请输入您的姓名" autocomplete="username">
    </div>
    <div class="form-group">
      <label>登录密码</label>
      <input type="password" id="loginPwd" placeholder="请输入密码" autocomplete="current-password">
    </div>
    <button class="btn-primary" onclick="doLogin()">登 录</button>
    <div class="error-msg" id="loginErr"></div>
  </div>
</div>

<div id="dashboard">
  <nav class="navbar">
    <div class="navbar-brand">
      <div class="nav-icon">🏆</div>
      <span>课程查询系统</span>
    </div>
    <div class="nav-right">
      <div class="coach-badge" id="coachNameBadge"></div>
      <button class="btn-sm" onclick="doLogout()">退出</button>
    </div>
  </nav>

  <div class="main">
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">📋</div>
        <div class="stat-info"><label>课程条目</label><div class="val" id="statTotal">0</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">⏱️</div>
        <div class="stat-info"><label>课时（小时）</label><div class="val" id="statHours">0</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon teal">📆</div>
        <div class="stat-info"><label>常规课（天数）</label><div class="val" id="statDays2">0</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple">🎯</div>
        <div class="stat-info"><label>总课节数</label><div class="val" id="statLessons">0</div></div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">年度</span>
        <select id="filterYear" onchange="renderTable()">
          <option value="">全部</option>
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">类别</span>
        <select id="filterCat" onchange="renderTable()">
          <option value="">全部</option>
        </select>
      </div>
      <input type="text" id="filterSearch" placeholder="搜索课程或备注…" oninput="renderTable()">
      <div class="record-count">共 <span id="recordCount">0</span> 条记录</div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>课程</th>
            <th>类别</th>
            <th>标准</th>
            <th>课节数</th>
            <th>课时</th>
            <th>备注</th>
            <th>年度</th>
          </tr>
        </thead>
        <tbody id="tableBody"></tbody>
      </table>
      <div class="empty-state" id="emptyState" style="display:none">
        <div class="empty-icon">📭</div>
        <p>暂无匹配的课程记录</p>
      </div>
    </div>
  </div>
</div>

<script>
let allRecords = [];
let coachName = '';

async function init() {
  try {
    const r = await fetch('/api/coach/me');
    if (r.ok) {
      const d = await r.json();
      coachName = d.name;
      showDashboard();
      await loadRecords();
    }
  } catch(e) {}
}

async function doLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pwd  = document.getElementById('loginPwd').value;
  const errEl = document.getElementById('loginErr');
  errEl.style.display = 'none';
  if (!name || !pwd) { showErr('请填写完整信息'); return; }
  try {
    const r = await fetch('/api/coach/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, password: pwd})
    });
    const d = await r.json();
    if (!r.ok) { showErr(d.error || '登录失败'); return; }
    coachName = d.name;
    showDashboard();
    await loadRecords();
  } catch(e) { showErr('网络错误，请重试'); }
}

function showErr(msg) {
  const el = document.getElementById('loginErr');
  el.textContent = msg; el.style.display = 'block';
}

async function doLogout() {
  await fetch('/api/coach/logout', {method:'POST'});
  location.reload();
}

function showDashboard() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('coachNameBadge').textContent = coachName;
}

async function loadRecords() {
  try {
    const r = await fetch('/api/coach/records');
    const d = await r.json();
    allRecords = d.records || [];
    buildFilters();
    updateStats();
    renderTable();
  } catch(e) {}
}

function buildFilters() {
  const years = [...new Set(allRecords.map(r => r['年度']).filter(Boolean))].sort();
  const cats  = [...new Set(allRecords.map(r => r['类别']).filter(Boolean))].sort();
  const ySel = document.getElementById('filterYear');
  const cSel = document.getElementById('filterCat');
  years.forEach(y => { const o=document.createElement('option'); o.value=y; o.textContent=y; ySel.appendChild(o); });
  cats.forEach(c  => { const o=document.createElement('option'); o.value=c; o.textContent=c;  cSel.appendChild(o); });
}

function updateStats(filtered) {
  const data = filtered !== undefined ? filtered : allRecords;
  // 特长队/计时：课时单位是分钟，转换为小时
  const specialRecs = data.filter(r => r['类别'] === '特长队/计时');
  const specialHours = specialRecs.reduce((s,r) => s + (+r['课时'] || 0), 0) / 60;
  // 常规课/天数：课时单位是天数，直接合计
  const regularRecs = data.filter(r => r['类别'] === '常规课/天数');
  const regularDays = regularRecs.reduce((s,r) => s + (+r['课时'] || 0), 0);

  document.getElementById('statTotal').textContent    = data.length;
  document.getElementById('statHours').textContent    = specialHours.toFixed(2) + ' h';
  document.getElementById('statDays2').textContent    = regularDays.toFixed(2) + ' 天';
  document.getElementById('statLessons').textContent  = data.reduce((s,r) => s + (+r['课节数'] || 0), 0);
}

function renderTable() {
  const year   = document.getElementById('filterYear').value;
  const cat    = document.getElementById('filterCat').value;
  const search = document.getElementById('filterSearch').value.toLowerCase().trim();

  const filtered = allRecords.filter(r => {
    if (year   && r['年度'] !== year)  return false;
    if (cat    && r['类别'] !== cat)   return false;
    if (search && !(r['课程']||'').toLowerCase().includes(search) && !(r['备注']||'').toLowerCase().includes(search)) return false;
    return true;
  });

  document.getElementById('recordCount').textContent = filtered.length;
  updateStats(filtered);

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  const empty = document.getElementById('emptyState');

  if (filtered.length === 0) { empty.style.display='block'; return; }
  empty.style.display = 'none';

  const catColors = {'常规课/天数':'badge-blue','特长队/计时':'badge-green'};

  filtered.forEach(r => {
    const tr = document.createElement('tr');
    const cat = r['类别'] || '';
    const badgeClass = catColors[cat] || 'badge-gray';
    const std = r['标准'];
    const stdText = (std !== undefined && std !== '') ? std : '-';
    tr.innerHTML = \`
      <td>\${r['时间']||'-'}</td>
      <td><strong>\${r['课程']||'-'}</strong></td>
      <td><span class="badge \${badgeClass}">\${cat||'-'}</span></td>
      <td style="color:var(--muted)">\${stdText}</td>
      <td style="text-align:center;font-weight:600">\${r['课节数']||'-'}</td>
      <td style="text-align:center;font-weight:600;color:var(--pri)">\${r['课时']||'-'}</td>
      <td style="color:var(--muted)">\${r['备注']||'—'}</td>
      <td><span class="badge badge-gray">\${r['年度']||'-'}</span></td>
    \`;
    tbody.appendChild(tr);
  });
}

document.getElementById('loginPwd').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
document.getElementById('loginName').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('loginPwd').focus(); });
init();
</script>
</body>
</html>`;
}

// ─── 管理端 HTML ───────────────────────────────────────────

function adminHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>管理后台 - 教练课程系统</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#F8FAFC;min-height:100vh;color:#1e293b;-webkit-tap-highlight-color:transparent}
:root{--pri:#4F46E5;--pri2:#818CF8;--bg:#F8FAFC;--card:#fff;--muted:#64748b;--border:#E2E8F0;--danger:#ef4444;--success:#10b981}

/* 登录 */
#loginPage{display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#1e3a8a 0%,#312e81 100%);padding:20px}
.login-box{background:#fff;border-radius:24px;padding:48px 40px;width:100%;max-width:400px;box-shadow:0 25px 60px rgba(0,0,0,.25)}
.login-logo{text-align:center;margin-bottom:32px}
.login-logo .icon{width:64px;height:64px;background:linear-gradient(135deg,#1e3a8a,#4F46E5);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px}
.login-logo h1{font-size:22px;font-weight:700}
.login-logo p{color:var(--muted);font-size:14px;margin-top:4px}
.form-group{margin-bottom:18px}
.form-group label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
.form-group input{width:100%;padding:14px 16px;border:1.5px solid var(--border);border-radius:10px;font-size:15px;transition:border-color .2s;outline:none;background:#FAFBFF;appearance:none}
.form-group input:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(79,70,229,.1)}
.btn{padding:12px 20px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:none;transition:all .15s;display:inline-flex;align-items:center;justify-content:center}
.btn-primary{background:linear-gradient(135deg,var(--pri),#7C3AED);color:#fff;width:100%;padding:14px;font-size:16px}
.btn-primary:hover{opacity:.9}
.btn-success{background:var(--success);color:#fff}
.btn-success:hover{background:#059669}
.btn-danger{background:var(--danger);color:#fff}
.btn-danger:hover{background:#DC2626}
.btn-outline{background:#fff;border:1.5px solid var(--border);color:#374151}
.btn-outline:hover{background:#F1F5F9}
.error-msg{background:#FEF2F2;border:1px solid #FECACA;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:12px;display:none}
.success-msg{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:12px;display:none}

/* 后台布局 */
#adminPage{display:none}
.navbar{background:linear-gradient(135deg,#1e3a8a,#312e81);padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.navbar-brand{display:flex;align-items:center;gap:10px;color:#fff}
.nav-icon{width:36px;height:36px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px}
.navbar-brand span{font-size:16px;font-weight:700}
.admin-badge{background:rgba(255,255,255,.2);color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.5px}
.btn-logout{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);transition:all .15s}
.btn-logout:hover{background:rgba(255,255,255,.25)}
.nav-right{display:flex;align-items:center;gap:12px}

.main{max-width:1100px;margin:0 auto;padding:28px 20px}

/* 标签页 */
.tabs{display:flex;gap:8px;background:#fff;border-radius:14px;padding:8px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid var(--border)}
.tab{flex:1;padding:12px 10px;border-radius:10px;font-size:15px;font-weight:600;text-align:center;cursor:pointer;transition:all .2s;color:var(--muted);border:none;background:transparent}
.tab.active{background:linear-gradient(135deg,var(--pri),#7C3AED);color:#fff;box-shadow:0 2px 8px rgba(79,70,229,.3)}

/* 卡片 */
.card{background:#fff;border-radius:16px;padding:24px;border:1px solid var(--border);box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:20px}
.card-title{font-size:16px;font-weight:700;color:#1e293b;margin-bottom:18px;display:flex;align-items:center;gap:8px}
.card-title .icon{font-size:18px}

/* 用户管理 */
.user-list{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
.user-item{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#F8FAFC;border-radius:10px;border:1px solid var(--border)}
.user-name{display:flex;align-items:center;gap:12px}
.avatar{width:42px;height:42px;background:linear-gradient(135deg,var(--pri),#7C3AED);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;flex-shrink:0}
.user-info strong{font-size:15px;color:#1e293b;display:block}
.pwd-row{display:flex;align-items:center;gap:6px;margin-top:4px}
.pwd-dots,.pwd-plain{font-size:14px;color:var(--muted);font-family:monospace;letter-spacing:1px}
.pwd-plain{color:#374151;font-weight:600}
.eye-btn{background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;opacity:.6;transition:opacity .15s}
.eye-btn:hover{opacity:1}
.btn-edit{padding:8px 16px;font-size:13px;background:#EEF2FF;color:var(--pri);border:1.5px solid #C7D2FE;border-radius:8px;cursor:pointer;font-weight:600;transition:all .15s}
.btn-edit:hover{background:#E0E7FF}

/* 编辑弹窗 */
.modal-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center;padding:16px}
.modal-box{background:#fff;border-radius:20px;padding:32px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.modal-title{font-size:18px;font-weight:700;color:#1e293b;margin-bottom:22px;display:flex;align-items:center;gap:8px}
.modal-actions{display:flex;gap:12px;margin-top:20px}
.modal-actions .btn{flex:1;padding:12px;font-size:15px}
.add-user-form{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;background:#F0F4FF;padding:16px;border-radius:12px;border:1.5px dashed #C7D2FE}
.add-user-form .form-group{margin-bottom:0}
.add-user-form label{font-size:12px;color:var(--muted);font-weight:600;display:block;margin-bottom:6px}
.add-user-form input{padding:12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;outline:none;width:100%;background:#fff;appearance:none}
.add-user-form input:focus{border-color:var(--pri)}

/* 上传区域 */
.upload-zone{border:2.5px dashed #C7D2FE;border-radius:14px;padding:48px 24px;text-align:center;background:#F5F7FF;cursor:pointer;transition:all .2s;position:relative}
.upload-zone:hover,.upload-zone.drag{border-color:var(--pri);background:#EEF2FF}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer}
.upload-icon{font-size:48px;margin-bottom:12px}
.upload-zone h3{font-size:16px;font-weight:700;color:#1e293b;margin-bottom:6px}
.upload-zone p{font-size:13px;color:var(--muted)}
.upload-info{display:flex;align-items:center;gap:12px;background:#EEF2FF;padding:12px 16px;border-radius:10px;margin-top:16px;display:none}
.upload-info .file-icon{font-size:24px}
.upload-info .file-name{font-size:14px;font-weight:600;color:#1e293b}
.upload-info .file-size{font-size:12px;color:var(--muted)}
.upload-actions{display:flex;gap:12px;margin-top:16px;display:none}

/* 表格公用 */
.preview-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:12px;border:1px solid var(--border)}
.preview-wrap table{width:100%;border-collapse:collapse;font-size:13px;min-width:600px}
.preview-wrap th{background:#F1F5F9;padding:12px;text-align:left;font-size:12px;font-weight:700;color:var(--muted);border-bottom:1.5px solid var(--border);white-space:nowrap}
.preview-wrap td{padding:12px;border-bottom:1px solid #F1F5F9;color:#374151;white-space:nowrap}
.preview-wrap tr:last-child td{border-bottom:none}
.preview-wrap tr:hover td{background:#FAFBFF}
.badge-cat{display:inline-block;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#F1F5F9;color:#64748b}

/* 进度 */
.status-bar{padding:12px 16px;border-radius:10px;font-size:14px;font-weight:500;display:none;margin-top:12px}
.status-bar.success{background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0;display:block}
.status-bar.error{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;display:block}
.status-bar.info{background:#EEF2FF;color:#3730A3;border:1px solid #C7D2FE;display:block}

/* 设置 */
.settings-form{max-width:480px}
.input-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}

/* 数据概览 */
.data-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.data-stat{background:#F8FAFC;padding:16px;border-radius:12px;text-align:center;border:1px solid var(--border)}
.data-stat .num{font-size:28px;font-weight:800;color:var(--pri)}
.data-stat .lbl{font-size:12px;color:var(--muted);margin-top:4px}

/* 筛选栏 */
.admin-filter-bar{display:flex;align-items:center;background:#F8FAFC;padding:12px 16px;border-radius:12px;border:1px solid var(--border);margin-bottom:16px}
.admin-filter-bar select{flex:1;padding:12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background-color:#fff;appearance:none;background-image:url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");background-repeat:no-repeat;background-position:right .8rem top 50%;background-size:.7rem auto;outline:none}
.admin-filter-bar select:focus{border-color:var(--pri)}

/* 移动端深度优化 */
@media(max-width:640px){
  .login-box{padding:40px 24px}
  .navbar{padding:0 16px}
  .main{padding:16px 12px}
  
  .tabs{flex-wrap:wrap;gap:4px}
  .tabs .tab{flex:1 1 30%;font-size:13px;padding:10px 4px}
  
  .card{padding:16px}
  .add-user-form{grid-template-columns:1fr;gap:12px;padding:16px 12px}
  .add-user-form .btn{width:100%;height:44px !important}
  
  .data-stats{grid-template-columns:1fr 1fr;gap:10px}
  .data-stat{padding:12px}
  .data-stat .num{font-size:22px}
  
  .input-row{grid-template-columns:1fr;gap:12px}
  .upload-zone{padding:32px 16px}
  .upload-actions{flex-direction:column}
  .upload-actions .btn{width:100%}
  
  .user-item{flex-direction:column;align-items:flex-start;gap:12px}
  .user-item > div:last-child{width:100%;display:flex;justify-content:flex-end}
  .btn-edit, .btn-danger{flex:1;text-align:center;padding:10px}
}
</style>
</head>
<body>

<div id="loginPage">
  <div class="login-box">
    <div class="login-logo">
      <div class="icon">⚙️</div>
      <h1>系统管理后台</h1>
      <p>教练课程查询系统</p>
    </div>
    <div class="form-group">
      <label>管理员密码</label>
      <input type="password" id="adminPwd" placeholder="请输入管理员密码" autocomplete="current-password">
    </div>
    <button class="btn btn-primary" onclick="doAdminLogin()">登 录</button>
    <div class="error-msg" id="loginErr"></div>
  </div>
</div>

<div id="adminPage">
  <nav class="navbar">
    <div class="navbar-brand">
      <div class="nav-icon">⚙️</div>
      <span>管理后台</span>
    </div>
    <div class="nav-right">
      <span class="admin-badge">ADMIN</span>
      <button class="btn-logout" onclick="doLogout()">退出</button>
    </div>
  </nav>

  <div class="main">
    <div class="tabs">
      <button class="tab active" onclick="switchTab('users',this)">👥 用户管理</button>
      <button class="tab" onclick="switchTab('data',this)">📊 数据管理</button>
      <button class="tab" onclick="switchTab('settings',this)">🔧 系统设置</button>
    </div>

    <div id="tab-users">
      <div class="card">
        <div class="card-title"><span class="icon">👥</span>教练账号列表</div>
        <div class="user-list" id="userList">
          <div style="text-align:center;color:var(--muted);padding:20px">加载中…</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><span class="icon">➕</span>添加教练账号</div>
        <div class="add-user-form" style="margin-bottom: 16px;">
          <div class="form-group">
            <label>教练姓名</label>
            <input type="text" id="newUserName" placeholder="与数据中完全一致">
          </div>
          <div class="form-group">
            <label>登录密码</label>
            <input type="password" id="newUserPwd" placeholder="设置初始密码">
          </div>
          <button class="btn btn-success" onclick="addUser()" style="height:44px;align-self:end">添 加</button>
        </div>
        
        <div class="add-user-form" style="display: flex; flex-direction: column; gap: 8px;">
          <label style="font-size:13px">批量导入 (Excel格式: 表头须包含 "教练姓名" 和 "登录密码" 两列)</label>
          <div style="display: flex; gap: 12px; align-items: center; width: 100%; flex-wrap: wrap;">
             <input type="file" id="batchUserFile" accept=".xlsx,.xls,.csv" style="flex:1; min-width: 200px; padding:10px; border:1.5px solid var(--border); border-radius:8px; font-size:14px; background:#fff; cursor:pointer;">
             <button class="btn btn-outline" onclick="uploadBatchUsers()" style="height:44px; white-space:nowrap; flex-shrink:0;">批量导入</button>
          </div>
        </div>
        
        <div class="status-bar" id="userStatus"></div>
      </div>
    </div>

    <div id="tab-data" style="display:none">
      <div class="card">
        <div class="card-title"><span class="icon">📂</span>上传原始数据（Excel）</div>
        <div class="upload-zone" id="uploadZone">
          <input type="file" id="fileInput" accept=".xlsx,.xls,.csv" onchange="handleFile(this)">
          <div class="upload-icon">📤</div>
          <h3>点击或拖拽上传 Excel 文件</h3>
          <p>支持 .xlsx / .xls / .csv 格式，上传后将覆盖全部旧数据</p>
        </div>
        <div class="upload-info" id="uploadInfo">
          <div class="file-icon">📊</div>
          <div>
            <div class="file-name" id="fileName"></div>
            <div class="file-size" id="fileSize"></div>
          </div>
        </div>
        <div class="upload-actions" id="uploadActions">
          <button class="btn btn-success" onclick="submitData()">✅ 确认上传覆盖数据</button>
          <button class="btn btn-outline" onclick="clearFile()">✖ 取消</button>
        </div>
        <div class="status-bar" id="uploadStatus"></div>
      </div>

      <div class="card" id="previewCard" style="display:none">
        <div class="card-title"><span class="icon">👁</span>数据预览</div>
        <div class="data-stats" id="dataStatsBar"></div>
        <div class="preview-wrap" id="previewTable"></div>
      </div>

      <div class="card" id="currentDataCard">
        <div class="card-title"><span class="icon">💾</span>当前系统数据</div>
        <div id="currentDataInfo" style="color:var(--muted);font-size:14px">加载中…</div>
      </div>

      <div class="card" id="coachDataCard" style="display:none">
        <div class="card-title"><span class="icon">🔍</span>按教练查询详情</div>
        <div class="admin-filter-bar">
          <select id="adminCoachFilter" onchange="renderAdminCoachTable()">
            <option value="">请选择教练查看详细明细...</option>
          </select>
        </div>
        <div class="data-stats" id="adminCoachStats" style="display:none; margin-bottom:16px;"></div>
        <div class="preview-wrap" id="adminCoachTableWrap" style="display:none;">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>课程</th>
                <th>类别</th>
                <th>标准</th>
                <th>课节数</th>
                <th>课时</th>
                <th>备注</th>
                <th>年度</th>
              </tr>
            </thead>
            <tbody id="adminCoachTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="tab-settings" style="display:none">
      <div class="card settings-form">
        <div class="card-title"><span class="icon">🔑</span>修改管理员密码</div>
        <div class="form-group">
          <label>当前密码</label>
          <input type="password" id="oldPwd" placeholder="输入当前密码">
        </div>
        <div class="input-row">
          <div class="form-group">
            <label>新密码</label>
            <input type="password" id="newPwd" placeholder="输入新密码">
          </div>
          <div class="form-group">
            <label>确认新密码</label>
            <input type="password" id="newPwd2" placeholder="再次输入新密码">
          </div>
        </div>
        <button class="btn btn-primary" style="margin-top:8px" onclick="changePwd()">更新密码</button>
        <div class="status-bar" id="pwdStatus"></div>
      </div>
    </div>
  </div>
  
<div class="modal-backdrop" id="editModal" onclick="if(event.target===this)closeEdit()">
  <div class="modal-box">
    <div class="modal-title">✏️ 编辑教练账号</div>
    <input type="hidden" id="editOldName">
    <div class="form-group">
      <label>教练姓名</label>
      <input type="text" id="editName" placeholder="教练姓名（与数据中完全一致）">
    </div>
    <div class="form-group">
      <label>登录密码</label>
      <input type="text" id="editPwd" placeholder="登录密码">
    </div>
    <div class="status-bar" id="editStatus"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeEdit()">取 消</button>
      <button class="btn btn-primary" onclick="saveEdit()">保 存</button>
    </div>
  </div>
</div>

</div><script>
let parsedRecords = [];
let adminAllRecords = [];

// ─── 认证 ───
async function doAdminLogin() {
  const pwd = document.getElementById('adminPwd').value;
  const errEl = document.getElementById('loginErr');
  errEl.style.display = 'none';
  try {
    const r = await fetch('/api/admin/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({password:pwd})
    });
    const d = await r.json();
    if (!r.ok) { errEl.textContent = d.error||'密码错误'; errEl.style.display='block'; return; }
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'block';
    loadUsers(); loadCurrentData();
  } catch(e) { errEl.textContent='网络错误'; errEl.style.display='block'; }
}

async function doLogout() {
  await fetch('/api/admin/logout',{method:'POST'});
  location.reload();
}

async function checkAdminAuth() {
  try {
    const r = await fetch('/api/admin/users');
    if (r.ok) {
      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('adminPage').style.display = 'block';
      loadUsers(); loadCurrentData();
    }
  } catch(e) {}
}

document.getElementById('adminPwd').addEventListener('keydown', e => { if(e.key==='Enter') doAdminLogin(); });

// ─── 标签切换 ───
function switchTab(name, btn) {
  ['users','data','settings'].forEach(t => {
    document.getElementById('tab-'+t).style.display = t===name ? 'block' : 'none';
  });
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (name==='data') loadCurrentData();
}

// ─── 用户管理 ───
async function loadUsers() {
  try {
    const r = await fetch('/api/admin/users');
    const d = await r.json();
    renderUsers(d.users||[]);
  } catch(e) {}
}

function renderUsers(users) {
  const el = document.getElementById('userList');
  if (!users.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:14px">暂无教练账号，请在下方添加</div>';
    return;
  }
  el.innerHTML = users.map(u => {
    const initial = u.name.slice(0,1);
    const safeN = u.name.replace(/'/g,"\\\\'");
    const safeP = (u.password||'').replace(/'/g,"\\\\'");
    return \`<div class="user-item" id="ui-\${safeN}">
      <div class="user-name">
        <div class="avatar">\${initial}</div>
        <div class="user-info">
          <strong>\${u.name}</strong>
          <div class="pwd-row">
            <span class="pwd-dots" id="pwd-\${safeN}">••••••</span>
            <span class="pwd-plain" id="pwdp-\${safeN}" style="display:none">\${u.password||''}</span>
            <button class="eye-btn" onclick="togglePwd('\${safeN}')" title="显示/隐藏密码">👁</button>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-edit" onclick="openEdit('\${safeN}','\${safeP}')">编辑</button>
        <button class="btn btn-danger" onclick="deleteUser('\${safeN}')">删除</button>
      </div>
    </div>\`;
  }).join('');
}

function togglePwd(name) {
  const dots  = document.getElementById('pwd-'  + name);
  const plain = document.getElementById('pwdp-' + name);
  if (!dots || !plain) return;
  const showing = plain.style.display !== 'none';
  dots.style.display  = showing ? 'inline' : 'none';
  plain.style.display = showing ? 'none'   : 'inline';
}

function openEdit(name, password) {
  document.getElementById('editOldName').value = name;
  document.getElementById('editName').value    = name;
  document.getElementById('editPwd').value     = password;
  document.getElementById('editStatus').className = 'status-bar';
  document.getElementById('editModal').style.display = 'flex';
}

function closeEdit() {
  document.getElementById('editModal').style.display = 'none';
}

async function saveEdit() {
  const oldName  = document.getElementById('editOldName').value;
  const newName  = document.getElementById('editName').value.trim();
  const newPwd   = document.getElementById('editPwd').value;
  const status   = document.getElementById('editStatus');
  if (!newName || !newPwd) { showStatus(status,'请填写完整信息','error'); return; }
  try {
    const r = await fetch('/api/admin/users/' + encodeURIComponent(oldName), {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({newName, newPassword: newPwd})
    });
    const d = await r.json();
    if (!r.ok) { showStatus(status, d.error||'保存失败','error'); return; }
    showStatus(status, '✅ 保存成功', 'success');
    setTimeout(() => { closeEdit(); loadUsers(); }, 800);
  } catch(e) { showStatus(status,'网络错误','error'); }
}

async function addUser() {
  const name = document.getElementById('newUserName').value.trim();
  const pwd  = document.getElementById('newUserPwd').value;
  const status = document.getElementById('userStatus');
  if (!name||!pwd) { showStatus(status,'请填写姓名和密码','error'); return; }
  try {
    const r = await fetch('/api/admin/users', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, password:pwd})
    });
    const d = await r.json();
    if (!r.ok) { showStatus(status, d.error||'添加失败','error'); return; }
    showStatus(status, \`✅ 成功添加教练「\${name}」\`,'success');
    document.getElementById('newUserName').value='';
    document.getElementById('newUserPwd').value='';
    loadUsers();
  } catch(e) { showStatus(status,'网络错误','error'); }
}

async function uploadBatchUsers() {
  const input = document.getElementById('batchUserFile');
  const file = input.files[0];
  const status = document.getElementById('userStatus');
  if (!file) { showStatus(status, '请先选择Excel文件', 'error'); return; }

  showStatus(status, '⏳ 正在解析...', 'info');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});

      const users = [];
      for(let r of rows) {
        const name = r['教练姓名'];
        const pwd = r['登录密码'];
        if(name && pwd) {
          users.push({name: String(name).trim(), password: String(pwd).trim()});
        }
      }

      if(users.length === 0) {
        showStatus(status, '未找到有效数据，请确保表头包含「教练姓名」和「登录密码」', 'error');
        return;
      }

      showStatus(status, \`⏳ 正在导入 \${users.length} 个账号...\`, 'info');
      const res = await fetch('/api/admin/users/batch', {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({users})
      });
      const d = await res.json();
      if(!res.ok) { showStatus(status, d.error||'导入失败', 'error'); return; }

      showStatus(status, \`✅ 成功批量导入 \${users.length} 个教练账号\`, 'success');
      input.value = '';
      loadUsers();
    } catch(err) {
      showStatus(status, '解析或上传失败: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function deleteUser(name) {
  if (!confirm(\`确认删除教练「\${name}」的账号吗？\`)) return;
  await fetch('/api/admin/users/'+encodeURIComponent(name), {method:'DELETE'});
  loadUsers();
}

// ─── 数据上传 ───
function handleFile(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = (file.size/1024).toFixed(1) + ' KB';
  document.getElementById('uploadInfo').style.display = 'flex';
  document.getElementById('uploadActions').style.display = 'flex';
  document.getElementById('uploadStatus').className = 'status-bar';
  document.getElementById('previewCard').style.display = 'none';

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      parsedRecords = rows.map(r => ({
        '时间': String(r['时间']||''),
        '课程': String(r['课程']||''),
        '类别': String(r['类别']||''),
        '标准': r['标准']!==undefined ? r['标准'] : '',
        '教练': String(r['教练']||''),
        '课节数': r['课节数']!==undefined ? r['课节数'] : '',
        '课时':  r['课时']!==undefined  ? r['课时']  : '',
        '备注':  String(r['备注']||''),
        '年度':  String(r['年度']||''),
      }));
      showPreview(parsedRecords);
    } catch(err) {
      showStatus(document.getElementById('uploadStatus'), '解析失败：'+err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function showPreview(records) {
  const card = document.getElementById('previewCard');
  card.style.display = 'block';
  const coaches = new Set();
  records.forEach(r => { (r['教练']||'').split(',').forEach(c => { if(c.trim()) coaches.add(c.trim()); }); });
  
  const specialHours = records.filter(r => r['类别'] === '特长队/计时').reduce((s,r) => s + (+r['课时'] || 0), 0) / 60;
  const regularDays = records.filter(r => r['类别'] === '常规课/天数').reduce((s,r) => s + (+r['课时'] || 0), 0);

  document.getElementById('dataStatsBar').innerHTML = \`
    <div class="data-stat"><div class="num">\${records.length}</div><div class="lbl">总条目</div></div>
    <div class="data-stat"><div class="num">\${coaches.size}</div><div class="lbl">涉及教练</div></div>
    <div class="data-stat"><div class="num">\${specialHours.toFixed(1)}</div><div class="lbl">课时 (小时)</div></div>
    <div class="data-stat"><div class="num">\${regularDays.toFixed(1)}</div><div class="lbl">常规课 (天数)</div></div>
  \`;
  const cols = ['时间','课程','类别','标准','教练','课节数','课时','备注','年度'];
  const preview = records.slice(0,8);
  document.getElementById('previewTable').innerHTML = \`
    <table>
      <thead><tr>\${cols.map(c=>\`<th>\${c}</th>\`).join('')}</tr></thead>
      <tbody>\${preview.map(r=>\`<tr>\${cols.map(c=>\`<td>\${r[c]!==undefined?r[c]:''}</td>\`).join('')}</tr>\`).join('')}
      \${records.length>8 ? \`<tr><td colspan="9" style="text-align:center;color:var(--muted);font-style:italic;padding:10px">…另有 \${records.length-8} 条记录</td></tr>\` : ''}
      </tbody>
    </table>\`;
}

async function submitData() {
  if (!parsedRecords.length) return;
  const status = document.getElementById('uploadStatus');
  showStatus(status, '⏳ 正在上传…', 'info');
  try {
    const r = await fetch('/api/admin/upload', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({records: parsedRecords})
    });
    const d = await r.json();
    if (!r.ok) { showStatus(status, d.error||'上传失败', 'error'); return; }
    showStatus(status, \`✅ 成功上传 \${d.count} 条记录，旧数据已覆盖！\`, 'success');
    loadCurrentData();
    clearFile();
  } catch(e) { showStatus(status,'网络错误','error'); }
}

function clearFile() {
  parsedRecords = [];
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadInfo').style.display = 'none';
  document.getElementById('uploadActions').style.display = 'none';
  document.getElementById('previewCard').style.display = 'none';
}

async function loadCurrentData() {
  try {
    const r = await fetch('/api/admin/records');
    const d = await r.json();
    const records = d.records||[];
    adminAllRecords = records; // 保存供按教练筛选使用
    
    const coaches = new Set();
    records.forEach(r => { (r['教练']||'').split(',').forEach(c => { if(c.trim()) coaches.add(c.trim()); }); });
    const el = document.getElementById('currentDataInfo');
    
    if (!records.length) {
      el.innerHTML = '<span style="color:var(--muted)">系统中暂无数据，请上传 Excel 文件</span>';
      document.getElementById('coachDataCard').style.display = 'none';
      return;
    }
    
    const specialHours = records.filter(r => r['类别'] === '特长队/计时').reduce((s,r) => s + (+r['课时'] || 0), 0) / 60;
    const regularDays = records.filter(r => r['类别'] === '常规课/天数').reduce((s,r) => s + (+r['课时'] || 0), 0);

    el.innerHTML = \`
      <div class="data-stats" style="margin-bottom:0">
        <div class="data-stat"><div class="num">\${records.length}</div><div class="lbl">总条目数</div></div>
        <div class="data-stat"><div class="num">\${coaches.size}</div><div class="lbl">涉及教练</div></div>
        <div class="data-stat"><div class="num">\${specialHours.toFixed(1)}</div><div class="lbl">课时 (小时)</div></div>
        <div class="data-stat"><div class="num">\${regularDays.toFixed(1)}</div><div class="lbl">常规课 (天数)</div></div>
      </div>\`;
      
    // 渲染筛选下拉框
    const filter = document.getElementById('adminCoachFilter');
    filter.innerHTML = '<option value="">请选择教练查看详细明细...</option>';
    Array.from(coaches).sort().forEach(c => {
      filter.innerHTML += \`<option value="\${c}">\${c}</option>\`;
    });
    
    document.getElementById('coachDataCard').style.display = 'block';
    renderAdminCoachTable();
  } catch(e) {}
}

function renderAdminCoachTable() {
  const coach = document.getElementById('adminCoachFilter').value;
  const statsEl = document.getElementById('adminCoachStats');
  const wrapEl = document.getElementById('adminCoachTableWrap');
  const tbody = document.getElementById('adminCoachTableBody');
  
  if (!coach) {
    statsEl.style.display = 'none';
    wrapEl.style.display = 'none';
    return;
  }
  
  const filtered = adminAllRecords.filter(r => {
    const cArr = String(r['教练']||'').split(',').map(x=>x.trim());
    return cArr.includes(coach);
  });
  
  const specialHours = filtered.filter(r => r['类别'] === '特长队/计时').reduce((s,r) => s + (+r['课时'] || 0), 0) / 60;
  const regularDays = filtered.filter(r => r['类别'] === '常规课/天数').reduce((s,r) => s + (+r['课时'] || 0), 0);
  const lessons = filtered.reduce((s,r) => s + (+r['课节数'] || 0), 0);
  
  statsEl.innerHTML = \`
    <div class="data-stat"><div class="num" style="color:var(--pri)">\${filtered.length}</div><div class="lbl">课程条目</div></div>
    <div class="data-stat"><div class="num" style="color:#059669">\${specialHours.toFixed(2)}</div><div class="lbl">课时 (小时)</div></div>
    <div class="data-stat"><div class="num" style="color:#0284c7">\${regularDays.toFixed(2)}</div><div class="lbl">常规课 (天数)</div></div>
    <div class="data-stat"><div class="num" style="color:#7C3AED">\${lessons}</div><div class="lbl">总课节数</div></div>
  \`;
  statsEl.style.display = 'grid';
  
  if(filtered.length === 0) {
     tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--muted)">暂无记录</td></tr>';
  } else {
     const catColors = {'常规课/天数':'badge-blue','特长队/计时':'badge-green'};
     tbody.innerHTML = filtered.map(r => {
       const cat = r['类别'] || '';
       const badgeClass = catColors[cat] || 'badge-gray';
       const std = r['标准'];
       const stdText = (std !== undefined && std !== '') ? std : '-';
       return \`<tr>
         <td>\${r['时间']||'-'}</td>
         <td><strong>\${r['课程']||'-'}</strong></td>
         <td><span class="badge-cat \${badgeClass}">\${cat||'-'}</span></td>
         <td style="color:var(--muted)">\${stdText}</td>
         <td style="text-align:center;font-weight:600">\${r['课节数']||'-'}</td>
         <td style="text-align:center;font-weight:600;color:var(--pri)">\${r['课时']||'-'}</td>
         <td style="color:var(--muted)">\${r['备注']||'—'}</td>
         <td><span class="badge-cat badge-gray">\${r['年度']||'-'}</span></td>
       </tr>\`;
     }).join('');
  }
  wrapEl.style.display = 'block';
}

// ─── 密码设置 ───
async function changePwd() {
  const oldPwd  = document.getElementById('oldPwd').value;
  const newPwd  = document.getElementById('newPwd').value;
  const newPwd2 = document.getElementById('newPwd2').value;
  const status  = document.getElementById('pwdStatus');
  if (!oldPwd||!newPwd||!newPwd2) { showStatus(status,'请填写所有字段','error'); return; }
  if (newPwd !== newPwd2) { showStatus(status,'两次输入的新密码不一致','error'); return; }
  if (newPwd.length < 6)  { showStatus(status,'密码长度至少 6 位','error'); return; }
  try {
    const r = await fetch('/api/admin/password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({oldPassword:oldPwd, newPassword:newPwd})
    });
    const d = await r.json();
    if (!r.ok) { showStatus(status, d.error||'修改失败','error'); return; }
    showStatus(status, '✅ 密码修改成功','success');
    document.getElementById('oldPwd').value='';
    document.getElementById('newPwd').value='';
    document.getElementById('newPwd2').value='';
  } catch(e) { showStatus(status,'网络错误','error'); }
}

// ─── 工具 ───
function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status-bar ' + type;
}

// 拖拽上传
const zone = document.getElementById('uploadZone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
zone.addEventListener('drop', e => {
  e.preventDefault(); zone.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) { document.getElementById('fileInput').files = e.dataTransfer.files; handleFile(document.getElementById('fileInput')); }
});

checkAdminAuth();
</script>
</body>
</html>`;
}

// ─── 主 Fetch Handler ──────────────────────────────────────

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      // ── 页面路由 ──
      if (path === '/'      && method === 'GET') return html(coachHTML());
      if (path === '/admin' && method === 'GET') return html(adminHTML());

      // ── 教练 API ──
      if (path === '/api/coach/login' && method === 'POST') {
        const { name, password } = await request.json();
        if (!name || !password) return json({ error: '参数不完整' }, 400);

        const raw   = await env.COACH_KV.get(USERS_KEY);
        const users = raw ? JSON.parse(raw) : {};

        if (!users[name] || users[name].password !== password) {
          return json({ error: '用户名或密码错误' }, 401);
        }
        const token = generateToken();
        await env.COACH_KV.put(`cch:${token}`, name, { expirationTtl: SESSION_TTL });
        return new Response(JSON.stringify({ success: true, name }), {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': setCookieHeader('cch_tok', token, SESSION_TTL),
          },
        });
      }

      if (path === '/api/coach/logout' && method === 'POST') {
        const token = getCookie(request, 'cch_tok');
        if (token) await env.COACH_KV.delete(`cch:${token}`);
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': setCookieHeader('cch_tok', '', 0),
          },
        });
      }

      if (path === '/api/coach/me' && method === 'GET') {
        const name = await checkCoach(request, env);
        if (!name) return json({ error: '未登录' }, 401);
        return json({ name });
      }

      if (path === '/api/coach/records' && method === 'GET') {
        const name = await checkCoach(request, env);
        if (!name) return json({ error: '未登录' }, 401);

        const raw     = await env.COACH_KV.get(RECORDS_KEY);
        const all     = raw ? JSON.parse(raw) : [];
        const matched = all.filter(r => {
          const coaches = String(r['教练'] || '').split(',').map(c => c.trim());
          return coaches.includes(name);
        });
        // 隐藏"教练"字段
        const sanitized = matched.map(({ 教练, ...rest }) => rest);
        return json({ records: sanitized, name });
      }

      // ── 管理员 API ──
      if (path === '/api/admin/login' && method === 'POST') {
        const { password } = await request.json();
        const correct = await getAdminPwd(env);
        if (password !== correct) return json({ error: '密码错误' }, 401);
        const token = generateToken();
        await env.COACH_KV.put(`adm:${token}`, '1', { expirationTtl: SESSION_TTL });
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': setCookieHeader('adm_tok', token, SESSION_TTL),
          },
        });
      }

      if (path === '/api/admin/logout' && method === 'POST') {
        const token = getCookie(request, 'adm_tok');
        if (token) await env.COACH_KV.delete(`adm:${token}`);
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': setCookieHeader('adm_tok', '', 0),
          },
        });
      }

      // 以下管理 API 全部需要验证
      if (path.startsWith('/api/admin/')) {
        if (!(await checkAdmin(request, env))) {
          return json({ error: '未授权，请先登录' }, 401);
        }

        // 获取用户列表
        if (path === '/api/admin/users' && method === 'GET') {
          const raw   = await env.COACH_KV.get(USERS_KEY);
          const users = raw ? JSON.parse(raw) : {};
          return json({ users: Object.keys(users).map(n => ({ name: n, password: users[n].password })) });
        }

        // 添加单个用户
        if (path === '/api/admin/users' && method === 'POST') {
          const { name, password } = await request.json();
          if (!name || !password) return json({ error: '参数不完整' }, 400);
          const raw   = await env.COACH_KV.get(USERS_KEY);
          const users = raw ? JSON.parse(raw) : {};
          users[name] = { password };
          await env.COACH_KV.put(USERS_KEY, JSON.stringify(users));
          return json({ success: true });
        }

        // 批量添加用户
        if (path === '/api/admin/users/batch' && method === 'POST') {
          const { users } = await request.json();
          if (!Array.isArray(users)) return json({ error: '参数不完整' }, 400);
          
          const raw   = await env.COACH_KV.get(USERS_KEY);
          const existingUsers = raw ? JSON.parse(raw) : {};
          
          for (const u of users) {
            if (u.name && u.password) {
              existingUsers[u.name] = { password: u.password };
            }
          }
          await env.COACH_KV.put(USERS_KEY, JSON.stringify(existingUsers));
          return json({ success: true, count: users.length });
        }

        // 删除用户
        if (path.startsWith('/api/admin/users/') && method === 'DELETE') {
          const name  = decodeURIComponent(path.slice('/api/admin/users/'.length));
          const raw   = await env.COACH_KV.get(USERS_KEY);
          const users = raw ? JSON.parse(raw) : {};
          delete users[name];
          await env.COACH_KV.put(USERS_KEY, JSON.stringify(users));
          return json({ success: true });
        }

        // 编辑用户（改名或改密码）
        if (path.startsWith('/api/admin/users/') && method === 'PUT') {
          const oldName = decodeURIComponent(path.slice('/api/admin/users/'.length));
          const { newName, newPassword } = await request.json();
          if (!newName || !newPassword) return json({ error: '参数不完整' }, 400);
          const raw   = await env.COACH_KV.get(USERS_KEY);
          const users = raw ? JSON.parse(raw) : {};
          if (!users[oldName]) return json({ error: '用户不存在' }, 404);
          // 如果改了名字，删旧键建新键
          if (newName !== oldName) delete users[oldName];
          users[newName] = { password: newPassword };
          await env.COACH_KV.put(USERS_KEY, JSON.stringify(users));
          return json({ success: true });
        }

        // 上传数据（覆盖）
        if (path === '/api/admin/upload' && method === 'POST') {
          const { records } = await request.json();
          if (!Array.isArray(records)) return json({ error: '数据格式错误' }, 400);
          await env.COACH_KV.put(RECORDS_KEY, JSON.stringify(records));
          return json({ success: true, count: records.length });
        }

        // 查看当前数据
        if (path === '/api/admin/records' && method === 'GET') {
          const raw = await env.COACH_KV.get(RECORDS_KEY);
          const records = raw ? JSON.parse(raw) : [];
          return json({ records, count: records.length });
        }

        // 修改管理员密码
        if (path === '/api/admin/password' && method === 'POST') {
          const { oldPassword, newPassword } = await request.json();
          const current = await getAdminPwd(env);
          if (oldPassword !== current) return json({ error: '原密码错误' }, 400);
          if (!newPassword || newPassword.length < 6) return json({ error: '新密码长度至少 6 位' }, 400);
          await env.COACH_KV.put(ADMIN_PASSWORD_KEY, newPassword);
          return json({ success: true });
        }
      }

      return json({ error: '路由不存在' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: '服务器内部错误: ' + err.message }, 500);
    }
  },
};
