// 依次运行 tests/cases 下的各组测试
// 用法: node tests/run.js [名称的一部分 ...]   不带参数运行全部
// 不并行: 同时开多个浏览器 负载高了页面还没加载完就被检查 会出现误报
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, 'cases');
const filters = process.argv.slice(2);
const cases = fs.readdirSync(dir).filter((file) => file.endsWith('.js') && (!filters.length || filters.some((filter) => file.includes(filter)))).sort();
const failed = [];
const skipped = [];
for (const file of cases) {
    const result = spawnSync(process.execPath, [path.join(dir, file)], { stdio: 'inherit' });
    // 77: 被测的功能不在这个版本里 整组跳过
    result.status === 77 ? skipped.push(file) : (result.status === 0 || failed.push(file));
    console.log('');
}
const passed = cases.length - failed.length - skipped.length;
console.log(`${passed} 组通过` + (skipped.length ? ` ${skipped.length} 组跳过 (${skipped.join(' ')})` : '') + (failed.length ? ` ${failed.length} 组失败 (${failed.join(' ')})` : ''));
process.exit(failed.length ? 1 : 0);
