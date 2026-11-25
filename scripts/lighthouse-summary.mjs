// Lighthouse の JSON（lh-*.json）を読み、スコアと Core Web Vitals を表にまとめる
import { readdir, readFile, writeFile } from 'node:fs/promises';

const dir = process.argv[2] || 'lh';
const rows = [];
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json') && !x.startsWith('summary')).sort()) {
  const r = JSON.parse(await readFile(`${dir}/${f}`, 'utf8'));
  const c = r.categories, a = r.audits;
  const s = (k) => Math.round((c[k]?.score ?? 0) * 100);
  rows.push({
    page: decodeURI(new URL(r.finalDisplayedUrl || r.finalUrl).pathname),
    device: r.configSettings.formFactor,
    performance: s('performance'), accessibility: s('accessibility'), bestPractices: s('best-practices'), seo: s('seo'),
    lcp: a['largest-contentful-paint']?.displayValue, cls: a['cumulative-layout-shift']?.displayValue, tbt: a['total-blocking-time']?.displayValue,
    failed: Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode === 'binary').map((x) => x.id).slice(0, 12),
  });
}
const md = ['| ページ | 端末 | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |', '|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.page} | ${r.device} | ${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.seo} | ${r.lcp} | ${r.cls} | ${r.tbt} |`)].join('\n');
await writeFile(`${dir}/summary.md`, md + '\n\n' + rows.map((r) => `- ${r.page} (${r.device}) 要改善: ${r.failed.join(', ') || 'なし'}`).join('\n') + '\n');
await writeFile(`${dir}/summary.json`, JSON.stringify(rows, null, 2));
console.log(md);
