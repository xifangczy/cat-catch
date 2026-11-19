// 动态签名 URL
// 切片地址带有效期和签名 每次取清单签名都不一样 所有切片的路径相同 只靠参数区分 (不同画质也是)
// 1. 带签名的地址能正常下载
// 2. 下载中断后重新取清单 (签名变了) 核对内容后接着上次的进度 不同的资源不会被混在一起
// 3. 地址过期后有提示 重新取清单可以接着下载
'use strict';
const crypto = require('node:crypto');
const { launch, serve, send, segment, test, sleep, until, sha256 } = require('../lib/harness.js');
const { openParser, state, fetched, errors, download } = require('../lib/parser.js');

const TOTAL = 12;
const SECRET = 'cat-catch-test';
const sign = (text) => crypto.createHmac('sha256', SECRET).update(text).digest('hex').slice(0, 32);

test('动态签名 URL', async (c) => {
    // 三个资源 路径和切片数量都一样 内容不同
    const videos = {};
    for (const name of ['A', 'B', 'C']) {
        const segments = Array.from({ length: TOTAL }, (_, index) => segment(index, 20000, name));
        videos[name] = { segments, hash: sha256(Buffer.concat(segments)) };
    }
    const option = { broken: false, ttl: 300 };  // broken: 第 5 个之后的切片返回 500 模拟下载中断
    const denied = [];
    const site = await serve(async (req, res, url) => {
        const query = url.searchParams;
        if (url.pathname == '/signed/index.m3u8') {
            // fixed 参数: 固定有效期和会话 (同一个清单地址每次返回相同的切片地址) 否则每次都重新签名
            const expires = query.get('fixed') || Math.floor(Date.now() / 1000) + option.ttl;
            const session = query.get('fixed') ? 'fixed' : crypto.randomBytes(6).toString('hex');
            const lines = videos[query.get('v')].segments.map((_, n) => `#EXTINF:2,\nseg.ts?v=${query.get('v')}&n=${n}&session=${session}&expires=${expires}&sign=${sign(`${query.get('v')}/${n}/${session}/${expires}`)}\n`);
            send(req, res, Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n' + lines.join('') + '#EXT-X-ENDLIST\n'), 'application/vnd.apple.mpegurl');
            return true;
        }
        if (url.pathname == '/signed/seg.ts') {
            const [v, n, session, expires] = ['v', 'n', 'session', 'expires'].map((name) => query.get(name));
            if (query.get('sign') != sign(`${v}/${n}/${session}/${expires}`) || expires * 1000 < Date.now()) {
                denied.push(url.search);
                res.writeHead(403);
                res.end();
                return true;
            }
            if (option.broken && n >= 5) {
                res.writeHead(500);
                res.end();
                return true;
            }
            send(req, res, videos[v].segments[n], 'video/mp2t');
            return true;
        }
    });
    c.defer(site.close);
    const browser = await launch();
    c.defer(browser.close);
    const playlist = (v, extra = '') => `${site.origin}/signed/index.m3u8?v=${v}${extra}`;
    const segments = (page) => fetched(page, /seg\.ts/);
    // 下载到第 5 个切片后中断 关掉页面
    const interrupt = async (url) => {
        option.broken = true;
        const page = await openParser(browser, url);
        await download(browser, page, { wait: false });
        const saved = await until(() => page.eval('store.saved.size == 5'), 15000, 100);
        await page.close();
        option.broken = false;
        return saved;
    };

    // 1. 带签名的地址正常下载
    let page = await openParser(browser, playlist('A'));
    const resume = await page.eval(`typeof TaskStore == 'function'`);
    let file = await download(browser, page);
    c.check('带签名的切片地址能下载 文件内容正确', !!file && sha256(file) == videos.A.hash && denied.length == 0, { size: file && file.length, denied });
    c.check('页面没有报错', errors(page).length == 0, errors(page).slice(0, 3));
    await page.close();
    if (!resume) {
        c.skip('这个版本没有断点续传 跳过中断后恢复的部分');
        return;
    }

    // 2. A 下载到一半中断
    c.check('A 下载到一半中断 保存了 5 个切片', await interrupt(playlist('A')));
    // 路径相同的另一个资源 B 不能用 A 保存的切片
    page = await openParser(browser, playlist('B'));
    let s = await state(page);
    const checkB = await segments(page);
    file = await download(browser, page);
    console.log(`    打开 B: 提示 "${s.resume}" 核对内容请求了 ${checkB.length} 个切片 之后下载请求了 ${(await segments(page)).length - checkB.length} 个`);
    c.check('路径相同但内容不同的 B: 核对后不接管 A 的切片 没有恢复提示', s.resume == '' && checkB.length == 1, { resume: s.resume, check: checkB.length });
    c.check('B 完整下载 内容是 B 的', !!file && sha256(file) == videos.B.hash && (await segments(page)).length - checkB.length == TOTAL);
    await page.close();
    // 重新取 A 的清单 签名全变了
    page = await openParser(browser, playlist('A'));
    s = await state(page);
    const checkA = await segments(page);
    console.log(`    重新打开 A: 提示 "${s.resume}" 核对内容请求了 ${checkA.length} 个切片`);
    c.check('重新取清单 (签名变了): 核对两个切片的内容后接着用 提示 5/12', s.resume.includes(`5/${TOTAL}`) && checkA.length == 2, { resume: s.resume, check: checkA.length });
    c.check('提示里有地址的有效期', /\d{4}/.test(s.resume.split(`5/${TOTAL}`)[1] || ''), s.resume);
    file = await download(browser, page);
    const rest = (await segments(page)).length - checkA.length;
    c.check('只下载剩下的 7 个切片 文件内容是 A 的', rest == TOTAL - 5 && !!file && sha256(file) == videos.A.hash, { rest, size: file && file.length });
    c.check('页面没有报错', errors(page).length == 0, errors(page).slice(0, 3));
    await page.close();

    // 3. 地址过期
    const expires = Math.floor(Date.now() / 1000) + 6;
    c.check('C 下载到一半中断', await interrupt(playlist('C', '&fixed=' + expires)));
    await sleep(Math.max(0, expires * 1000 - Date.now()) + 1200);
    page = await openParser(browser, playlist('C', '&fixed=' + expires));
    s = await state(page);
    console.log(`    过期后打开同一个清单: 提示 "${s.resume}"`);
    c.check('过期后打开原来的清单: 提示已保存的进度和地址已过期', s.resume.includes(`5/${TOTAL}`) && s.resume.includes(await page.eval('i18n.resumeExpired')), s.resume);
    await page.close();
    page = await openParser(browser, playlist('C'));
    s = await state(page);
    file = await download(browser, page);
    c.check('重新取清单后接着下载 文件内容是 C 的', s.resume.includes(`5/${TOTAL}`) && !!file && sha256(file) == videos.C.hash, { resume: s.resume, size: file && file.length });
    c.check('页面没有报错', errors(page).length == 0, errors(page).slice(0, 3));
});
