// =================================================================================================
// IMPORTANT: THIS FILE IS SAFE TO COMMIT TO GIT
// =================================================================================================
//
// This configuration object is used by the Firebase client-side SDKs to identify your project.
// The actual values should come from environment variables.
//
// For local development, create a .env.local file with your Firebase credentials.
// See .env.example for the required variables.
//
// =================================================================================================

export const firebaseConfig = {
  "projectId": process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  "appId": process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  "apiKey": process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  "authDomain": process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  "measurementId": "",
  "messagingSenderId": ""
};
