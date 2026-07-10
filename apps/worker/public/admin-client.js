// BhojPatra Cloud Admin - Client JavaScript v2
// Served as a static file from the Worker to avoid template-literal syntax issues

const api = function(p, o) {
  o = o || {};
  var headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (o.headers) {
    for (var k in o.headers) { if (o.headers.hasOwnProperty(k)) headers[k] = o.headers[k]; }
  }
  var opts = { credentials: 'include', headers: headers };
  if (o.method) opts.method = o.method;
  if (o.body !== undefined) opts.body = o.body;
  return fetch(p, opts);
};

var esc = function(v) {
  var str = String(v != null ? v : '');
  return str.replace(/[&<>"']/g, function(c) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
};

var dt = function(v) {
  return v ? new Date(v).toLocaleDateString('en-IN') : '--';
};

var ymd = function(date) {
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};

var parseYmd = function(value, endOfDay) {
  if (!value) return null;
  var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    var parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
};

var addMonths = function(value, months) {
  var base = parseYmd(value, false) || new Date();
  var result = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  result.setMonth(result.getMonth() + months);
  return ymd(result);
};

var daysUntil = function(value) {
  var target = parseYmd(value, false);
  if (!target) return null;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

var rs = function(v) {
  if (v === undefined || v === null || v === '') return '--';
  return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:2 }).format(Number(v));
};

var $ = function(id) { return document.getElementById(id); };

var msg = function(el, text, type) {
  el.textContent = '';
  el.className = 'msg';
  if (text) {
    el.textContent = text;
    el.className = 'msg show msg-' + (type || 'ok');
  }
};

var editId = null;
var staffMap = new Map();

function vals() {
  var u = staffMap.get(editId) || {};
  return {
    id: editId,
    tenantId: u.tenantId || '',
    restaurantName: $('fRestaurantName').value,
    name: $('fName').value,
    email: $('fEmail').value,
    phone: $('fPhone').value,
    password: $('fPassword').value,
    pin: $('fPin').value,
    accessStartsAt: $('fAccessStartsAt').value,
    accessEndsAt: $('fAccessEndsAt').value,
    paymentDate: $('fPaymentDate').value,
    paymentAmount: $('fPaymentAmount').value,
    renewalDate: $('fRenewalDate').value,
    renewalAmount: $('fRenewalAmount').value,
    paymentReceived: $('fPaymentReceived').checked,
    renewalPaymentReceived: $('fRenewalPaymentReceived').checked,
    paymentNote: $('fPaymentNote').value
  };
}

function setForm(user) {
  editId = user ? user.id : null;
  $('fRestaurantName').value = user ? (user.restaurantName || '') : '';
  $('fName').value = user ? (user.name || '') : '';
  $('fEmail').value = user ? (user.email || '') : '';
  $('fPhone').value = user ? (user.phone || '') : '';
  $('fPassword').value = '';
  $('fPassword').required = !user;
  $('fPin').value = '';
  $('fAccessStartsAt').value = user ? (user.accessStartsAt || '') : '';
  $('fAccessEndsAt').value = user ? (user.accessEndsAt || '') : '';
  $('fPaymentDate').value = user ? (user.paymentDate || '') : '';
  $('fPaymentAmount').value = user ? (user.paymentAmount != null ? user.paymentAmount : '') : '';
  $('fRenewalDate').value = user ? (user.renewalDate || '') : '';
  $('fRenewalAmount').value = user ? (user.renewalAmount != null ? user.renewalAmount : '') : '';
  $('fPaymentReceived').checked = user ? user.paymentReceived !== false : true;
  $('fRenewalPaymentReceived').checked = user ? user.renewalPaymentReceived !== false : true;
  $('fPaymentNote').value = user ? (user.paymentNote || '') : '';
  $('formTitle').textContent = user ? 'Edit Customer: ' + (user.restaurantName || user.name) : 'Create Customer Account';
  $('btnSubmitCustomer').textContent = user ? 'Save Changes' : 'Create Customer Account';
  $('btnCancelForm').style.display = user ? '' : 'none';
  $('pwHint').textContent = user ? '(leave empty to keep)' : '*';
  $('fPassword').required = !user && !$('fPhone').value && !$('fEmail').value;
  syncDateSummary();
}

function clearForm() {
  editId = null;
  setForm(null);
  $('credsBox').style.display = 'none';
  msg($('formMsg'), '');
}

function syncDateSummary() {
  var summary = $('dateHelperSummary');
  if (!summary) return;
  var start = $('fAccessStartsAt').value || $('fPaymentDate').value;
  var renewal = $('fRenewalDate').value;
  var accessEnd = $('fAccessEndsAt').value;
  if (!start && !renewal && !accessEnd) {
    summary.textContent = 'Pick a quick cycle or enter the dates manually.';
    return;
  }
  var renewalDays = daysUntil(renewal);
  var accessDays = daysUntil(accessEnd);
  var parts = [];
  if (start) parts.push('Start: ' + dt(start));
  if (renewal) parts.push('Renewal: ' + dt(renewal) + (renewalDays !== null ? ' (' + (renewalDays === 0 ? 'due today' : renewalDays > 0 ? renewalDays + ' day(s) left' : Math.abs(renewalDays) + ' day(s) overdue') + ')' : ''));
  if (accessEnd) parts.push('Access ends: ' + dt(accessEnd) + (accessDays !== null ? ' (' + (accessDays === 0 ? 'today' : accessDays > 0 ? accessDays + ' day(s) left' : Math.abs(accessDays) + ' day(s) overdue') + ')' : ''));
  summary.textContent = parts.join(' | ');
}

function applyRenewalCycle(months) {
  var base = $('fPaymentDate').value || $('fAccessStartsAt').value || ymd(new Date());
  if (!$('fPaymentDate').value) $('fPaymentDate').value = base;
  if (!$('fAccessStartsAt').value) $('fAccessStartsAt').value = base;
  var target = addMonths(base, months);
  $('fRenewalDate').value = target;
  $('fAccessEndsAt').value = target;
  syncDateSummary();
}

function showModal(title, body, actions) {
  $('modalContent').innerHTML = '<h3>' + esc(title) + '</h3><div>' + body + '</div><div class="actions">' + actions + '</div>';
  $('modalOverlay').classList.add('show');
}

function closeModal() {
  $('modalOverlay').classList.remove('show');
}

async function loadStaff() {
  var res = await api('/api/v1/admin/staff');
  if (res.status === 401) { showLogin(true); return; }
  var data = await res.json();
  if (!res.ok) { msg($('topMsg'), data.error || 'Failed to load customers', 'err'); return; }
  var staff = (data.staff || []).filter(function(u) { return u.tenantId !== 'platform'; });
  staffMap.clear();
  staff.forEach(function(u) { staffMap.set(u.id, u); });

  var active = staff.filter(function(u) { return u.status === 'active'; }).length;
  var halted = staff.filter(function(u) { return u.status === 'halted'; }).length;
  var expiring = staff.filter(function(u) {
    var accessDays = daysUntil(u.accessEndsAt);
    var renewalDays = daysUntil(u.renewalDate);
    return (accessDays !== null && accessDays >= 0 && accessDays <= 10) || (renewalDays !== null && renewalDays >= 0 && renewalDays <= 10);
  }).length;
  var totalData = staff.reduce(function(s, u) { return s + ((u.dataCounts && u.dataCounts.score) || 0); }, 0);

  $('statsRow').innerHTML = [
    { v: staff.length, l: 'Total Customers' },
    { v: active, l: 'Active' },
    { v: halted, l: 'Halted' },
    { v: expiring, l: 'Expiring Soon' },
    { v: totalData, l: 'Data Score' }
  ].map(function(s) {
    return '<div class="stat-card"><div class="stat-val">' + s.v + '</div><div class="stat-lbl">' + s.l + '</div></div>';
  }).join('');

  $('staffRows').innerHTML = staff.length ? staff.map(function(u) {
    var c = u.dataCounts || {};
    var now = Date.now();
    var endsAt = u.accessEndsAt ? new Date(u.accessEndsAt).getTime() : 0;
    var accessDays = daysUntil(u.accessEndsAt);
    var renewalDays = daysUntil(u.renewalDate);
    var accessClass = endsAt && endsAt < now ? 'pill-inactive' : endsAt && endsAt < now + 10*86400000 ? 'pill-halted' : 'pill-active';
    var statusPill = u.status === 'active' ? 'pill-active' : u.status === 'halted' ? 'pill-halted' : 'pill-inactive';
    var statusActionLabel = u.status === 'active' ? 'Halt Account' : u.status === 'halted' ? 'Reactivate' : 'Activate';
    var renewalHint = renewalDays === null ? '' : renewalDays < 0 ? '<br><span style="font-size:11px;color:var(--bad);font-weight:800">Renewal overdue by ' + Math.abs(renewalDays) + ' day(s)</span>' : renewalDays <= 10 ? '<br><span style="font-size:11px;color:#9a3412;font-weight:800">Renewal due in ' + renewalDays + ' day(s)</span>' : '';
    var accessHint = accessDays === null ? '' : accessDays < 0 ? '<br><span style="font-size:11px;color:var(--bad);font-weight:800">Access expired</span>' : accessDays <= 10 ? '<br><span style="font-size:11px;color:#92400e;font-weight:800">Access ends in ' + accessDays + ' day(s)</span>' : '';
    return '<tr>' +
      '<td><strong>' + esc(u.restaurantName || u.name || '-') + '</strong><br><span style="font-size:11px;color:var(--muted)">' + esc(u.tenantId) + '</span></td>' +
      '<td>' + esc(u.email || u.phone || '-') + '<br><span class="pill pill-paid">' + esc(u.role) + '</span></td>' +
      '<td><span class="pill ' + statusPill + '">' + esc(u.status) + '</span>' + (u.paymentNote ? '<br><span style="font-size:11px">' + esc(u.paymentNote) + '</span>' : '') + '</td>' +
      '<td><span class="pill ' + accessClass + '">' + esc(dt(u.accessEndsAt)) + '</span><br><span style="font-size:11px;color:var(--muted)">Starts ' + esc(dt(u.accessStartsAt)) + '</span>' + accessHint + '</td>' +
      '<td>Paid: ' + esc(dt(u.paymentDate)) + ' &middot; ' + esc(rs(u.paymentAmount)) + '<br>Renewal: ' + esc(dt(u.renewalDate)) + ' &middot; ' + esc(rs(u.renewalAmount)) + renewalHint + '</td>' +
      '<td>Menu ' + (c.menuItems || 0) + ' | Orders ' + (c.orders || 0) + ' | KOTs ' + (c.kots || 0) + '<br>Payments ' + (c.payments || 0) + ' | Tables ' + (c.tables || 0) + ' | Score ' + (c.score || 0) + (c.updatedAt ? '<br><span style="font-size:10px;color:var(--muted)">Sync: ' + esc(new Date(c.updatedAt).toLocaleString('en-IN')) + '</span>' : '') + '</td>' +
      '<td><div class="actions-cell">' +
        '<button class="btn-sm btn-ghost" data-edit="' + esc(u.id) + '">Edit</button>' +
        '<div class="dropdown"><button class="btn-sm btn-ghost" data-more="' + esc(u.id) + '">More \u25BE</button><div class="dropdown-menu" id="menu-' + esc(u.id) + '">' +
          '<button data-action="status" data-id="' + esc(u.id) + '" data-cur="' + esc(u.status) + '">' + statusActionLabel + '</button>' +
          '<button data-action="pwd" data-id="' + esc(u.id) + '">Change Password</button>' +
          '<button data-action="alert" data-id="' + esc(u.id) + '">Send Renewal Alert</button>' +
          '<button data-action="download" data-id="' + esc(u.id) + '">Download Cloud Data</button>' +
          '<button data-action="cleardata" data-id="' + esc(u.id) + '" class="danger-item">Clear Cloud Data</button>' +
          '<button data-action="delete" data-id="' + esc(u.id) + '" class="danger-item">Delete Account</button>' +
        '</div></div>' +
      '</div></td>' +
      '</tr>';
  }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">No customers yet. Create one above.</td></tr>';
}

var openMenu = null;

document.addEventListener('click', function(e) {
  var moreBtn = e.target.closest('[data-more]');
  if (moreBtn) {
    var id = moreBtn.getAttribute('data-more');
    var menu = document.getElementById('menu-' + id);
    if (openMenu && openMenu !== menu) openMenu.classList.remove('show');
    menu.classList.toggle('show');
    openMenu = menu.classList.contains('show') ? menu : null;
    e.stopPropagation();
    return;
  }
  var actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    handleAction(actionBtn.getAttribute('data-action'), actionBtn.getAttribute('data-id'), actionBtn.getAttribute('data-cur'));
    if (openMenu) { openMenu.classList.remove('show'); openMenu = null; }
    return;
  }
  var editBtn = e.target.closest('[data-edit]');
  if (editBtn) {
    var user = staffMap.get(editBtn.getAttribute('data-edit'));
    if (user) { setForm(user); $('formPanel').scrollIntoView({ behavior: 'smooth' }); }
    return;
  }
  if (openMenu && !e.target.closest('.dropdown')) { openMenu.classList.remove('show'); openMenu = null; }
});

async function handleAction(action, id, cur) {
  var user = staffMap.get(id);
  if (!user) return;

  if (action === 'status') {
    var newStatus = cur === 'active' ? 'halted' : cur === 'halted' ? 'active' : 'active';
    var res = await api('/api/v1/admin/staff/' + encodeURIComponent(id) + '/status', { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { msg($('topMsg'), d.error || 'Failed', 'err'); return; }
    msg($('topMsg'), 'Status changed to ' + newStatus);
    loadStaff();
  }

  if (action === 'pwd') {
    showModal('Change Password for ' + (user.restaurantName || user.name),
      '<div class="field"><label>New Password</label><input id="modalPwd" type="text" /></div>',
      '<button class="btn-sm btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-sm btn-primary" onclick="doChangePwd(\'' + esc(id) + '\')">Update</button>');
  }

  if (action === 'alert') {
    var res = await api('/api/v1/admin/staff/' + encodeURIComponent(id) + '/alert', { method: 'POST' });
    var d = await res.json().catch(function() { return {}; });
    msg($('topMsg'), res.ok ? 'Renewal alert sent!' : (d.error || 'Alert failed'), res.ok ? 'ok' : 'err');
  }

  if (action === 'download') {
    var res = await api('/api/v1/admin/staff/' + encodeURIComponent(id) + '/data');
    var d = await res.json();
    var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bhojpatra-' + (user.restaurantName || user.tenantId).replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    msg($('topMsg'), 'Data downloaded.');
  }

  if (action === 'cleardata') {
    showModal('Clear Cloud Data',
      '<p>This will delete ALL cloud data (menu, orders, KOTs, payments, tables) for <strong>' + esc(user.restaurantName || user.name) + '</strong>. The account will remain.</p><p style="color:var(--bad);font-weight:800">This cannot be undone.</p>',
      '<button class="btn-sm btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-sm btn-danger" onclick="doClearData(\'' + esc(id) + '\')">Clear All Data</button>');
  }

  if (action === 'delete') {
    showModal('Delete Customer Account',
      '<p>This will permanently delete <strong>' + esc(user.restaurantName || user.name) + '</strong> and ALL their cloud data.</p><p style="color:var(--bad);font-weight:800">Type DELETE to confirm:</p><input id="delConfirm" placeholder="DELETE" style="width:100%;margin-top:8px;border:2px solid var(--bad);border-radius:10px;padding:10px;font:inherit" />',
      '<button class="btn-sm btn-ghost" onclick="closeModal()">Cancel</button><button class="btn-sm btn-danger" onclick="doDelete(\'' + esc(id) + '\')">Delete Forever</button>');
  }
}

async function doChangePwd(id) {
  var pwdEl = document.getElementById('modalPwd');
  var pwd = pwdEl ? pwdEl.value : '';
  if (!pwd) { alert('Enter a password'); return; }
  var res = await api('/api/v1/admin/staff/' + encodeURIComponent(id) + '/password', { method: 'PUT', body: JSON.stringify({ password: pwd }) });
  var d = await res.json().catch(function() { return {}; });
  if (!res.ok) { msg($('topMsg'), d.error || 'Failed', 'err'); return; }
  closeModal();
  msg($('topMsg'), 'Password updated. New password: ' + (d.password || pwd));
}

async function doClearData(id) {
  var res = await api('/api/v1/admin/staff/' + encodeURIComponent(id) + '/data', { method: 'DELETE' });
  var d = await res.json().catch(function() { return {}; });
  if (!res.ok) { msg($('topMsg'), d.error || 'Failed', 'err'); return; }
  closeModal();
  msg($('topMsg'), 'Cloud data cleared.');
  loadStaff();
}

async function doDelete(id) {
  var confirmEl = document.getElementById('delConfirm');
  var confirmVal = confirmEl ? confirmEl.value : '';
  if (confirmVal !== 'DELETE') { alert('Type DELETE to confirm'); return; }
  var res = await api('/api/v1/admin/staff/' + encodeURIComponent(id) + '?scope=tenant', { method: 'DELETE' });
  var d = await res.json().catch(function() { return {}; });
  if (!res.ok) { msg($('topMsg'), d.error || 'Delete failed', 'err'); closeModal(); return; }
  closeModal();
  msg($('topMsg'), 'Customer deleted.');
  loadStaff();
}

function showLogin(show) {
  $('loginPage').style.display = show ? 'flex' : 'none';
  $('adminBody').classList.toggle('active', !show);
}

$('loginBtn').addEventListener('click', async function() {
  var errEl = $('loginErr');
  errEl.className = 'login-err';
  var res = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrPhone: $('loginEmail').value, password: $('loginPass').value })
  });
  var d = await res.json().catch(function() { return {}; });
  if (!res.ok) {
    errEl.textContent = d.error || 'Login failed';
    errEl.className = 'login-err show err';
    return;
  }
  if (d.user && d.user.tenantId !== 'platform') {
    errEl.textContent = 'Only platform admin can access.';
    errEl.className = 'login-err show err';
    return;
  }
  showLogin(false);
  loadStaff();
});

