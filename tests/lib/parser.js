// m3u8 解析器页面的常用操作
'use strict';
const { until } = require('./harness.js');

// 页面的状态
const STATE = `(() => {
    const shown = (selector) => { const el = document.querySelector(selector); return !!el && getComputedStyle(el).display != 'none'; };
    return {
        fragments: _fragments.length,
        error: shown('#loading') ? document.querySelector('#loading').innerText.trim().slice(0, 80) : '',
        progress: document.querySelector('#progress').textContent,
        resume: shown('#resumeBox') ? document.querySelector('#resumeTips').textContent : '',
        tips: document.querySelector('#tips').innerText.trim(),
        download: shown('#button'),
    };
})()`;
// 记录页面用 fetch 发出的 GET 请求 (下载切片 / 密钥 / 核对内容) 解析器自己的预览用的是 XHR 估算大小用的是 HEAD 都不在内
const RECORD = `window.__fetched = []; (() => { const origin = window.fetch; window.fetch = function (input, init) { if (((init && init.method) || 'GET') == 'GET') { window.__fetched.push(String((input && input.url) || input)); } return origin.apply(this, arguments); }; })();`;

/**
 * 打开扩展的页面 在页面脚本运行之前装好请求记录
 * @param {Object} browser launch() 的返回值
 * @param {String} url 扩展内的页面地址 例如 m3u8.html?url=...
 */
async function openPage(browser, url) {
    const page = await browser.open('about:blank');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORD });
    await page.send('Page.navigate', { url: browser.url(url) });
    return page;
}
/**
 * 打开 m3u8 解析器 等它解析完
 * @param {String} url m3u8 地址
 * @param {Object} params 其他地址参数
 */
async function openParser(browser, url, params = {}) {
    const page = await openPage(browser, 'm3u8.html?' + new URLSearchParams({ url, ...params }));
    await until(() => page.eval('_fragments.length > 0'), 10000);
    // 断点续传读取上次的进度是异步的
    await page.eval(`typeof storeReady == 'undefined' ? true : storeReady.then(() => true)`).catch(() => { });
    return page;
}
const state = (page) => page.eval(STATE);
// 页面用 fetch 请求过的地址 可以用正则筛选
const fetched = async (page, test = /./) => (await page.eval('window.__fetched')).filter((url) => test.test(url));
// 页面里没有捕获的异常 解析器取视频信息用的隐藏 video 被移除时 play() 会被中断 这个不算
const errors = (page) => page.errors.filter((text) => !text.includes('The play() request was interrupted'));

/**
 * 点 合并下载 等文件保存下来 返回文件内容
 * 关掉 mp4 转码和在线 ffmpeg 保存的就是各个切片按顺序拼起来的原始数据 可以逐字节核对
 * @param {Object} options { thread: 线程数, timeout }
 */
async function download(browser, page, options = {}) {
    const before = browser.files();
    await page.eval(`(() => {
        for (const id of ['ffmpeg', 'mp4', 'StreamSaver']) { document.querySelector('#' + id).checked = false; }
        ${options.thread ? `document.querySelector('#thread').value = ${options.thread};` : ''}
        document.querySelector('#mergeTs').click();
    })()`);
    return options.wait === false ? null : browser.download(before, options.timeout || 30000);
}

module.exports = { openPage, openParser, state, fetched, errors, download };
