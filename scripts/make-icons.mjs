// public/icon.svg로 PWA용 PNG 아이콘을 만듭니다. (Playwright 필요)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // 전역 설치본을 쓰려면 NODE_PATH=$(npm root -g)
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const targets = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  ['icon-512-maskable.png', 512, 0.12],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  const off = Math.round(size * pad);
  // maskable·apple 아이콘은 모서리를 둥글리지 않고 배경을 채웁니다.
  const flat = pad > 0 || name.startsWith('apple');
  await page.setContent(
    `<body style="margin:0;background:${flat ? '#2f6b4f' : 'transparent'}">
       <div style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `).replace(flat ? 'rx="112"' : '__', flat ? 'rx="0"' : '__')}</div>
     </body>`,
  );
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: !flat });
  console.log('wrote', name);
}
await browser.close();
