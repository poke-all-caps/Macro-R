import { Router, type IRouter } from "express";
import {
  createSession,
  isValidSession,
  deleteSession,
  getSessionFromCookie,
  requireAdmin,
} from "../adminSession";

const router: IRouter = Router();

const ADMIN_SECRET = process.env["ADMIN_SECRET"] || "";
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_FLAGS = `HttpOnly; SameSite=Strict; Path=/${IS_PROD ? "; Secure" : ""}`;

// ── HTML helpers ──────────────────────────────────────────────────────────────
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Login page HTML ───────────────────────────────────────────────────────────
function loginPage(errorMsg?: string, baseAdminPath = "/api/admin"): string {
  const formAction = `${baseAdminPath}/login`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Macro Rewards — Admin Login</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0f172a; color:#e2e8f0; font-family:system-ui,-apple-system,sans-serif;
           display:flex; justify-content:center; align-items:center; min-height:100vh; }
    .card { background:#1e293b; border-radius:16px; padding:32px; width:320px; border:1px solid #334155; }
    h2 { font-size:20px; color:#fff; margin-bottom:8px; }
    p { color:#94a3b8; font-size:13px; margin-bottom:24px; }
    input { background:#0f172a; color:#fff; border:1px solid #334155; border-radius:8px;
            padding:10px 14px; font-size:14px; width:100%; margin-bottom:16px; }
    input:focus { outline:none; border-color:#3b82f6; }
    button { background:#3b82f6; color:#fff; border:none; border-radius:8px; padding:10px;
             font-size:14px; font-weight:600; width:100%; cursor:pointer; }
    button:hover { opacity:0.85; }
    .err { color:#f87171; font-size:13px; margin-bottom:12px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Admin Access</h2>
    <p>Enter your admin secret to continue.</p>
    ${errorMsg ? `<div class="err">${esc(errorMsg)}</div>` : ""}
    <form method="POST" action="${formAction}">
      <input type="password" name="secret" placeholder="Admin secret" autofocus autocomplete="current-password">
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

// ── Dashboard page HTML ───────────────────────────────────────────────────────
function dashboardPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Macro Rewards — Key Admin</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0f172a; color:#e2e8f0; font-family:system-ui,-apple-system,sans-serif; padding:24px; }
    h1 { font-size:24px; margin-bottom:24px; color:#fff; }
    .card { background:#1e293b; border-radius:12px; padding:20px; margin-bottom:16px; border:1px solid #334155; }
    .card.expired { opacity:0.5; }
    .card.inactive { opacity:0.4; }
    .row { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .key-text { font-family:monospace; font-size:18px; color:#3b82f6; font-weight:bold; letter-spacing:2px; }
    .badge { display:inline-block; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:600; }
    .badge.active { background:#16a34a22; color:#4ade80; border:1px solid #16a34a44; }
    .badge.expired { background:#dc262622; color:#f87171; border:1px solid #dc262644; }
    .badge.inactive { background:#64748b22; color:#94a3b8; border:1px solid #64748b44; }
    .badge.type-basic { background:#64748b22; color:#94a3b8; border:1px solid #64748b44; }
    .badge.type-premium { background:#7c3aed22; color:#a78bfa; border:1px solid #7c3aed44; }
    .badge.type-unlimited { background:#d9770622; color:#fbbf24; border:1px solid #d9770644; }
    .badge.type-admin { background:#dc262622; color:#f87171; border:1px solid #dc262644; }
    .type-select { background:#0f172a; color:#fff; border:1px solid #334155; border-radius:8px; padding:4px 8px; font-size:12px; cursor:pointer; }
    button { padding:8px 16px; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; transition:opacity 0.2s; }
    button:hover { opacity:0.85; }
    .btn-primary { background:#3b82f6; color:#fff; }
    .btn-danger { background:#ef4444; color:#fff; }
    .btn-secondary { background:#334155; color:#e2e8f0; }
    .btn-success { background:#16a34a; color:#fff; }
    .btn-logout { background:#1e293b; color:#94a3b8; border:1px solid #334155; font-size:12px; padding:6px 12px; }
    input,select { background:#0f172a; color:#fff; border:1px solid #334155; border-radius:8px; padding:8px 12px; font-size:14px; width:100%; }
    input:focus,select:focus { outline:none; border-color:#3b82f6; }
    .form-group { margin-bottom:12px; }
    .form-group label { display:block; color:#94a3b8; font-size:12px; margin-bottom:4px; }
    .actions { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
    .create-form { background:#1e293b; border-radius:12px; margin-bottom:24px; border:1px solid #334155; overflow:hidden; }
    .create-form-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; cursor:pointer; user-select:none; }
    .create-form-header:hover { background:#253347; }
    .create-form-body { padding:0 20px 20px; display:none; }
    .create-form-body.open { display:block; }
    .create-btn { width:36px; height:36px; border-radius:50%; background:#3b82f6; color:#fff; border:none; font-size:22px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.2s; }
    .create-btn.open { transform:rotate(45deg); }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .no-keys { text-align:center; color:#64748b; padding:48px; }
    .stats { display:flex; gap:12px; margin-bottom:8px; flex-wrap:wrap; }
    .stat { font-size:12px; color:#94a3b8; }
    .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
    .deactivated-info { font-size:11px; color:#f87171; margin-top:4px; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1 style="margin-bottom:0">Macro Rewards — License Keys</h1>
    <form method="POST" action="/api/admin/logout" style="margin:0">
      <button type="submit" class="btn-logout">Sign Out</button>
    </form>
  </div>

  <div class="create-form">
    <div class="create-form-header" onclick="toggleCreateForm()">
      <h3 style="margin:0;color:#fff">Create New Key</h3>
      <button class="create-btn" id="createToggleBtn" type="button">+</button>
    </div>
    <div class="create-form-body" id="createFormBody">
      <div class="grid">
        <div class="form-group">
          <label>Label (optional)</label>
          <input type="text" id="newLabel" placeholder="e.g. Personal, Friend">
        </div>
        <div class="form-group">
          <label>Max Accounts</label>
          <input type="number" id="newMaxAccounts" value="3" min="1" max="50">
        </div>
        <div class="form-group">
          <label>Duration</label>
          <input type="number" id="newExpAmount" value="30" min="1">
        </div>
        <div class="form-group">
          <label>Unit</label>
          <select id="newExpUnit">
            <option value="days">Days</option>
            <option value="months">Months</option>
            <option value="years">Years</option>
          </select>
        </div>
        <div class="form-group">
          <label>Key Type</label>
          <select id="newKeyType">
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
            <option value="unlimited">Unlimited</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <button class="btn-primary" style="width:100%;height:38px" onclick="createKey()">Generate Key</button>
        </div>
      </div>
    </div>
  </div>

  <div id="keysList"></div>

  <div id="cookieModal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:999;overflow-y:auto;padding:40px">
    <div style="max-width:700px;margin:0 auto;background:#1e293b;border-radius:12px;border:1px solid #334155;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#fff;margin:0" id="cookieModalTitle">Synced Cookies</h3>
        <button class="btn-secondary" onclick="document.getElementById('cookieModal').style.display='none'" style="padding:4px 12px">Close</button>
      </div>
      <div id="cookieModalBody"></div>
    </div>
  </div>

  <h2 style="margin-top:32px;margin-bottom:16px;color:#fff">Feature Config (per Key Type)</h2>
  <div id="featureConfigList"></div>

  <script>
    const API = window.location.pathname.replace(/\\/admin\\/?$/, '');

    async function api(method, path, body) {
      const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const r = await fetch(API + path, opts);
      if (r.status === 401) { window.location.reload(); return {}; }
      return r.json();
    }

    function esc(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function toggleCreateForm() {
      var body = document.getElementById('createFormBody');
      var btn = document.getElementById('createToggleBtn');
      body.classList.toggle('open');
      btn.classList.toggle('open');
    }

    async function loadKeys() {
      const { keys } = await api('GET', '/admin/keys');
      const el = document.getElementById('keysList');
      if (!keys || keys.length === 0) {
        el.innerHTML = '<div class="no-keys">No keys created yet</div>';
        return;
      }
      el.innerHTML = keys.map(k => {
        const exp = new Date(k.expiresAt);
        const now = new Date();
        const isExpired = exp < now;
        const daysLeft = Math.ceil((exp - now) / 86400000);
        const status = !k.isActive ? 'inactive' : isExpired ? 'expired' : 'active';
        const statusText = !k.isActive ? 'Inactive' : isExpired ? 'Expired' : daysLeft + 'd left';
        const kt = esc(k.keyType || 'basic');
        const safeId = esc(k.id);
        const safeKey = esc(k.key);
        const safeLabel = esc(k.label);
        const safeMax = esc(k.maxAccounts);
        const deactivatedAt = !k.isActive && k.updatedAt ? new Date(k.updatedAt) : null;
        const deactivatedInfo = deactivatedAt ? '<div class="deactivated-info">Deactivated on ' + deactivatedAt.toLocaleString() + '</div>' : '';
        return '<div class="card ' + esc(status) + '">' +
          '<div class="row"><span class="key-text">' + safeKey + '</span><span style="display:flex;gap:6px"><span class="badge type-' + kt + '">' + kt.toUpperCase() + '</span><span class="badge ' + esc(status) + '">' + esc(statusText) + '</span></span></div>' +
          '<div class="stats">' +
            (k.label ? '<span class="stat">' + safeLabel + '</span>' : '') +
            '<span class="stat">Max: ' + safeMax + ' accounts</span>' +
            '<span class="stat">Expires: ' + esc(exp.toLocaleDateString()) + '</span>' +
            (k.boundDeviceId ? '<span class="stat">Device: ' + esc(k.boundDeviceId.slice(0,8)) + '…</span>' : '<span class="stat" style="color:#fbbf24">No device bound</span>') +
          '</div>' +
          deactivatedInfo +
          '<div class="actions">' +
            '<select class="type-select" onchange="changeType(' + JSON.stringify(safeId) + ', this.value)">' +
              ['basic','premium','unlimited','admin'].map(t => '<option value="' + t + '"' + (t === k.keyType ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>').join('') +
            '</select>' +
            '<button class="btn-secondary" onclick="extendKey(' + JSON.stringify(safeId) + ')">+30 Days</button>' +
            '<button class="btn-secondary" onclick="editAccounts(' + JSON.stringify(safeId) + ', ' + Number(k.maxAccounts) + ')">Edit Limit</button>' +
            '<button class="btn-secondary" onclick="resetDevice(' + JSON.stringify(safeId) + ')">Reset Device</button>' +
            '<button class="' + (k.isActive ? 'btn-danger' : 'btn-success') + '" onclick="toggleKey(' + JSON.stringify(safeId) + ', ' + !k.isActive + ')">' + (k.isActive ? 'Deactivate' : 'Activate') + '</button>' +
            '<button class="btn-danger" onclick="deleteKey(' + JSON.stringify(safeId) + ')">Delete</button>' +
            '<button class="btn-secondary" onclick="viewCookies(' + JSON.stringify(safeId) + ', ' + JSON.stringify(safeKey) + ')">Cookies</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function createKey() {
      const label = document.getElementById('newLabel').value;
      const maxAccounts = parseInt(document.getElementById('newMaxAccounts').value) || 3;
      const amount = parseInt(document.getElementById('newExpAmount').value) || 30;
      const unit = document.getElementById('newExpUnit').value;
      const keyType = document.getElementById('newKeyType').value;
      const d = new Date();
      if (unit === 'months') d.setMonth(d.getMonth() + amount);
      else if (unit === 'years') d.setFullYear(d.getFullYear() + amount);
      else d.setDate(d.getDate() + amount);
      const expiresAt = d.toISOString();
      await api('POST', '/admin/keys', { label, maxAccounts, expiresAt, keyType });
      document.getElementById('newLabel').value = '';
      document.getElementById('newExpAmount').value = '30';
      document.getElementById('newExpUnit').value = 'days';
      document.getElementById('newKeyType').value = 'basic';
      loadKeys();
    }

    async function changeType(id, newType) {
      await api('PUT', '/admin/keys/' + id, { keyType: newType });
      loadKeys();
    }

    async function extendKey(id) {
      const { keys } = await api('GET', '/admin/keys');
      const found = keys?.find(k => k.id === id);
      if (!found) return;
      const current = new Date(found.expiresAt || Date.now());
      const base = current > new Date() ? current : new Date();
      const newExp = new Date(base.getTime() + 30 * 86400000).toISOString();
      await api('PUT', '/admin/keys/' + id, { expiresAt: newExp });
      loadKeys();
    }

    async function editAccounts(id, current) {
      const val = prompt('Max accounts for this key:', current);
      if (val === null) return;
      const n = parseInt(val);
      if (isNaN(n) || n < 1) return alert('Invalid number');
      await api('PUT', '/admin/keys/' + id, { maxAccounts: n });
      loadKeys();
    }

    async function toggleKey(id, active) {
      if (!active) {
        if (!confirm('Are you sure you want to DEACTIVATE this key? The user will lose access immediately.')) return;
      }
      await api('PUT', '/admin/keys/' + id, { isActive: active });
      loadKeys();
    }

    async function resetDevice(id) {
      if (!confirm('Reset the device binding? The key can be activated on a new device.')) return;
      await api('PUT', '/admin/keys/' + id + '/reset-device');
      loadKeys();
    }

    async function deleteKey(id) {
      if (!confirm('Delete this key permanently?')) return;
      await api('DELETE', '/admin/keys/' + id);
      loadKeys();
    }

    function copyCookie(textarea) {
      navigator.clipboard.writeText(textarea.value).then(function() {
        var btn = textarea.nextElementSibling.firstChild;
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy Raw'; }, 1500);
      });
    }

    function copyLoginScript(textarea) {
      try {
        var raw = textarea.value;
        var cookies = JSON.parse(raw);
        var lines = Object.entries(cookies)
          .filter(function(e) { return !e[0].startsWith('_ls_') && e[1]; })
          .map(function(e) {
            var safeName = e[0].replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
            var safeVal = String(e[1]).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
            return 'document.cookie="' + safeName + '=' + safeVal + '; path=/; domain=.bing.com";';
          });
        lines.push('location.reload();');
        var script = lines.join('\\n');
        navigator.clipboard.writeText(script).then(function() {
          var btn = textarea.nextElementSibling.lastChild;
          btn.textContent = 'Copied!';
          setTimeout(function() { btn.textContent = 'Copy Login Script'; }, 1500);
        });
      } catch(e) {
        alert('Could not parse cookies: ' + e.message);
      }
    }

    async function viewCookies(keyId, keyText) {
      var modal = document.getElementById('cookieModal');
      var title = document.getElementById('cookieModalTitle');
      var body = document.getElementById('cookieModalBody');
      title.textContent = 'Cookies — ' + keyText;
      body.innerHTML = '<p style="color:#94a3b8">Loading…</p>';
      modal.style.display = 'block';

      try {
        var data = await api('GET', '/admin/keys/' + keyId + '/cookies');
        var cookies = data.cookies;
      } catch (e) {
        body.innerHTML = '<p style="color:#f87171;text-align:center;padding:24px">Failed to load cookies</p>';
        return;
      }
      if (!cookies || cookies.length === 0) {
        body.innerHTML = '<p style="color:#64748b;text-align:center;padding:24px">No synced cookies for this key</p>';
        return;
      }
      body.innerHTML = cookies.map(function(c) {
        var age = c.updatedAt ? Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 3600000) : '?';
        var ageColor = age < 12 ? '#4ade80' : age < 48 ? '#fbbf24' : '#f87171';
        return '<div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<div>' +
              '<span style="color:#fff;font-weight:600">' + esc(c.accountName || c.accountEmail) + '</span>' +
              '<span style="color:#94a3b8;font-size:12px;margin-left:8px">' + esc(c.accountEmail) + '</span>' +
            '</div>' +
            '<span style="font-size:11px;color:' + ageColor + '">' + age + 'h ago</span>' +
          '</div>' +
          '<textarea readonly style="width:100%;height:60px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:8px;font-size:11px;font-family:monospace;resize:vertical" onclick="this.select()">' + esc(c.cookies) + '</textarea>' +
          '<div style="display:flex;gap:6px;margin-top:6px">' +
            '<button class="btn-secondary" style="padding:4px 12px;font-size:12px" onclick="copyCookie(this.parentElement.previousElementSibling)">Copy Raw</button>' +
            '<button class="btn-success" style="padding:4px 12px;font-size:12px" onclick="copyLoginScript(this.parentElement.previousElementSibling)">Copy Login Script</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    loadKeys();
    loadFeatureConfig();

    async function loadFeatureConfig() {
      const { configs } = await api('GET', '/admin/feature-config');
      const el = document.getElementById('featureConfigList');
      if (!configs || configs.length === 0) {
        el.innerHTML = '<div class="no-keys">No feature configs found</div>';
        return;
      }
      const typeColors = { basic: '#94a3b8', premium: '#a78bfa', unlimited: '#fbbf24', admin: '#f87171' };
      el.innerHTML = configs.map(c => {
        const color = typeColors[c.keyType] || '#94a3b8';
        const kt = esc(c.keyType);
        return '<div class="card">' +
          '<div class="row"><span style="font-size:16px;font-weight:700;color:' + color + '">' + kt.toUpperCase() + '</span></div>' +
          '<div class="grid" style="margin-top:12px">' +
            '<div class="form-group"><label>Max Accounts</label><input type="number" value="' + Number(c.maxAccounts) + '" min="1" onchange="updateConfig(' + JSON.stringify(kt) + ', {maxAccounts: parseInt(this.value)})"></div>' +
            '<div class="form-group"><label>Max Searches</label><input type="number" value="' + Number(c.maxSearches) + '" min="1" onchange="updateConfig(' + JSON.stringify(kt) + ', {maxSearches: parseInt(this.value)})"></div>' +
            '<div class="form-group"><label>Min Delay (sec)</label><input type="number" value="' + Number(c.minDelaySeconds) + '" min="1" onchange="updateConfig(' + JSON.stringify(kt) + ', {minDelaySeconds: parseInt(this.value)})"></div>' +
            '<div class="form-group"><label>Background</label><select onchange="updateConfig(' + JSON.stringify(kt) + ', {backgroundEnabled: this.value===\'true\'})"><option value="true"' + (c.backgroundEnabled ? ' selected' : '') + '>Yes</option><option value="false"' + (!c.backgroundEnabled ? ' selected' : '') + '>No</option></select></div>' +
            '<div class="form-group"><label>Custom Queries</label><select onchange="updateConfig(' + JSON.stringify(kt) + ', {customQueriesEnabled: this.value===\'true\'})"><option value="true"' + (c.customQueriesEnabled ? ' selected' : '') + '>Yes</option><option value="false"' + (!c.customQueriesEnabled ? ' selected' : '') + '>No</option></select></div>' +
            '<div class="form-group"><label>Daily Set</label><select onchange="updateConfig(' + JSON.stringify(kt) + ', {dailySetEnabled: this.value===\'true\'})"><option value="true"' + (c.dailySetEnabled ? ' selected' : '') + '>Yes</option><option value="false"' + (!c.dailySetEnabled ? ' selected' : '') + '>No</option></select></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function updateConfig(keyType, updates) {
      await api('PUT', '/admin/feature-config/' + keyType, updates);
      loadFeatureConfig();
    }
  </script>
</body>
</html>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/admin", (req, res) => {
  const baseAdminPath = `${req.baseUrl}/admin`;
  if (!ADMIN_SECRET) {
    return res.status(503).send(loginPage("ADMIN_SECRET is not configured on the server.", baseAdminPath));
  }

  const sessionToken = getSessionFromCookie(req.headers.cookie);
  if (isValidSession(sessionToken)) {
    return res.send(dashboardPage());
  }

  return res.status(401).send(loginPage(undefined, baseAdminPath));
});

router.post("/admin/login", (req, res) => {
  const baseAdminPath = `${req.baseUrl}/admin`;
  const { secret } = req.body ?? {};
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return res.status(401).send(loginPage("Invalid secret. Please try again.", baseAdminPath));
  }
  const token = createSession();
  res.setHeader(
    "Set-Cookie",
    `admin_session=${token}; ${COOKIE_FLAGS}; Max-Age=14400`
  );
  return res.redirect(303, baseAdminPath);
});

router.post("/admin/logout", (req, res) => {
  const baseAdminPath = `${req.baseUrl}/admin`;
  const token = getSessionFromCookie(req.headers.cookie);
  deleteSession(token);
  res.setHeader(
    "Set-Cookie",
    `admin_session=; ${COOKIE_FLAGS}; Max-Age=0`
  );
  return res.redirect(303, baseAdminPath);
});

export { requireAdmin };
export default router;
