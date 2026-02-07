const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔨 Building VideoVitals for all browsers...\n');

const rootDir = path.join(__dirname, '..');

// Function to copy directory recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Function to delete directory recursively
function deleteDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Load environment variables
const envPath = path.join(rootDir, '.env.local');
const env = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      env[key.trim()] = value.trim();
    }
  });
  console.log('✓ Loaded environment variables from .env.local\n');
} else {
  console.warn('⚠ WARNING: .env.local not found - credentials will not be injected!\n');
}

// Build base Next.js app if out folder doesn't exist
const outDir = path.join(rootDir, 'out');
if (!fs.existsSync(outDir)) {
  console.log('Building base Next.js app...');
  execSync('npm run build:base', { cwd: rootDir, stdio: 'inherit' });
}

// Process each browser
const browsers = ['chrome', 'firefox'];

browsers.forEach(browser => {
  console.log(`\n📦 Processing ${browser.toUpperCase()} build...`);

  const browserOutDir = path.join(rootDir, `out-${browser}`);

  // Delete existing browser-specific output
  deleteDir(browserOutDir);

  // Copy base out folder to browser-specific folder
  copyDir(outDir, browserOutDir);
  console.log(`  ✓ Created out-${browser}/ folder`);

  // Inject env vars into content.js
  const contentJsPath = path.join(browserOutDir, 'content.js');
  if (fs.existsSync(contentJsPath)) {
    let content = fs.readFileSync(contentJsPath, 'utf8');

    content = content.replace(
      /process\.env\.NEXT_PUBLIC_FIREBASE_PROJECT_ID \|\| ''/g,
      `'${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''}'`
    );
    content = content.replace(
      /process\.env\.NEXT_PUBLIC_FIREBASE_API_KEY \|\| ''/g,
      `'${env.NEXT_PUBLIC_FIREBASE_API_KEY || ''}'`
    );

    fs.writeFileSync(contentJsPath, content);
    console.log(`  ✓ Injected Firebase credentials into content.js`);
  }

  // Copy appropriate manifest
  const manifestSource = path.join(rootDir, 'public', `manifest.${browser}.json`);
  const manifestDest = path.join(browserOutDir, 'manifest.json');

  if (fs.existsSync(manifestSource)) {
    let manifest = fs.readFileSync(manifestSource, 'utf8');

    // For Chrome, inject Chrome OAuth client ID
    if (browser === 'chrome' && env.NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID) {
      manifest = manifest.replace(
        /"client_id":\s*"YOUR_OAUTH_CLIENT_ID_HERE"/,
        `"client_id": "${env.NEXT_PUBLIC_CHROME_OAUTH_CLIENT_ID}"`
      );
      console.log(`  ✓ Injected Chrome OAuth client ID into manifest`);
    }

    fs.writeFileSync(manifestDest, manifest);
    console.log(`  ✓ Copied manifest.${browser}.json`);
  }

  // Copy browser-polyfill.js
  const polyfillSource = path.join(rootDir, 'public', 'browser-polyfill.js');
  const polyfillDest = path.join(browserOutDir, 'browser-polyfill.js');
  if (fs.existsSync(polyfillSource)) {
    fs.copyFileSync(polyfillSource, polyfillDest);
    console.log(`  ✓ Copied browser-polyfill.js`);
  }

  // For Firefox, copy the simple popup.html, popup.js, and background.js
  if (browser === 'firefox') {
    const popupHtmlSource = path.join(rootDir, 'public', 'popup.html');
    const popupHtmlDest = path.join(browserOutDir, 'popup.html');
    if (fs.existsSync(popupHtmlSource)) {
      fs.copyFileSync(popupHtmlSource, popupHtmlDest);
      console.log(`  ✓ Copied popup.html`);
    }

    const popupJsSource = path.join(rootDir, 'public', 'popup.js');
    const popupJsDest = path.join(browserOutDir, 'popup.js');
    if (fs.existsSync(popupJsSource)) {
      let popupJs = fs.readFileSync(popupJsSource, 'utf8');

      // Inject Firefox OAuth client ID
      if (env.NEXT_PUBLIC_FIREFOX_OAUTH_CLIENT_ID) {
        popupJs = popupJs.replace(
          /FIREFOX_OAUTH_CLIENT_ID_PLACEHOLDER/g,
          env.NEXT_PUBLIC_FIREFOX_OAUTH_CLIENT_ID
        );
        console.log(`  ✓ Injected Firefox OAuth client ID into popup.js`);
      }

      fs.writeFileSync(popupJsDest, popupJs);
      console.log(`  ✓ Copied popup.js`);
    }

    // Copy background.js for Firefox OAuth handling
    const bgJsSource = path.join(rootDir, 'public', 'background.js');
    const bgJsDest = path.join(browserOutDir, 'background.js');
    if (fs.existsSync(bgJsSource)) {
      let bgJs = fs.readFileSync(bgJsSource, 'utf8');

      // Inject Firefox OAuth client ID for background script
      if (env.NEXT_PUBLIC_FIREFOX_OAUTH_CLIENT_ID) {
        bgJs = bgJs.replace(
          /FIREFOX_OAUTH_CLIENT_ID_PLACEHOLDER/g,
          env.NEXT_PUBLIC_FIREFOX_OAUTH_CLIENT_ID
        );
        console.log(`  ✓ Injected Firefox OAuth client ID into background.js`);
      }

      fs.writeFileSync(bgJsDest, bgJs);
      console.log(`  ✓ Copied background.js`);
    }
  }
});

console.log('\n' + '='.repeat(50));
console.log('✅ All builds complete!\n');
console.log('Output folders:');
console.log(`  Chrome:  ${path.join(rootDir, 'out-chrome')}`);
console.log(`  Firefox: ${path.join(rootDir, 'out-firefox')}`);
console.log('\nTo create ZIP files for store submission:');
console.log('  cd out-chrome && zip -r ../videovitals-chrome.zip .');
console.log('  cd out-firefox && zip -r ../videovitals-firefox.zip .');
