// 无 PSSH 的 DRM 清单
// 清单里只声明了加密方式 没有带 pssh 也要认出是 DRM 提示不能下载 不能当成普通资源去解析和下载
// 页面里用了 EME 的媒体 资源列表里要标出 DRM
'use strict';
const { launch, serve, send, html, fixture, test, sleep, until } = require('../lib/harness.js');
const { openPage, state, errors } = require('../lib/parser.js');

const KID = '0123456789abcdef0123456789abcdef';
const KEY = '00112233445566778899aabbccddeeff';
const PROTECTION = `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" cenc:default_KID="01234567-89ab-cdef-0123-456789abcdef"/>
        <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>`;
const mpd = (protection) => `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" xmlns:cenc="urn:mpeg:cenc:2013" type="static" mediaPresentationDuration="PT8S" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-live:2011">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true">
        ${protection}
      <SegmentTemplate timescale="1000" duration="4000" startNumber="1" initialization="init-$RepresentationID$.mp4" media="seg-$RepresentationID$-$Number$.m4s"/>
      <Representation id="v1" bandwidth="500000" codecs="avc1.42E01E" width="320" height="180" frameRate="10"/>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4" lang="en" segmentAlignment="true">
        ${protection}
      <SegmentTemplate timescale="1000" duration="4000" startNumber="1" initialization="init-$RepresentationID$.mp4" media="seg-$RepresentationID$-$Number$.m4s"/>
      <Representation id="a1" bandwidth="64000" codecs="mp4a.40.2" audioSamplingRate="22050"/>
    </AdaptationSet>
  </Period>
</MPD>`;
const m3u8 = (key) => `#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:2\n#EXT-X-PLAYLIST-TYPE:VOD\n${key}#EXTINF:2,\nsegment.ts?n=1\n#EXTINF:2,\nsegment.ts?n=2\n#EXT-X-ENDLIST\n`;
// 用 EME (ClearKey) 播放: 视频不加密 音频加密
const PLAYER = `<video id="v" width="320" height="180" style="display:block;margin:20px" muted playsinline loop></video>
<script>
const hex = (text) => new Uint8Array(text.match(/../g).map((value) => parseInt(value, 16)));
const base64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
(async () => {
    const video = document.querySelector('#v');
    const access = await navigator.requestMediaKeySystemAccess('org.w3.clearkey', [{ initDataTypes: ['keyids'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }]);
    const keys = await access.createMediaKeys();
    await video.setMediaKeys(keys);
    const session = keys.createSession();
    session.addEventListener('message', () => session.update(new TextEncoder().encode(JSON.stringify({ keys: [{ kty: 'oct', kid: base64(hex('${KID}')), k: base64(hex('${KEY}')) }], type: 'temporary' }))));
    await session.generateRequest('keyids', new TextEncoder().encode(JSON.stringify({ kids: [base64(hex('${KID}'))] })));
    const source = new MediaSource();
    video.src = URL.createObjectURL(source);
    await new Promise((resolve) => source.addEventListener('sourceopen', resolve, { once: true }));
    const buffers = [['video/mp4; codecs="avc1.42E01E"', '/media/video.mp4'], ['audio/mp4; codecs="mp4a.40.2"', '/media/audio-cenc.mp4']].map(([type, url]) => [source.addSourceBuffer(type), url]);
    for (const [buffer, url] of buffers) {
        buffer.appendBuffer(await fetch(url).then((response) => response.arrayBuffer()));
        await new Promise((resolve) => buffer.addEventListener('updateend', resolve, { once: true }));
    }
    source.endOfStream();
    video.play();
})().catch((error) => { window.playerError = String(error); });
</script>`;

