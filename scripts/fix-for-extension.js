const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');

function processHtmlFiles(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      processHtmlFiles(filePath);
    } else if (file.endsWith('.html')) {
      let content = fs.readFileSync(filePath, 'utf8');

      // Extract inline scripts and save them to external files
      const inlineScripts = [];
      let scriptIndex = 0;

      content = content.replace(/<script>([^<]*)<\/script>/gi, (_match, scriptContent) => {
        if (scriptContent.trim()) {
          const scriptFileName = `inline-script-${scriptIndex++}.js`;
          const scriptPath = path.join(outDir, scriptFileName);
          fs.writeFileSync(scriptPath, scriptContent);
          inlineScripts.push(scriptFileName);
          return `<script src="./${scriptFileName}"></script>`;
        }
        return '';
      });

      fs.writeFileSync(filePath, content);
      console.log(`Processed: ${filePath}`);
    }
  }
}

// Run the script
console.log('Fixing HTML files for Chrome extension compatibility...');
processHtmlFiles(outDir);
console.log('Done!');
