// VideoVitals Popup Script - Cross-browser (Chrome & Firefox)
(function() {
  'use strict';

  var OAUTH_CLIENT_ID = 'FIREFOX_OAUTH_CLIENT_ID_PLACEHOLDER';
  var isFirefox = typeof browser !== 'undefined';
  var browserAPI = isFirefox ? browser : chrome;

  var loadingState = document.getElementById('loading-state');
  var signedOutState = document.getElementById('signed-out-state');
  var signedInState = document.getElementById('signed-in-state');
  var signInBtn = document.getElementById('sign-in-btn');
  var signOutBtn = document.getElementById('sign-out-btn');
  var errorMessage = document.getElementById('error-message');
  var userAvatar = document.getElementById('user-avatar');
  var userName = document.getElementById('user-name');
  var userEmail = document.getElementById('user-email');

  function storageGet(keys) {
    if (isFirefox) return browserAPI.storage.local.get(keys);
    return new Promise(function(resolve) {
      browserAPI.storage.local.get(keys, function(result) { resolve(result || {}); });
    });
  }

  function storageSet(items) {
    if (isFirefox) return browserAPI.storage.local.set(items);
    return new Promise(function(resolve) {
      browserAPI.storage.local.set(items, resolve);
    });
  }

  function showSignedOut() {
    loadingState.className = 'hidden';
    signedOutState.className = '';
    signedInState.className = 'hidden';
  }

  function showSignedIn(user) {
    loadingState.className = 'hidden';
    signedOutState.className = 'hidden';
    signedInState.className = '';
    userName.textContent = user.name || 'VideoVitals User';
    userEmail.textContent = user.email || '';
    if (user.picture) {
      userAvatar.src = user.picture;
      userAvatar.className = 'avatar';
    } else {
      userAvatar.className = 'avatar hidden';
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.className = 'error-text';
  }

  // Check auth on load
  storageGet(['vv_user', 'vv_signed_in', 'vv_last_error']).then(function(result) {
    if (result.vv_signed_in && result.vv_user) {
      showSignedIn(result.vv_user);
    } else {
      showSignedOut();
      if (result.vv_last_error) {
        showError(result.vv_last_error);
        storageSet({ vv_last_error: null });
      }
    }
  }).catch(function() {
    showSignedOut();
  });

  // Firefox OAuth via background script
  function firefoxSignIn() {
    browserAPI.runtime.sendMessage({ action: 'startOAuth' });
  }

  // Chrome OAuth
  function chromeSignIn() {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (chrome.runtime.lastError || !token) {
        showError(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'No token');
        return;
      }
      fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: 'Bearer ' + token }
      }).then(function(r) { return r.json(); }).then(function(userInfo) {
        var userData = { id: userInfo.id, email: userInfo.email, name: userInfo.name, picture: userInfo.picture };
        storageSet({ vv_user: userData, vv_user_id: userInfo.id, vv_signed_in: true }).then(function() {
          showSignedIn(userData);
        });
      }).catch(function(e) { showError(String(e)); });
    });
  }

  signInBtn.onclick = function() {
    errorMessage.className = 'error-text hidden';
    if (isFirefox) firefoxSignIn();
    else chromeSignIn();
  };

  signOutBtn.onclick = function() {
    if (!isFirefox && chrome.identity) {
      chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (token) chrome.identity.removeCachedAuthToken({ token: token }, function() {});
      });
    }
    storageSet({ vv_user: null, vv_user_id: null, vv_signed_in: false, vv_access_token: null }).then(showSignedOut);
  };
})();
