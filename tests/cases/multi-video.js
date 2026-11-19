// 多视频同页关联
// 一个页面里有多个视频时 每个视频旁的浮窗只列出属于它自己的资源:
//   地址和 video 的 src 相同的资源归这个 video
//   其余的资源 (MSE 播放器请求的分片等) 归用 blob 地址播放的 video
'use strict';
const { launch, serve, send, html, fixture, test, sleep, until } = require('../lib/harness.js');

// 在扩展的隔离环境里读取每个浮窗 (浮窗在 closed shadow root 里) 以及它贴着的是哪个 video
const FLOATS = `(() => {
    const host = document.querySelector('cat-catch-float');
    if (!host) { return []; }
    const root = chrome.dom.openOrClosedShadowRoot(host);
    const videos = [...document.querySelectorAll('video')];
    return [...root.querySelectorAll('.CatCatchFloat')].filter(float => float.style.display != 'none').map(float => {
        const logo = float.querySelector('.logo').getBoundingClientRect();
        const x = logo.left + logo.width / 2, y = logo.top + logo.height / 2;
        const video = videos.find(video => { const box = video.getBoundingClientRect(); return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom; });
        return {
            video: video ? video.id : null, x, y,
            open: float.classList.contains('open'),
            count: float.querySelector('.count').textContent,
            own: [...float.querySelectorAll('.panel')].filter(panel => !panel.closest('details')).map(panel => panel.querySelector('.name').textContent),
            other: float.querySelector('summary').textContent,
        };
    });
})()`;

test('多视频同页关联', async (c) => {
    const site = await serve(async (req, res, url) => {
        if (url.pathname == '/page.html') {
            return html(res, `
                <video id="a" src="/media/one.mp4" width="320" height="180" style="display:block;margin:20px" muted autoplay loop playsinline></video>
                <video id="b" src="/media/two.mp4" width="320" height="180" style="display:block;margin:20px" muted autoplay loop playsinline></video>
                <video id="c" width="320" height="180" style="display:block;margin:20px" muted autoplay loop playsinline></video>
                <script>
                    // 第三个视频用 MSE 播放 数据来自 stream.mp4 另外还请求了一个和任何 video 的地址都对不上的 extra.mp4
                    const source = new MediaSource();
                    document.querySelector('#c').src = URL.createObjectURL(source);
                    source.addEventListener('sourceopen', async () => {
                        const buffer = source.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
                        buffer.appendBuffer(await fetch('/media/stream.mp4').then(response => response.arrayBuffer()));
                        buffer.addEventListener('updateend', () => source.endOfStream(), { once: true });
                        await fetch('/media/extra.mp4').then(response => response.arrayBuffer());
                    }, { once: true });
                </script>`);
        }
        if (url.pathname.startsWith('/media/')) {
            send(req, res, fixture('video.mp4'), 'video/mp4');
            return true;
        }
    });
    c.defer(site.close);
    const browser = await launch();
    c.defer(browser.close);
    const page = await browser.open(site.origin + '/page.html');
    const playing = await until(() => page.eval(`[...document.querySelectorAll('video')].every(video => video.currentTime > 0.3)`), 10000);
    c.check('三个视频都在播放', !!playing, await page.eval(`[...document.querySelectorAll('video')].map(video => [video.id, video.currentTime, video.error && video.error.message])`));
    const tabId = await browser.tabId('/page.html');
    const sniffed = await until(async () => { const names = await browser.sw.eval(`(cacheData[${tabId}] || []).map(item => item.name)`); return names.length >= 4 ? names : null; }, 8000);
    c.check('嗅探到 4 个资源', !!sniffed && ['one.mp4', 'two.mp4', 'stream.mp4', 'extra.mp4'].every((name) => sniffed.includes(name)), sniffed);

    const isolated = await until(() => page.isolated(browser.extId), 5000);
    // 浮窗是隔一会儿才向后台要一次资源列表的 最后一个资源可能晚一步到 等数量到齐再看
    let floats = await until(async () => { const list = await page.eval(FLOATS, isolated); return list.length == 3 && list.every((float) => float.count != '' && float.count != '0') && list.some((float) => float.video == 'c' && float.count == '2') ? list : null; }, 10000) || await page.eval(FLOATS, isolated);
    console.log('    浮窗:', JSON.stringify(floats.map((float) => [float.video, float.count])));
    c.check('每个视频旁各有一个浮窗', floats.length == 3 && ['a', 'b', 'c'].every((id) => floats.some((float) => float.video == id)), floats);
    const count = Object.fromEntries(floats.map((float) => [float.video, float.count]));
    c.check('浮窗上的数量: 两个有地址的视频各 1 个 MSE 的视频 2 个', count.a == '1' && count.b == '1' && count.c == '2', count);
    // 逐个展开 看列出的资源
    for (const id of ['a', 'b', 'c']) {
        const float = floats.find((item) => item.video == id);
        if (!float) { continue; }
        await page.click(float.x, float.y);
        await sleep(700);
    }
    floats = await page.eval(FLOATS, isolated);
    const own = Object.fromEntries(floats.map((float) => [float.video, float.own.sort().join()]));
    console.log('    展开后:', JSON.stringify(floats.map((float) => [float.video, float.own, float.other])));
    c.check('地址相同的资源归对应的视频', own.a == 'one.mp4' && own.b == 'two.mp4', own);
    c.check('其余的资源归 MSE 的视频', own.c == 'extra.mp4,stream.mp4', own);
    c.check('别的视频的资源收在"本页其他资源"里', floats.every((float) => float.other.includes(`(${4 - float.own.length})`)), floats.map((float) => float.other));
    c.check('页面没有报错', page.errors.length == 0, page.errors.slice(0, 3));
});