test('无 PSSH 的 DRM 清单', async (c) => {
    const site = await serve(async (req, res, url) => {
        const text = {
            '/drm.mpd': [mpd(PROTECTION), 'application/dash+xml'],
            '/clear.mpd': [mpd(''), 'application/dash+xml'],
            '/fairplay.m3u8': [m3u8('#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://test",KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1"\n'), 'application/vnd.apple.mpegurl'],
            '/widevine.m3u8': [m3u8('#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,URI="data:text/plain;base64,AAAA",KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed",KEYFORMATVERSIONS="1"\n'), 'application/vnd.apple.mpegurl'],
            '/clear.m3u8': [m3u8(''), 'application/vnd.apple.mpegurl'],
        }[url.pathname];
        if (text) {
            send(req, res, Buffer.from(text[0]), text[1]);
            return true;
        }
        if (url.pathname == '/player.html') { return html(res, PLAYER); }
    });
    c.defer(site.close);
    const browser = await launch();
    c.defer(browser.close);

    // mpd 解析器
    const MPD = `(() => { const shown = (selector) => getComputedStyle(document.querySelector(selector)).display != 'none'; return { notice: shown('#loading') ? document.querySelector('#loading').innerText.trim() : '', main: shown('#main'), videos: document.querySelectorAll('#mpdVideoLists option').length }; })()`;
    let page = await openPage(browser, 'mpd.html?url=' + encodeURIComponent(site.origin + '/drm.mpd'));
    await until(() => page.eval(`document.querySelector('#loading').innerText.trim() != '' && typeof mpdJson == 'object'`), 5000);
    if (!await page.eval(`typeof getDrmName == 'function'`)) {
        c.skip('这个版本没有对 DRM 的处理');
        return;
    }
    let s = await until(async () => { const x = await page.eval(MPD); return /DRM/.test(x.notice) ? x : null; }, 8000) || await page.eval(MPD);
    console.log('    mpd 解析器 (DRM):', JSON.stringify(s));
    c.check('mpd: 没有 pssh 的清单也认出 DRM 写明是 Widevine', /DRM/.test(s.notice) && s.notice.includes('Widevine'), s);
    c.check('mpd: 只显示提示 没有解析和下载的界面', !s.main, s);
    c.check('mpd: 页面没有报错', errors(page).length == 0, errors(page).slice(0, 3));
    await page.close();
    page = await openPage(browser, 'mpd.html?url=' + encodeURIComponent(site.origin + '/clear.mpd'));
    s = await until(async () => { const x = await page.eval(MPD); return x.videos ? x : null; }, 8000) || await page.eval(MPD);
    c.check('mpd: 没有加密的清单照常解析', s.main && s.videos == 1 && !/DRM/.test(s.notice), s);
    await page.close();

    // m3u8 解析器
    for (const [name, drm] of [['fairplay.m3u8', 'FairPlay'], ['widevine.m3u8', 'Widevine'], ['clear.m3u8', '']]) {
        page = await openPage(browser, 'm3u8.html?url=' + encodeURIComponent(`${site.origin}/${name}`));
        await until(async () => { const x = await state(page); return x.fragments > 0 || /DRM/.test(x.tips); }, 8000);
        await sleep(1000);
        s = await state(page);
        if (drm) {
            c.check(`m3u8 ${drm}: 提示不能下载 没有下载的界面 没有报"解析出错"`, /DRM/.test(s.tips) && s.tips.includes(drm) && !s.download && s.error == '', s);
        } else {
            c.check('m3u8: 没有加密的清单照常解析', s.fragments == 2 && s.download && !/DRM/.test(s.tips), s);
        }
        c.check(`m3u8 ${name}: 页面没有报错`, errors(page).length == 0, errors(page).slice(0, 3));
        await page.close();
    }

    // 页面里用 EME 播放的媒体
    const player = await browser.open(site.origin + '/player.html');
    const playing = await until(() => player.eval(`document.querySelector('#v').currentTime > 0.5`), 10000);
    c.check('ClearKey 视频能播放 (测试环境)', !!playing, await player.eval('window.playerError'));
    const tabId = await browser.tabId('/player.html');
    const video = await browser.sw.eval(`new Promise(resolve => chrome.tabs.sendMessage(${tabId}, { Message: 'getVideoState', index: 0 }, { frameId: 0 }, resolve))`);
    c.check('媒体控制: 能读到播放状态 并标明受 DRM 保护', !!video && video.count == 1 && Array.isArray(video.drm), video);
    const popup = await browser.open(browser.url(`popup.html?tabId=${tabId}&type=tab`), 640, 600);
    const ROWS = `[...document.querySelectorAll('#mediaList .panel')].map(panel => ({ name: panel.querySelector('.name').textContent.trim(), drm: !!panel.querySelector('.drm'), disabled: panel.querySelector('.DownCheck').disabled, checked: panel.querySelector('.DownCheck').checked, download: !panel.querySelector('#download').classList.contains('hide') }))`;
    const rows = await until(async () => { const list = await popup.eval(ROWS); return list.length == 2 && list.every((row) => row.drm) ? list : null; }, 8000) || await popup.eval(ROWS);
    console.log('    弹窗:', JSON.stringify(rows));
    c.check('弹窗: 这个页面的两个资源都标了 DRM', rows.length == 2 && rows.every((row) => row.drm), rows);
    c.check('弹窗: DRM 资源不能勾选 没有下载图标', rows.every((row) => row.disabled && !row.checked && !row.download), rows);
    c.check('弹窗: 页面没有报错', popup.errors.length == 0, popup.errors.slice(0, 3));
});
