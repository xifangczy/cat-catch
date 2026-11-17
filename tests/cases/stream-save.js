// 大文件流式写入 (边下边存)
// 多线程下载时切片完成的顺序是乱的 写入文件必须按顺序 而且要边下边写 不能等全部下完
// 这里把保存文件的那一端换成记录器 (不依赖在线的 StreamSaver 服务) 核对写入的字节和顺序
'use strict';
const { launch, serve, send, segment, test, sleep, until } = require('../lib/harness.js');
const { openParser, state, errors } = require('../lib/parser.js');

const TOTAL = 48;
const SIZE = 512 * 1024;
// 可以分段累加的校验值 和分几次写入无关
function fnv(hash, bytes) {
    for (let i = 0; i < bytes.length; i++) { hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0; }
    return hash;
}

test('大文件流式写入', async (c) => {
    const segments = Array.from({ length: TOTAL }, (_, index) => segment(index, SIZE));
    const total = segments.reduce((sum, item) => sum + item.length, 0);
    const expected = segments.reduce((hash, item) => fnv(hash, item), 2166136261);
    const times = [];   // 每个切片被请求的时间
    const site = await serve(async (req, res, url) => {
        if (url.pathname == '/big/index.m3u8') {
            send(req, res, Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n' + segments.map((_, index) => `#EXTINF:2,\nseg-${index}.ts\n`).join('') + '#EXT-X-ENDLIST\n'), 'application/vnd.apple.mpegurl');
            return true;
        }
        const match = /^\/big\/seg-(\d+)\.ts$/.exec(url.pathname);
        if (match) {
            if (req.method == 'GET') {
                times.push(Date.now());
                // 每 4 个里有一个慢的 让完成的顺序和清单的顺序不一样
                await sleep(match[1] % 4 == 0 ? 250 : 20);
            }
            send(req, res, segments[match[1]], 'video/mp2t');
            return true;
        }
    });
    c.defer(site.close);
    const browser = await launch();
    c.defer(browser.close);
    const page = await openParser(browser, site.origin + '/big/index.m3u8');
    c.check(`清单解析出 ${TOTAL} 个切片 共 ${(total / 1024 / 1024).toFixed(1)} MB`, (await state(page)).fragments == TOTAL);
    await sleep(1500);  // 等解析器自己的预览探测结束
    times.length = 0;
    const before = browser.files();
    // 把 StreamSaver 的写入端换成记录器 然后用 边下边存 下载
    await page.eval(`(() => {
        const record = window.__stream = { bytes: 0, writes: 0, hash: 2166136261, first: 0, last: 0, closed: false, name: '' };
        streamSaver.createWriteStream = function (name) {
            record.name = name;
            return { getWriter: () => ({
                write(chunk) {
                    record.first = record.first || Date.now();
                    record.last = Date.now();
                    record.writes++;
                    record.bytes += chunk.length;
                    let hash = record.hash;
                    for (let i = 0; i < chunk.length; i++) { hash = Math.imul(hash ^ chunk[i], 16777619) >>> 0; }
                    record.hash = hash;
                },
                close() { record.closed = true; },
                abort() { record.aborted = true; },
            }) };
        };
        for (const id of ['ffmpeg', 'mp4']) { document.querySelector('#' + id).checked = false; }
        document.querySelector('#StreamSaver').checked = true;
        document.querySelector('#thread').value = 6;
        document.querySelector('#mergeTs').click();
    })()`);
    const record = await until(async () => { const r = await page.eval('window.__stream'); return r.closed ? r : null; }, 60000, 200) || await page.eval('window.__stream');
    console.log('    写入记录:', JSON.stringify(record), '| 期望', total, '字节 校验值', expected);
    c.check('下载完成 文件流已关闭', record.closed && !record.aborted, record);
    c.check('写入的字节数和内容与按顺序拼接的结果一致', record.bytes == total && record.hash == expected, { bytes: record.bytes, hash: record.hash });
    c.check('每个切片写入一次', record.writes == TOTAL, record.writes);
    const lastRequest = Math.max(...times);
    c.check('边下边写: 最后一个切片还没开始下载时 已经在写入', record.first > 0 && record.first < lastRequest, { first: record.first, lastRequest });
    c.check('没有另外生成整个文件再保存', browser.files().length == before.length, browser.files());
    c.check('页面没有报错', errors(page).length == 0, errors(page).slice(0, 3));
});
