// 浏览器中断后的任务恢复
// 下载到一半直接结束浏览器进程 用同一份用户资料重新启动 再次下载同一个清单 只请求没保存过的切片 文件内容完整
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launch, serve, send, segment, test, sleep, until, sha256 } = require('../lib/harness.js');
const { openParser, state, fetched, errors, download } = require('../lib/parser.js');

const TOTAL = 24;
const KEY = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
const IV = Buffer.from('0f0e0d0c0b0a09080706050403020100', 'hex');
const playlist = (lines) => Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n' + lines.join('') + '#EXT-X-ENDLIST\n');

test('浏览器中断后的任务恢复', async (c) => {
    const segments = Array.from({ length: TOTAL }, (_, index) => segment(index, 40000));
    const expected = sha256(Buffer.concat(segments));
    // slow: 放慢切片 留出中断的时间  broken: 加密的清单第 4 个之后的切片返回 500
    const option = { slow: true, broken: false };
    const site = await serve(async (req, res, url) => {
        if (url.pathname == '/video/index.m3u8') {
            send(req, res, playlist(segments.map((_, index) => `#EXTINF:2,\nseg-${index}.ts\n`)), 'application/vnd.apple.mpegurl');
            return true;
        }
        const plain = /^\/video\/seg-(\d+)\.ts$/.exec(url.pathname);
        if (plain) {
            option.slow && await sleep(400);
            send(req, res, segments[plain[1]], 'video/mp2t');
            return true;
        }
        // AES-128 加密的清单 用前 10 个切片
        if (url.pathname == '/aes/index.m3u8') {
            const lines = segments.slice(0, 10).map((_, index) => `#EXTINF:2,\nenc-${index}.ts\n`);
            send(req, res, playlist([`#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x${IV.toString('hex')}\n`, ...lines]), 'application/vnd.apple.mpegurl');
            return true;
        }
        if (url.pathname == '/aes/key.bin') {
            send(req, res, KEY, 'application/octet-stream');
            return true;
        }
        const encrypted = /^\/aes\/enc-(\d+)\.ts$/.exec(url.pathname);
        if (encrypted) {
            if (option.broken && encrypted[1] >= 4) {
                res.writeHead(500);
                res.end();
                return true;
            }
            const cipher = crypto.createCipheriv('aes-128-cbc', KEY, IV);
            send(req, res, Buffer.concat([cipher.update(segments[encrypted[1]]), cipher.final()]), 'video/mp2t');
            return true;
        }
    });
    c.defer(site.close);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-catch-test-resume-'));
    c.defer(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }));
    const m3u8 = site.origin + '/video/index.m3u8';
    const saved = (page) => page.eval(`TaskStore.open(_fragments, '').then(result => result.saved.size)`);

    // 第一次: 下载到一半 结束浏览器进程
    let browser = await launch({ profile });
    let page = await openParser(browser, m3u8);
    if (!await page.eval(`typeof TaskStore == 'function'`)) {
        c.skip('这个版本没有断点续传');
        await browser.close();
        return;
    }
    c.check('第一次打开 没有保存过的进度', (await state(page)).resume == '', await state(page));
    await download(browser, page, { thread: 2, wait: false });
    const before = await until(() => page.eval(`store.saved.size >= 8 ? store.saved.size : 0`), 20000, 100);
    c.check('下载中 切片陆续保存到数据库', before >= 8, before);
    const first = await fetched(page, /seg-\d+\.ts/);
    await browser.kill();
    c.check('中断时还没有下载完', first.length < TOTAL, first.length);
    option.slow = false;

    // 第二次: 同一份用户资料重新启动
    browser = await launch({ profile });
    c.defer(() => browser.close());
    page = await openParser(browser, m3u8);
    let s = await state(page);
    const restored = await page.eval('store.saved.size');
    console.log(`    重启后的提示: "${s.resume}" 数据库里的切片 ${restored} 个`);
    c.check('重启后 提示上次保存的进度', restored >= before && s.resume.includes(`${restored}/${TOTAL}`), s);
    let file = await download(browser, page);
    const second = await fetched(page, /seg-\d+\.ts/);
    console.log(`    第一次请求 ${first.length} 个 第二次请求 ${second.length} 个`);
    c.check('第二次只请求没保存过的切片', second.length == TOTAL - restored && second.length > 0, { second: second.length, restored });
    c.check('保存的文件和完整下载的一样', !!file && sha256(file) == expected, file && file.length);
    c.check('下载完成后 保存的切片已删除', await until(async () => await saved(page) === 0, 5000));
    c.check('页面没有报错', errors(page).length == 0, errors(page).slice(0, 3));
    await page.close();

    // 关掉断点续传 不保存也不读取
    page = await openParser(browser, m3u8 + '?again=1');
    await page.eval(`(() => { const box = document.querySelector('#resume'); box.checked = false; box.dispatchEvent(new Event('change')); })()`);
    file = await download(browser, page);
    c.check('关掉断点续传 照常下载 数据库里没有东西', !!file && sha256(file) == expected && (await fetched(page, /seg-\d+\.ts/)).length == TOTAL && await saved(page) === 0);
    await page.close();

    // AES-128 加密的清单: 保存的是没解密的数据 恢复后照常解密
    option.broken = true;
    page = await openParser(browser, site.origin + '/aes/index.m3u8');
    await download(browser, page, { wait: false });
    c.check('加密的清单 下载到一半中断', await until(() => page.eval('store.saved.size == 4'), 15000, 100));
    await page.close();
    option.broken = false;
    page = await openParser(browser, site.origin + '/aes/index.m3u8');
    s = await state(page);
    c.check('加密的清单 提示上次保存的进度', s.resume.includes('4/10'), s);
    file = await download(browser, page);
    c.check('加密的清单 恢复后只下载剩下的 6 个 解密出的文件内容正确', !!file && sha256(file) == sha256(Buffer.concat(segments.slice(0, 10))) && (await fetched(page, /enc-\d+\.ts/)).length == 6, file && file.length);
    c.check('页面没有报错', errors(page).length == 0, errors(page).slice(0, 3));
});
