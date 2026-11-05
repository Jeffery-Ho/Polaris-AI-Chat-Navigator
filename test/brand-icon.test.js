import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const icon = (name) => new URL(`../public/icons/${name}`, import.meta.url);

test('C1 品牌图标源文件使用 Clay 底与米白星形大纲', async () => {
  const svg = await readFile(icon('polaris-icon.svg'), 'utf8');
  assert.match(svg, /stop-color="#B85C3A"/);
  assert.match(svg, /fill="url\(#clay-depth\)"/);
  assert.equal(svg.match(/fill="#FFF7EF"/g).length, 3);
});

test('各尺寸 PNG 图标与文件名尺寸一致', async () => {
  for (const size of [16, 32, 48, 96, 128, 512, 1024]) {
    const png = await readFile(icon(`gpt-voyager-icon-${size}.png`));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
