const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // LinkedIn banner: 1584 × 396
  const W = 1584;
  const H = 396;

  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 }); // 2x for retina quality

  const htmlPath = path.resolve(__dirname, 'linkedin-banner.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Let fonts + gradients render
  await new Promise(r => setTimeout(r, 1500));

  // Full-size (3168×792 @ 2x, but saved as 1584×396 image area)
  const outputPath = path.resolve(__dirname, 'linkloop-linkedin-banner-1584x396.png');
  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: { x: 0, y: 0, width: W, height: H },
    omitBackground: false,
  });
  console.log(`✅ LinkedIn banner saved: ${outputPath}`);

  // Also save a 1x version at exact pixel dimensions
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  const output1x = path.resolve(__dirname, 'linkloop-linkedin-banner-1x.png');
  await page.screenshot({
    path: output1x,
    type: 'png',
    clip: { x: 0, y: 0, width: W, height: H },
    omitBackground: false,
  });
  console.log(`✅ LinkedIn banner (1x) saved: ${output1x}`);

  await browser.close();
  console.log('🎉 Done — LinkedIn banner generated!');
})();
