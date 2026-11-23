// 下载切片列表
// 解析器里的 下载切片列表 导出的 txt 用来交给外部下载器 每行必须和清单里的切片地址完全一致
// 切片地址里常见百分号编码 (签名里的 %2F %3D 中文目录名等) 导出时不能被解码
'use strict';
const { launch, serve, send, segment, test } = require('../lib/harness.js');
const { openParser, state, errors } = require('../lib/parser.js');

test('下载切片列表', async (c) => {
    // 三段地址 分别带 %2F %3D 的签名参数 百分号编码的目录名 和 %20
    const paths = [
        'seg-0.ts?n=0&sig=a%2Fb%3D',
        '%E4%B8%AD/seg-1.ts',
        'seg-2.ts?x=%20y',
    ];
    const site = await serve(async (req, res, url) => {
        if (url.pathname == '/enc/index.m3u8') {
            const lines = paths.map((path) => `#EXTINF:2,\n${path}`).join('\n');
            send(req, res, Buffer.from(`#EXTM3U\n#EXT-X-TARGETDURATION:2\n${lines}\n#EXT-X-ENDLIST\n`), 'application/vnd.apple.mpegurl');
            return true;
        }
        // 切片按清单里的写法请求 路径里的百分号编码原样保留
        const index = paths.findIndex((path) => url.pathname + url.search == '/enc/' + path);
        if (index != -1) {
            send(req, res, segment(index, 4000), 'video/mp2t');
            return true;
        }
    });
    c.defer(site.close);
    const browser = await launch();
    c.defer(browser.close);
    const page = await openParser(browser, site.origin + '/enc/index.m3u8');
    const parsed = await state(page);
    c.check('清单解析出 3 个切片', parsed.fragments == 3, parsed);
    // 清单里写的地址 解析成绝对地址后就是期望导出的内容
    const expected = paths.map((path) => `${site.origin}/enc/${path}`);
    const fragments = await page.eval('_fragments.map(fragment => fragment.url)');
    c.check('切片地址带百分号编码', JSON.stringify(fragments) == JSON.stringify(expected), { fragments, expected });

    // 点 下载切片列表 读出保存的 txt
    const before = browser.files();
    await page.eval(`document.querySelector('#downText').click()`);
    const file = await browser.download(before);
    const lines = file ? file.toString('utf8').split('\n').filter((line) => line.trim()) : [];
    console.log('    导出的列表:', JSON.stringify(lines));
    c.check('导出 3 行地址', lines.length == 3, lines);
    c.check('导出的地址和清单里的切片地址一致', JSON.stringify(lines) == JSON.stringify(expected), { lines, expected });
    c.check('页面没有报错', errors(page).length == 0, errors(page).slice(0, 3));
});
