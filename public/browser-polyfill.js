// Browser API Polyfill for Chrome/Firefox compatibility
// This provides a unified API that works in both browsers

(function() {
  'use strict';

  // If browser is already defined (Firefox), use it
  // Otherwise, use chrome (Chrome/Edge)
  if (typeof globalThis.browser === 'undefined') {
    globalThis.browser = globalThis.chrome;
  }

  // Detect browser type
  globalThis.isFirefox = typeof browser !== 'undefined' &&
    typeof browser.runtime !== 'undefined' &&
    typeof browser.runtime.getBrowserInfo === 'function';

  globalThis.isChrome = !globalThis.isFirefox &&
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime !== 'undefined';

  // Promisify chrome APIs for consistency (Chrome uses callbacks, Firefox uses promises)
  if (globalThis.isChrome && chrome.storage) {
    // Wrap storage.local.get
    const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.getAsync = function(keys) {
      return new Promise((resolve, reject) => {
        originalGet(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });
    };

    // Wrap storage.local.set
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.setAsync = function(items) {
      return new Promise((resolve, reject) => {
        originalSet(items, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    };
  }
})();
