const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, 'Web Page Images');
const HTML_FILE = path.join(__dirname, 'linkloop-renders.html');

const renders = [
  { id: 'render-1', name: '01-Home-Dashboard' },
  { id: 'render-2', name: '02-CGM-Data-Chart' },
  { id: 'render-3', name: '03-Care-Circle' },
  { id: 'render-4', name: '04-AI-Insights' },
  { id: 'render-5', name: '05-Loop-Member-View' },
  { id: 'render-6', name: '06-Live-Status-Roster' },
  { id: 'render-7', name: '07-Smart-Alerts' },
  { id: 'render-8', name: '08-Welcome-Onboarding' },
];

(async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  await page.goto('file://' + HTML_FILE, { waitUntil: 'networkidle0' });

  // Wait for fonts
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 1500));

  for (const { id, name } of renders) {
    const el = await page.$('#' + id);
    if (!el) { console.log(`⚠️  #${id} not found, skipping`); continue; }
    const outPath = path.join(OUTPUT_DIR, name + '.png');
    await el.screenshot({ path: outPath, omitBackground: true });
    console.log(`✅ ${name}.png`);
  }

  await browser.close();
  console.log(`\n🎉 Done! ${renders.length} PNGs saved to: ${OUTPUT_DIR}`);
})();
