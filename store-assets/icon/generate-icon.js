const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // Set viewport to exact icon size
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });

  const htmlPath = path.resolve(__dirname, 'linkloop-appstore-icon.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Wait a moment for any rendering
  await new Promise(r => setTimeout(r, 500));

  const outputPath = path.resolve(__dirname, 'linkloop-appstore-icon-1024.png');

  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: { x: 0, y: 0, width: 1024, height: 1024 },
    omitBackground: false,
  });

  console.log(`✅ App Store icon saved: ${outputPath}`);

  // Also generate a 512px version for Google Play
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 0.5 });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  const output512 = path.resolve(__dirname, 'linkloop-icon-512.png');
  await page.screenshot({
    path: output512,
    type: 'png',
    clip: { x: 0, y: 0, width: 1024, height: 1024 },
    omitBackground: false,
  });

  console.log(`✅ 512px icon saved: ${output512}`);

  await browser.close();
  console.log('🎉 Done — both icons generated!');
})();
