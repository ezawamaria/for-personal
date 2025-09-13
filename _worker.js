export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = (env.KEY || "").trim();

    if (!key) {
      return new Response("Server misconfig: missing environment variable KEY", { status: 500 });
    }

    const pathname = url.pathname;

    // 项目页面
    if ((pathname === `/${key}` || pathname === `/${key}/`) && request.method === "GET") {
      return new Response(renderHTML(key), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    // 转换接口
    if (pathname === `/${key}/convert` && request.method === "POST") {
      try {
        const payload = await request.json().catch(() => ({}));
        const source = (payload.source || "https://cfxr.eu.org/getSub").trim();
        let subHost = (payload.subHost || "").trim();
        const proxyIp = (payload.proxyIp || "").trim();
        const proxyPort = (payload.proxyPort || "").trim();

        if (!source) return jsonError("请填写『白嫖订阅』地址");
        if (proxyPort && !/^\d+$/.test(proxyPort)) return jsonError("『反代端口』应为数字");

        subHost = subHost.replace(/^https?:\/\//i, "").replace(/\/+$/i, "");

        const resp = await fetch(source, { cf: { cacheTtl: 0 } });
        if (!resp.ok) return jsonError(`拉取订阅失败：HTTP ${resp.status}`);
        const text = await resp.text();

        const converted = convertSubscription(text, subHost, proxyIp, proxyPort);
        if (converted.length === 0) return jsonError("未从订阅内容中解析到 vless:// 链接");

        return jsonOK({ result: converted.join("\n") });
      } catch (err) {
        return jsonError("转换出错：" + (err && err.message ? err.message : String(err)));
      }
    }

    return new Response("404 Not Found", { status: 404 });
  },
};

/* ---------- 帮助函数 ---------- */

function jsonOK(obj) {
  return new Response(JSON.stringify(Object.assign({ ok: true }, obj)), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function jsonError(msg) {
  return new Response(JSON.stringify({ ok: false, error: String(msg) }), {
    status: 400,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * 将订阅文本中的每条 vless:// 链接转换为目标格式，并去重
 */
function convertSubscription(text, subHost, proxyIp, proxyPort) {
  const lines = String(text || "").split(/\r?\n/);
  const results = [];

  for (let raw of lines) {
    if (!raw) continue;
    const line = raw.trim();
    if (!/vless:\/\//i.test(line)) continue;

    const piece = line.split(/\s+/)[0];
    const clean = piece.split("#")[0];

    const converted = convertOneVless(clean, subHost, proxyIp, proxyPort);
    if (converted) results.push(converted);
  }

  return [...new Set(results)];
}

/**
 * 单条 vless:// 链接转换
 * - subHost 有值 → 输出 https://{subHost}/sub?uuid=...
 * - subHost 为空 → 输出修改后的 vless://...
 */
function convertOneVless(vlessUrl, subHost, proxyIp, proxyPort) {
  const re = /^vless:\/\/([^@]+)@([^?]+)(?:\?([^#]*))?/i;
  const m = vlessUrl.match(re);
  if (!m) return null;

  const uuid = m[1];
  const server = m[2];
  let qs = m[3] || "";
  qs = qs.split("#")[0];

  const newQs = replacePathInQuery(qs, proxyIp, proxyPort);

  if (subHost) {
    // 输出为 https://{subHost}/sub?uuid=...
    const tail = newQs ? "&" + newQs : "";
    return `https://${subHost}/sub?uuid=${encodeURIComponent(uuid)}${tail}`;
  } else {
    // 输出为修改后的 vless://...
    const tail = newQs ? "?" + newQs : "";
    return `vless://${uuid}@${server}${tail}`;
  }
}

/**
 * 在查询字符串中只替换 path= 的值
 * 若 proxyIp 或 proxyPort 为空，则对应项不替换
 */
function replacePathInQuery(qs, proxyIp, proxyPort) {
  if (!qs) return "";
  const re = /(^|&)path=([^&]*)/i;
  const match = qs.match(re);
  if (!match) return qs;

  const prefix = match[1];
  const encodedVal = match[2] || "";

  let decoded;
  try {
    decoded = decodeURIComponent(encodedVal);
  } catch {
    decoded = encodedVal;
  }

  if (proxyIp) decoded = decoded.replace(/proxyip/gi, proxyIp);
  if (proxyPort) decoded = decoded.replace(/port\(\d+\)/gi, proxyPort);

  const newEncoded = encodeURIComponent(decoded);
  return qs.replace(re, `${prefix}path=${newEncoded}`);
}

/* ---------- 前端页面 ---------- */

function renderHTML(key) {
  const pagePath = `/${escapeHtml(key)}`;
  const convertPath = `${pagePath}/convert`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>订阅转换</title>
<style>
  :root{--bg:#0b1220;--card:#0f1724;--muted:#98a0b3;--text:#e6eef8;--accent:#2f80ed}
  *{box-sizing:border-box}
  html,body{height:100%;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,'PingFang SC',Noto Sans SC}
  body{background:linear-gradient(180deg,var(--bg),#07101a);color:var(--text);padding:18px}
  .wrap{max-width:920px;margin:0 auto}
  .card{background:var(--card);border-radius:12px;padding:16px;border:1px solid rgba(255,255,255,0.03);box-shadow:0 8px 30px rgba(2,6,23,0.6)}
  h1{margin:0 0 8px;font-size:20px}
  .muted{color:var(--muted);font-size:13px;margin-bottom:12px}
  .grid{display:grid;grid-template-columns:1fr;gap:10px}
  @media(min-width:720px){.grid{grid-template-columns:1fr 1fr}}
  label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
  input,textarea{width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.03);background:#071126;color:var(--text);font-size:14px;outline:none}
  textarea{min-height:160px;resize:vertical;font-family:ui-monospace,monospace}
  .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
  .btn{padding:10px 14px;border-radius:10px;border:0;cursor:pointer;font-weight:600}
  .primary{background:var(--accent);color:#fff}
  .secondary{background:#102135;color:var(--text)}
  .status{margin-top:8px;color:var(--muted);font-size:13px}
  code{background:rgba(255,255,255,0.02);padding:2px 6px;border-radius:6px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>订阅转换器</h1>
      <div class="muted">仅当路径为 <code>${pagePath}</code> 时打开本页面；其它路径返回 404。</div>

      <form id="form">
        <div class="grid">
          <div>
            <label>白嫖订阅</label>
            <input id="source" value="https://cfxr.eu.org/getSub" />
          </div>
          <div>
            <label>订阅器（留空则输出 vless 原始格式）</label>
            <input id="subHost" placeholder="例如：owo.o00o.ooo" />
          </div>
          <div>
            <label>反代ip（留空则使用原始数据）</label>
            <input id="proxyIp" placeholder="sjc.o00o.ooo（可留空）" />
          </div>
          <div>
            <label>反代端口（留空则使用原始数据）</label>
            <input id="proxyPort" placeholder="443（可留空）" inputmode="numeric" />
          </div>
        </div>

        <div style="margin-top:12px">
          <label>转换结果</label>
          <textarea id="output" readonly></textarea>
        </div>

        <div class="row">
          <button class="btn primary" id="runBtn" type="submit">开始转换</button>
          <button class="btn secondary" id="copyBtn" type="button">复制结果</button>
        </div>
        <div class="status" id="status"></div>
      </form>
    </div>
  </div>

<script>
const form = document.getElementById('form');
const sourceEl = document.getElementById('source');
const subHostEl = document.getElementById('subHost');
const proxyIpEl = document.getElementById('proxyIp');
const proxyPortEl = document.getElementById('proxyPort');
const outputEl = document.getElementById('output');
const runBtn = document.getElementById('runBtn');
const copyBtn = document.getElementById('copyBtn');
const statusEl = document.getElementById('status');

const CONVERT_URL = location.origin + '${convertPath}';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('正在转换…');
  setDisabled(true);
  outputEl.value = '';
  try {
    const payload = {
      source: sourceEl.value.trim(),
      subHost: subHostEl.value.trim(),
      proxyIp: proxyIpEl.value.trim(),
      proxyPort: proxyPortEl.value.trim()
    };
    const res = await fetch(CONVERT_URL, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
    outputEl.value = data.result || '';
    setStatus('转换完成，共 ' + (data.result ? data.result.split(/\\n/).length : 0) + ' 条（已去重）');
  } catch (err) {
    setStatus('出错：' + err.message);
  } finally {
    setDisabled(false);
  }
});

copyBtn.addEventListener('click', async () => {
  if (!outputEl.value) return setStatus('没有可复制内容');
  try {
    await navigator.clipboard.writeText(outputEl.value);
    setStatus('已复制到剪贴板');
  } catch {
    setStatus('复制失败，请手动复制');
  }
});

function setStatus(t){ statusEl.textContent = t || ''; }
function setDisabled(b){
  [sourceEl, subHostEl, proxyIpEl, proxyPortEl, runBtn, copyBtn].forEach(el => el.disabled = b);
}
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[ch]));
}
