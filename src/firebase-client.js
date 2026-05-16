import { CONFIG } from "./config.js";

const STORAGE = {
  ID_TOKEN: "vv_fb_id_token",
  REFRESH_TOKEN: "vv_fb_refresh_token",
  ID_TOKEN_EXPIRES: "vv_fb_id_token_expires",
  UID: "vv_fb_uid"
};

const TOKEN_SAFETY_MARGIN_SEC = 60;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export async function firebaseSignInWithGoogle(googleAccessToken) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${CONFIG.FIREBASE_API_KEY}`;
  const body = {
    postBody: `access_token=${googleAccessToken}&providerId=google.com`,
    requestUri: "http://localhost",
    returnSecureToken: true,
    returnIdpCredential: false
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`Firebase sign-in failed: ${await readError(res)}`);
  }
  const data = await res.json();
  await persistTokens({
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: Number(data.expiresIn),
    uid: data.localId
  });
  return {
    uid: data.localId,
    email: data.email,
    displayName: data.displayName,
    photoUrl: data.photoUrl
  };
}

export async function clearFirebaseSession() {
  await chrome.storage.local.remove(Object.values(STORAGE));
}

export async function getFirebaseUid() {
  const { [STORAGE.UID]: uid } = await chrome.storage.local.get(STORAGE.UID);
  return uid || null;
}

export async function upsertRating(videoId, updates) {
  const uid = await getFirebaseUid();
  if (!uid) throw new Error("Not signed in");

  const fields = {};
  const updateMask = [];
  if (updates.clickbait === null) {
    // Explicit clear — include in mask without a value to delete the field.
    updateMask.push("clickbait");
  } else if (typeof updates.clickbait === "boolean") {
    fields.clickbait = { booleanValue: updates.clickbait };
    updateMask.push("clickbait");
  }
  if (updates.density === null) {
    updateMask.push("density");
  } else if (typeof updates.density === "number") {
    fields.density = { integerValue: String(updates.density) };
    updateMask.push("density");
  }
  if (typeof updates.channelId === "string" && updates.channelId.length > 0) {
    fields.channelId = { stringValue: updates.channelId.slice(0, 64) };
    updateMask.push("channelId");
  }
  fields.updatedAt = { timestampValue: new Date().toISOString() };
  updateMask.push("updatedAt");

  const docPath = `/videoRatings/${encodeURIComponent(videoId)}/users/${encodeURIComponent(uid)}`;
  const query = updateMask
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join("&");
  await firestoreRequest(`${docPath}?${query}`, {
    method: "PATCH",
    body: JSON.stringify({ fields })
  });
  return fromFirestoreFields(fields);
}

export async function getMyRating(videoId) {
  const uid = await getFirebaseUid();
  if (!uid) return null;
  const path = `/videoRatings/${encodeURIComponent(videoId)}/users/${encodeURIComponent(uid)}`;
  try {
    const doc = await firestoreRequest(path, { method: "GET" });
    return fromFirestoreFields(doc.fields || {});
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function getVideoStats(videoId) {
  const parent = `/videoRatings/${encodeURIComponent(videoId)}`;
  const fromClause = [{ collectionId: "users" }];

  // Each aggregation runs in its own query. Combining count() with avg(field)
  // in a single aggregation query restricts count() to docs that have the
  // averaged field — so a flagged-only doc with no density would be counted
  // as 0, not 1.
  const [totalQuery, flaggedQuery, avgQuery] = await Promise.all([
    runAggregation(parent, {
      structuredQuery: { from: fromClause },
      aggregations: [{ alias: "total", count: {} }]
    }),
    runAggregation(parent, {
      structuredQuery: {
        from: fromClause,
        where: {
          fieldFilter: {
            field: { fieldPath: "clickbait" },
            op: "EQUAL",
            value: { booleanValue: true }
          }
        }
      },
      aggregations: [{ alias: "flagged", count: {} }]
    }),
    runAggregation(parent, {
      structuredQuery: { from: fromClause },
      aggregations: [{ alias: "avgDensity", avg: { field: { fieldPath: "density" } } }]
    })
  ]);

  return {
    totalRaters: readAggInt(totalQuery, "total"),
    clickbaitCount: readAggInt(flaggedQuery, "flagged"),
    averageDensity: readAggDouble(avgQuery, "avgDensity")
  };
}

async function runAggregation(parent, structuredAggregationQuery) {
  const url = `${FIRESTORE_BASE}${parent}:runAggregationQuery`;
  const headers = await buildReadHeaders(url);
  const res = await fetchWithTimeout(headers.url, {
    method: "POST",
    headers: headers.headers,
    body: JSON.stringify({ structuredAggregationQuery })
  });
  if (!res.ok) {
    const err = new Error(`Aggregation ${res.status}: ${await readError(res)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function readAggInt(response, alias) {
  const row = Array.isArray(response) ? response[0] : response;
  const result = row?.result?.aggregateFields?.[alias];
  if (!result) return 0;
  if ("integerValue" in result) return Number(result.integerValue);
  if ("doubleValue" in result) return Math.round(Number(result.doubleValue));
  return 0;
}

function readAggDouble(response, alias) {
  const row = Array.isArray(response) ? response[0] : response;
  const result = row?.result?.aggregateFields?.[alias];
  if (!result) return null;
  if ("nullValue" in result) return null;
  if ("doubleValue" in result) {
    const v = Number(result.doubleValue);
    return Number.isFinite(v) ? v : null;
  }
  if ("integerValue" in result) return Number(result.integerValue);
  return null;
}

async function firestoreRequest(path, init = {}) {
  const baseUrl = `${FIRESTORE_BASE}${path}`;
  const { url, headers } = await buildAuthedHeaders(baseUrl, init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetchWithTimeout(url, { ...init, headers });
  if (!res.ok) {
    const err = new Error(`Firestore ${res.status}: ${await readError(res)}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function buildAuthedHeaders(url, initHeaders) {
  const headers = new Headers(initHeaders || {});
  const token = await getValidIdToken();
  headers.set("Authorization", `Bearer ${token}`);
  return { url, headers };
}

async function buildReadHeaders(url) {
  const headers = new Headers();
  const token = await getValidIdTokenIfAvailable();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    return { url, headers };
  }
  headers.set("Content-Type", "application/json");
  const sep = url.includes("?") ? "&" : "?";
  return { url: `${url}${sep}key=${CONFIG.FIREBASE_API_KEY}`, headers };
}

async function getValidIdToken() {
  const token = await getValidIdTokenIfAvailable();
  if (!token) throw new Error("Firebase session expired; please sign in again");
  return token;
}

async function getValidIdTokenIfAvailable() {
  const stored = await chrome.storage.local.get([STORAGE.ID_TOKEN, STORAGE.ID_TOKEN_EXPIRES]);
  if (
    stored[STORAGE.ID_TOKEN] &&
    typeof stored[STORAGE.ID_TOKEN_EXPIRES] === "number" &&
    stored[STORAGE.ID_TOKEN_EXPIRES] > Date.now()
  ) {
    return stored[STORAGE.ID_TOKEN];
  }
  return refreshIdToken().catch(() => null);
}

async function refreshIdToken() {
  const { [STORAGE.REFRESH_TOKEN]: refreshToken } = await chrome.storage.local.get(
    STORAGE.REFRESH_TOKEN
  );
  if (!refreshToken) return null;
  const url = `https://securetoken.googleapis.com/v1/token?key=${CONFIG.FIREBASE_API_KEY}`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    await clearFirebaseSession();
    return null;
  }
  const data = await res.json();
  await persistTokens({
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in),
    uid: data.user_id
  });
  return data.id_token;
}

async function persistTokens({ idToken, refreshToken, expiresIn, uid }) {
  const expiresAt = Date.now() + (expiresIn - TOKEN_SAFETY_MARGIN_SEC) * 1000;
  const payload = {
    [STORAGE.ID_TOKEN]: idToken,
    [STORAGE.REFRESH_TOKEN]: refreshToken,
    [STORAGE.ID_TOKEN_EXPIRES]: expiresAt
  };
  if (uid) payload[STORAGE.UID] = uid;
  await chrome.storage.local.set(payload);
}

function fromFirestoreFields(fields = {}) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    if ("booleanValue" in v) obj[k] = v.booleanValue;
    else if ("integerValue" in v) obj[k] = Number(v.integerValue);
    else if ("doubleValue" in v) obj[k] = Number(v.doubleValue);
    else if ("stringValue" in v) obj[k] = v.stringValue;
    else if ("timestampValue" in v) obj[k] = v.timestampValue;
    else if ("nullValue" in v) obj[k] = null;
  }
  return obj;
}

function isNotFound(err) {
  return err && err.status === 404;
}

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    return json.error?.message || text || res.statusText;
  } catch {
    return text || res.statusText;
  }
}
