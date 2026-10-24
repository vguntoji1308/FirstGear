// Generates ORIGINAL placeholder brand badges (monogram + wordmark) into public/img/brands/<slug>.svg.
// These are stand-ins, not the manufacturers' trademarks. To use official logos, replace the .svg files
// (same filenames) with SVGs obtained from each manufacturer's brand/press page and where licence permits.
const fs = require('node:fs');
const path = require('node:path');
const BRANDS = [
  ['maruti-suzuki', 'Maruti Suzuki', 'MS', '#1d5bbf'],
  ['toyota', 'Toyota', 'T', '#d9132a'],
  ['hyundai', 'Hyundai', 'H', '#1b3f7a'],
  ['kia', 'Kia', 'K', '#c8102e'],
  ['tata', 'Tata', 'T', '#2f5fb0'],
  ['mahindra', 'Mahindra', 'M', '#c8102e'],
];
const dir = path.join(__dirname, '..', 'public', 'img', 'brands');
fs.mkdirSync(dir, { recursive: true });
for (const [slug, name, mono, color] of BRANDS) {
  const w = Math.max(120, 56 + name.length * 11);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 48" width="${w}" height="48" role="img" aria-label="${name}">
  <title>${name}</title>
  <rect x="1" y="1" width="${w - 2}" height="46" rx="23" fill="#161625" stroke="#2a2a42" stroke-width="2"/>
  <circle cx="24" cy="24" r="16" fill="${color}"/>
  <text x="24" y="29" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${mono.length > 1 ? 12 : 16}" font-weight="800" fill="#fff">${mono}</text>
  <text x="48" y="30" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" fill="#f5f5fa">${name}</text>
</svg>
`;
  fs.writeFileSync(path.join(dir, `${slug}.svg`), svg);
}
console.log(`Wrote ${BRANDS.length} badges to ${dir}`);
