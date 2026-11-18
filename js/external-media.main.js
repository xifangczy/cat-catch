// 跟踪页面主环境里 不挂在 DOM 上的 HTMLMediaElement
// 这些元素 content-script.js 的 querySelectorAll("video, audio") 查不到
// (例如 Spotify 的网页播放器把音频塞进一个 从不 append 进 document 的 video 元素)
// 跑在页面主环境 document_start all_frames
// 和 content-script.js 的隔离环境靠 CustomEvent 作桥
(function () {
    if (window.__catCatchExtMedia) { return; }
    window.__catCatchExtMedia = true;

    // ========== DRM ==========
    // 这段和 content-script.js 里的实现相同 (隔离环境和主环境各看到一份 encrypted 事件)
    const DRM_SYSTEMS = {
        "edef8ba979d64acea3c827dcd51d21ed": "Widevine",
        "9a04f07998404286ab92e65be0885f95": "PlayReady",
        "94ce86fb07ff4f43adb893d2fa968ca2": "FairPlay",
        "1077efecc0b24d02ace33c1e52e2fb4b": "ClearKey",
        "e2719d58a985b3c9781ab030af78d30e": "ClearKey"
    };
    const drmNames = new WeakMap();
    function onEncrypted(event) {
        const media = event.target;
        if (!(media instanceof HTMLMediaElement) || event.initDataType != "cenc" || !event.initData) { return; }
        const names = drmNames.get(media) ?? new Set();
        try {
            const view = new DataView(event.initData);
            for (let offset = 0; offset + 28 <= view.byteLength;) {
                const size = view.getUint32(offset);
                if (size < 28 || offset + size > view.byteLength) { break; }
                if (view.getUint32(offset + 4) == 0x70737368) {
                    let id = "";
                    for (let i = 0; i < 16; i++) {
                        id += view.getUint8(offset + 12 + i).toString(16).padStart(2, "0");
                    }
                    DRM_SYSTEMS[id] && names.add(DRM_SYSTEMS[id]);
                }
                offset += size;
            }
        } catch (e) { }
        drmNames.set(media, names);
    }
    // 元素在 DOM 里时 事件会从 window 捕获下去 不在 DOM 里只能挂在元素自己身上
    // 两边都装一份 保证收得到
    window.addEventListener("encrypted", onEncrypted, true);

    // ========== 跟踪媒体元素 ==========
    const tracked = new Set();       // Set<WeakRef<HTMLMediaElement>>
    const seen = new WeakSet();      // 防止一个元素被加多次

    function track(target) {
        if (!(target instanceof HTMLMediaElement) || seen.has(target)) { return; }
        seen.add(target);
        tracked.add(new WeakRef(target));
        // 挂在元素自己上 这样元素不挂进 DOM 时 encrypted 事件也收得到
        try { target.addEventListener("encrypted", onEncrypted, true); } catch (e) { }
    }

    // 1. 任何方式 new 出来的 video / audio
    try {
        const origin = Document.prototype.createElement;
        Document.prototype.createElement = function (tag, options) {
            const el = options === undefined ? origin.call(this, tag) : origin.call(this, tag, options);
            if (el instanceof HTMLMediaElement) { track(el); }
            return el;
        };
    } catch (e) { }
    // 2. new Audio() 走的是 constructor 不走 createElement
    try {
        const OriginAudio = window.Audio;
        function Audio(src) {
            const el = src === undefined ? new OriginAudio() : new OriginAudio(src);
            track(el);
            return el;
        }
        Audio.prototype = OriginAudio.prototype;
        Object.defineProperty(window, "Audio", { value: Audio, writable: true, configurable: true });
    } catch (e) { }
    // 3. 兜底: play / srcObject / src 都是网站实际让元素开始工作的时机 hook 住保险
    try {
        const origin = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
            track(this);
            return origin.apply(this, arguments);
        };
    } catch (e) { }
    try {
        const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject");
        if (d && d.set) {
            Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
                get: d.get, configurable: d.configurable, enumerable: d.enumerable,
                set: function (v) { track(this); return d.set.call(this, v); }
            });
        }
    } catch (e) { }
    try {
        const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
        if (d && d.set) {
            Object.defineProperty(HTMLMediaElement.prototype, "src", {
                get: d.get, configurable: d.configurable, enumerable: d.enumerable,
                set: function (v) { track(this); return d.set.call(this, v); }
            });
        }
    } catch (e) { }

    // 返回所有 "活着" 的跟踪元素 顺带清理失效的 WeakRef
    function getAll() {
        const result = [];
        for (const ref of tracked) {
            const el = ref.deref();
            el ? result.push(el) : tracked.delete(ref);
        }
        return result;
    }
    // 不在 DOM 树里的那些 (这才是 content-script 找不到的)
    function externalOnly() {
        return getAll().filter((el) => !el.isConnected);
    }

    // ========== 桥 ==========
    // 隔离环境里的 content-script.js 发事件问主环境
    // CustomEvent.detail 跨 world 边界会被 clone 隔离环境修改看不见
    // 所以走 DOM attribute (Blink 层共享)
    // 不是 isolated 调用时也可以直接传 detail 作为 req
    document.documentElement.addEventListener("cat-catch-ext-media-req", function (event) {
        const bridge = document.documentElement;
        let req;
        // 同 world 调用可以直接给 detail
        if (event.detail && typeof event.detail == "object") {
            req = event.detail;
        } else {
            try { req = JSON.parse(bridge.dataset.ccExtMediaReq || "{}"); } catch (e) { req = {}; }
        }
        const external = externalOnly();
        let result;
        if (req.action == "drm") {
            let hit = false;
            const names = new Set();
            for (const el of external) {
                if (!el.mediaKeys) { continue; }
                hit = true;
                const set = drmNames.get(el);
                if (set) { set.forEach((n) => names.add(n)); }
            }
            result = hit ? [...names] : false;
        } else if (req.action == "state") {
            result = external.map((el) => ({
                tag: el.tagName,
                currentSrc: el.currentSrc || el.src || "",
                paused: el.paused,
                duration: el.duration,
                currentTime: el.currentTime,
                volume: el.volume,
                muted: el.muted,
                loop: el.loop,
                playbackRate: el.playbackRate,
                readyState: el.readyState,
                videoWidth: el.videoWidth || 0,
                videoHeight: el.videoHeight || 0,
                drm: el.mediaKeys ? [...(drmNames.get(el) ?? [])] : false
            }));
        }
        // 两边都写 同 world 的调用直接读 req.result 跨 world 的读 dataset
        req.result = result;
        try { bridge.dataset.ccExtMediaResp = JSON.stringify(result); } catch (e) { }
    }, true);
})();
