const puppeteer = require('puppeteer');
const path = require('path');

const VARIATIONS = [
  { file: 'v2-minimal-bold.html',   name: 'v2-minimal-bold' },
  { file: 'v3-glucose-ring.html',   name: 'v3-glucose-ring' },
  { file: 'v4-neon-pulse.html',     name: 'v4-neon-pulse' },
  { file: 'v5-glass-shield.html',   name: 'v5-glass-shield' },
  { file: 'v6-gradient-bloom.html', name: 'v6-gradient-bloom' },
  { file: 'v7-app-dashboard.html',  name: 'v7-app-dashboard' },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });

  for (const v of VARIATIONS) {
    const htmlPath = path.resolve(__dirname, v.file);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));

    const outPath = path.resolve(__dirname, `${v.name}-1024.png`);
    await page.screenshot({
      path: outPath,
      type: 'png',
      clip: { x: 0, y: 0, width: 1024, height: 1024 },
      omitBackground: false,
    });
    console.log(`✅ ${v.name}-1024.png`);
  }

  await browser.close();
  console.log('\n🎉 All 6 variations generated (V2–V7)!');
})();
