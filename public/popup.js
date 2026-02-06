// VideoVitals Popup Script - Optimized for fast loading
(function() {
  'use strict';

  // Detect browser type immediately
  var isFirefox = typeof browser !== 'undefined';
  var browserAPI = isFirefox ? browser : chrome;

  // Cache DOM elements
  var loadingState = document.getElementById('loading-state');
  var signedOutState = document.getElementById('signed-out-state');
  var signedInState = document.getElementById('signed-in-state');
  var signInBtn = document.getElementById('sign-in-btn');
  var signOutBtn = document.getElementById('sign-out-btn');
  var errorMessage = document.getElementById('error-message');
  var userAvatar = document.getElementById('user-avatar');
  var userName = document.getElementById('user-name');
  var userEmail = document.getElementById('user-email');

  // Fast storage get using Promise
  function storageGet(keys) {
    if (isFirefox) {
      return browserAPI.storage.local.get(keys);
    }
    return new Promise(function(resolve) {
      browserAPI.storage.local.get(keys, function(result) {
        resolve(result || {});
      });
    });
  }

  function storageSet(items) {
    if (isFirefox) {
      return browserAPI.storage.local.set(items);
    }
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

  // Check auth immediately
  storageGet(['vv_user', 'vv_signed_in']).then(function(result) {
    if (result.vv_signed_in && result.vv_user) {
      showSignedIn(result.vv_user);
    } else {
      showSignedOut();
    }
  }).catch(function() {
    showSignedOut();
  });

  // Sign in handler
  signInBtn.onclick = function() {
    errorMessage.className = 'error-text hidden';

    if (isFirefox) {
      // Firefox: Generate anonymous user ID
      var userId = 'user_' + Math.random().toString(36).substring(2, 11) + Date.now();
      var userData = { id: userId, email: 'anonymous@videovitals.app', name: 'VideoVitals User' };
      storageSet({ vv_user: userData, vv_user_id: userId, vv_signed_in: true }).then(function() {
        showSignedIn(userData);
      });
    } else {
      // Chrome: Use chrome.identity API
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
  };

  // Sign out handler
  signOutBtn.onclick = function() {
    if (!isFirefox && chrome.identity) {
      chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (token) chrome.identity.removeCachedAuthToken({ token: token }, function() {});
      });
    }
    storageSet({ vv_user: null, vv_user_id: null, vv_signed_in: false }).then(showSignedOut);
  };
})();
