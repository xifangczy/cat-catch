// 声称浏览器不支持 DRM 让有无加密版本的网站改发无加密版本
// 跑在页面主环境 document_start
// manifest 里静态注入到每个页面 只有本标签开了这个功能 (sessionStorage 里有标记) 才生效
// 标记由后台在开关时写入 跨域的 frame 由 webNavigation.onCommitted 补写标记后再执行一次本文件
//
// 模拟的是一个没有任何 CDM 的浏览器: EME 接口都在 但所有 key system 都申请不到
// (直接删掉 EME 接口 有的播放器会认为浏览器太旧 连无加密的也不播)
(function () {
    "use strict";
    const FLAG = "catCatchNoDrm";
    let enabled = false;
    try { enabled = window.sessionStorage.getItem(FLAG) === "1"; } catch (e) { }
    if (!enabled) { return; }

    const MARK = Symbol.for(FLAG);
    const UNSUPPORTED = "Unsupported keySystem or supportedConfigurations.";
    // MIME 里出现这些字样 说明是在问加密的格式
    const encryptedRe = /(^|[^a-z])(encrypted|cenc|cbcs|cens|cbc1|drm|widevine|playready|fairplay|clearkey|eme)([^a-z]|$)/i;
    // 包装过的函数 => 原函数 toString 时返回原函数的文字 看起来和原生的一样
    const natives = new WeakMap();

    install(window);

    function install(win) {
        try {
            if (!win || win[MARK]) { return; }
            Object.defineProperty(win, MARK, { value: true });
        } catch (e) { return; }    // 跨域的 window 访问会抛错

        const reject = (message) => win.Promise.reject(new win.DOMException(message, "NotSupportedError"));
        const fail = (message) => { throw new win.DOMException(message, "NotSupportedError"); };

        function wrap(target, handler) {
            const proxy = new win.Proxy(target, handler);
            natives.set(proxy, target);
            return proxy;
        }
        // 替换对象上的方法 (保留原来的属性描述)
        function method(owner, key, apply) {
            try {
                const desc = owner && Object.getOwnPropertyDescriptor(owner, key);
                if (!desc || typeof desc.value != "function") { return; }
                Object.defineProperty(owner, key, Object.assign({}, desc, { value: wrap(desc.value, { apply }) }));
            } catch (e) { }
        }
        // 替换 getter
        function getter(owner, key, apply) {
            try {
                const desc = owner && Object.getOwnPropertyDescriptor(owner, key);
                if (!desc || typeof desc.get != "function") { return; }
                Object.defineProperty(owner, key, Object.assign({}, desc, { get: wrap(desc.get, { apply }) }));
            } catch (e) { }
        }
        // 替换全局的构造函数 new 的时候报不支持 静态的 isTypeSupported 返回 false
        function constructor(key) {
            try {
                const desc = Object.getOwnPropertyDescriptor(win, key);
                if (!desc || typeof desc.value != "function") { return; }
                method(desc.value, "isTypeSupported", () => false);
                Object.defineProperty(win, key, Object.assign({}, desc, {
                    value: wrap(desc.value, { construct: () => fail(UNSUPPORTED) })
                }));
            } catch (e) { }
        }

        // toString 先换掉 后面包装的函数都显示成原生的
        method(win.Function && win.Function.prototype, "toString", function (target, thisArg, args) {
            return Reflect.apply(target, natives.has(thisArg) ? natives.get(thisArg) : thisArg, args);
        });

        // 1. 标准 EME: 申请任何 key system 都失败
        //    参数本身不对的 (空字符串 空数组) 交给原函数 报的错和原生一致
        method(win.Navigator && win.Navigator.prototype, "requestMediaKeySystemAccess", function (target, thisArg, args) {
            if (typeof args[0] != "string" || args[0] === "" || !args[1] || !args[1].length) {
                return Reflect.apply(target, thisArg, args);
            }
            return reject(UNSUPPORTED);
        });
        // 别处拿到的 MediaKeys 也挂不上 (null 是卸载 照常)
        method(win.HTMLMediaElement && win.HTMLMediaElement.prototype, "setMediaKeys", function (target, thisArg, args) {
            if (args[0] === null) { return Reflect.apply(target, thisArg, args); }
            return reject(UNSUPPORTED);
        });

        // 2. 加了前缀的旧版 EME (Safari 旧版 / IE / EME v0.1b)
        constructor("WebKitMediaKeys");
        constructor("MSMediaKeys");
        const media = win.HTMLMediaElement && win.HTMLMediaElement.prototype;
        for (const key of ["generateKeyRequest", "webkitGenerateKeyRequest", "webkitSetMediaKeys", "msSetMediaKeys"]) {
            method(media, key, () => fail(UNSUPPORTED));
        }

        // 3. 问加密格式的 MIME 都说不支持
        for (const key of ["MediaSource", "ManagedMediaSource", "WebKitMediaSource"]) {
            method(win[key], "isTypeSupported", function (target, thisArg, args) {
                if (typeof args[0] == "string" && encryptedRe.test(args[0])) { return false; }
                return Reflect.apply(target, thisArg, args);
            });
        }
        // canPlayType 的第二个参数是 EME v0.1b 的 key system
        method(media, "canPlayType", function (target, thisArg, args) {
            if (args.length > 1 && args[1]) { return ""; }
            if (typeof args[0] == "string" && encryptedRe.test(args[0])) { return ""; }
            return Reflect.apply(target, thisArg, args);
        });

        // 4. Media Capabilities 带 keySystemConfiguration 的查询 回答不支持
        method(win.MediaCapabilities && win.MediaCapabilities.prototype, "decodingInfo", function (target, thisArg, args) {
            if (args[0] && typeof args[0] == "object" && args[0].keySystemConfiguration) {
                return win.Promise.resolve({ supported: false, smooth: false, powerEfficient: false, keySystemAccess: null });
            }
            return Reflect.apply(target, thisArg, args);
        });

        // 5. 旧浏览器的 navigator.plugins / mimeTypes 里会列出 CDM 有的话去掉
        try {
            const cdm = /widevine|playready|fairplay|primetime|content decryption/i;
            for (const key of ["plugins", "mimeTypes"]) {
                const list = win.navigator[key];
                if (!list || !list.length) { continue; }
                const kept = [];
                for (let i = 0; i < list.length; i++) {
                    const item = list[i];
                    if (!cdm.test((item && (item.name || item.type || item.description)) || "")) { kept.push(item); }
                }
                kept.length != list.length && Object.defineProperty(win.navigator, key, { value: kept, configurable: true });
            }
        } catch (e) { }

        // 6. 同源 iframe / 弹出窗口里拿到的是没改过的接口 拿到时也装上
        //    (content script 注入新 frame 有先后 网站可以抢在前面拿)
        const child = function (target, thisArg, args) {
            const result = Reflect.apply(target, thisArg, args);
            try { install(result && result.window === result ? result : result && result.defaultView); } catch (e) { }
            return result;
        };
        for (const key of ["HTMLIFrameElement", "HTMLFrameElement", "HTMLObjectElement"]) {
            const proto = win[key] && win[key].prototype;
            getter(proto, "contentWindow", child);
            getter(proto, "contentDocument", child);
        }
        method(win, "open", child);
    }
})();
