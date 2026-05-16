(() => {
  "use strict";

  const SETTING_OVERLAYS = "vv_overlays_enabled";

  const els = {
    signedOut: document.getElementById("signed-out"),
    signedIn: document.getElementById("signed-in"),
    name: document.getElementById("name"),
    email: document.getElementById("email"),
    avatar: document.getElementById("avatar"),
    signIn: document.getElementById("sign-in"),
    signOut: document.getElementById("sign-out"),
    overlayToggle: document.getElementById("overlay-toggle"),
    status: document.getElementById("status")
  };

  function setStatus(text, hideAfter) {
    els.status.textContent = text || "";
    if (hideAfter) {
      setTimeout(() => {
        if (els.status.textContent === text) els.status.textContent = "";
      }, hideAfter);
    }
  }

  function send(type) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res?.ok) return reject(new Error(res?.error || "Unknown error"));
        resolve(res.data);
      });
    });
  }

  function render(profile) {
    if (profile) {
      els.signedIn.hidden = false;
      els.signedOut.hidden = true;
      els.name.textContent = profile.name || "";
      els.email.textContent = profile.email || "";
      if (profile.picture) els.avatar.src = profile.picture;
    } else {
      els.signedIn.hidden = true;
      els.signedOut.hidden = false;
    }
  }

  els.signIn.addEventListener("click", async () => {
    setStatus("Opening Google sign-in…");
    try {
      const profile = await send("VV_SIGN_IN");
      render(profile);
      setStatus("Signed in", 1500);
    } catch (e) {
      setStatus(e.message, 4000);
    }
  });

  els.signOut.addEventListener("click", async () => {
    setStatus("Signing out…");
    try {
      await send("VV_SIGN_OUT");
      render(null);
      setStatus("Signed out", 1500);
    } catch (e) {
      setStatus(e.message, 4000);
    }
  });

  els.overlayToggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ [SETTING_OVERLAYS]: els.overlayToggle.checked });
  });

  (async () => {
    try {
      const profile = await send("VV_GET_PROFILE");
      render(profile);
    } catch (e) {
      render(null);
      setStatus(e.message, 3000);
    }
    const { [SETTING_OVERLAYS]: enabled } = await chrome.storage.local.get(SETTING_OVERLAYS);
    els.overlayToggle.checked = enabled !== false;
  })();
})();
