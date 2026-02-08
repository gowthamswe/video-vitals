// VideoVitals - Content Script with Auth + Firebase
// Cross-browser compatible (Chrome & Firefox)
// NOTE: Firebase credentials are injected at build time from environment variables

(function() {
  'use strict';

  if (window.vvLoaded) return;
  window.vvLoaded = true;

  console.log('[VideoVitals] Content script loaded');

  // Detect browser type
  const isFirefox = typeof browser !== 'undefined' && typeof InstallTrigger !== 'undefined';

  // Use browser API (Firefox) or chrome API (Chrome)
  const browserAPI = isFirefox ? browser : chrome;

  console.log('[VideoVitals] Browser detected:', isFirefox ? 'Firefox' : 'Chrome');

  // Firebase config - these will be replaced at build time
  // If you're forking this project, set these in your .env.local file
  const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
  const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';

  // State
  let isSignedIn = false;
  let isClickbait = false;
  let clickbaitCount = 0;
  let density = null;        // User's own rating
  let avgDensity = null;     // Average rating from all users
  let totalRatings = 0;      // Number of ratings
  let currentVideoId = null;
  let userId = null;

  // Helper to handle storage API differences between Chrome (callback) and Firefox (Promise)
  async function storageGet(keys) {
    try {
      if (isFirefox) {
        // Firefox uses Promise-based API
        return await browserAPI.storage.local.get(keys);
      } else {
        // Chrome uses callback-based API
        return new Promise((resolve, reject) => {
          browserAPI.storage.local.get(keys, (result) => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
            } else {
              resolve(result);
            }
          });
        });
      }
    } catch (e) {
      console.log('[VideoVitals] storageGet error:', e);
      return {};
    }
  }

  async function storageSet(items) {
    try {
      if (isFirefox) {
        // Firefox uses Promise-based API
        return await browserAPI.storage.local.set(items);
      } else {
        // Chrome uses callback-based API
        return new Promise((resolve, reject) => {
          browserAPI.storage.local.set(items, () => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      }
    } catch (e) {
      console.log('[VideoVitals] storageSet error:', e);
    }
  }

  // Check if user is signed in
  async function checkAuth() {
    try {
      const result = await storageGet(['vv_user_id', 'vv_signed_in']);
      console.log('[VideoVitals] Auth check result:', result);
      if (result.vv_signed_in && result.vv_user_id) {
        userId = result.vv_user_id;
        isSignedIn = true;
        return true;
      }
    } catch (e) {
      console.log('[VideoVitals] Auth check error:', e);
    }
    isSignedIn = false;
    return false;
  }

  // Get user ID
  async function getUserId() {
    if (userId) return userId;

    try {
      const result = await storageGet(['vv_user_id']);
      if (result.vv_user_id) {
        userId = result.vv_user_id;
      }
    } catch (e) {
      console.log('[VideoVitals] Get user ID error:', e);
    }
    return userId;
  }

  // Firebase REST API - Save rating with proper authentication
  async function syncToFirebase(data) {
    if (!userId || !FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) {
      console.log('[VideoVitals] Cannot sync - missing userId or Firebase config');
      return;
    }

    // Get the access token for authenticated requests
    let accessToken = null;
    try {
      const tokenResult = await storageGet(['vv_access_token']);
      accessToken = tokenResult.vv_access_token;
    } catch (e) {
      console.log('[VideoVitals] Could not get access token:', e);
    }

    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/videos/${currentVideoId}/ratings/${userId}?key=${FIREBASE_API_KEY}`;

    const firestoreData = {
      fields: {
        videoId: { stringValue: currentVideoId },
        odId: { stringValue: userId },
        clickbaitFlag: { booleanValue: data.isClickbait },
        informationDensity: { integerValue: data.density !== null ? data.density : 0 },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };

    const headers = { 'Content-Type': 'application/json' };

    // Add authorization header if we have an access token
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    fetch(url, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify(firestoreData)
    }).then(response => {
      if (response.ok) {
        console.log('[VideoVitals] Synced to Firebase');
      } else {
        console.log('[VideoVitals] Firebase sync failed:', response.status);
      }
    }).catch(err => {
      console.log('[VideoVitals] Firebase sync error:', err);
    });
  }

  // Firebase REST API - Load ratings for video
  async function loadFromFirebase() {
    if (!currentVideoId || !FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) {
      console.log('[VideoVitals] Cannot load from Firebase - missing config');
      return null;
    }

    try {
      const uid = await getUserId();

      // Get all ratings for this video (for clickbait count AND average density)
      const allRatingsUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/videos/${currentVideoId}/ratings?key=${FIREBASE_API_KEY}`;
      const allResponse = await fetch(allRatingsUrl);

      let userRating = null;
      let clickbaitFlagCount = 0;
      let totalDensity = 0;
      let densityCount = 0;

      if (allResponse.ok) {
        const allData = await allResponse.json();
        if (allData.documents) {
          allData.documents.forEach(doc => {
            // Count clickbait flags
            if (doc.fields?.clickbaitFlag?.booleanValue === true) {
              clickbaitFlagCount++;
            }

            // Sum up density ratings for average
            const docDensity = doc.fields?.informationDensity?.integerValue;
            if (docDensity && parseInt(docDensity) > 0) {
              totalDensity += parseInt(docDensity);
              densityCount++;
            }

            // Extract user's own rating
            if (uid && doc.name && doc.name.endsWith(`/ratings/${uid}`)) {
              userRating = {
                isClickbait: doc.fields?.clickbaitFlag?.booleanValue || false,
                density: docDensity ? parseInt(docDensity) : null
              };
              // If user's density is 0, treat as null (no rating)
              if (userRating.density === 0) {
                userRating.density = null;
              }
            }
          });
        }
      }

      // Calculate average density
      const averageDensity = densityCount > 0 ? Math.round((totalDensity / densityCount) * 10) / 10 : null;

      return {
        userRating,
        clickbaitCount: clickbaitFlagCount,
        avgDensity: averageDensity,
        totalRatings: densityCount
      };
    } catch (e) {
      console.log('[VideoVitals] Firebase load error:', e);
      return null;
    }
  }

  // Load data
  async function loadData() {
    if (!currentVideoId || !isSignedIn) return;

    // First, load from local storage for instant display
    try {
      const result = await storageGet([`vv_${currentVideoId}`]);
      const data = result[`vv_${currentVideoId}`];

      if (data) {
        isClickbait = data.isClickbait || false;
        density = data.density !== undefined ? data.density : null;
        clickbaitCount = isClickbait ? 1 : 0;
        updateUI();
      }
    } catch (e) {
      console.log('[VideoVitals] Local storage load error:', e);
    }

    // Then sync from Firebase (includes average calculation)
    loadFromFirebase().then(firebaseData => {
      console.log('[VideoVitals] Firebase data:', firebaseData);
      if (firebaseData) {
        // Update average density and total ratings
        avgDensity = firebaseData.avgDensity;
        totalRatings = firebaseData.totalRatings;
        clickbaitCount = firebaseData.clickbaitCount;

        // Update user's own rating if exists
        if (firebaseData.userRating) {
          isClickbait = firebaseData.userRating.isClickbait;
          density = firebaseData.userRating.density;
        }

        saveDataLocal();
        updateUI();
      }
    });
  }

  // Save data locally
  async function saveDataLocal() {
    if (!currentVideoId) return;

    try {
      await storageSet({
        [`vv_${currentVideoId}`]: {
          isClickbait,
          density
        }
      });
    } catch (e) {
      console.log('[VideoVitals] Storage save error:', e);
    }
  }

  // Save data locally + sync to Firebase
  function saveData() {
    saveDataLocal();
    syncToFirebase({ isClickbait, density });
  }

  // Inject CSS
  function addStyles() {
    if (document.getElementById('vv-styles')) return;

    const style = document.createElement('style');
    style.id = 'vv-styles';
    style.textContent = `
      #vv-signin-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0 16px;
        height: 36px;
        border: none;
        border-radius: 18px;
        background: #ff6b35;
        color: white;
        font-family: "Roboto", "Arial", sans-serif;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        margin-right: 8px;
        transition: background 0.2s;
      }
      #vv-signin-btn:hover {
        background: #e55a2b;
      }
      #vv-clickbait-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0 16px;
        height: 36px;
        border: none;
        border-radius: 18px;
        background: rgba(255,255,255,0.1);
        color: var(--yt-spec-text-primary, #f1f1f1);
        font-family: "Roboto", "Arial", sans-serif;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        margin-right: 8px;
        transition: background 0.2s;
      }
      #vv-clickbait-btn:hover {
        background: rgba(255,255,255,0.2);
      }
      #vv-clickbait-btn.active {
        background: #ff6b35;
        color: white;
      }
      #vv-density-container {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        height: 36px;
        border-radius: 18px;
        background: rgba(255,255,255,0.1);
        margin-right: 8px;
        font-family: "Roboto", "Arial", sans-serif;
        font-size: 14px;
        color: var(--yt-spec-text-primary, #f1f1f1);
        overflow: visible;
      }
      #vv-density-slider {
        width: 80px;
        height: 4px;
        border-radius: 2px;
        background: rgba(255,255,255,0.3);
        outline: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        cursor: pointer;
      }
      .vv-slider-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      .vv-slider-tooltip {
        position: absolute;
        top: 50%;
        left: 0;
        transform: translateY(-50%);
        display: none;
        background: #ff6b35;
        color: white;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        font-size: 11px;
        font-weight: 600;
        pointer-events: none;
        white-space: nowrap;
        z-index: 9999;
        text-align: center;
        line-height: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
      #vv-density-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ff6b35;
        cursor: pointer;
      }
      #vv-density-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ff6b35;
        cursor: pointer;
        border: none;
      }
      #vv-density-value {
        min-width: 20px;
        text-align: center;
        font-weight: 500;
      }
      #vv-density-value.no-rating {
        color: #888;
        cursor: help;
        font-size: 16px;
      }
      #vv-density-reset {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border: none;
        border-radius: 50%;
        background: rgba(255,255,255,0.2);
        color: var(--yt-spec-text-primary, #f1f1f1);
        font-size: 12px;
        cursor: pointer;
        padding: 0;
        margin-left: 4px;
        transition: background 0.2s;
      }
      #vv-density-reset:hover {
        background: rgba(255,107,53,0.8);
      }
    `;
    document.head.appendChild(style);
  }

  // Update UI
  function updateUI() {
    const btn = document.getElementById('vv-clickbait-btn');
    const densityValue = document.getElementById('vv-density-value');
    const densitySlider = document.getElementById('vv-density-slider');
    const resetBtn = document.getElementById('vv-density-reset');

    if (btn) {
      btn.classList.toggle('active', isClickbait);
      btn.innerHTML = `🚩 ${clickbaitCount}`;
    }

    if (densityValue) {
      // Always show average (with count), fallback to user's rating if no average
      const displayRating = avgDensity !== null ? avgDensity : density;

      // Build tooltip showing user's rating
      let tooltipText = 'Information Density';
      if (density !== null) {
        tooltipText = `Your rating: ${density}`;
      }

      if (displayRating === null) {
        densityValue.innerHTML = '<span class="no-rating" title="No ratings yet. Be the first to rate!">ⓘ</span>';
      } else {
        // Show average with count: "7.2 (12)"
        const countText = totalRatings > 0 ? ` (${totalRatings})` : '';
        densityValue.textContent = displayRating + countText;
        densityValue.title = tooltipText;
        densityValue.classList.remove('no-rating');
      }
    }

    if (densitySlider) {
      // Slider stays at user's position
      densitySlider.value = density === null ? 0 : density;
    }

    if (resetBtn) {
      resetBtn.style.display = density === null ? 'none' : 'inline-flex';
    }
  }

  // Create sign in button - opens extension popup
  function createSignInButton() {
    const btn = document.createElement('button');
    btn.id = 'vv-signin-btn';
    btn.title = 'Sign in to VideoVitals';
    btn.innerHTML = `🎬 Sign in to VideoVitals`;

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Show message to use extension popup
      alert('Click the VideoVitals extension icon in your browser toolbar to sign in.');
    });

    return btn;
  }

  // Create clickbait button
  function createButton() {
    const btn = document.createElement('button');
    btn.id = 'vv-clickbait-btn';
    btn.title = 'Clickbait';
    btn.innerHTML = `🚩 ${clickbaitCount}`;
    if (isClickbait) btn.classList.add('active');

    btn.addEventListener('click', function(e) {
      e.stopPropagation();

      isClickbait = !isClickbait;
      clickbaitCount += isClickbait ? 1 : -1;
      this.classList.toggle('active', isClickbait);
      this.innerHTML = `🚩 ${clickbaitCount}`;

      saveData();
    });

    return btn;
  }

  // Create density slider
  function createSlider() {
    const container = document.createElement('div');
    container.id = 'vv-density-container';

    // Always show average (with count), fallback to user's rating if no average
    const displayRating = avgDensity !== null ? avgDensity : density;

    // Build tooltip showing user's rating
    let tooltipText = 'Information Density';
    if (density !== null) {
      tooltipText = `Your rating: ${density}`;
    }

    const hasRating = displayRating !== null;
    // Show average with count: "7.2 (12)"
    const countText = totalRatings > 0 ? ` (${totalRatings})` : '';
    const displayValue = hasRating
      ? displayRating + countText
      : '<span class="no-rating" title="No ratings yet. Be the first to rate!">ⓘ</span>';
    const sliderValue = density === null ? 0 : density;

    container.innerHTML = `
      <span>📊</span>
      <div class="vv-slider-wrapper">
        <input type="range" id="vv-density-slider" min="0" max="10" value="${sliderValue}" title="Slide to rate (0 to reset)">
        <span class="vv-slider-tooltip" id="vv-slider-tooltip">${sliderValue > 0 ? sliderValue : ''}</span>
      </div>
      <span id="vv-density-value" title="${hasRating ? tooltipText : ''}">${displayValue}</span>
      <button id="vv-density-reset" title="Reset your rating" style="display: ${density !== null ? 'inline-flex' : 'none'};">✕</button>
    `;

    const slider = container.querySelector('#vv-density-slider');
    const sliderTooltip = container.querySelector('#vv-slider-tooltip');
    const resetBtn = container.querySelector('#vv-density-reset');

    // Update tooltip position based on slider value
    function updateTooltipPosition(val) {
      const percent = (val / 10) * 100;
      sliderTooltip.style.left = `calc(${percent}% - ${(percent / 100) * 14}px)`;
    }

    // Initial tooltip position
    if (sliderValue > 0) {
      sliderTooltip.style.display = 'block';
      updateTooltipPosition(sliderValue);
    }

    slider.addEventListener('input', function(e) {
      e.stopPropagation();
      const val = parseInt(this.value);

      // Update tooltip on thumb
      if (val > 0) {
        sliderTooltip.textContent = val;
        sliderTooltip.style.display = 'block';
        updateTooltipPosition(val);
      } else {
        sliderTooltip.style.display = 'none';
      }
    });

    slider.addEventListener('change', function(e) {
      e.stopPropagation();
      const val = parseInt(this.value);
      if (val === 0) {
        // Reset - slide to 0 clears the rating
        density = null;
        sliderTooltip.style.display = 'none';
        resetBtn.style.display = 'none';
      } else {
        density = val;
        resetBtn.style.display = 'inline-flex';
      }
      saveData();

      // After saving, reload from Firebase to get updated average
      setTimeout(() => {
        loadFromFirebase().then(firebaseData => {
          if (firebaseData) {
            avgDensity = firebaseData.avgDensity;
            totalRatings = firebaseData.totalRatings;
            updateUI();
          }
        });
      }, 500);
    });

    // Reset button click handler
    resetBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      density = null;
      slider.value = 0;
      sliderTooltip.style.display = 'none';
      this.style.display = 'none';
      saveData();

      // After saving, reload from Firebase to get updated average
      setTimeout(() => {
        loadFromFirebase().then(firebaseData => {
          if (firebaseData) {
            avgDensity = firebaseData.avgDensity;
            totalRatings = firebaseData.totalRatings;
            updateUI();
          }
        });
      }, 500);
    });

    return container;
  }

  // Remove existing UI elements
  function removeUI() {
    const elements = ['vv-signin-btn', 'vv-clickbait-btn', 'vv-density-container'];
    elements.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // Inject UI based on auth state
  function injectUI() {
    removeUI();

    const actionsContainer = document.querySelector('#top-level-buttons-computed');
    console.log('[VideoVitals] Actions container found:', !!actionsContainer);

    if (!actionsContainer) return false;

    if (isSignedIn) {
      const btn = createButton();
      const slider = createSlider();
      actionsContainer.insertBefore(slider, actionsContainer.firstChild);
      actionsContainer.insertBefore(btn, actionsContainer.firstChild);
      console.log('[VideoVitals] Injected clickbait button and slider');
    } else {
      const signInBtn = createSignInButton();
      actionsContainer.insertBefore(signInBtn, actionsContainer.firstChild);
      console.log('[VideoVitals] Injected sign-in button');
    }

    return true;
  }

  // Get video ID
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // Initialize
  async function init() {
    console.log('[VideoVitals] Initializing...');

    if (!location.hostname.includes('youtube.com')) {
      console.log('[VideoVitals] Not on YouTube, skipping');
      return;
    }
    if (!location.pathname.includes('/watch')) {
      console.log('[VideoVitals] Not on watch page, skipping');
      return;
    }

    const videoId = getVideoId();
    if (!videoId) {
      console.log('[VideoVitals] No video ID found');
      return;
    }

    console.log('[VideoVitals] Video ID:', videoId);

    // Reset for new video
    if (videoId !== currentVideoId) {
      currentVideoId = videoId;
      isClickbait = false;
      clickbaitCount = 0;
      density = null;
      avgDensity = null;
      totalRatings = 0;
    }

    addStyles();

    // Check auth status
    await checkAuth();
    console.log('[VideoVitals] Signed in:', isSignedIn);

    // Load data if signed in
    if (isSignedIn) {
      await loadData();
    }

    // Inject UI with retry
    if (!injectUI()) {
      console.log('[VideoVitals] UI container not found, retrying...');
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (injectUI() || attempts > 30) {
          clearInterval(interval);
          if (attempts > 30) {
            console.log('[VideoVitals] Failed to find UI container after 30 attempts');
          }
        }
      }, 500);
    }
  }

  // Listen for auth state changes from popup
  browserAPI.storage.onChanged.addListener((changes, area) => {
    console.log('[VideoVitals] Storage changed:', area, changes);
    if (area === 'local' && changes.vv_signed_in) {
      isSignedIn = changes.vv_signed_in.newValue || false;
      if (changes.vv_user_id) {
        userId = changes.vv_user_id.newValue;
      }
      if (isSignedIn) {
        loadData().then(() => injectUI());
      } else {
        // Reset state on sign out
        isClickbait = false;
        clickbaitCount = 0;
        density = null;
        injectUI();
      }
    }
  });

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for navigation (YouTube is a SPA)
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[VideoVitals] URL changed, reinitializing...');
      window.vvLoaded = false;
      setTimeout(init, 1500);
      window.vvLoaded = true;
    }
  }, 1000);
})();
