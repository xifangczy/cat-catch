// 低版本chrome manifest v3协议 会有 getMessage 函数不存在的bug
if (chrome.i18n.getMessage === undefined) {
    chrome.i18n.getMessage = (key) => key;
    fetch(chrome.runtime.getURL("_locales/zh_CN/messages.json")).then(res => res.json()).then(data => {
        chrome.i18n.getMessage = (key) => data[key].message;
    }).catch((e) => { console.error(e); });
}
/**
 * 部分修改版chrome 不存在 chrome.downloads API
 * 例如 夸克浏览器
 * 使用传统下载方式下载 但无法监听 无法另存为 无法判断下载是否失败 唉~
 */
if (!chrome.downloads) {
    chrome.downloads = {
        download: function (options, callback) {
            let a = document.createElement('a');
            a.href = options.url;
            a.download = options.filename;
            a.click();
            a = null;
            callback && callback();
        },
        onChanged: { addListener: function () { } },
        showDefaultFolder: function () { },
        show: function () { },
    }
}
// 兼容 114版本以下没有chrome.sidePanel
if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel = {
        setOptions: function (options) { },
        setPanelBehavior: function (options) { },
    }
}

// 简写翻译函数
const i18n = new Proxy(chrome.i18n.getMessage, {
    get: function (target, key) {
        return chrome.i18n.getMessage(key);
    }
});