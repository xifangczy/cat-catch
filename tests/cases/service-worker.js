// Service Worker 发起的请求
// 页面被 Service Worker 接管后 请求在浏览器看来不属于任何标签 (tabId 是 -1)
// 资源要归到它真正所在的标签 不能算到当前激活的标签头上
'use strict';
const { launch, serve, send, html, fixture, test, until } = require('../lib/harness.js');

test('Service Worker 发起的请求', async (c) => {
    const site = await serve(async (req, res, url) => {
        if (url.pathname == '/sw/sw.js') {
            // 页面的请求原样转发 收到消息时自己发起一个请求
            send(req, res, Buffer.from(`
                self.addEventListener('install', () => self.skipWaiting());
                self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
                self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)));
                self.addEventListener('message', (event) => event.waitUntil(fetch(event.data).then((response) => response.arrayBuffer())));
            `), 'text/javascript');
            return true;
        }
        if (url.pathname == '/sw/page.html') {
            return html(res, `<script>
                window.ready = navigator.serviceWorker.register('/sw/sw.js').then(() => navigator.serviceWorker.ready)
                    .then(() => navigator.serviceWorker.controller || new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve)))
                    .then(() => true);
            </script>`);
        }
        if (url.pathname == '/other.html') { return html(res, '另一个标签'); }
        if (url.pathname.endsWith('.mp4')) {
            send(req, res, fixture('video.mp4'), 'video/mp4');
            return true;
        }
    });
    c.defer(site.close);
    const browser = await launch();
    c.defer(browser.close);

    const page = await browser.open(site.origin + '/sw/page.html');
    c.check('页面被 Service Worker 接管', await until(() => page.eval('window.ready'), 10000) === true);
    // 再开一个同域名的标签 并让它成为当前激活的标签
    const other = await browser.open(site.origin + '/other.html');
    await other.send('Page.bringToFront');
    const [pageTab, otherTab] = [await browser.tabId('/sw/page.html'), await browser.tabId('/other.html')];
    await until(() => browser.sw.eval(`G.tabId == ${otherTab}`), 3000);
    c.check('当前激活的是另一个标签', await browser.sw.eval('G.tabId') == otherTab, { pageTab, otherTab });

    // 1. 页面发起 经 Service Worker 转发的请求
    await page.eval(`fetch('/sw/forwarded.mp4').then((response) => response.arrayBuffer()).then(() => true)`);
    // 2. Service Worker 自己发起的请求
    await page.eval(`navigator.serviceWorker.controller.postMessage('/sw/own.mp4'); true`);
    const list = (tabId) => browser.sw.eval(`(cacheData[${tabId}] || []).map(item => item.name)`);
    const found = await until(async () => { const names = await list(pageTab); return names.includes('forwarded.mp4') && names.includes('own.mp4') ? names : null; }, 8000);
    console.log('    页面所在标签:', JSON.stringify(await list(pageTab)), '| 另一个标签:', JSON.stringify(await list(otherTab)));
    c.check('两个请求都归到页面所在的标签', !!found, await list(pageTab));
    c.check('没有算到当前激活的标签头上', (await list(otherTab)).length == 0, await list(otherTab));
    const tabIds = await browser.sw.eval(`(cacheData[${pageTab}] || []).map(item => item.tabId)`);
    c.check('资源记录的标签也是页面所在的标签', tabIds.length > 0 && tabIds.every((id) => id == pageTab), tabIds);
    c.check('后台没有报错', browser.sw.errors.length == 0, browser.sw.errors.slice(0, 3));
});
