// 跑在页面主环境 document_start all_frames
// 1. 记下不挂在 DOM 上的媒体元素 content-script.js 的 querySelectorAll("video, audio") 找不到它们
//    (例如 Spotify 网页播放器的音乐 是一个从不 append 进 document 的 video 在放)
// 2. 记下每个资源地址喂给的是加密轨道还是明文轨道 弹窗和浮窗按资源标 DRM 不再整页一刀切
// 和隔离环境里的 content-script.js 靠 documentElement 上的事件同步通信:
//   cat-catch-ext-media-req   (隔离 -> 主) detail: { action: "list" }
//   cat-catch-ext-media-node  (主 -> 隔离) MouseEvent relatedTarget 就是元素 DOM 节点跨 world 传过去还是同一个
//   cat-catch-ext-media-data  (主 -> 隔离) detail 是普通数据 (跨 world 会被复制 所以只能单向传)
(function () {
    "use strict";
    const MARK = Symbol.for("catCatchExtMedia");
    if (window[MARK]) { return; }
    try { Object.defineProperty(window, MARK, { value: true }); } catch (e) { return; }

    // ========== DRM 名称 ==========
    // 和 content-script.js 的实现相同 不在 DOM 里的元素 encrypted 事件不会经过 window 隔离环境收不到
    const DRM_SYSTEMS = {
        "edef8ba979d64acea3c827dcd51d21ed": "Widevine",
        "9a04f07998404286ab92e65be0885f95": "PlayReady",
        "94ce86fb07ff4f43adb893d2fa968ca2": "FairPlay",
        "1077efecc0b24d02ace33c1e52e2fb4b": "ClearKey",
        "e2719d58a985b3c9781ab030af78d30e": "ClearKey"
    };
    const drmNames = new WeakMap();    // 媒体元素 => Set DRM 名称
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
    window.addEventListener("encrypted", onEncrypted, true);

    // 替换原型上的方法 / setter 出错就算了 不影响页面
    function method(owner, key, apply) {
        try {
            const desc = owner && Object.getOwnPropertyDescriptor(owner, key);
            if (!desc || typeof desc.value != "function") { return; }
            Object.defineProperty(owner, key, Object.assign({}, desc, { value: new Proxy(desc.value, { apply }) }));
        } catch (e) { }
    }
    function accessor(owner, key, part, apply) {
        try {
            const desc = owner && Object.getOwnPropertyDescriptor(owner, key);
            if (!desc || typeof desc[part] != "function") { return; }
            Object.defineProperty(owner, key, Object.assign({}, desc, { [part]: new Proxy(desc[part], { apply }) }));
        } catch (e) { }
    }

    // ========== 跟踪媒体元素 ==========
    const tracked = new Set();       // Set<WeakRef<HTMLMediaElement>>
    const seen = new WeakSet();
    function track(target) {
        if (!(target instanceof HTMLMediaElement) || seen.has(target)) { return; }
        seen.add(target);
        tracked.add(new WeakRef(target));
        target.addEventListener("encrypted", onEncrypted, true);
    }
    // document.createElement("video") / new Audio() / 设置 src srcObject / play()
    method(Document.prototype, "createElement", function (target, thisArg, args) {
        const el = Reflect.apply(target, thisArg, args);
        el instanceof HTMLMediaElement && track(el);
        return el;
    });
    try {
        const desc = Object.getOwnPropertyDescriptor(window, "Audio");
        desc && Object.defineProperty(window, "Audio", Object.assign({}, desc, {
            value: new Proxy(desc.value, {
                construct(target, args, newTarget) {
                    const el = Reflect.construct(target, args, newTarget);
                    track(el);
                    return el;
                }
            })
        }));
    } catch (e) { }
    const media = HTMLMediaElement.prototype;
    method(media, "play", function (target, thisArg, args) {
        track(thisArg);
        return Reflect.apply(target, thisArg, args);
    });
    for (const key of ["src", "srcObject"]) {
        accessor(media, key, "set", function (target, thisArg, args) {
            track(thisArg);
            return Reflect.apply(target, thisArg, args);
        });
    }
    function external() {
        const result = [];
        for (const ref of tracked) {
            const el = ref.deref();
            if (!el) { tracked.delete(ref); continue; }
            !el.isConnected && result.push(el);
        }
        return result;
    }

    // ========== 资源地址 => 加密 / 明文 ==========
    // fetch / XHR 拿到的 ArrayBuffer 记下来自哪个地址
    // 喂给 SourceBuffer 时 看这个 SourceBuffer 的初始化段里有没有加密的盒子 (tenc encv enca sinf pssh)
    const bufferUrl = new WeakMap();     // ArrayBuffer => 地址
    const sources = [];                  // [{ kind, encrypted: null | Boolean, urls: Set, ms: WeakRef<MediaSource> }]
    const sourceOf = new WeakMap();      // SourceBuffer => 上面的对象
    const blobSource = new Map();        // blob 地址 => WeakRef<MediaSource> 用来找到元素对应的 MediaSource
    method(URL, "createObjectURL", function (target, thisArg, args) {
        const url = Reflect.apply(target, thisArg, args);
        try {
            if (args[0] && typeof args[0].addSourceBuffer == "function") {
                blobSource.set(url, new WeakRef(args[0]));
                blobSource.size > 100 && blobSource.delete(blobSource.keys().next().value);
            }
        } catch (e) { }
        return url;
    });
    // 读到了 但还没原样喂给 SourceBuffer 的数据 播放器可能把初始化段和第一个分片拼成一块再喂
    // 喂进去的那块对不上地址时 找最近读到的 1~3 块 长度加起来正好相等的 就是它们拼的
    const pending = [];                  // [{ url, size, time }]
    function remember(buffer, url) {
        if (!url || !(buffer instanceof ArrayBuffer)) { return; }
        bufferUrl.set(buffer, url);
        buffer.byteLength && pending.push({ url: url, size: buffer.byteLength, time: Date.now() });
        pending.length > 50 && pending.shift();
    }
    function pieces(length) {
        const now = Date.now();
        const list = pending.filter(item => now - item.time < 15000).slice(-12);
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].size == length) { return [list[i]]; }
        }
        for (let i = list.length - 1; i >= 0; i--) {
            for (let j = i - 1; j >= 0; j--) {
                if (list[i].size + list[j].size == length) { return [list[j], list[i]]; }
                for (let k = j - 1; k >= 0; k--) {
                    if (list[i].size + list[j].size + list[k].size == length) { return [list[k], list[j], list[i]]; }
                }
            }
        }
        return [];
    }
    function consume(items) {
        items.forEach(item => { const index = pending.indexOf(item); index != -1 && pending.splice(index, 1); });
    }
    method(Response.prototype, "arrayBuffer", function (target, thisArg, args) {
        const promise = Reflect.apply(target, thisArg, args);
        const url = thisArg.url;
        url && promise.then(function (buffer) { remember(buffer, url); }, function () { });
        return promise;
    });
    accessor(XMLHttpRequest.prototype, "response", "get", function (target, thisArg, args) {
        const result = Reflect.apply(target, thisArg, args);
        try { result instanceof ArrayBuffer && !bufferUrl.has(result) && remember(result, thisArg.responseURL); } catch (e) { }
        return result;
    });
    const MediaSourceClass = window.MediaSource || window.ManagedMediaSource;
    method(MediaSourceClass && MediaSourceClass.prototype, "addSourceBuffer", function (target, thisArg, args) {
        const buffer = Reflect.apply(target, thisArg, args);
        const type = String(args[0] || "").toLowerCase();
        const info = { kind: type.startsWith("audio") ? "audio" : type.startsWith("video") ? "video" : "", encrypted: null, urls: new Set(), ms: new WeakRef(thisArg) };
        sources.push(info);
        sources.length > 200 && sources.shift();
        sourceOf.set(buffer, info);
        return buffer;
    });
    // 数据开头 64KB 里有没有某几个 MP4 盒子的名字
    const BOX = (name) => [...name].map(ch => ch.charCodeAt(0));
    const INIT_BOXES = [BOX("ftyp"), BOX("moov")];
    const ENCRYPTED_BOXES = [BOX("tenc"), BOX("encv"), BOX("enca"), BOX("sinf"), BOX("pssh"), BOX("senc")];
    function hasBox(bytes, boxes) {
        for (let i = 0; i + 4 <= bytes.length; i++) {
            for (const box of boxes) {
                if (bytes[i] == box[0] && bytes[i + 1] == box[1] && bytes[i + 2] == box[2] && bytes[i + 3] == box[3]) { return true; }
            }
        }
        return false;
    }
    method(window.SourceBuffer && SourceBuffer.prototype, "appendBuffer", function (target, thisArg, args) {
        try {
            const info = sourceOf.get(thisArg);
            const data = args[0];
            if (info && data) {
                const buffer = data instanceof ArrayBuffer ? data : data.buffer;
                const bytes = data instanceof ArrayBuffer ? new Uint8Array(data, 0, Math.min(data.byteLength, 65536))
                    : new Uint8Array(data.buffer, data.byteOffset, Math.min(data.byteLength, 65536));
                if (hasBox(bytes, INIT_BOXES)) {
                    info.encrypted = hasBox(bytes, ENCRYPTED_BOXES);
                } else if (info.encrypted !== true && hasBox(bytes, ENCRYPTED_BOXES)) {
                    info.encrypted = true;    // 初始化段没认出来 媒体段带 senc 的也算
                }
                const url = buffer && bufferUrl.get(buffer);
                if (url) {
                    info.urls.add(url);
                    consume(pending.filter(item => item.url == url && item.size == buffer.byteLength));
                } else {
                    const items = pieces(data.byteLength);
                    items.forEach(item => info.urls.add(item.url));
                    consume(items);
                }
            }
        } catch (e) { }
        return Reflect.apply(target, thisArg, args);
    });

    // ========== 桥 ==========
    document.addEventListener("cat-catch-ext-media-req", function (event) {
        const root = event.target;
        if (!event.detail || event.detail.action != "list" || !root || !root.dispatchEvent) { return; }
        const list = external();
        // 元素本身 一个一个传过去
        for (const el of list) {
            root.dispatchEvent(new MouseEvent("cat-catch-ext-media-node", { relatedTarget: el }));
        }
        // 加密 / 明文的地址
        // 用了 EME 的元素 (有 mediaKeys) 它的明文轨道也算 DRM (同一个节目只加密了部分轨道)
        // 只有喂给没用 EME 的元素的明文轨道才算明文 (例如 Spotify 页面上的 Canvas 短视频)
        const encrypted = new Set(), clear = new Set();
        const all = [...getAll(), ...document.querySelectorAll("video, audio")];
        const drmSources = new Set();
        for (const el of all) {
            if (!el.mediaKeys) { continue; }
            const ms = el.srcObject || blobSource.get(el.currentSrc || el.src)?.deref();
            ms && drmSources.add(ms);
        }
        for (const info of sources) {
            const drm = drmSources.has(info.ms.deref());
            if (info.encrypted === null && !drm) { continue; }
            info.urls.forEach(url => (info.encrypted || drm ? encrypted : clear).add(url));
        }
        // 不走 MSE 直接用文件地址播放的媒体 有 mediaKeys 是加密的 没有就是明文
        for (const el of all) {
            const src = el.currentSrc;
            src && !src.startsWith("blob:") && (el.mediaKeys ? encrypted : clear).add(src);
        }
        encrypted.forEach(url => clear.delete(url));
        root.dispatchEvent(new CustomEvent("cat-catch-ext-media-data", {
            detail: {
                // 和元素一一对应 有 mediaKeys 的给 DRM 名称 (不知道是哪种时是空数组) 没有的是 false
                drm: list.map(el => el.mediaKeys ? [...(drmNames.get(el) ?? [])] : false),
                encrypted: [...encrypted],
                clear: [...clear]
            }
        }));
    }, true);
    function getAll() {
        const result = [];
        for (const ref of tracked) {
            const el = ref.deref();
            el && result.push(el);
        }
        return result;
    }
})();
