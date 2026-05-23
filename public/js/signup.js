(function () {
  'use strict';

  const API_BASE = (function () {
    var host = window.location.hostname;
    var port = window.location.port;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:' + (port || 3100);
    }
    return window.location.origin;
  })();

  var googleCustomBtn = document.getElementById('googleCustomBtn');
  var mockAuthModal = document.getElementById('mockAuthModal');
  var closeMockBtn = document.getElementById('closeMockBtn');
  var submitMockBtn = document.getElementById('submitMockBtn');
  var authError = document.getElementById('authError');

  function showError (el, msg) {
    el.textContent = msg;
    el.classList.add('visible');
  }

  function setLoadingGoogle(loading) {
    if (googleCustomBtn) {
      googleCustomBtn.disabled = loading;
      const btnText = googleCustomBtn.querySelector('.btn-text');
      if (btnText) {
        btnText.textContent = loading ? 'Signing in...' : 'Continue with Google';
      }
    }
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
    if (data.apiKey) {
      localStorage.setItem('iai_api_key', data.apiKey);
    }
    window.location.href = 'dashboard.html';
  }

  // Handle response from Google Sign-In (official callback)
  window.handleCredentialResponse = function (response) {
    if (!response.credential) {
      showError(authError, 'No credential returned from Google.');
      return;
    }
    setLoadingGoogle(true);
    apiRequest('/api/auth/google', { credential: response.credential })
      .then(handleSuccess)
      .catch(function (err) {
        showError(authError, err.message || 'Google Sign-in failed.');
        setLoadingGoogle(false);
      });
  };

  if (googleCustomBtn) {
    googleCustomBtn.addEventListener('click', function () {
      if (authError) {
        authError.classList.remove('visible');
        authError.textContent = '';
      }
      
      // Try to trigger Google accounts prompt
      try {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          window.google.accounts.id.prompt();
        } else {
          // Fallback to mock modal
          if (mockAuthModal) mockAuthModal.style.display = 'flex';
        }
      } catch (e) {
        if (mockAuthModal) mockAuthModal.style.display = 'flex';
      }
    });
  }

  if (closeMockBtn && mockAuthModal) {
    closeMockBtn.addEventListener('click', function () {
      mockAuthModal.style.display = 'none';
    });
  }

  if (submitMockBtn && mockAuthModal) {
    submitMockBtn.addEventListener('click', function () {
      var email = document.getElementById('mockEmail').value.trim();
      var name = document.getElementById('mockName').value.trim();
      if (!email) {
        alert('Email is required');
        return;
      }
      mockAuthModal.style.display = 'none';
      setLoadingGoogle(true);
      
      apiRequest('/api/auth/google', { email: email, name: name })
        .then(handleSuccess)
        .catch(function (err) {
          showError(authError, err.message || 'Google Sign-in failed.');
          setLoadingGoogle(false);
        });
    });
  }

  // Toggle navigation menu
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
})();
