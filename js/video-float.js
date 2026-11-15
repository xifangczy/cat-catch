/**
 * 视频浮窗
 * 开关在 设置 - 其他设置 - 在视频旁显示下载浮窗 (videoFloat) 默认开启
 * 在页面的 video 角上显示猫抓图标和这个 video 的资源数量 点击图标展开浮窗
 * 浮窗只管它所在的这个 video:
 *   媒体控制 和 popup 的媒体控制一致 直接控制这个 video
 *   资源列表 和 popup 的资源列表一致 可以 复制 / 解析 / 预览 / 下载 / 发送 也可以勾选后 下载 / 复制 / 在线合并
 *   同一个 frame 的其他资源收在 "本页其他资源" 里 默认折叠
 * 样式沿用 catch-script 的页面面板 和 popup 图标使用 img 目录的图标 (由后台提供)
 *
 * 资源和 video 的对应规则 (资源只取和 video 同一个 frame 嗅探到的):
 * 1. 资源地址和 video 的 currentSrc / src / <source> 相同 属于该 video
 * 2. 其余资源交给没有匹配到地址的 video (MSE blob 地址 / 地址被重定向 等)
 *    只有一个这样的 video 全部归它
 *    有多个时 按资源出现的时间和 video 开始加载的时间 (loadstart) 就近分配
 *
 * 未开启时只读取一次设置 不监听页面 不创建任何元素
 */
