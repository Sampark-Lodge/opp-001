(function () {
  'use strict';

  const API_BASE = (function () {
    var host = window.location.hostname;
    var port = window.location.port;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:' + (port || 3000);
    }
    return window.location.origin;
  })();

  var tabs = document.querySelectorAll('.auth-tab');
  var panels = {
    signup: document.getElementById('panel-signup'),
    login: document.getElementById('panel-login')
  };
  var signupForm = document.getElementById('signupForm');
  var loginForm = document.getElementById('loginForm');
  var signupError = document.getElementById('signupError');
  var loginError = document.getElementById('loginError');
  var signupSubmit = document.getElementById('signupSubmit');
  var loginSubmit = document.getElementById('loginSubmit');

  function switchTab (tabId) {
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });
    Object.keys(panels).forEach(function (key) {
      panels[key].classList.toggle('active', key === tabId);
    });
    [signupError, loginError].forEach(function (el) {
      el.classList.remove('visible');
      el.textContent = '';
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      switchTab(tab.dataset.tab);
    });
  });

  function showError (el, msg) {
    el.textContent = msg;
    el.classList.add('visible');
  }

  function setLoading (btn, loading) {
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
  }

  function apiRequest (path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Request failed');
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function handleSuccess (data) {
    if (data.token) {
      localStorage.setItem('iai_token', data.token);
    }
    if (data.user) {
      localStorage.setItem('iai_user', JSON.stringify(data.user));
    }
    window.location.href = 'dashboard.html';
  }

  signupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    signupError.classList.remove('visible');
    signupError.textContent = '';

    var email = document.getElementById('signupEmail').value.trim();
    var password = document.getElementById('signupPassword').value;
    var name = document.getElementById('signupName').value.trim();
    var company = document.getElementById('signupCompany').value.trim();

    if (!email) {
      showError(signupError, 'Please enter your email address.');
      return;
    }
    if (!password || password.length < 6) {
      showError(signupError, 'Password must be at least 6 characters.');
      return;
    }

    setLoading(signupSubmit, true);

    var payload = { email: email, password: password };
    if (name) payload.name = name;
    if (company) payload.company = company;

    apiRequest('/api/auth/signup', payload).then(function (data) {
      handleSuccess(data);
    }).catch(function (err) {
      var msg = err.data && err.data.error ? err.data.error : 'Something went wrong. Please try again.';
      showError(signupError, msg);
      setLoading(signupSubmit, false);
    });
  });

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    loginError.classList.remove('visible');
    loginError.textContent = '';

    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;

    if (!email) {
      showError(loginError, 'Please enter your email address.');
      return;
    }
    if (!password) {
      showError(loginError, 'Please enter your password.');
      return;
    }

    setLoading(loginSubmit, true);

    apiRequest('/api/auth/login', { email: email, password: password }).then(function (data) {
      handleSuccess(data);
    }).catch(function (err) {
      var msg = err.data && err.data.error ? err.data.error : 'Invalid email or password.';
      showError(loginError, msg);
      setLoading(loginSubmit, false);
    });
  });

  var toggle = document.querySelector('.nav-toggle');
  var navLinks = document.querySelector('.nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', function () {
      navLinks.classList.toggle('active');
    });
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('active');
      });
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
})();
