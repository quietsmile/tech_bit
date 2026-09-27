// Generate poem-themed SVG illustrations for questions whose PNG art is not ready.
const fs = require('fs');
const path = require('path');
global.window = { QUESTIONS: [] };
require('../data/questions.js');

const questions = window.QUESTIONS;
const outDir = path.join(__dirname, '..', 'assets', 'placeholders');
fs.mkdirSync(outDir, { recursive: true });

const scenes = {
  mifeng: { c:['#fff7d6','#fbbf24'], ground:'#f59e0b', e:['🐝','🌻','🌼','🍯'] },
  bochuanguazhou: { c:['#dcfce7','#38bdf8'], ground:'#0ea5e9', e:['⛵','🌿','🏔️','🌙'] },
  shier: { c:['#fee2e2','#f59e0b'], ground:'#b45309', e:['👴','📜','🕯️','🖋️'] },
  fengqiaoyebo: { c:['#dbeafe','#1e3a8a'], ground:'#1e40af', e:['🌉','🌙','🚣','🐦'] },
  liangzhouci: { c:['#fef3c7','#d97706'], ground:'#b45309', e:['🏜️','🍷','🎺','⚔️'] },
  huanghelousong: { c:['#dbeafe','#0ea5e9'], ground:'#0284c7', e:['🏯','⛵','🌊','🕊️'] },
  xiangcisiyue: { c:['#ecfccb','#65a30d'], ground:'#4d7c0f', e:['🌾','🌧️','🧑‍🌾','🍃'] },
  'sishitianyuan-zhou': { c:['#f7fee7','#16a34a'], ground:'#15803d', e:['🧑‍🌾','🌾','🥬','🌻'] },
  zhizinongbing: { c:['#e0f2fe','#60a5fa'], ground:'#3b82f6', e:['🧒','🧊','🪣','❄️'] },
  cunwan: { c:['#fff7ed','#fb923c'], ground:'#c2410c', e:['🐃','🌇','🦆','🌿'] },
  zhushi: { c:['#f0fdf4','#22c55e'], ground:'#15803d', e:['🎋','🪨','🌄','🍃'] },
  qiuyexiao: { c:['#ffedd5','#f97316'], ground:'#ea580c', e:['🌅','🏯','🌄','🕊️'] },
  congjunxing: { c:['#e2e8f0','#475569'], ground:'#334155', e:['🏜️','🛡️','⚔️','🏰'] },
  wenguanjunshou: { c:['#fef9c3','#ca8a04'], ground:'#a16207', e:['📜','🎉','⚔️','🏯'] },
  huixiangoushu: { c:['#fef3c7','#a16207'], ground:'#854d0e', e:['👴','🏠','🧒','🍂'] },
  guanshuyougan: { c:['#e0e7ff','#6366f1'], ground:'#4f46e5', e:['📚','💧','🪞','🧠'] },
  guogurenzhuang: { c:['#ecfccb','#84cc16'], ground:'#65a30d', e:['🏡','🍲','🌾','🍶'] },
  wanghulou: { c:['#dbeafe','#2563eb'], ground:'#1d4ed8', e:['🌧️','🏯','🌊','⚡'] },
  chunri: { c:['#fdf2f8','#f472b6'], ground:'#db2777', e:['🌸','🌦️','🌿','🐟'] },
  langtaosha: { c:['#cffafe','#0284c7'], ground:'#0369a1', e:['🌊','🏖️','⛵','🌾'] },
  jiangnanchun: { c:['#ecfccb','#059669'], ground:'#047857', e:['🏘️','🌸','🌾','🚩'] },
  shuhuyinxianshengbi: { c:['#f0fdf4','#15803d'], ground:'#166534', e:['🪴','🧹','🌿','🏡'] },
  shihuiyin: { c:['#f8fafc','#64748b'], ground:'#475569', e:['🪨','🔥','⛰️','🌫️'] },
  youyuanbuzhi: { c:['#fdf2f8','#db2777'], ground:'#be185d', e:['🌷','🚪','🌿','🐞'] },
  caiwei: { c:['#f1f5f9','#334155'], ground:'#1e293b', e:['⚔️','🌿','❄️','🏘️'] },
  xijiangyue: { c:['#ecfeff','#14b8a6'], ground:'#0d9488', e:['🌙','🐸','🌾','🏮'] },
  qibushi: { c:['#fef2f2','#b91c1c'], ground:'#991b1b', e:['🫘','🔥','🏺','💧'] },
  momei: { c:['#f8fafc','#111827'], ground:'#1f2937', e:['🖤','🌸','🖌️','❄️'] },
  hanshi: { c:['#f8fafc','#7c3aed'], ground:'#6d28d9', e:['🕯️','🌿','🏯','🍡'] },
  tiaotiaoqianniuxing: { c:['#e0e7ff','#312e81'], ground:'#1e1b4b', e:['🌌','🧵','⭐','🌠'] },
  changgexing: { c:['#fef9c3','#f59e0b'], ground:'#d97706', e:['☀️','🌱','⏳','🌾'] },
  chan: { c:['#f0fdf4','#4d7c0f'], ground:'#3f6212', e:['🦗','🌳','☀️','🍃'] }
};

function svg(slug, scene) {
  const [sky1, sky2] = scene.c;
  const emojis = scene.e;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dy="12" stdDeviation="14" flood-opacity=".20"/>
    </filter>
  </defs>
  <rect width="1200" height="750" fill="url(#sky)"/>
  <circle cx="960" cy="145" r="78" fill="#fff" opacity=".28"/>
  <circle cx="215" cy="210" r="48" fill="#fff" opacity=".20"/>
  <path d="M-50 530 C190 395 420 395 680 520 C870 610 1040 590 1250 500 V750 H-50Z" fill="${scene.ground}" opacity=".82"/>
  <path d="M-40 610 C220 520 490 535 740 615 C920 665 1090 655 1240 610 V750 H-40Z" fill="#00000022"/>
  <circle cx="245" cy="310" r="72" fill="#fff" opacity=".18"/>
  <circle cx="915" cy="305" r="88" fill="#fff" opacity=".15"/>
  <g filter="url(#soft)">
    <text x="330" y="365" font-size="125" text-anchor="middle">${emojis[0]}</text>
    <text x="590" y="435" font-size="98" text-anchor="middle">${emojis[1]}</text>
    <text x="810" y="340" font-size="92" text-anchor="middle">${emojis[2]}</text>
    <text x="480" y="630" font-size="82" text-anchor="middle">${emojis[3]}</text>
  </g>
</svg>
`;
}

let updated = 0;
for (const q of questions) {
  if (!q.image.startsWith('assets/placeholders/')) continue;
  const slug = path.basename(q.image, '.svg');
  const scene = scenes[slug];
  if (!scene) throw new Error(`No theme for ${slug}`);
  fs.writeFileSync(path.join(outDir, `${slug}.svg`), svg(slug, scene));
  updated++;
}
console.log(`Updated ${updated} themed placeholder illustrations.`);
