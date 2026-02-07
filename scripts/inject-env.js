const fs = require('fs');
const path = require('path');

// Get target browser from command line args (default: chrome)
const targetBrowser = process.argv[2] || 'chrome';
console.log(`Building for: ${targetBrowser.toUpperCase()}`);

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
  console.log('Loaded environment variables from .env.local');
} else {
  console.warn('WARNING: .env.local not found - credentials will not be injected!');
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

// Copy the appropriate manifest based on target browser
const manifestSource = path.join(__dirname, '..', 'public', `manifest.${targetBrowser}.json`);
const manifestDest = path.join(__dirname, '..', 'out', 'manifest.json');

if (fs.existsSync(manifestSource)) {
  let manifest = fs.readFileSync(manifestSource, 'utf8');

  // For Chrome, inject Chrome OAuth client ID
  if (targetBrowser === 'chrome' && env.NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID) {
    manifest = manifest.replace(
      /"client_id":\s*"YOUR_OAUTH_CLIENT_ID_HERE"/,
      `"client_id": "${env.NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID}"`
    );
    console.log('Injected Chrome OAuth client ID into manifest.json');
  }

  fs.writeFileSync(manifestDest, manifest);
  console.log(`Copied manifest.${targetBrowser}.json to manifest.json`);
} else {
  console.warn(`WARNING: manifest.${targetBrowser}.json not found!`);
}

// Copy browser-polyfill.js to out folder
const polyfillSource = path.join(__dirname, '..', 'public', 'browser-polyfill.js');
const polyfillDest = path.join(__dirname, '..', 'out', 'browser-polyfill.js');
if (fs.existsSync(polyfillSource)) {
  fs.copyFileSync(polyfillSource, polyfillDest);
  console.log('Copied browser-polyfill.js to out folder');
}

// For Firefox, copy popup.html, popup.js, and background.js
if (targetBrowser === 'firefox') {
  const popupHtmlSource = path.join(__dirname, '..', 'public', 'popup.html');
  const popupHtmlDest = path.join(__dirname, '..', 'out', 'popup.html');
  if (fs.existsSync(popupHtmlSource)) {
    fs.copyFileSync(popupHtmlSource, popupHtmlDest);
    console.log('Copied popup.html to out folder');
  }

  const popupJsSource = path.join(__dirname, '..', 'public', 'popup.js');
  const popupJsDest = path.join(__dirname, '..', 'out', 'popup.js');
  if (fs.existsSync(popupJsSource)) {
    let popupJs = fs.readFileSync(popupJsSource, 'utf8');

    // Inject Firefox OAuth client ID
    if (env.NEXT_PUBLIC_FIREFOX_OAUTH_CLIENT_ID) {
      popupJs = popupJs.replace(
        /FIREFOX_OAUTH_CLIENT_ID_PLACEHOLDER/g,
        env.NEXT_PUBLIC_FIREFOX_OAUTH_CLIENT_ID
      );
      console.log('Injected Firefox OAuth client ID into popup.js');
    }

    fs.writeFileSync(popupJsDest, popupJs);
    console.log('Copied popup.js to out folder');
  }

  // Copy background.js for Firefox OAuth handling
  const bgJsSource = path.join(__dirname, '..', 'public', 'background.js');
  const bgJsDest = path.join(__dirname, '..', 'out', 'background.js');
  if (fs.existsSync(bgJsSource)) {
    let bgJs = fs.readFileSync(bgJsSource, 'utf8');

    // Inject Firefox OAuth client ID for background script
    if (env.NEXT_PUBLIC_FIREFOX_OAUTH_CLIENT_ID) {
      bgJs = bgJs.replace(
        /FIREFOX_OAUTH_CLIENT_ID_PLACEHOLDER/g,
        env.NEXT_PUBLIC_FIREFOX_OAUTH_CLIENT_ID
      );
      console.log('Injected Firefox OAuth client ID into background.js');
    }

    fs.writeFileSync(bgJsDest, bgJs);
    console.log('Copied background.js to out folder');
  }
}

console.log(`\n✅ Build complete for ${targetBrowser.toUpperCase()}!`);
console.log(`Extension is ready in: ${path.join(__dirname, '..', 'out')}`);
