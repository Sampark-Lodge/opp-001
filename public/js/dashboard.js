(function () {
  'use strict';

  var token = localStorage.getItem('iai_token');
  if (!token) {
    window.location.href = 'signup.html';
    return;
  }

  var userData;
  try {
    userData = JSON.parse(localStorage.getItem('iai_user') || '{}');
  } catch (_) {
    userData = {};
  }

  var API_BASE = (function () {
    var host = window.location.hostname;
    var port = window.location.port;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:' + (port || 3100);
    }
    return window.location.origin;
  })();

  var els = {};

  function $(id) { return document.getElementById(id); }

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }

  function qsa(sel, ctx) { return (ctx || document).querySelectorAll(sel); }

  function api(path, opts) {
    opts = opts || {};
    return fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Request failed');
          err.data = data;
          err.status = res.status;
          if (res.status === 401) {
            localStorage.removeItem('iai_token');
            localStorage.removeItem('iai_user');
            window.location.href = 'signup.html';
          }
          throw err;
        }
        return data;
      });
    });
  }

  function showError(msg) {
    var el = $('errorMessage');
    if (el) {
      el.textContent = msg;
      el.classList.add('visible');
    }
  }

  function hideError() {
    var el = $('errorMessage');
    if (el) {
      el.textContent = '';
      el.classList.remove('visible');
    }
  }

  function loadStats() {
    els.statsTotal.textContent = '...';
    els.stats24h.textContent = '...';
    els.stats7d.textContent = '...';
    els.stats30d.textContent = '...';

    api('/api/stats').then(function (data) {
      var u = data.usage || {};
      els.statsTotal.textContent = (u.total || 0).toLocaleString();
      els.stats24h.textContent = (u.last24h || 0).toLocaleString();
      els.stats7d.textContent = (u.last7d || 0).toLocaleString();
      els.stats30d.textContent = (u.last30d || 0).toLocaleString();

      var sub = data.subscription || {};
      var plan = sub.plan || 'free';
      var status = sub.status || 'active';
      var planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

      var badge = qs('.plan-badge', els.subscriptionCard);
      badge.className = 'plan-badge plan-' + plan;
      badge.textContent = planLabel;

      els.planStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      els.planStatus.style.color = status === 'active' ? 'var(--green)' : 'var(--text-dim)';

      if (plan === 'free') {
        els.planActions.innerHTML =
          '<a href="pricing.html" class="btn btn-primary">Upgrade Plan</a>';
        els.planDetails.textContent = 'Free tier — ' + (u.total || 0) + ' API calls used';
      } else {
        var validUntil = sub.current_period_end
          ? new Date(sub.current_period_end).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric'
            })
          : 'N/A';
        els.planDetails.textContent = planLabel + ' plan';
        els.planActions.innerHTML =
          '<span style="color:var(--text-dim);font-size:0.85rem;">Valid until ' + validUntil + '</span>';
      }

      renderRecentParses(data.recentParses || []);
    }).catch(function (err) {
      showError('Failed to load stats: ' + err.message);
      els.statsTotal.textContent = '—';
      els.stats24h.textContent = '—';
      els.stats7d.textContent = '—';
      els.stats30d.textContent = '—';
    });
  }

  function renderRecentParses(parses) {
    if (!parses || parses.length === 0) {
      els.parsesBody.innerHTML =
        '<tr><td colspan="6"><div class="empty-state">' +
        '<div class="icon">📄</div>' +
        '<p>No parses yet</p>' +
        '<p style="font-size:0.85rem;margin-top:8px;">Try the <a href="demo.html" style="color:var(--primary-glow);">live demo</a> to test invoice parsing.</p>' +
        '</div></td></tr>';
      return;
    }

    var html = '';
    parses.forEach(function (p) {
      var confidence = p.confidence != null ? (p.confidence * 100).toFixed(0) + '%' : '—';
      var total = p.total_amount != null
        ? (p.currency || '$') + parseFloat(p.total_amount).toFixed(2)
        : '—';
      var date = p.created_at
        ? new Date(p.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
          })
        : '—';
      html += '<tr>' +
        '<td>' + (p.invoice_number || '—') + '</td>' +
        '<td>' + (p.vendor || '—') + '</td>' +
        '<td>' + total + '</td>' +
        '<td>' + (p.currency || '—') + '</td>' +
        '<td>' + confidence + '</td>' +
        '<td>' + date + '</td>' +
        '</tr>';
    });
    els.parsesBody.innerHTML = html;
  }

  function loadApiKeys() {
    els.keysBody.innerHTML =
      '<tr><td colspan="4"><div class="empty-state"><div class="icon">🔑</div><p>Loading keys...</p></div></td></tr>';

    api('/api/auth/me').then(function (data) {
      var keys = data.apiKeys || [];
      renderKeys(keys);

      if (data.user) {
        var displayName = data.user.name || data.user.email || 'User';
        els.userName.textContent = displayName;
      }
    }).catch(function (err) {
      showError('Failed to load API keys: ' + err.message);
      els.keysBody.innerHTML =
        '<tr><td colspan="4"><div class="empty-state"><div class="icon">⚠️</div><p>Could not load keys</p></div></td></tr>';
    });
  }

  function renderKeys(keys) {
    if (!keys || keys.length === 0) {
      els.keysBody.innerHTML =
        '<tr><td colspan="4"><div class="empty-state"><div class="icon">🔑</div><p>No API keys yet. Generate one below.</p></div></td></tr>';
      return;
    }

    var html = '';
    keys.forEach(function (k) {
      var truncated = k.key.length > 16
        ? k.key.substring(0, 8) + '...' + k.key.slice(-4)
        : k.key;
      var created = k.created_at
        ? new Date(k.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
          })
        : '—';
      var lastUsed = k.last_used_at
        ? new Date(k.last_used_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
          })
        : 'Never';
      var statusClass = k.is_active ? 'status-active' : 'status-inactive';
      var statusText = k.is_active ? 'Active' : 'Inactive';

      html += '<tr>' +
        '<td>' +
          '<div class="key-label">' + escHtml(k.label || 'Untitled') + '</div>' +
          '<div class="api-key-display" data-fullkey="' + escAttr(k.key) + '" onclick="window.copyKey(this)">' +
            escHtml(truncated) +
          '</div>' +
        '</td>' +
        '<td>' + created + '</td>' +
        '<td>' + lastUsed + '</td>' +
        '<td>' +
          '<span class="status-dot ' + statusClass + '"></span> ' + statusText +
        '</td>' +
        '<td class="key-actions-col">' +
          '<button class="btn btn-outline btn-sm" onclick="window.copyKey(this.parentElement.parentElement.querySelector(\'.api-key-display\'))">Copy</button>' +
          '<button class="btn btn-outline btn-sm btn-danger" onclick="window.revokeKey(' + k.id + ')">Revoke</button>' +
        '</td>' +
        '</tr>';
    });
    els.keysBody.innerHTML = html;
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.copyKey = function (el) {
    var fullKey = el.dataset.fullkey || el.textContent;
    navigator.clipboard.writeText(fullKey).then(function () {
      var orig = el.textContent;
      el.textContent = 'Copied!';
      el.style.borderColor = 'var(--green)';
      el.style.color = 'var(--green)';
      setTimeout(function () {
        el.textContent = orig + ' ';
        el.style.borderColor = '';
        el.style.color = '';
      }, 1500);
    }).catch(function () {
      showError('Failed to copy to clipboard');
    });
  };

  window.revokeKey = function (keyId) {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }
    api('/api/keys/' + keyId, { method: 'DELETE' }).then(function () {
      loadApiKeys();
    }).catch(function (err) {
      showError('Failed to revoke key: ' + err.message);
    });
  };

  function generateKey() {
    var label = prompt('Name this API key:');
    if (label === null) return;
    label = label.trim() || 'Untitled';

    api('/api/keys', { method: 'POST', body: { label: label } }).then(function (data) {
      loadApiKeys();
      if (data.key) {
        navigator.clipboard.writeText(data.key).then(function () {
          showError('Key created and copied to clipboard: ' + data.key.substring(0, 12) + '...');
        }).catch(function () {
          showError('Key created: ' + data.key.substring(0, 12) + '... (copy manually)');
        });
      }
    }).catch(function (err) {
      showError('Failed to generate key: ' + err.message);
    });
  }

  $('generateKeyBtn').addEventListener('click', generateKey);

  function signOut() {
    localStorage.removeItem('iai_token');
    localStorage.removeItem('iai_user');
    window.location.href = 'signup.html';
  }

  $('signOutBtn').addEventListener('click', function (e) {
    e.preventDefault();
    signOut();
  });

  $('userDropdownToggle').addEventListener('click', function () {
    var menu = $('userDropdownMenu');
    menu.classList.toggle('active');
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.user-dropdown')) {
      var menu = $('userDropdownMenu');
      if (menu) menu.classList.remove('active');
    }
  });

  qs('.nav-toggle').addEventListener('click', function () {
    qs('.nav-links').classList.toggle('active');
    qs('.nav-cta').classList.toggle('active');
  });

  els.statsTotal = $('statsTotal');
  els.stats24h = $('stats24h');
  els.stats7d = $('stats7d');
  els.stats30d = $('stats30d');
  els.keysBody = $('keysBody');
  els.parsesBody = $('parsesBody');
  els.subscriptionCard = $('subscriptionCard');
  els.planStatus = $('planStatus');
  els.planDetails = $('planDetails');
  els.planActions = $('planActions');
  els.userName = $('userName');

  hideError();
  loadStats();
  loadApiKeys();
})();
