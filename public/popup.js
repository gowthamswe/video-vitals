// VideoVitals Popup Script - Cross-browser (Chrome & Firefox)
(function() {
  'use strict';

  var isFirefox = typeof browser !== 'undefined';
  var api = isFirefox ? browser : chrome;

  var outState = document.getElementById('signed-out-state');
  var inState = document.getElementById('signed-in-state');
  var errEl = document.getElementById('error-message');
  var avatarEl = document.getElementById('user-avatar');
  var nameEl = document.getElementById('user-name');
  var emailEl = document.getElementById('user-email');

  function showSignedIn(u) {
    outState.classList.add('hidden');
    inState.classList.remove('hidden');
    nameEl.textContent = u.name || 'VideoVitals User';
    emailEl.textContent = u.email || '';
    if (u.picture) {
      avatarEl.src = u.picture;
      avatarEl.classList.remove('hidden');
    }
  }

  function showSignedOut() {
    outState.classList.remove('hidden');
    inState.classList.add('hidden');
  }

  function showError(m) {
    errEl.textContent = m;
    errEl.classList.remove('hidden');
  }

  // Check auth state on load
  api.storage.local.get(['vv_user', 'vv_signed_in', 'vv_last_error'], function(r) {
    if (r && r.vv_signed_in && r.vv_user) showSignedIn(r.vv_user);
    if (r && r.vv_last_error) {
      showError(r.vv_last_error);
      api.storage.local.set({ vv_last_error: null });
    }
  });

  document.getElementById('sign-in-btn').onclick = function() {
    errEl.classList.add('hidden');
    if (isFirefox) {
      api.runtime.sendMessage({ action: 'startOAuth' });
    } else {
      chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError || !token) {
          showError(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'No token');
          return;
        }
        fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: 'Bearer ' + token }
        })
          .then(function(resp) { return resp.json(); })
          .then(function(userInfo) {
            var userData = {
              id: userInfo.id,
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture
            };
            api.storage.local.set({
              vv_user: userData,
              vv_user_id: userInfo.id,
              vv_signed_in: true
            }, function() {
              showSignedIn(userData);
            });
          })
          .catch(function(e) { showError(String(e)); });
      });
    }
  };

  document.getElementById('sign-out-btn').onclick = function() {
    if (!isFirefox && chrome.identity) {
      chrome.identity.getAuthToken({ interactive: false }, function(t) {
        if (t) chrome.identity.removeCachedAuthToken({ token: t });
      });
    }
    api.storage.local.set({
      vv_user: null,
      vv_user_id: null,
      vv_signed_in: false,
      vv_access_token: null
    }, function() {
      showSignedOut();
    });
  };
})();
