import { Router, type IRouter } from "express";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADMIN_SECRET = process.env["ADMIN_SECRET"] || "";

router.get("/admin", (req, res) => {
  const secret = req.query.secret as string;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).send(`
      <html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2>Admin Access Required</h2>
          <p style="color:#94a3b8">Add ?secret=YOUR_ADMIN_SECRET to the URL</p>
        </div>
      </body></html>
    `);
  }

  res.send(`<!DOCTYPE html>
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
    .label { color:#94a3b8; font-size:13px; }
    .value { color:#fff; font-size:14px; }
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
    input,select { background:#0f172a; color:#fff; border:1px solid #334155; border-radius:8px; padding:8px 12px; font-size:14px; width:100%; }
    input:focus,select:focus { outline:none; border-color:#3b82f6; }
    .form-group { margin-bottom:12px; }
    .form-group label { display:block; color:#94a3b8; font-size:12px; margin-bottom:4px; }
    .actions { display:flex; gap:8px; margin-top:12px; }
    .create-form { background:#1e293b; border-radius:12px; padding:20px; margin-bottom:24px; border:1px solid #334155; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .no-keys { text-align:center; color:#64748b; padding:48px; }
    .stats { display:flex; gap:12px; margin-bottom:8px; }
    .stat { font-size:12px; color:#94a3b8; }
  </style>
</head>
<body>
  <h1>Macro Rewards — License Keys</h1>

  <div class="create-form">
    <h3 style="margin-bottom:12px;color:#fff">Create New Key</h3>
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
        <label>Expires In (days)</label>
        <input type="number" id="newExpDays" value="30" min="1">
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

  <div id="keysList"></div>

  <script>
    const SECRET = "${ADMIN_SECRET}";
    const API = window.location.pathname.replace(/\\/admin$/, '');

    async function api(method, path, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': SECRET } };
      if (body) opts.body = JSON.stringify(body);
      const r = await fetch(API + path, opts);
      return r.json();
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
        const kt = k.keyType || 'basic';
        return '<div class="card ' + status + '">' +
          '<div class="row"><span class="key-text">' + k.key + '</span><span style="display:flex;gap:6px"><span class="badge type-' + kt + '">' + kt.toUpperCase() + '</span><span class="badge ' + status + '">' + statusText + '</span></span></div>' +
          '<div class="stats">' +
            (k.label ? '<span class="stat">' + k.label + '</span>' : '') +
            '<span class="stat">Max: ' + k.maxAccounts + ' accounts</span>' +
            '<span class="stat">Expires: ' + exp.toLocaleDateString() + '</span>' +
          '</div>' +
          '<div class="actions">' +
            '<select class="type-select" onchange="changeType(\\'' + k.id + '\\', this.value)">' +
              ['basic','premium','unlimited','admin'].map(t => '<option value="' + t + '"' + (t === kt ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>').join('') +
            '</select>' +
            '<button class="btn-secondary" onclick="extendKey(\\'' + k.id + '\\')">+30 Days</button>' +
            '<button class="btn-secondary" onclick="editAccounts(\\'' + k.id + '\\', ' + k.maxAccounts + ')">Edit Limit</button>' +
            '<button class="' + (k.isActive ? 'btn-danger' : 'btn-success') + '" onclick="toggleKey(\\'' + k.id + '\\', ' + !k.isActive + ')">' + (k.isActive ? 'Deactivate' : 'Activate') + '</button>' +
            '<button class="btn-danger" onclick="deleteKey(\\'' + k.id + '\\')">Delete</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function createKey() {
      const label = document.getElementById('newLabel').value;
      const maxAccounts = parseInt(document.getElementById('newMaxAccounts').value) || 3;
      const days = parseInt(document.getElementById('newExpDays').value) || 30;
      const keyType = document.getElementById('newKeyType').value;
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      await api('POST', '/admin/keys', { label, maxAccounts, expiresAt, keyType });
      document.getElementById('newLabel').value = '';
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
      await api('PUT', '/admin/keys/' + id, { isActive: active });
      loadKeys();
    }

    async function deleteKey(id) {
      if (!confirm('Delete this key permanently?')) return;
      await api('DELETE', '/admin/keys/' + id);
      loadKeys();
    }

    loadKeys();
  </script>
</body>
</html>`);
});

export default router;
