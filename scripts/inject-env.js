const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '..', '.env.local');
const env = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      env[key.trim()] = value.trim();
    }
  });
}

// Replace placeholders in content.js
const contentJsPath = path.join(__dirname, '..', 'out', 'content.js');
if (fs.existsSync(contentJsPath)) {
  let content = fs.readFileSync(contentJsPath, 'utf8');

  // Replace environment variables
  content = content.replace(
    /process\.env\.NEXT_PUBLIC_FIREBASE_PROJECT_ID \|\| ''/g,
    `'${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''}'`
  );
  content = content.replace(
    /process\.env\.NEXT_PUBLIC_FIREBASE_API_KEY \|\| ''/g,
    `'${env.NEXT_PUBLIC_FIREBASE_API_KEY || ''}'`
  );

  fs.writeFileSync(contentJsPath, content);
  console.log('Injected environment variables into content.js');
}

// Replace placeholder in manifest.json for OAuth client ID
const manifestPath = path.join(__dirname, '..', 'out', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  if (env.NEXT_PUBLIC_OAUTH_CLIENT_ID) {
    manifest = manifest.replace(
      /"client_id":\s*"YOUR_OAUTH_CLIENT_ID_HERE"/,
      `"client_id": "${env.NEXT_PUBLIC_OAUTH_CLIENT_ID}"`
    );
    fs.writeFileSync(manifestPath, manifest);
    console.log('Injected OAuth client ID into manifest.json');
  } else {
    console.warn('WARNING: NEXT_PUBLIC_OAUTH_CLIENT_ID not set in .env.local - OAuth will not work!');
  }
}

console.log('Environment injection complete!');