(function () {
    if (window.catCatchVideoFloat) { return; }
    window.catCatchVideoFloat = true;

    const MIN_WIDTH = 200;      // video 小于这个尺寸不显示浮窗
    const MIN_HEIGHT = 110;
    const MARGIN = 10;          // 浮窗和 video 边缘的距离
    const MAX_ROWS = 60;        // 一组资源最多显示的数量
    const START_SLACK = 3000;   // 资源比 video 开始加载早出现 这个毫秒数以内仍然算它的
    const TICK = 500;           // 定时检查页面 video 的间隔
    const HTML_NS = "http://www.w3.org/1999/xhtml";
    // 需要同步到媒体控制的 video 事件
    const MEDIA_EVENTS = ["play", "pause", "volumechange", "ratechange", "timeupdate", "durationchange", "loadedmetadata", "emptied", "seeked", "enterpictureinpicture", "leavepictureinpicture"];

    let running = false;
    let list = [];      // 后台返回的 当前 frame 的资源列表
    let total = 0;      // 当前 frame 的资源总数 (list 只保留最新的一部分)
    let stale = true;   // 资源列表需要重新向后台获取
    let icons = null;   // 图标 { 图标名: data URL } 由后台读取 img 目录提供
    let options = {};   // 和浮窗有关的设置 决定显示哪些操作图标
    let optionsKey = "";
    let playbackRate = 2;   // 倍速 和 popup 的媒体控制共用
    let rateTimer = 0;
    const libWaiting = {};  // 等待库注入的回调 { 库名称: [回调] }
    let host = null;    // 浮窗容器 挂在 documentElement 下
    let root = null;    // 浮窗容器的 shadow root
    let anchor = null;  // 拖动后的位置 相对 video 宽高的比例 { fx, fy } 页面内所有浮窗共用
    let tickTimer = 0;
    let fetchTimer = 0;
    let fetchAt = 0;
    let failures = 0;   // 连续获取资源列表失败的次数
    let frame = 0;
    const floats = new Map();           // video => 浮窗
    const startTimes = new WeakMap();   // 媒体元素 => 开始加载的时间 数组
    const dismissed = new WeakSet();    // 被手动关闭浮窗的 video
    const videos = document.getElementsByTagName("video");
    const audios = document.getElementsByTagName("audio");
    const dark = window.matchMedia("(prefers-color-scheme: dark)");

    // 面板样式沿用 catch-script 的页面面板 资源列表 按钮 媒体控制 沿用 css/public.css css/popup.css
    const STYLE = `
        * { box-sizing: border-box; }
        .CatCatchFloat {
            --background-color: #fff;
            --background-color-opacity: #ffffffea;
            --background-color-two: #f5f5f5;
            --text-color: #000;
            --text2-color: rgb(26, 115, 232);
            --link-color: #3079ed;
            --size-color: #666;
            --border-color: #c7c7c7;
            --input-border: solid 1px #000;
            --button-color: #fff;
            --button-text-color: rgb(26, 115, 232);
            --button-border: solid 1px #c7c7c780;
            --button-hover-color: rgb(66 133 244 / 4%);
            --button-active-color: rgb(66 133 244 / 10%);
            --button2-color: rgb(26, 115, 232);
            --button2-text-color: #fff;
            --button2-hover-color: rgb(26 115 232 / 90%);
            --button2-active-color: rgb(26 115 232 / 50%);
            --media-accent: #1a73e8;
            --media-track: rgb(26 115 232 / 22%);
            position: absolute;
            left: 0;
            top: 0;
            pointer-events: auto;
            background: var(--background-color-opacity);
            border: solid 1px var(--border-color);
            border-radius: 4px;
            color: var(--text2-color);
            padding: 5px;
            font-size: 12px;
            line-height: normal;
            font-family: "Microsoft YaHei", "Helvetica", "Arial", sans-serif;
            text-align: left;
            direction: ltr;
            user-select: none;
            -webkit-user-select: none;
            opacity: 0.6;
        }
        .CatCatchFloat:hover,
        .CatCatchFloat.open {
            opacity: 1;
        }
        @media (prefers-color-scheme: dark) {
            .CatCatchFloat {
                --background-color: #0f172a;
                --background-color-opacity: #0f172aea;
                --background-color-two: #1e293b;
                --text-color: #fff;
                --text2-color: #fff;
                --link-color: #94a3b8;
                --size-color: #94a3b8;
                --border-color: #c7c7c780;
                --input-border: solid 1px #ffffffb6;
                --button-color: #161b22;
                --button-text-color: #fff;
                --button2-color: rgb(26 115 232 / 50%);
                --media-track: rgb(255 255 255 / 22%);
            }
        }
        .head { display: flex; align-items: center; cursor: move; }
        .logo { width: 20px; height: 20px; cursor: pointer; -webkit-user-drag: none; }
        .count { margin-left: 4px; font-weight: bold; }
        .tips {
            display: none; visibility: hidden; flex: 1; min-width: 0; margin-left: 10px;
            font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .CatCatchFloat.open .tips { display: block; }
        .tips.show { visibility: visible; }
        .content { display: none; flex-direction: column; width: 420px; max-width: calc(100vw - 24px); margin-top: 4px; }
        .CatCatchFloat.open .content { display: flex; }

        .icon, .regex { flex: none; width: 20px; height: 20px; -webkit-user-drag: none; }
        .icon { cursor: pointer; transition: all 0.1s; }
        .icon:hover { transform: scale(1.2); }
        .icon:active { transform: scale(0.9); }

        .PlayControl {
            display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; padding: 6px 8px;
            border-radius: 4px; background: var(--background-color-two);
        }
        .mediaProgress { display: flex; align-items: center; gap: 8px; }
        .mediaTime { min-width: 3.2em; text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .mediaButtons { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
        .mediaGroup { display: flex; align-items: center; gap: 6px; }
        .PlayControl .control { width: 26px; height: 26px; }
        .mediaOff { opacity: 0.4; }
        .mediaRange {
            --pct: 0%; -webkit-appearance: none; appearance: none; flex: 1; min-width: 0; height: 16px;
            margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer;
        }
        .mediaRange:focus { outline: none; }
        .mediaRange::-webkit-slider-runnable-track {
            height: 4px; border-radius: 2px;
            background: linear-gradient(to right, var(--media-accent) var(--pct), var(--media-track) var(--pct));
        }
        .mediaRange::-webkit-slider-thumb {
            -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px; border-radius: 50%;
            background: var(--media-accent); transition: transform 0.1s;
        }
        .mediaRange:hover::-webkit-slider-thumb { transform: scale(1.3); }
        .mediaRange::-moz-range-track { height: 4px; border-radius: 2px; background: var(--media-track); }
        .mediaRange::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--media-accent); }
        .mediaRange::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: var(--media-accent); }
        .mediaVolume { flex: none; width: 70px; }
        .playbackRate {
            width: 3.4em; height: 20px; margin: 0 -3px 0 0; padding: 1px 2px; font: inherit;
            color: var(--text-color); background: var(--background-color); border: var(--input-border);
        }
        .mediaSpeedUnit { margin-right: 4px; font-weight: bold; }

        .list { max-height: 420px; overflow-x: hidden; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #1a73e8 transparent; }
        .panel { border: 1px solid #ddd0; margin-bottom: 1px; }
        .panel-heading {
            display: flex; flex-direction: row; align-items: center; padding: 5px;
            background-color: var(--background-color-two); cursor: pointer;
        }
        .name { flex: auto; min-width: 0; margin-right: 3px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; color: var(--text-color); }
        .bold { font-weight: bold; }
        .size { flex: none; font-weight: bold; color: var(--size-color); white-space: nowrap; }
        .panel-heading .icon { margin-left: 3px; }
        .regex { margin-right: 2px; }
        .DownCheck { flex: 0 0 auto; width: 15px; height: 15px; margin: 0 4px 0 0; -webkit-appearance: auto; appearance: auto; cursor: pointer; }
        .url { padding: 5px; color: var(--text-color); word-break: break-all; cursor: auto; user-select: text; -webkit-user-select: text; }
        .url a { color: var(--link-color); text-decoration: none; }
        .url a:hover { text-decoration: underline; }
        .moreButton { display: flex; margin: 2px 0; }
        .moreButton .icon { margin-right: 3px; }
        .qrcodeBox canvas { display: block; max-width: 100%; height: auto; margin: 4px 0; padding: 6px; background: #fff; }
        .confirm { padding: 5px; text-align: center; }
        .confirm textarea {
            display: block; width: 100%; margin-bottom: 4px; font: inherit; resize: vertical;
            color: var(--text-color); background: var(--background-color); border: var(--input-border);
        }
        .confirm button { margin: 0 2px; }
        .preview { display: block; max-width: 100%; max-height: 200px; margin-top: 4px; background: #000; }
        .screenshots { display: block; max-width: 100%; max-height: 200px; margin: 4px auto 0; }
        details { margin-top: 2px; }
        summary { padding: 2px 0; font-weight: bold; cursor: pointer; }
        .note { display: none; padding-top: 2px; color: var(--size-color); }
        .note.show { display: block; }
        .down { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
        button {
            margin: 0; padding: 3px 6px; border-radius: 4px; font: inherit; cursor: pointer;
            background: var(--button-color); border: var(--button-border); color: var(--button-text-color);
        }
        button:hover { background: var(--button-hover-color); }
        button:active { background: var(--button-active-color); }
        .button2 { background: var(--button2-color); color: var(--button2-text-color); }
        .button2:hover { background: var(--button2-hover-color); }
        .button2:active { background: var(--button2-active-color); }
        button:disabled { background-color: #ccc; color: #666; cursor: not-allowed; opacity: 0.6; }
    `;

    /******************** 工具函数 ********************/
    function i18n(key, substitutions) {
        try {
            return chrome.i18n.getMessage(key, substitutions) || key;
        } catch (e) {
            return key;
        }
    }
    function h(tag, className, text) {
        const el = document.createElementNS(HTML_NS, tag);
        if (className) { el.className = className; }
        if (text !== undefined) { el.textContent = text; }
        return el;
    }
    // 图标 使用 img 目录的图标文件 深色模式使用 -dark 图标 和 css/public.css 一致
    function iconURL(name) {
        return (dark.matches && icons[name + "-dark"]) || icons[name] || "";
    }
    function img(name, className, title) {
        const el = h("img", className);
        el.dataset.icon = name;
        el.src = iconURL(name);
        el.draggable = false;
        if (title) { el.title = title; }
        return el;
    }
    // 切换图标 例如 播放 / 暂停
    function setIcon(el, name, title) {
        if (el.dataset.icon != name) {
            el.dataset.icon = name;
            el.src = iconURL(name);
        }
        if (title && el.title != title) { el.title = title; }
    }
    function refreshIcons() {
        if (!root || !icons) { return; }
        for (const el of root.querySelectorAll("img[data-icon]")) {
            el.src = iconURL(el.dataset.icon);
        }
    }
    function textButton(className, text, onClick) {
        const btn = h("button", className, text);
        btn.type = "button";
        btn.tabIndex = -1;  // 不参与页面的 Tab 键顺序
        btn.addEventListener("click", onClick);
        return btn;
    }
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    function byteToSize(byte) {
        if (!byte || byte < 1024) { return ""; }
        if (byte < 1024 * 1024) { return (byte / 1024).toFixed(1) + "KB"; }
        if (byte < 1024 * 1024 * 1024) { return (byte / 1024 / 1024).toFixed(1) + "MB"; }
        return (byte / 1024 / 1024 / 1024).toFixed(1) + "GB";
    }
    // 秒转时间 和 js/function.js 的 secToTime 一致
    function secToTime(sec) {
        sec = Number.isFinite(sec) ? sec : 0;
        const hour = (sec / 3600) | 0;
        const min = ((sec % 3600) / 60) | 0;
        sec = (sec % 60) | 0;
        return (hour > 0 ? hour + ":" : "") + min.toString().padStart(2, "0") + ":" + sec.toString().padStart(2, "0");
    }
    function formatBitrate(bps) {
        if (bps >= 1000 * 1000) { return (bps / 1000 / 1000).toFixed(2) + " Mbps"; }
        return (bps / 1000).toFixed(2) + " kbps";
    }
    // 去掉 hash 的绝对地址 用于比较 (srcdoc / about:blank 的 frame 没有自己的地址 使用 baseURI)
    function normalize(url) {
        try {
            const parsing = new URL(url, document.baseURI);
            parsing.hash = "";
            return parsing.href;
        } catch (e) {
            return url;
        }
    }
    // 向后台发送消息 扩展被重载或更新后 旧的 content-script 失效 直接停止
    function send(message, callback) {
        try {
            chrome.runtime.sendMessage(message, function (response) {
                if (chrome.runtime.lastError) {
                    callback && callback(undefined);
                    return;
                }
                callback && callback(response);
            });
        } catch (e) {
            stop();
        }
    }
    function copyText(text) {
        const legacy = function () {
            const active = document.activeElement;
            const textarea = h("textarea");
            textarea.value = text;
            textarea.style.cssText = "position: fixed; left: -9999px; top: 0; opacity: 0;";
            (root ?? document.documentElement).appendChild(textarea);
            textarea.focus();
            textarea.select();
            let ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { }
            textarea.remove();
            try { active && active.focus && active.focus({ preventScroll: true }); } catch (e) { }
            return ok;
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(() => true, legacy);
        }
        return Promise.resolve(legacy());
    }
    /**
     * 按需加载库 由后台注入到当前环境 (和页面的脚本隔离)
     * hls: 预览 m3u8 需要 hls.js   qrcode: 二维码需要 jquery.qrcode
     * @param {String} name 库名称
     * @param {Function} callback 回调 参数为是否加载成功
     */
    function loadLib(name, callback) {
        const ready = function () {
            if (name == "hls") { return typeof globalThis.Hls == "function"; }
            return typeof globalThis.jQuery == "function" && typeof globalThis.jQuery.fn.qrcode == "function";
        };
        if (ready()) {
            callback(true);
            return;
        }
        if (libWaiting[name]) {
            libWaiting[name].push(callback);
            return;
        }
        libWaiting[name] = [callback];
        send({ Message: "videoFloatLib", lib: name }, function (ok) {
            const waiting = libWaiting[name];
            delete libWaiting[name];
            const loaded = ok === true && ready();
            waiting.forEach(item => item(loaded));
        });
    }

    /******************** 资源列表 ********************/
    // 请求资源列表 多次调用合并成一次 已经有更早的请求在排队则不处理
    function requestData(delay = 0) {
        if (!running) { return; }
        const at = Date.now() + delay;
        if (fetchTimer && fetchAt <= at) { return; }
        clearTimeout(fetchTimer);
        fetchAt = at;
        fetchTimer = setTimeout(fetchData, delay);
    }
    function fetchData() {
        fetchTimer = 0;
        // 页面内没有 video 不需要资源列表 等出现 video 再获取
        if (!running || !videos.length) { return; }
        stale = false;
        send({ Message: "videoFloatGetData", icons: !icons }, function (result) {
            if (!running) { return; }
            // 后台还没初始化完成 稍后重试 连续失败就等后台下一次通知
            if (result === "error" || result === undefined) {
                if (++failures <= 5) {
                    stale = true;
                    requestData(1000 * failures);
                }
                return;
            }
            failures = 0;
            if (!result || !Array.isArray(result.data)) { return; }
            if (result.icons && result.icons.icon) {
                icons = result.icons;
            }
            if (result.playbackRate > 0) {
                playbackRate = result.playbackRate;
            }
            // 设置有变化 操作图标需要重建
            const key = JSON.stringify(result.options ?? {});
            if (key != optionsKey) {
                optionsKey = key;
                options = result.options ?? {};
                for (const float of floats.values()) {
                    float.rows.forEach(destroyRow);
                    float.rows.clear();
                    float.ownBox.replaceChildren();
                    float.otherBox.replaceChildren();
                    float.signature = "";
                }
            }
            list = result.enable ? result.data : [];
            total = result.enable ? result.total : 0;
            for (const item of list) {
                // 页面内解码得到的轨道 地址随接收进度更新 用 requestId 标识 已有的行才不会被重建
                item.key = item.capture ? item.requestId : item.requestId + "\n" + item.url;
                item.href = normalize(item.url);
            }
            update();
        });
    }

    /**
     * 把资源分配给页面内的媒体元素
     * @returns {Array} [{ el: 媒体元素, own: Set 属于它的资源 }]
     */
    function assign() {
        const medias = [];
        for (const collection of [videos, audios]) {
            for (const el of collection) {
                // 浮窗里预览用的 video 不算页面的媒体
                if (root && el.getRootNode() === root) { continue; }
                // 摄像头 WebRTC 等媒体流没有可下载的资源
                const stream = typeof MediaStream == "function" && el.srcObject instanceof MediaStream;
                if (!el.currentSrc && (!el.srcObject || stream)) { continue; }
                const srcs = new Set();
                el.currentSrc && srcs.add(normalize(el.currentSrc));
                el.src && srcs.add(normalize(el.src));
                for (const source of el.getElementsByTagName("source")) {
                    source.src && srcs.add(normalize(source.src));
                }
                medias.push({ el: el, srcs: srcs, own: new Set(), direct: false });
            }
        }
        if (!medias.length || !list.length) { return medias; }

        // 1. 地址相同
        const pool = [];
        for (const item of list) {
            let claimed = false;
            for (const media of medias) {
                if (media.srcs.has(item.href)) {
                    media.own.add(item);
                    media.direct = true;
                    claimed = true;
                }
            }
            !claimed && pool.push(item);
        }

        // 2. 其余资源交给没有匹配到地址的媒体元素
        // 页面内解码得到的轨道就是播放器正在播放的内容 有它们时 其他没有匹配到地址的资源 (例如页面的提示音) 不再算作 video 的
        const captured = pool.filter(item => item.capture);
        const rest = captured.length ? captured : pool;
        const candidates = medias.filter(media => !media.direct);
        if (candidates.length == 1) {
            rest.forEach(item => candidates[0].own.add(item));
        } else if (candidates.length > 1) {
            for (const item of rest) {
                owners(item.getTime || 0, candidates).forEach(media => media.own.add(item));
            }
        }
        return medias;
    }
    /**
     * 多个媒体元素时 按资源出现的时间 找出它属于谁
     * 优先 资源出现之前(或之后很短时间内)开始加载的 取时间最近的
     * 其次 资源出现之后才开始加载的 取最早的
     * 最后 没有记录到开始加载时间的
     */
    function owners(time, candidates) {
        let near = Infinity;
        let later = Infinity;
        let nearOwners = [];
        let laterOwners = [];
        const unknown = [];
        for (const media of candidates) {
            const times = startTimes.get(media.el);
            if (!times || !times.length) {
                unknown.push(media);
                continue;
            }
            let before = Infinity;
            let after = Infinity;
            for (const start of times) {
                if (start <= time + START_SLACK) {
                    before = Math.min(before, Math.abs(time - start));
                } else {
                    after = Math.min(after, start - time);
                }
            }
            if (before < near) {
                near = before;
                nearOwners = [media];
            } else if (before == near && before != Infinity) {
                nearOwners.push(media);
            }
            if (after < later) {
                later = after;
                laterOwners = [media];
            } else if (after == later && after != Infinity) {
                laterOwners.push(media);
            }
        }
        if (nearOwners.length) { return nearOwners; }
        if (laterOwners.length) { return laterOwners; }
        return unknown;
    }
    // 资源太多时 优先保留需要解析的资源(m3u8 mpd) 再保留最新的 保持原来的顺序
    function limit(items, max) {
        if (items.length <= max) { return items; }
        const keep = new Set(items.filter(item => item.parsing).slice(-max));
        for (let i = items.length - 1; i >= 0 && keep.size < max; i--) {
            keep.add(items[i]);
        }
        return items.filter(item => keep.has(item));
    }

    /******************** 浮窗 ********************/
    function ensureHost() {
        if (host) {
            // 页面重写了 DOM 重新挂上
            !host.isConnected && document.documentElement && document.documentElement.appendChild(host);
            return;
        }
        host = h("cat-catch-float");
        host.style.cssText = `
            all: initial !important; display: block !important; position: fixed !important;
            left: 0 !important; top: 0 !important; width: 0 !important; height: 0 !important;
            margin: 0 !important; padding: 0 !important; border: 0 !important;
            z-index: 2147483647 !important; pointer-events: none !important;
            opacity: 1 !important; visibility: visible !important; transform: none !important; filter: none !important;`;
        root = host.attachShadow({ mode: "closed" });
        // 优先使用 adoptedStyleSheets 不受页面 CSP 限制
        let adopted = false;
        if (!navigator.userAgent.includes("Firefox")) {
            try {
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(STYLE);
                root.adoptedStyleSheets = [sheet];
                adopted = root.adoptedStyleSheets.length == 1;
            } catch (e) { }
        }
        if (!adopted) {
            root.appendChild(h("style", "", STYLE));
        }
        document.documentElement.appendChild(host);
    }

    function createFloat(video) {
        ensureHost();
        const float = {
            video: video, open: false, x: 0, y: 0, signature: "", tipTimer: 0,
            rows: new Map(),        // 资源 key => 一行资源
            checked: new Map(),     // 资源 key => 手动修改过的勾选状态
            own: [], other: [],     // 属于该 video 的资源 / 本页其他资源
            shownOwn: [], shownOther: []
        };
        float.el = h("div", "CatCatchFloat");
        float.el.style.display = "none";

        // 猫抓图标 + 资源数量 点击图标 展开 / 隐藏 按住可以拖动
        float.head = h("div", "head");
        float.logo = img("icon", "logo", i18n("catCatch"));
        float.count = h("span", "count");
        float.tips = h("span", "tips");     // 操作提示 显示在图标右边 不改变列表位置
        float.head.append(float.logo, float.count, float.tips);

        // 媒体控制
        float.media = createMedia(float);

        // 资源列表
        float.content = h("div", "content");
        float.list = h("div", "list");
        float.ownBox = h("div");
        float.details = h("details");
        float.summary = h("summary");
        float.otherBox = h("div");
        float.details.append(float.summary, float.otherBox);
        float.details.addEventListener("toggle", function () {
            float.signature = "";
            render(float);
            reposition();
        });
        float.list.append(float.ownBox, float.details);
        float.note = h("div", "note");

        // 底部按钮 和 popup 一致 对勾选的资源生效
        const down = h("div", "down");
        float.mergeDown = textButton("button2", i18n("onlineMerge"), function () { batch(float, "merge"); });
        down.append(
            float.mergeDown,
            textButton("", i18n("download"), function () { batch(float, "downloadAll"); }),
            textButton("", i18n("copy"), function () { batch(float, "copy"); }),
            textButton("", i18n("invertSelection"), function () { invert(float); }),
            textButton("", i18n("close"), function () {
                dismissed.add(video);
                removeFloat(video);
            })
        );
        float.content.append(float.media.el, float.list, float.note, down);
        float.el.append(float.head, float.content);

        // 浮窗内的操作不传给页面 不抢走页面的焦点 (输入框 滑块 详情里的文字和预览除外)
        for (const type of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "contextmenu", "wheel", "keydown", "keyup", "keypress", "input", "change"]) {
            float.el.addEventListener(type, function (event) {
                event.stopPropagation();
                if (type == "mousedown" && !event.target.closest(".url, input, textarea")) {
                    event.preventDefault();
                }
            }, { passive: type != "mousedown" });
        }
        // 按住图标或面板空白处拖动 点击图标 展开 / 隐藏
        float.el.addEventListener("pointerdown", function (event) {
            if (event.button !== 0) { return; }
            const logo = event.target === float.logo;
            if (!logo && event.target.closest("button, input, a, summary, .icon, .panel")) { return; }
            dragStart(float, event, logo);
        });
        // video 的状态同步到媒体控制
        float.onMedia = function () {
            float.open && syncMedia(float);
        };
        MEDIA_EVENTS.forEach(type => video.addEventListener(type, float.onMedia));

        root.appendChild(float.el);
        floats.set(video, float);
        return float;
    }
    function removeFloat(video) {
        const float = floats.get(video);
        if (!float) { return; }
        clearTimeout(float.tipTimer);
        MEDIA_EVENTS.forEach(type => video.removeEventListener(type, float.onMedia));
        float.rows.forEach(destroyRow);
        float.el.remove();
        floats.delete(video);
    }

    // 没有移动是点击 (点在图标上 展开 / 隐藏) 移动了是拖动
    function dragStart(float, event, toggle) {
        const el = float.el;
        const startX = event.clientX;
        const startY = event.clientY;
        const originX = float.x;
        const originY = float.y;
        let moved = false;
        try { el.setPointerCapture(event.pointerId); } catch (e) { }
        const move = function (ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!moved && Math.hypot(dx, dy) < 5) { return; }
            moved = true;
            const rect = float.video.getBoundingClientRect();
            if (!rect.width || !rect.height) { return; }
            anchor = {
                fx: clamp((originX + dx - rect.left) / rect.width, 0, 1),
                fy: clamp((originY + dy - rect.top) / rect.height, 0, 1)
            };
            reposition();
        };
        const end = function (ev) {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", end);
            el.removeEventListener("pointercancel", end);
            try { el.releasePointerCapture(ev.pointerId); } catch (e) { }
            if (!moved && toggle && ev.type == "pointerup") {
                float.open = !float.open;
                el.classList.toggle("open", float.open);
                render(float);
                reposition();
            }
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", end);
    }

    /******************** 媒体控制 ********************/
    // 设置滑块的值 并更新已播放 / 当前音量部分的填充
    function setRange(range, value) {
        if (value !== undefined && !isNaN(value)) {
            range.value = value;
        }
        const min = parseFloat(range.min) || 0;
        const max = parseFloat(range.max) || 100;
        range.style.setProperty("--pct", `${(range.value - min) / (max - min) * 100}%`);
    }
    function createRange(className, max, step, title) {
        const range = h("input", className);
        range.type = "range";
        range.min = 0;
        range.max = max;
        range.step = step;
        range.tabIndex = -1;
        if (title) { range.title = title; }
        return range;
    }
    // 和 popup 的媒体控制一致 直接控制浮窗所在的 video
    function createMedia(float) {
        const video = float.video;
        const media = { seeking: false };
        media.el = h("div", "PlayControl");
        const icon = function (name, title, onClick) {
            const el = img(name, "icon " + name, title);
            el.addEventListener("click", function () {
                try { onClick(); } catch (e) { }
                syncMedia(float);
            });
            return el;
        };

        // 进度
        const progress = h("div", "mediaProgress");
        media.current = h("span", "mediaTime", "00:00");
        media.time = createRange("mediaRange", 100, 0.1);
        media.duration = h("span", "mediaTime", "00:00");
        progress.append(media.current, media.time, media.duration);
        // 拖动时预览要跳转到的时间 松开后跳转
        media.time.addEventListener("input", function () {
            media.seeking = true;
            setRange(media.time);
            Number.isFinite(video.duration) && (media.current.textContent = secToTime(media.time.value * video.duration / 100));
        });
        media.time.addEventListener("change", function () {
            media.seeking = false;
            if (Number.isFinite(video.duration)) {
                video.currentTime = media.time.value * video.duration / 100;
            }
        });

        const buttons = h("div", "mediaButtons");
        const left = h("div", "mediaGroup");
        const right = h("div", "mediaGroup");
        // 播放 / 暂停
        media.control = icon("play", i18n("play"), function () {
            video.paused ? video.play().catch(function () { }) : video.pause();
        });
        media.control.classList.add("control");
        // 静音 音量
        media.muted = icon("volume", i18n("mute"), function () {
            video.muted = !video.muted;
        });
        media.volume = createRange("mediaRange mediaVolume", 1, 0.01, i18n("volume"));
        media.volume.addEventListener("input", function () {
            setRange(media.volume);
            video.volume = media.volume.value;
        });
        // 循环
        media.loop = icon("loop", i18n("loop"), function () {
            video.loop = !video.loop;
        });
        left.append(media.control, media.muted, media.volume, media.loop);

        // 倍速 点击图标在 设定的倍数 和 正常速度 之间切换
        const getRate = function () {
            const rate = parseFloat(media.rate.value);
            return rate >= 0.1 && rate <= 16 ? rate : playbackRate;
        };
        const saveRate = function (rate) {
            playbackRate = rate;
            clearTimeout(rateTimer);
            rateTimer = setTimeout(function () {
                try { chrome.storage.sync.set({ playbackRate: rate }); } catch (e) { }
            }, 200);
        };
        media.speed = icon("speed", i18n("speedPlayback"), function () {
            if (video.playbackRate == 1) {
                saveRate(getRate());
                video.playbackRate = getRate();
            } else {
                video.playbackRate = 1;
            }
        });
        media.rate = h("input", "playbackRate");
        media.rate.type = "number";
        media.rate.min = 0.1;
        media.rate.max = 16;
        media.rate.step = 1;
        media.rate.value = playbackRate;
        media.rate.title = i18n("speedPlayback");
        // 滚轮调节倍数 直接生效
        media.rate.addEventListener("wheel", function (event) {
            event.preventDefault();
            const rate = parseFloat((getRate() + (event.deltaY > 0 ? -0.1 : 0.1)).toFixed(1));
            if (rate < 0.1 || rate > 16) { return; }
            media.rate.value = rate;
            saveRate(rate);
            video.playbackRate = rate;
        }, { passive: false });
        media.rate.addEventListener("change", function () {
            saveRate(getRate());
            if (video.playbackRate != 1) {
                video.playbackRate = getRate();
            }
        });
        // 截图
        media.screenshot = icon("screenshot", i18n("screenshot"), function () {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                const link = document.createElement("a");
                link.href = canvas.toDataURL("image/jpeg");
                // 文件名和 content-script 的截图一致
                const time = video.currentTime;
                const hour = Math.floor(time / 3600);
                link.download = `${location.hostname}-${hour > 0 ? hour + "'" : ""}${Math.floor((time % 3600) / 60).toString().padStart(2, "0")}'${Math.floor(time % 60).toString().padStart(2, "0")}.jpg`;
                link.click();
            } catch (e) {
                tip(float, i18n("saveFailed"));
            }
        });
        // 画中画
        media.pip = icon("pip", i18n("pictureInPicture"), function () {
            if (video.ownerDocument.pictureInPictureElement === video) {
                video.ownerDocument.exitPictureInPicture().catch(function () { });
            } else {
                video.requestPictureInPicture().catch(function () { });
            }
        });
        // 全屏
        media.fullscreen = icon("fullscreen", i18n("fullscreen"), function () {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(function () { });
            } else {
                video.requestFullscreen().catch(function () { });
            }
        });
        right.append(media.speed, media.rate, h("span", "mediaSpeedUnit", "×"), media.screenshot, media.pip, media.fullscreen);
        // 和 popup 一致 firefox 不显示 画中画 全屏
        if (navigator.userAgent.includes("Firefox") || typeof video.requestPictureInPicture != "function") {
            media.pip.style.display = "none";
        }
        if (navigator.userAgent.includes("Firefox")) {
            media.fullscreen.style.display = "none";
        }

        buttons.append(left, right);
        media.el.append(progress, buttons);
        return media;
    }
    // video 的状态显示到媒体控制
    function syncMedia(float) {
        const video = float.video;
        const media = float.media;
        setIcon(media.control, video.paused ? "play" : "pause", video.paused ? i18n("play") : i18n("pause"));
        setIcon(media.muted, video.muted ? "mute" : "volume");
        media.loop.classList.toggle("mediaOff", !video.loop);
        media.speed.classList.toggle("mediaOff", video.playbackRate == 1);
        media.speed.title = video.playbackRate == 1 ? i18n("speedPlayback") : i18n("normalPlay");
        if (video.playbackRate != 1 && root.activeElement !== media.rate) {
            media.rate.value = video.playbackRate;
        }
        media.pip.title = video.ownerDocument.pictureInPictureElement === video ? `${i18n("exit")} ${i18n("pictureInPicture")}` : i18n("pictureInPicture");
        setRange(media.volume, video.volume);
        if (media.seeking) { return; }
        if (Number.isFinite(video.duration) && video.duration > 0) {
            media.current.textContent = secToTime(video.currentTime);
            media.duration.textContent = secToTime(video.duration);
            setRange(media.time, video.currentTime / video.duration * 100);
        } else {
            // 直播等没有时长的媒体
            media.current.textContent = secToTime(video.currentTime);
            media.duration.textContent = "--:--";
            setRange(media.time, 0);
        }
    }

    /******************** 资源行 ********************/
    // 一行资源 和 popup 的资源列表一致
    function createRow(float, item, checked) {
        const row = { item: item, detail: null, preview: null, hls: null, loaded: false };
        row.panel = h("div", "panel");
        const heading = h("div", "panel-heading");

        row.checkbox = h("input", "DownCheck");
        row.checkbox.type = "checkbox";
        row.checkbox.tabIndex = -1;
        row.checkbox.checked = checked;
        row.checkbox.addEventListener("click", function (event) {
            event.stopPropagation();
            float.checked.set(row.item.key, row.checkbox.checked);
            updateBar(float);
        });
        heading.appendChild(row.checkbox);

        item.isRegex && heading.appendChild(img("regex", "regex", i18n("regexTitle")));
        const name = h("span", item.parsing || item.isRegex ? "name bold" : "name", item.name);
        name.title = item.name;
        heading.appendChild(name);
        const size = sizeText(item);
        if (size || item.capture) {
            row.size = h("span", "size", size);
            heading.appendChild(row.size);
        }

        const add = function (parent, icon, title, onClick) {
            const el = img(icon, "icon " + icon, title);
            el.addEventListener("click", function (event) {
                event.stopPropagation();
                typeof onClick == "function" ? onClick() : action(float, onClick, [row.item]);
            });
            parent.appendChild(el);
        };
        add(heading, "copy", i18n("copy"), "copy");
        item.parsing && add(heading, "parsing", i18n("parser"), "parse");
        // 预览 设置了本地播放器就调用播放器 否则在详情里播放
        item.isPlay && add(heading, "play", i18n("preview"), function () {
            options.player ? action(float, "play", [row.item]) : toggle(true, true);
        });
        add(heading, "download", i18n("download"), "download");
        options.aria2 && add(heading, "aria2", "Aria2", "aria2");
        options.invoke && add(heading, "invoke", i18n("invoke"), "invoke");
        options.send && add(heading, "send", i18n("send2local"), "send2local");
        options.mqtt && add(heading, "mqtt", i18n("send2MQTT"), function () {
            tip(float, i18n("sendingToMQTT"));
            action(float, "mqtt", [row.item]);
        });

        // 详情 标题 类型 地址 更多操作 以及预览
        const build = function () {
            row.detail = h("div", "url");
            row.detail.style.display = "none";
            row.info = h("div");
            if (item.title) {
                row.info.append(h("b", "", i18n("title") + ": "), item.title);
            }
            const mime = item.capture?.mime || item.type;
            mime && addInfo(row, "MIME", mime);
            const more = h("div", "moreButton");
            // 二维码 点击显示 / 隐藏
            row.qrcode = h("div", "qrcodeBox");
            row.qrcode.style.display = "none";
            add(more, "qrcode", "QR Code", function () {
                if (row.qrcode.style.display != "none") {
                    row.qrcode.style.display = "none";
                    reposition();
                    return;
                }
                loadLib("qrcode", function (ready) {
                    if (!ready) { return; }
                    const size = row.item.url.length >= 300 ? 400 : 256;
                    row.qrcode.replaceChildren();
                    globalThis.jQuery(row.qrcode).qrcode({ width: size, height: size, text: row.item.url });
                    row.qrcode.style.display = "";
                    reposition();
                });
            });
            add(more, "cat-down", i18n("downloadWithRequestHeader"), "catDown");
            add(more, "send2ffmpeg", i18n("sendFfmpeg"), "ffmpeg");
            add(more, "invoke", i18n("invoke"), "invoke");
            row.link = h("a", "", row.item.url);
            row.link.href = row.item.url;
            row.link.target = "_blank";
            row.link.rel = "noreferrer noopener";
            row.detail.append(row.info, more, row.qrcode, row.link);
            if (item.picture) {
                row.image = h("img", "screenshots");
                row.image.style.display = "none";
                row.detail.appendChild(row.image);
            } else if (item.isPlay) {
                row.preview = h("video", "preview");
                row.preview.controls = true;
                row.preview.style.display = "none";
                row.detail.appendChild(row.preview);
            }
            row.panel.appendChild(row.detail);
        };
        // 展开 / 收起详情 play 为 true 时开始播放预览
        const toggle = function (show, play) {
            !row.detail && build();
            show = show ?? row.detail.style.display == "none";
            row.detail.style.display = show ? "" : "none";
            if (show) {
                loadPreview(row);
                if (play && row.preview) {
                    row.preview.style.display = "";
                    row.preview.play().catch(function () { });
                }
            } else if (row.preview && !row.preview.paused) {
                row.preview.pause();
            }
            reposition();
        };
        heading.addEventListener("click", function () { toggle(); });
        row.panel.appendChild(heading);
        refreshRow(row);
        return row;
    }
    // 资源大小 页面内解码得到的轨道没收全时 后面带上接收进度
    function sizeText(item) {
        const size = byteToSize(item.size);
        const capture = item.capture;
        if (!capture || capture.complete || !capture.total) { return size; }
        return `${size} ${Math.floor(capture.received / capture.total * 100)}%`;
    }
    // 页面内解码得到的轨道 大小和地址随接收进度变化 更新已有的行
    function refreshRow(row) {
        const item = row.item;
        if (!item.capture) { return; }
        if (row.size) {
            row.size.textContent = sizeText(item);
            row.size.title = item.capture.total && !item.capture.complete ? i18n("umpProgress", [String(item.capture.received), String(item.capture.total)]) : "";
        }
        if (row.link) {
            row.link.textContent = item.url;
            row.link.href = item.url;
        }
    }
    function addInfo(row, label, value) {
        row.info.childNodes.length && row.info.appendChild(h("br"));
        row.info.appendChild(h("b", "", value === undefined ? label : label + ": "));
        value !== undefined && row.info.append(value);
    }
    /**
     * 载入预览 和 popup 展开资源一致
     * m3u8 使用 hls.js 其他可播放的资源直接播放 图片直接显示
     * 载入后显示 时长 分辨率 码率 等信息
     */
    function loadPreview(row) {
        if (row.loaded) { return; }
        row.loaded = true;
        const item = row.item;
        if (row.image) {
            row.image.addEventListener("load", function () {
                row.image.style.display = "";
                reposition();
            });
            row.image.src = item.url;
            return;
        }
        const video = row.preview;
        if (!video) { return; }
        video.addEventListener("loadedmetadata", function () {
            video.style.display = "";
            if (video.duration && video.duration != Infinity) {
                addInfo(row, i18n("duration"), secToTime(video.duration));
                // 没收全的轨道 大小不是整个文件的 算不出码率
                if (item.parsing != "m3u8" && item.size >= 1024 && !(item.capture && !item.capture.complete)) {
                    addInfo(row, i18n("bitrate"), formatBitrate(item.size * 8 / video.duration));
                }
            }
            if (video.videoHeight && video.videoWidth) {
                addInfo(row, i18n("resolution"), `${video.videoWidth}x${video.videoHeight}`);
            }
            reposition();
        });
        if (item.parsing != "m3u8") {
            video.src = item.url;
            return;
        }
        loadLib("hls", function (ready) {
            const Hls = globalThis.Hls;
            if (!ready || !row.loaded || !Hls.isSupported()) { return; }
            const hls = new Hls({ enableWorker: false });
            row.hls = hls;
            hls.loadSource(item.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, function () {
                hls.stopLoad();
            });
            hls.on(Hls.Events.BUFFER_CREATED, function (event, data) {
                if (data.tracks && !data.tracks.audiovideo) {
                    !data.tracks.audio && addInfo(row, i18n("noAudio"));
                    !data.tracks.video && addInfo(row, i18n("noVideo"));
                }
            });
            hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                data.levels.length > 1 && addInfo(row, i18n("m3u8Playlist"));
            });
            // 通过前5个片段的大小和时长来估算码率
            let totalFragments = 0;
            const fragments = [];
            hls.on(Hls.Events.LEVEL_LOADED, function (event, data) {
                totalFragments = data.details.fragments.length;
            });
            const onFragLoaded = function (event, data) {
                const frag = data.frag;
                const bytes = frag && frag.stats ? (frag.stats.total || frag.stats.loaded || 0) : 0;
                if (!bytes || !frag.duration) { return; }
                fragments.push({ bytes: bytes, duration: frag.duration });
                if (fragments.length >= 5) {
                    const totalBytes = fragments.reduce((sum, value) => sum + value.bytes, 0);
                    const totalDuration = fragments.reduce((sum, value) => sum + value.duration, 0);
                    addInfo(row, i18n("bitrate"), formatBitrate(totalBytes * 8 / totalDuration));
                    totalFragments && addInfo(row, i18n("estimateSize"), byteToSize(totalBytes / fragments.length * totalFragments));
                    hls.off(Hls.Events.FRAG_LOADED, onFragLoaded);
                }
            };
            hls.on(Hls.Events.FRAG_LOADED, onFragLoaded);
        });
    }
    // 移除一行资源 停止预览
    function destroyRow(row) {
        row.loaded = false;
        try { row.hls && row.hls.destroy(); } catch (e) { }
        row.hls = null;
        if (row.preview) {
            try {
                row.preview.pause();
                row.preview.removeAttribute("src");
                row.preview.load();
            } catch (e) { }
        }
    }

    // 把一组资源渲染到容器里 已经存在的行不重建 避免正在点击的图标被替换
    function renderGroup(float, box, items, checked, used) {
        const children = items.map(function (item) {
            let row = float.rows.get(item.key);
            if (!row) {
                row = createRow(float, item, float.checked.get(item.key) ?? checked);
                float.rows.set(item.key, row);
            }
            if (row.item !== item) {
                row.item = item;
                refreshRow(row);
            }
            used.add(item.key);
            return row.panel;
        });
        children.forEach(function (child, index) {
            box.children[index] !== child && box.insertBefore(child, box.children[index] ?? null);
        });
        while (box.children.length > children.length) {
            box.lastElementChild.remove();
        }
    }

    /**
     * 渲染浮窗 收起时只更新数量 展开时渲染 媒体控制 和 资源列表
     * 属于该 video 的资源直接列出 默认勾选
     * 本页其他资源默认折叠 展开后才渲染 默认不勾选
     */
    function render(float) {
        const own = float.own;
        const other = float.other;
        float.count.textContent = own.length;
        float.summary.textContent = `${i18n("videoFloatOther")} (${other.length})`;
        float.details.style.display = other.length ? "" : "none";
        if (!float.open) { return; }
        syncMedia(float);

        const shownOwn = limit(own, MAX_ROWS);
        const shownOther = float.details.open ? limit(other, MAX_ROWS) : [];
        // 页面内解码得到的轨道 key 不变但内容会变 把地址也算进去
        const sign = item => item.capture ? item.key + "\t" + item.url : item.key;
        const signature = shownOwn.map(sign).join("\n") + "\n\n" + shownOther.map(sign).join("\n") + "\n\n" + own.length + "/" + other.length;
        if (signature == float.signature) { return; }
        float.signature = signature;
        float.shownOwn = shownOwn;
        float.shownOther = shownOther;

        const used = new Set();
        renderGroup(float, float.ownBox, shownOwn, true, used);
        renderGroup(float, float.otherBox, shownOther, false, used);
        for (const [key, row] of [...float.rows]) {
            if (!used.has(key)) {
                destroyRow(row);
                float.rows.delete(key);
            }
        }

        const hidden = own.length - shownOwn.length + (float.details.open ? other.length - shownOther.length : 0);
        float.note.textContent = hidden > 0 ? i18n("videoFloatLimit", [String(shownOwn.length + shownOther.length), String(own.length + (float.details.open ? other.length : 0))]) : "";
        float.note.classList.toggle("show", hidden > 0);
        updateBar(float);
    }

    // 勾选的资源
    function checkedItems(float) {
        return [...float.shownOwn, ...float.shownOther].filter(item => float.rows.get(item.key)?.checkbox.checked);
    }
    // 在线合并按钮 和 popup 一致 勾选2个可合并的资源才可用
    function updateBar(float) {
        const items = checkedItems(float);
        let merge = items.length == 2 && (items.every(item => item.merge) || items.every(item => item.parsing == "m3u8"));
        if (merge && options.mergeLimit && Math.max(...items.map(item => item.size || 0)) > options.mergeLimit) {
            merge = false;
        }
        float.mergeDown.disabled = !merge;
    }
    function invert(float) {
        for (const item of [...float.shownOwn, ...float.shownOther]) {
            const row = float.rows.get(item.key);
            if (!row) { continue; }
            row.checkbox.checked = !row.checkbox.checked;
            float.checked.set(item.key, row.checkbox.checked);
        }
        updateBar(float);
    }
    // 底部按钮 对勾选的资源操作
    function batch(float, name) {
        const items = checkedItems(float);
        if (!items.length) { return; }
        if (name == "downloadAll" && items.length >= 10 && !window.confirm(i18n("confirmDownload", [String(items.length)]))) { return; }
        action(float, name, items);
    }

    // 操作提示 显示在图标右边
    function tip(float, text) {
        if (!text) { return; }
        float.tips.textContent = text;
        float.tips.title = text;
        float.tips.classList.add("show");
        clearTimeout(float.tipTimer);
        float.tipTimer = setTimeout(function () {
            float.tips.classList.remove("show");
        }, 2000);
    }

    /**
     * 调用 m3u8dl / 程序 前确认参数 和 popup 一致 可以修改参数后再调用
     * @param {Object} float 浮窗
     * @param {Object} item 资源
     * @param {String} text 参数
     * @param {String} kind m3u8dl | invoke
     */
    function showConfirm(float, item, text, kind) {
        const row = float.rows.get(item.key);
        if (!row) { return; }
        row.confirm && row.confirm.remove();
        const confirm = h("div", "confirm");
        const textarea = h("textarea");
        textarea.rows = 6;
        textarea.value = text;
        const remove = function () {
            confirm.remove();
            row.confirm = null;
            reposition();
        };
        confirm.append(
            textarea,
            textButton("button2", i18n("confirm"), function () {
                remove();
                action(float, "protocol", [item], { kind: kind, text: textarea.value });
            }),
            textButton("button2", i18n("close"), remove)
        );
        row.panel.appendChild(confirm);
        row.confirm = confirm;
        reposition();
    }

    // 操作交给后台执行 和 popup 的操作保持一致 extra 为附加参数
    function action(float, name, items, extra) {
        send({ Message: "videoFloatAction", action: name, items: items.map(item => ({ requestId: item.requestId, url: item.url })), ...extra }, function (result) {
            if (!result || result === "error") {
                tip(float, i18n("dataFetchFailed"));
                return;
            }
            if (typeof result.confirm == "string") {
                showConfirm(float, items[0], result.confirm, result.kind);
                return;
            }
            if (typeof result.copy == "string") {
                copyText(result.copy).then(function (ok) {
                    // 无法写入剪贴板时 交给用户手动复制
                    ok ? tip(float, result.message) : window.prompt(i18n("copy"), result.copy);
                });
                return;
            }
            if (result.share && navigator.share) {
                try { navigator.share({ url: result.share }); } catch (e) { }
            }
            if (result.open) {
                location.href = result.open;
            }
            tip(float, result.message);
        });
    }

    /******************** 位置 ********************/
    // video 是否适合显示浮窗 返回它在可视区域内的位置
    function visibleRect(video) {
        if (!video.isConnected) { return null; }
        const rect = video.getBoundingClientRect();
        if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) { return null; }
        const width = document.documentElement.clientWidth || window.innerWidth;
        const height = window.innerHeight;
        if (rect.bottom < 60 || rect.top > height - 40 || rect.right < 80 || rect.left > width - 60) { return null; }
        if (typeof video.checkVisibility == "function" && !video.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) { return null; }
        return rect;
    }
    function place(float, rect, origin) {
        const width = document.documentElement.clientWidth || window.innerWidth;
        const height = window.innerHeight;
        // 收起时的尺寸 图标 + 数量
        const headWidth = float.logo.offsetWidth + float.count.offsetWidth + 16;
        const headHeight = float.head.offsetHeight + 12;
        let x = anchor ? rect.left + anchor.fx * rect.width : rect.left + MARGIN;
        let y = anchor ? rect.top + anchor.fy * rect.height : rect.top + MARGIN;
        // 图标不超出 video
        x = Math.min(x, rect.right - headWidth - 2);
        y = Math.min(y, rect.bottom - headHeight - 2);
        let listHeight = "";
        if (float.open) {
            // 展开的面板不超出可视区域 列表过长时限制高度
            const fixed = float.el.offsetHeight - float.list.offsetHeight;
            const max = clamp(height - Math.max(y, 4) - fixed - 8, 60, 420);
            listHeight = `${max}px`;
            x = Math.min(x, width - float.el.offsetWidth - 4);
            y = Math.min(y, height - fixed - Math.min(float.list.scrollHeight, max) - 4);
        } else {
            x = Math.min(x, width - headWidth - 4);
            y = Math.min(y, height - headHeight - 4);
        }
        x = Math.max(x, 4);
        y = Math.max(y, 4);
        float.x = x;
        float.y = y;
        float.list.style.maxHeight = listHeight;
        float.el.style.transform = `translate(${Math.round(x - origin.x)}px, ${Math.round(y - origin.y)}px)`;
    }
    // 只更新位置 滚动 / 改变窗口大小时调用
    function reposition() {
        frame = 0;
        if (!running || !floats.size || !host) { return; }
        const fullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        // fixed 定位的原点 祖先元素有 transform / filter 时不在可视区域左上角 需要修正
        const hostRect = host.getBoundingClientRect();
        const origin = { x: hostRect.left, y: hostRect.top };
        for (const [video, float] of floats) {
            const rect = fullscreen ? null : visibleRect(video);
            if (!rect) {
                float.el.style.display = "none";
                continue;
            }
            float.el.style.display = "";
            place(float, rect, origin);
        }
    }
    function scheduleReposition() {
        if (frame || !floats.size) { return; }
        frame = requestAnimationFrame(reposition);
    }

    /**
     * 检查页面内的 video 创建 / 更新 / 移除浮窗
     */
    function update() {
        if (!running) { return; }
        // 扩展被重载或更新
        if (!chrome.runtime || !chrome.runtime.id) {
            stop();
            return;
        }
        if (stale && videos.length && !fetchTimer) {
            requestData();
        }
        const wanted = new Set();
        if (list.length && videos.length && icons) {
            for (const media of assign()) {
                const video = media.el;
                // 只管有自己资源的 video
                if (video.tagName != "VIDEO" || !media.own.size || dismissed.has(video)) { continue; }
                // 没有浮窗的 video 尺寸不合适就不创建
                if (!floats.has(video) && !visibleRect(video)) { continue; }
                const float = floats.get(video) ?? createFloat(video);
                float.own = list.filter(item => media.own.has(item));
                float.other = list.filter(item => !media.own.has(item));
                render(float);
                wanted.add(video);
            }
        }
        // 移除已经不存在 或 没有资源的 video 的浮窗
        for (const video of [...floats.keys()]) {
            !wanted.has(video) && removeFloat(video);
        }
        if (!floats.size) {
            if (host) {
                host.remove();
                host = null;
                root = null;
            }
            return;
        }
        ensureHost();
        reposition();
    }

    /******************** 事件 ********************/
    // 记录媒体元素开始加载的时间
    function onLoadStart(event) {
        const media = event.target;
        if (!media || (media.tagName != "VIDEO" && media.tagName != "AUDIO")) { return; }
        let times = startTimes.get(media);
        if (!times) {
            times = [];
            startTimes.set(media, times);
        }
        times.push(Date.now());
        times.length > 20 && times.shift();
    }
    function onMediaEvent(event) {
        const media = event.target;
        if (!media || media.tagName != "VIDEO") { return; }
        setTimeout(update, 0);
    }

    function start() {
        if (running) { return; }
        running = true;
        stale = true;
        failures = 0;
        document.addEventListener("loadstart", onLoadStart, true);
        document.addEventListener("loadedmetadata", onMediaEvent, true);
        document.addEventListener("emptied", onMediaEvent, true);
        document.addEventListener("fullscreenchange", scheduleReposition, true);
        window.addEventListener("scroll", scheduleReposition, { capture: true, passive: true });
        window.addEventListener("resize", scheduleReposition, { passive: true });
        dark.addEventListener("change", refreshIcons);
        tickTimer = setInterval(function () {
            !document.hidden && update();
        }, TICK);
        update();
    }
    function stop() {
        if (!running) { return; }
        running = false;
        document.removeEventListener("loadstart", onLoadStart, true);
        document.removeEventListener("loadedmetadata", onMediaEvent, true);
        document.removeEventListener("emptied", onMediaEvent, true);
        document.removeEventListener("fullscreenchange", scheduleReposition, true);
        window.removeEventListener("scroll", scheduleReposition, { capture: true });
        window.removeEventListener("resize", scheduleReposition);
        dark.removeEventListener("change", refreshIcons);
        clearInterval(tickTimer);
        clearTimeout(fetchTimer);
        fetchTimer = 0;
        frame && cancelAnimationFrame(frame);
        frame = 0;
        for (const video of [...floats.keys()]) {
            removeFloat(video);
        }
        host && host.remove();
        host = null;
        root = null;
        list = [];
        total = 0;
    }

    // 读取设置 开关 和 扩展总开关
    function readOption() {
        try {
            chrome.storage.sync.get({ videoFloat: true, enable: true }, function (items) {
                if (chrome.runtime.lastError || !items) { return; }
                items.videoFloat && items.enable ? start() : stop();
            });
        } catch (e) {
            stop();
        }
    }
    try {
        chrome.storage.onChanged.addListener(function (changes, namespace) {
            if (namespace != "sync") { return; }
            if (changes.videoFloat || changes.enable) {
                readOption();
            } else if (running) {
                // 其他设置有变化 (例如开启了 Aria2 / 调用) 重新获取 更新浮窗里的操作图标
                stale = true;
                requestData(300);
            }
        });
        // 后台通知资源列表有变化
        chrome.runtime.onMessage.addListener(function (Message) {
            if (Message && Message.Message == "videoFloatUpdate" && running) {
                stale = true;
                failures = 0;
                requestData(300);
            }
        });
    } catch (e) { return; }
    readOption();
})();
