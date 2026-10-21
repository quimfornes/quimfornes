// Renders public/icons/icon.svg into the PNG sizes iOS and the web manifest need.
const { chromium } = await import(process.env.PW || "playwright");
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const p = await b.newPage();
const out = [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["apple-touch-icon.png", 180, 0], ["icon-512-maskable.png", 512, 0.1], ["icon-1024.png", 1024, 0]];
for (const [name, size, pad] of out) {
  await p.setViewportSize({ width: size, height: size });
  const inner = svg.replace('rx="112"', name.includes("touch") || name.includes("1024") || pad ? 'rx="0"' : 'rx="112"');
  await p.setContent(`<html><body style="margin:0;background:${pad ? "#3b5bdb" : "transparent"}"><div style="width:${size}px;height:${size}px;padding:${size * pad}px;box-sizing:border-box">${inner.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`);
  await p.screenshot({ path: new URL("../public/icons/" + name, import.meta.url).pathname, omitBackground: !pad });
}
await b.close();
