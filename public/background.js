// VideoVitals Background Script for Firefox
// Handles OAuth flow since popup gets destroyed during auth
(function() {
  'use strict';

  var OAUTH_CLIENT_ID = 'FIREFOX_OAUTH_CLIENT_ID_PLACEHOLDER';

  browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'startOAuth') {
      var redirectURL = browser.identity.getRedirectURL();
      var authURL = 'https://accounts.google.com/o/oauth2/v2/auth';
      authURL += '?client_id=' + encodeURIComponent(OAUTH_CLIENT_ID);
      authURL += '&response_type=token';
      authURL += '&redirect_uri=' + encodeURIComponent(redirectURL);
      authURL += '&scope=' + encodeURIComponent('openid email profile');
      authURL += '&prompt=consent';

      browser.identity.launchWebAuthFlow({
        url: authURL,
        interactive: true
      }).then(function(responseUrl) {
        if (!responseUrl) {
          throw new Error('No response URL received');
        }

        var hashPart = responseUrl.split('#')[1];
        var params = new URLSearchParams(hashPart || '');
        var accessToken = params.get('access_token');

        if (!accessToken) {
          var error = params.get('error');
          var errorDesc = params.get('error_description');
          throw new Error(error ? (error + ': ' + errorDesc) : 'No access token');
        }

        return fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: 'Bearer ' + accessToken }
        }).then(function(response) {
          if (!response.ok) throw new Error('Failed to get user info');
          return response.json();
        }).then(function(userInfo) {
          return browser.storage.local.set({
            vv_user: {
              id: userInfo.id,
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture
            },
            vv_user_id: userInfo.id,
            vv_signed_in: true,
            vv_access_token: accessToken,
            vv_last_error: null
          });
        });
      }).catch(function(error) {
        browser.storage.local.set({
          vv_last_error: error.message || String(error)
        });
      });

      return true;
    }
  });
})();