$('loginPass').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') $('loginBtn').click();
});

$('btnLogout').addEventListener('click', async function() {
  await api('/api/v1/auth/logout', { method: 'POST' });
  showLogin(true);
});

$('btnSubmitCustomer').addEventListener('click', async function() {
  var v = vals();
  if (!v.restaurantName || !v.name) { msg($('formMsg'), 'Restaurant name and owner name are required.', 'err'); return; }
  if (!editId && !v.email && !v.phone) { msg($('formMsg'), 'Email or phone is required.', 'err'); return; }
  if (!editId && !v.password) { msg($('formMsg'), 'Password is required for new accounts.', 'err'); return; }

  var body = {
    restaurantName: v.restaurantName,
    name: v.name,
    role: 'admin',
    status: 'active',
    email: v.email,
    phone: v.phone,
    pin: v.pin,
    accessStartsAt: v.accessStartsAt,
    accessEndsAt: v.accessEndsAt,
    paymentDate: v.paymentDate,
    renewalDate: v.renewalDate,
    paymentNote: v.paymentNote,
    paymentReceived: v.paymentReceived,
    renewalPaymentReceived: v.renewalPaymentReceived
  };
  if (v.password) body.password = v.password;
  if (v.paymentAmount && Number(v.paymentAmount) > 0) body.paymentAmount = Number(v.paymentAmount);
  if (v.renewalAmount && Number(v.renewalAmount) > 0) body.renewalAmount = Number(v.renewalAmount);
  if (v.tenantId) body.tenantId = v.tenantId;

  var method = editId ? 'PUT' : 'POST';
  var path = editId ? '/api/v1/admin/staff/' + encodeURIComponent(editId) : '/api/v1/admin/staff';
  if (!editId) delete body.tenantId;

  var res = await api(path, { method: method, body: JSON.stringify(body) });
  var d = await res.json().catch(function() { return {}; });
  if (!res.ok) { msg($('formMsg'), d.error || 'Failed', 'err'); return; }

  if (!editId && d.setupJson) {
    $('credsBox').style.display = 'block';
    $('credsBox').textContent = 'Cloud Sync Credentials\n' +
      'Server URL: ' + (d.serverUrl || location.origin) + '\n' +
      'Tenant ID: ' + d.tenantId + '\n' +
      'Outlet ID: ' + d.outletId + '\n' +
      'Login: ' + d.login + '\n' +
      'Password: ' + d.password + '\n\n' +
      'JSON: ' + JSON.stringify(d.setupJson, null, 2);
  }

  msg($('formMsg'), editId ? 'Customer updated.' : 'Customer created!', 'ok');
  clearForm();
  loadStaff();
});

