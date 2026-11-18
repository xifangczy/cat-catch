// 声称浏览器不支持 DRM 让网站给无加密版本
// 跑在页面主环境 document_start
// 猫抓发现 当前标签开着这个功能时 下次加载注入
(function () {
    if (window.__catCatchNoDrm) { return; }
    window.__catCatchNoDrm = true;

    const notSupported = function (name) {
        try {
            return Promise.reject(new DOMException(name + " is not supported.", "NotSupportedError"));
        } catch (e) {
            const err = new Error(name + " is not supported.");
            err.name = "NotSupportedError";
            return Promise.reject(err);
        }
    };
    // 这些标志在 MIME 里出现一般意味着加密 把它们挡掉
    const encryptedRe = /(^|[^a-z])(encrypted|cenc|cbcs|drm|widevine|playready|fairplay|clearkey|eme)([^a-z]|$)/i;

    // 1. navigator.requestMediaKeySystemAccess 整体拒绝
    //    把 Navigator.prototype 上的也替掉 避免解构赋值拿到原函数
    try {
        const refuse = function () { return notSupported("requestMediaKeySystemAccess"); };
        if (Navigator.prototype.requestMediaKeySystemAccess) {
            Object.defineProperty(Navigator.prototype, "requestMediaKeySystemAccess", {
                value: refuse, writable: true, configurable: true
            });
        }
        if (navigator.requestMediaKeySystemAccess) {
            Object.defineProperty(navigator, "requestMediaKeySystemAccess", {
                value: refuse, writable: true, configurable: true
            });
        }
    } catch (e) { }

    // 2. MediaSource.isTypeSupported 对带加密关键字的 MIME 返回 false
    try {
        const origin = MediaSource.isTypeSupported;
        MediaSource.isTypeSupported = function (type) {
            if (typeof type == "string" && encryptedRe.test(type)) { return false; }
            return origin.call(this, type);
        };
    } catch (e) { }
    try {
        if (typeof WebKitMediaSource != "undefined" && WebKitMediaSource.isTypeSupported) {
            const origin = WebKitMediaSource.isTypeSupported;
            WebKitMediaSource.isTypeSupported = function (type) {
                if (typeof type == "string" && encryptedRe.test(type)) { return false; }
                return origin.call(this, type);
            };
        }
    } catch (e) { }

    // 3. HTMLMediaElement.canPlayType 加密 MIME 返回空串
    try {
        const origin = HTMLMediaElement.prototype.canPlayType;
        HTMLMediaElement.prototype.canPlayType = function (type) {
            if (typeof type == "string" && encryptedRe.test(type)) { return ""; }
            return origin.call(this, type);
        };
    } catch (e) { }

    // 4. navigator.mediaCapabilities.decodingInfo 带 keySystemConfiguration 的查询都返回不支持
    try {
        const mc = navigator.mediaCapabilities;
        if (mc && typeof mc.decodingInfo == "function") {
            const origin = mc.decodingInfo;
            mc.decodingInfo = function (cfg) {
                if (cfg && cfg.keySystemConfiguration) {
                    return Promise.resolve({ supported: false, smooth: false, powerEfficient: false, keySystemAccess: null });
                }
                return origin.call(this, cfg);
            };
        }
    } catch (e) { }

    // 5. 把 navigator.plugins 和 mimeTypes 里带 Widevine / PlayReady / FairPlay 的条目去掉
    //    现代浏览器一般看不到这些 以防万一
    try {
        const plugins = navigator.plugins;
        if (plugins && plugins.length) {
            const filtered = [];
            for (let i = 0; i < plugins.length; i++) {
                const name = plugins[i]?.name || "";
                if (!/widevine|playready|fairplay|eme/i.test(name)) { filtered.push(plugins[i]); }
            }
            if (filtered.length != plugins.length) {
                Object.defineProperty(navigator, "plugins", { value: filtered, configurable: true });
            }
        }
    } catch (e) { }
})();
