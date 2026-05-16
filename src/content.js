(() => {
  "use strict";

  const DEBUG = false; // ← flip to true to log to console and show empty-state debug pills
  const PANEL_ID = "vv-panel";
  const BADGE_CLASS = "vv-badge";
  const THUMB_MARK = "vvSeen";
  const REFRESH_AVERAGE_MS = 30_000;
  const OVERLAY_TTL_MS = 10 * 60_000;
  const MIN_RATERS_FOR_BADGE = DEBUG ? 0 : 1;
  const SETTING_OVERLAYS = "vv_overlays_enabled";

  const log = DEBUG ? (...args) => console.log("[VideoVitals]", ...args) : () => {};

  const send = (type, payload) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res?.ok) return reject(new Error(res?.error || "Unknown error"));
        resolve(res.data);
      });
    });

  const state = {
    videoId: null,
    channelId: null,
    profile: null,
    myRating: null,
    stats: null,
    refreshTimer: null,
    debounceTimer: null
  };

  // ------------------------------------------------------------------
  // Stats cache shared by the watch-page panel and the overlay badges.
  // ------------------------------------------------------------------
  const statsCache = {
    entries: new Map(),
    pending: new Map(),
    get(videoId) {
      const cached = this.entries.get(videoId);
      if (cached && Date.now() - cached.at < OVERLAY_TTL_MS) {
        return Promise.resolve(cached.stats);
      }
      if (this.pending.has(videoId)) return this.pending.get(videoId);
      const p = send("VV_GET_VIDEO_STATS", { videoId })
        .then((stats) => {
          this.entries.set(videoId, { stats, at: Date.now() });
          this.pending.delete(videoId);
          return stats;
        })
        .catch((err) => {
          this.pending.delete(videoId);
          throw err;
        });
      this.pending.set(videoId, p);
      return p;
    },
    invalidate(videoId) {
      this.entries.delete(videoId);
      this.pending.delete(videoId);
    }
  };

  // ------------------------------------------------------------------
  // Watch-page panel
  // ------------------------------------------------------------------
  function getVideoIdFromUrl() {
    const u = new URL(window.location.href);
    if (u.pathname !== "/watch") return null;
    return u.searchParams.get("v");
  }

  function getChannelIdFromPage() {
    const meta = document.querySelector('meta[itemprop="channelId"]');
    if (meta?.content) return meta.content;
    const link = document.querySelector('link[itemprop="url"][href*="/channel/"]');
    if (link) {
      const m = link.getAttribute("href").match(/\/channel\/([^/?#]+)/);
      if (m) return m[1];
    }
    return null;
  }

  function findMountPoint() {
    // Mount inside the title row so the chips sit right-aligned next to the
    // title (above the action row). CSS uses :has() to make the title flex
    // when our panel is present, without breaking YouTube's default styling.
    return (
      document.querySelector("ytd-watch-metadata #title") ||
      document.querySelector("ytd-watch-metadata h1.ytd-watch-metadata")?.parentElement
    );
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    const mount = findMountPoint();
    if (!mount) return null;
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "vv-panel";
    panel.innerHTML = panelMarkup();
    mount.appendChild(panel);
    wirePanel(panel);
    return panel;
  }

  function panelMarkup() {
    return `
      <button class="vv-chip vv-flag" data-vv="flag" aria-pressed="false" title="Flag as clickbait" aria-label="Flag as clickbait">
        <svg class="vv-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="6" y1="21" x2="6" y2="4"/>
          <path d="M6 4h13l-3 4 3 4H6"/>
        </svg>
        <span class="vv-chip-count" data-vv="flag-count" aria-hidden="true"></span>
      </button>

      <div class="vv-density-wrap">
        <button class="vv-chip vv-density-trigger" data-vv="density-trigger" aria-expanded="false" title="Rate information density" aria-label="Rate information density">
          <svg class="vv-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="6" y1="20" x2="6" y2="14"/>
            <line x1="12" y1="20" x2="12" y2="10"/>
            <line x1="18" y1="20" x2="18" y2="6"/>
          </svg>
          <span class="vv-chip-count" data-vv="density-display" aria-hidden="true"></span>
        </button>

        <div class="vv-density-popover" data-vv="density-popover" hidden>
          <div class="vv-popover-header">Information density</div>
          <div class="vv-density" data-vv-density-state="unset">
            <input
              class="vv-slider"
              type="range"
              min="1"
              max="10"
              step="1"
              value="5"
              data-vv="density"
              aria-label="Information density rating from 1 to 10"
            />
            <span class="vv-density-value" data-vv="density-value">—</span>
            <button class="vv-density-clear" data-vv="density-clear" title="Clear my density rating" aria-label="Clear density rating">✕</button>
          </div>
          <div class="vv-popover-stats">
            Community avg <strong data-vv="stat-density">—</strong>
            · <span data-vv="stat-count">0</span> ratings
          </div>
        </div>
      </div>

      <div class="vv-status" data-vv="status" hidden></div>
    `;
  }

  function wirePanel(panel) {
    const flagBtn = panel.querySelector('[data-vv="flag"]');
    flagBtn.addEventListener("click", async () => {
      if (!(await ensureSignedIn())) return;
      const wasFlagged = flagBtn.getAttribute("aria-pressed") === "true";
      const next = wasFlagged ? null : true;
      flagBtn.setAttribute("aria-pressed", String(next === true));
      await submit({ clickbait: next });
    });

    const densityTrigger = panel.querySelector('[data-vv="density-trigger"]');
    const popover = panel.querySelector('[data-vv="density-popover"]');

    const closePopover = () => {
      popover.setAttribute("hidden", "");
      densityTrigger.setAttribute("aria-expanded", "false");
    };
    const scheduleClose = (delayMs = 1500) => {
      clearTimeout(state.popoverCloseTimer);
      state.popoverCloseTimer = setTimeout(closePopover, delayMs);
    };

    densityTrigger.addEventListener("click", async (e) => {
      e.stopPropagation();
      clearTimeout(state.popoverCloseTimer);
      const willOpen = popover.hasAttribute("hidden");
      if (willOpen && !(await ensureSignedIn())) return;
      popover.toggleAttribute("hidden");
      densityTrigger.setAttribute("aria-expanded", String(!popover.hasAttribute("hidden")));
    });

    document.addEventListener("click", (e) => {
      if (popover.hasAttribute("hidden")) return;
      if (!panel.contains(e.target)) closePopover();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !popover.hasAttribute("hidden")) closePopover();
    });

    const slider = panel.querySelector('[data-vv="density"]');
    slider.addEventListener("input", () => {
      panel.querySelector('[data-vv="density-value"]').textContent = slider.value;
      updateSliderFill(slider);
      clearTimeout(state.popoverCloseTimer);
    });
    slider.addEventListener("change", async () => {
      if (!(await ensureSignedIn())) return;
      submit({ density: Number(slider.value) });
      scheduleClose();
    });

    const clearBtn = panel.querySelector('[data-vv="density-clear"]');
    clearBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!(await ensureSignedIn())) return;
      submit({ density: null });
      scheduleClose();
    });
  }

  async function ensureSignedIn() {
    if (state.profile) return true;
    try {
      setStatus("Signing in…");
      state.profile = await send("VV_SIGN_IN");
      setStatus("Signed in", 1500);
      await refreshAll();
      return true;
    } catch (e) {
      setStatus(`Sign-in failed: ${e.message}`, 3000);
      return false;
    }
  }

  async function submit({ clickbait, density }) {
    const payload = { videoId: state.videoId };
    if (state.channelId) payload.channelId = state.channelId;
    if (clickbait !== undefined) payload.clickbait = clickbait;
    if (density !== undefined) payload.density = density;

    // Optimistic local update so the UI (slider state, X button visibility,
    // pressed flag button) reflects the change immediately.
    const previousRating = state.myRating;
    const next = { ...(state.myRating || {}) };
    if (clickbait !== undefined) {
      if (clickbait === null) delete next.clickbait;
      else next.clickbait = clickbait;
    }
    if (density !== undefined) {
      if (density === null) delete next.density;
      else next.density = density;
    }
    state.myRating = next;
    renderMyRating();

    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(async () => {
      try {
        setStatus("Saving…");
        await send("VV_SUBMIT_RATING", payload);
        setStatus("Saved", 1200);
        statsCache.invalidate(state.videoId);
        await Promise.all([refreshStats(), refreshMyRating()]);
        overlay.invalidate(state.videoId);
      } catch (e) {
        setStatus(`Save failed: ${e.message}`, 3000);
        state.myRating = previousRating;
        renderMyRating();
      }
    }, 250);
  }

  function setStatus(text, hideAfter) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const el = panel.querySelector('[data-vv="status"]');
    el.textContent = text;
    el.hidden = !text;
    if (hideAfter) {
      setTimeout(() => {
        if (el.textContent === text) {
          el.hidden = true;
          el.textContent = "";
        }
      }, hideAfter);
    }
  }

  function renderAuth() {
    // Auth UI lives in the popup now; nothing to render here.
  }

  function renderMyRating() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const flagBtn = panel.querySelector('[data-vv="flag"]');
    const slider = panel.querySelector('[data-vv="density"]');
    const densityValue = panel.querySelector('[data-vv="density-value"]');
    const densityWrap = panel.querySelector(".vv-density");
    const r = state.myRating;
    flagBtn.setAttribute("aria-pressed", r?.clickbait === true ? "true" : "false");
    if (r?.density != null) {
      slider.value = String(r.density);
      densityValue.textContent = String(r.density);
      densityWrap.dataset.vvDensityState = "set";
    } else {
      slider.value = "5";
      densityValue.textContent = "—";
      densityWrap.dataset.vvDensityState = "unset";
    }
    updateSliderFill(slider);
  }

  function updateSliderFill(slider) {
    const min = Number(slider.min) || 1;
    const max = Number(slider.max) || 10;
    const val = Number(slider.value);
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.setProperty("--vv-fill", `${pct}%`);
  }

  function renderStats() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const s = state.stats || {};
    const flagCount = s.clickbaitCount ?? 0;
    const totalRaters = s.totalRaters ?? 0;
    const avg =
      typeof s.averageDensity === "number" ? String(Math.round(s.averageDensity)) : null;

    // Pill contents stay constant-width: a "Flag" / "Rate" prompt when there's
    // no community data yet, otherwise the number replaces the prompt.
    const flagCountEl = panel.querySelector('[data-vv="flag-count"]');
    if (flagCountEl) flagCountEl.textContent = flagCount > 0 ? String(flagCount) : "Flag";

    const densityDisplay = panel.querySelector('[data-vv="density-display"]');
    if (densityDisplay) densityDisplay.textContent = avg || "Rate";

    // Inside the popover: avg + rater count (keep "—" placeholder here).
    const statDensity = panel.querySelector('[data-vv="stat-density"]');
    if (statDensity) statDensity.textContent = avg || "—";
    const statCount = panel.querySelector('[data-vv="stat-count"]');
    if (statCount) statCount.textContent = String(totalRaters);
  }

  async function refreshStats() {
    if (!state.videoId) return;
    try {
      statsCache.invalidate(state.videoId);
      state.stats = await statsCache.get(state.videoId);
      renderStats();
    } catch (e) {
      setStatus(`Stats unavailable: ${e.message}`, 3000);
    }
  }

  async function refreshMyRating() {
    if (!state.videoId || !state.profile) {
      state.myRating = null;
      renderMyRating();
      return;
    }
    try {
      state.myRating = await send("VV_GET_MY_RATING", { videoId: state.videoId });
      renderMyRating();
    } catch (_) {
      state.myRating = null;
      renderMyRating();
    }
  }

  async function refreshAll() {
    await Promise.all([refreshStats(), refreshMyRating()]);
  }

  async function loadProfileSilently() {
    try {
      state.profile = (await send("VV_GET_PROFILE")) || null;
    } catch (_) {
      state.profile = null;
    }
    renderAuth();
  }

  async function onLocationChange() {
    const newId = getVideoIdFromUrl();
    if (newId === state.videoId) return;
    state.videoId = newId;
    state.channelId = null;
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();
    if (!state.videoId) return;
    await mountWhenReady();
    state.channelId = getChannelIdFromPage();
    await refreshAll();
    state.refreshTimer = setInterval(refreshStats, REFRESH_AVERAGE_MS);
  }

  async function mountWhenReady() {
    let tries = 0;
    return new Promise((resolve) => {
      const tick = () => {
        const panel = ensurePanel();
        if (panel) {
          renderAuth();
          renderMyRating();
          renderStats();
          if (!state.channelId) state.channelId = getChannelIdFromPage();
          return resolve(panel);
        }
        if (++tries > 50) return resolve(null);
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  // ------------------------------------------------------------------
  // Home / search / sidebar thumbnail overlay
  // ------------------------------------------------------------------
  const overlay = (() => {
    const observed = new WeakSet();
    let enabled = true;
    let mutationObserver = null;
    let intersectionObserver = null;
    let periodicScanTimer = null;
    let scanCount = 0;

    function videoIdFromHref(href) {
      try {
        const u = new URL(href, window.location.origin);
        if (u.pathname === "/watch") return u.searchParams.get("v");
        if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      } catch (_) {}
      return null;
    }

    const FLAG_META_SVG = `<svg class="vv-meta-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="21" x2="6" y2="4" fill="none"/><path d="M6 4h13l-3 4 3 4H6"/></svg>`;
    const BARS_META_SVG = `<svg class="vv-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="6"/></svg>`;

    function findTileForAnchor(anchor) {
      return anchor.closest(
        "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2"
      );
    }

    function findMetaRow(tile) {
      if (!tile) return null;

      // 1) Old Polymer DOM
      const oldLine = tile.querySelector("#metadata-line");
      if (oldLine) return oldLine;

      // 2) New view-model DOM. The class is camelCase
      // (ytContentMetadataViewModelMetadataRow), so we match case-
      // insensitively to catch both the old kebab-case and new camelCase
      // naming. There can be multiple rows (e.g. channel-name row first,
      // then views/date row) — take the last one, which is views/date.
      const rows = tile.querySelectorAll(
        '[class*="metadatarow" i], [class*="metadata-row" i]'
      );
      if (rows.length) return rows[rows.length - 1];

      return tile.querySelector('[class*="metadata-line"]');
    }

    function buildDelimiter() {
      const span = document.createElement("span");
      span.className = "ytContentMetadataViewModelDelimiter vv-meta-item";
      span.textContent = "•";
      return span;
    }

    function clearMetaItems(metaRow) {
      metaRow.querySelectorAll(".vv-meta-item").forEach((el) => el.remove());
    }

    function buildMetaItem(svgHtml, value, titleText) {
      const span = document.createElement("span");
      // Include both old-style (inline-metadata-item) and our marker class
      // (vv-meta-item) — the old class gives us free CSS delimiters on
      // old-style rows, and the marker lets us clean up later.
      span.className = "inline-metadata-item style-scope ytd-video-meta-block vv-meta-item";
      span.title = titleText;
      span.innerHTML = `${svgHtml}<span class="vv-meta-text">${value}</span>`;
      return span;
    }

    function paintMetaRow(anchor, stats) {
      const tile = findTileForAnchor(anchor);
      if (!tile) {
        log("paint: no tile found for anchor", anchor);
        return;
      }
      const metaRow = findMetaRow(tile);
      if (!metaRow) {
        const candidates = [];
        for (const el of tile.querySelectorAll("*")) {
          const cls = typeof el.className === "string" ? el.className : "";
          if (cls.toLowerCase().includes("metadata") || cls.toLowerCase().includes("meta-row")) {
            candidates.push(`${el.tagName.toLowerCase()}.${cls}`);
          }
        }
        log("paint: no meta row in tile", tile.tagName, "candidates:", candidates);
        return;
      }
      log("paint: found meta row", metaRow);

      clearMetaItems(metaRow);

      const total = stats?.totalRaters ?? 0;
      if (!stats || total < MIN_RATERS_FOR_BADGE) {
        log("paint: skipping (no community data)", { total, stats });
        return;
      }

      const flagCount = stats.clickbaitCount ?? 0;
      const avg =
        typeof stats.averageDensity === "number"
          ? String(Math.round(stats.averageDensity))
          : null;

      // New-style rows use explicit delimiter spans between items rather
      // than CSS-generated separators, so prepend a delimiter before each
      // of our items in that case.
      const needsExplicitDelimiter = !!metaRow.querySelector(
        '[class*="elimiter" i]'
      );

      const items = [];
      if (flagCount >= 1) {
        items.push({ svg: FLAG_META_SVG, val: flagCount, title: `${flagCount} flagged as clickbait` });
      }
      if (avg) {
        items.push({ svg: BARS_META_SVG, val: avg, title: "Average information density" });
      }
      for (const item of items) {
        if (needsExplicitDelimiter) metaRow.appendChild(buildDelimiter());
        metaRow.appendChild(buildMetaItem(item.svg, item.val, item.title));
      }
      log("paint: injected", { flagCount, avg, style: needsExplicitDelimiter ? "new" : "old" });
    }

    async function fetchAndPaint(anchor) {
      const href = anchor.getAttribute("href");
      const vid = href ? videoIdFromHref(href) : null;
      if (!vid) return;
      log("fetch", vid);
      try {
        const stats = await statsCache.get(vid);
        if (!anchor.isConnected) return;
        log("paint", vid, stats);
        paintMetaRow(anchor, stats);
      } catch (e) {
        log("fetch-error", vid, e?.message);
      }
    }

    function isThumbnailAnchor(a) {
      // The thumbnail link is the one that wraps the image; the title link
      // wraps text. Both can have /watch?v= hrefs.
      return !!a.querySelector("img, yt-image, ytd-thumbnail, .ytImage");
    }

    function findAnchors() {
      const all = document.querySelectorAll(
        'a[href*="/watch?v="], a[href*="/shorts/"]'
      );
      const out = [];
      const seenPerTile = new WeakMap();
      for (const a of all) {
        const href = a.getAttribute("href") || "";
        const isShorts = href.includes("/shorts/");
        if (!isShorts && !isThumbnailAnchor(a)) continue;
        // Dedupe by tile container so we don't attach a badge to BOTH the
        // image link and a title link inside the same tile.
        const tile =
          a.closest(
            "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2"
          ) || a;
        if (seenPerTile.has(tile)) continue;
        seenPerTile.set(tile, a);
        out.push(a);
      }
      return out;
    }

    function scan() {
      if (!enabled) return;
      scanCount++;
      const anchors = findAnchors();
      let newCount = 0;
      for (const a of anchors) {
        if (observed.has(a)) continue;
        observed.add(a);
        intersectionObserver.observe(a);
        newCount++;
      }
      log(`scan #${scanCount}: found ${anchors.length} thumbnail anchors, ${newCount} new`);
    }

    function removeAllInjections() {
      for (const el of document.querySelectorAll(".vv-meta-item")) el.remove();
    }

    function start() {
      if (mutationObserver) return;
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting && enabled) {
              fetchAndPaint(e.target);
              intersectionObserver.unobserve(e.target);
            }
          }
        },
        { rootMargin: "200px" }
      );
      mutationObserver = new MutationObserver(() => scheduleScan());
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href"]
      });
      scheduleScan();
      // Safety-net: re-scan periodically in case YouTube hydrates DOM in a way
      // that the MutationObserver misses.
      if (periodicScanTimer) clearInterval(periodicScanTimer);
      periodicScanTimer = setInterval(() => {
        if (enabled) scheduleScan();
      }, 3000);
      log("overlay started");
    }

    let scanTimer = null;
    function scheduleScan() {
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scan();
      }, 250);
    }

    function setEnabled(next) {
      enabled = next;
      log("overlay enabled =", enabled);
      if (!enabled) removeAllInjections();
      else scheduleScan();
    }

    function invalidate(videoId) {
      statsCache.invalidate(videoId);
      const matches = document.querySelectorAll(`a[href*="v=${videoId}"]`);
      for (const a of matches) {
        if (observed.has(a)) {
          observed.delete(a);
          intersectionObserver.observe(a);
        }
      }
    }

    return { start, setEnabled, invalidate };
  })();

  async function loadOverlaySetting() {
    const { [SETTING_OVERLAYS]: enabled } = await chrome.storage.local.get(SETTING_OVERLAYS);
    overlay.setEnabled(enabled !== false);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && SETTING_OVERLAYS in changes) {
      overlay.setEnabled(changes[SETTING_OVERLAYS].newValue !== false);
    }
  });

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  function installLocationWatcher() {
    let lastUrl = window.location.href;
    const check = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        onLocationChange();
      }
    };
    window.addEventListener("yt-navigate-finish", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    setInterval(check, 1000);
  }

  async function main() {
    await loadProfileSilently();
    await loadOverlaySetting();
    overlay.start();
    installLocationWatcher();
    await onLocationChange();
  }

  main();
})();