$('btnClearForm').addEventListener('click', clearForm);
$('btnCancelForm').addEventListener('click', clearForm);
$('btnRefresh').addEventListener('click', function() { loadStaff(); });

document.querySelectorAll('[data-cycle-base]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var today = ymd(new Date());
    $('fPaymentDate').value = today;
    $('fAccessStartsAt').value = today;
    syncDateSummary();
  });
});

document.querySelectorAll('[data-cycle-months]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    applyRenewalCycle(Number(btn.getAttribute('data-cycle-months') || '0'));
  });
});

['fPaymentDate', 'fAccessStartsAt', 'fAccessEndsAt', 'fRenewalDate'].forEach(function(id) {
  var input = $(id);
  if (input) input.addEventListener('change', syncDateSummary);
});

$('btnSendDigest').addEventListener('click', async function() {
  $('btnSendDigest').disabled = true;
  var res = await api('/api/v1/admin/send-renewal-alerts', { method: 'POST' });
  var d = await res.json().catch(function() { return {}; });
  msg($('topMsg'), res.ok ? 'Renewal digest sent!' : (d.error || 'Failed'), res.ok ? 'ok' : 'err');
  $('btnSendDigest').disabled = false;
});

$('btnTestEmail').addEventListener('click', async function() {
  $('btnTestEmail').disabled = true;
  var res = await api('/api/v1/admin/test-email', { method: 'POST' });
  var d = await res.json().catch(function() { return {}; });
  msg($('topMsg'), res.ok ? 'Test email sent!' : (d.error || 'Failed'), res.ok ? 'ok' : 'err');
  $('btnTestEmail').disabled = false;
});

$('modalOverlay').addEventListener('click', function(e) {
  if (e.target === $('modalOverlay')) closeModal();
});

showLogin(true);
