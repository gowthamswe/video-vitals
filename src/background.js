import {
  firebaseSignInWithGoogle,
  clearFirebaseSession,
  upsertRating,
  getMyRating as fbGetMyRating,
  getVideoStats as fbGetVideoStats
} from "./firebase-client.js";

const STORAGE_KEYS = {
  PROFILE: "vv_profile"
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "VV_SIGN_IN":
      return signIn({ interactive: true });
    case "VV_SIGN_IN_SILENT":
      return signIn({ interactive: false });
    case "VV_SIGN_OUT":
      return signOut();
    case "VV_GET_PROFILE":
      return getProfile();
    case "VV_SUBMIT_RATING":
      return submitRating(message.payload);
    case "VV_GET_VIDEO_STATS":
      return getVideoStats(message.payload?.videoId);
    case "VV_GET_MY_RATING":
      return getMyRating(message.payload?.videoId);
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}

async function signIn({ interactive }) {
  const googleToken = await getGoogleAuthToken(interactive);
  if (!googleToken) throw new Error("Sign-in cancelled");

  const fbUser = await firebaseSignInWithGoogle(googleToken);

  const profile = {
    uid: fbUser.uid,
    email: fbUser.email,
    name: fbUser.displayName,
    picture: fbUser.photoUrl
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILE]: profile });
  return profile;
}

async function signOut() {
  const googleToken = await getGoogleAuthToken(false).catch(() => null);
  if (googleToken) {
    try {
      await chrome.identity.removeCachedAuthToken({ token: googleToken });
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${googleToken}`);
    } catch (_) {
      // best-effort
    }
  }
  await clearFirebaseSession();
  await chrome.storage.local.remove([STORAGE_KEYS.PROFILE]);
  return { signedOut: true };
}

async function getProfile() {
  const { [STORAGE_KEYS.PROFILE]: profile } = await chrome.storage.local.get(STORAGE_KEYS.PROFILE);
  return profile || null;
}

async function submitRating(payload) {
  const { videoId, clickbait, density, channelId } = payload || {};
  if (!videoId) throw new Error("Missing videoId");
  if (clickbait === undefined && density === undefined) {
    throw new Error("Nothing to submit");
  }
  return upsertRating(videoId, { clickbait, density, channelId });
}

async function getVideoStats(videoId) {
  if (!videoId) throw new Error("Missing videoId");
  return fbGetVideoStats(videoId);
}

async function getMyRating(videoId) {
  if (!videoId) throw new Error("Missing videoId");
  return fbGetMyRating(videoId);
}

function getGoogleAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        if (!interactive) return resolve(null);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(token);
    });
  });
}
