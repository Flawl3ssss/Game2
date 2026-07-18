import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:'/usr/bin/chromium', headless:false, args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true, locale:'ru-RU' });
const errors=[];
page.on('console', msg => { if (msg.type()==='error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.message));
await page.goto('http://127.0.0.1:4173/?qa=1', { waitUntil:'networkidle' });
await page.waitForSelector('#start-button:visible');
await page.locator('#start-button').click();
await page.waitForTimeout(200);
await page.keyboard.down('Space');
await page.waitForTimeout(700);
await page.keyboard.up('Space');
await page.waitForTimeout(500);
await page.evaluate(() => window.__snowGame?.debugWarp(650));
await page.waitForTimeout(600);
await page.keyboard.press('Backquote');
await page.waitForTimeout(150);
const beforePause = {
  distance: Number(await page.locator('#distance-value').textContent()),
  hudVisible: await page.locator('#hud').isVisible(),
  debug: await page.locator('#debug').textContent(),
};
await page.locator('#pause-button').click();
const paused = await page.locator('#pause').isVisible();
await page.locator('#resume-button').click();
await page.waitForTimeout(250);
const resumed = await page.locator('#hud').isVisible();
await page.screenshot({path:'stress.png'});
console.log(JSON.stringify({beforePause,paused,resumed,errors},null,2));
await browser.close();
