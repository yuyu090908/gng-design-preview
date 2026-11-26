// 手元確認用の WordPress の代わりのデータ（GNG_FIXTURES 用）。本番のビルドでは使わない。
// 記事のタイトル・本文はすべて「確認用」と分かる文言にしている。
// 使い方：node tests/fixtures/make.mjs /tmp/gng-fixtures && GNG_FIXTURES=/tmp/gng-fixtures npm run build
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const out = process.argv[2] || '/tmp/gng-fixtures';
const O = 'https://globalnightguide.com';
const cats = [
  [1, '未分類', 0], [10, '国内風俗', 0], [11, 'ソープランド', 10], [12, '高級デリヘル', 10], [13, '激安デリヘル', 10],
  [20, '海外風俗', 0], [21, 'タイ風俗', 20], [22, '韓国風俗', 20], [23, '台湾風俗', 20], [24, 'ベトナム風俗', 20], [25, 'フィリピン風俗', 20],
  [30, 'セフレ', 0], [31, '精力剤', 0],
];
const slug = (n) => encodeURIComponent(n);
const categories = cats.map(([id, name, parent]) => ({ id, name, slug: slug(name), count: 0, parent, link: `${O}/category/${parent ? `${slug(cats.find((c) => c[0] === parent)[1])}/` : ''}${slug(name)}/`, description: `${name}の記事（確認用）` }));
const posts = [];
let id = 3000;
const day = (n) => new Date(Date.UTC(2026, 10, 20) - n * 86400000).toISOString().slice(0, 19);
const leaf = cats.filter(([cid, , p]) => p || [30, 31].includes(cid));
for (let i = 0; i < 36; i++) {
  const [cid, name] = leaf[i % leaf.length];
  const pid = id++;
  const body = Array.from({ length: 6 }, (_, k) => `<h2>確認用の見出し ${k + 1}</h2><p>${name}についての確認用の本文です。表示とレイアウトの確認のためだけに使います。`.repeat(1) + 'ダミーの段落。'.repeat(20) + '</p>').join('');
  posts.push({
    id: pid, link: `${O}/${pid}/`, title: { rendered: `【確認用】${name}の記事 ${i + 1}` }, excerpt: { rendered: `<p>${name}の確認用の抜粋です。</p>` },
    content: { rendered: body }, date: day(i), modified: day(Math.max(0, i - 2)), categories: [cid], _embedded: {},
  });
}
for (const c of categories) c.count = posts.filter((p) => p.categories.includes(c.id)).length;
const pages = [{ id: 2, slug: 'about', link: `${O}/about/`, title: { rendered: '運営について' }, content: { rendered: '<p>確認用の固定ページです。</p>' }, date: day(100), modified: day(50) }];
await mkdir(out, { recursive: true });
await writeFile(join(out, 'categories.json'), JSON.stringify(categories));
await writeFile(join(out, 'posts.json'), JSON.stringify(posts));
await writeFile(join(out, 'pages.json'), JSON.stringify(pages));
await writeFile(join(out, 'home.html'), `<ul class="my_popular_posts">${posts.slice(0, 6).map((p) => `<li><a href="${p.link}">x</a></li>`).join('')}</ul>`);
console.log(`fixtures: ${posts.length} posts → ${out}`);
