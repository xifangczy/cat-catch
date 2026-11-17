/**
 * 页面内解码 UMP 响应 (YouTube)
 *
 * UMP 的内容只有页面自己能读到 扩展后台拿不到响应体
 * 这里旁路读取播放器收到的响应 交给 js/ump.js 解码 把同一个视频的各条轨道整理成文件
 * 再以 blob: 地址的形式交给扩展 和其他资源一样出现在列表里
 *
 * 只整理播放器已经请求过的数据 不会自己发起请求 所以轨道随播放进度逐渐变完整
 */
(function () {
    const UMP = window.CatCatchUMP;
    if (!UMP || window.CatCatchUmpCapture) { return; }
    try { delete window.CatCatchUMP; } catch (e) { }
    Object.defineProperty(window, "CatCatchUmpCapture", { value: true });

    const REPORT_DELAY = 3000;                  // 同一条轨道两次上报的最小间隔
    const URL_LIFETIME = 10 * 60 * 1000;        // 旧的 blob 地址保留多久 (已经显示在列表里的地址仍要能用)
    const MAX_BYTES = 4 * 1024 * 1024 * 1024;   // 保留数据的上限 超出后不再保存新的分片
    const MAX_VIDEOS = 2;                       // 地址里没有视频ID的页面 最多保留几个视频的数据

    const tracks = new UMP.Tracks();
    const states = new Map();   // 轨道 key → { urls, timer, reported, seen }
    let bytes = 0;

    /**
     * 当前页面正在看的视频ID 从地址里取 取不到返回 null
     * 广告 / 预加载的下一个视频 / 鼠标悬停的预览 都是别的视频ID 用它排除
     */
    function pageVideoId() {
        try {
            const url = new URL(location.href);
            const v = url.searchParams.get("v");
            if (v && /^[\w-]{11}$/.test(v)) { return v; }
            const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})(?:[/?]|$)/);
            return match ? match[1] : null;
        } catch (e) { return null; }
    }

    function getState(track) {
        let state = states.get(track.key);
        if (!state) {
            state = { urls: [], timer: 0, reported: 0, seen: 0 };
            states.set(track.key, state);
        }
        return state;
    }

    // 丢弃一条轨道 释放数据 并通知扩展从列表里移除
    function drop(track) {
        const state = states.get(track.key);
        if (state) {
            clearTimeout(state.timer);
            state.urls.forEach(item => URL.revokeObjectURL(item.url));
            state.reported && window.postMessage({ action: "catCatchUmp", key: track.key, remove: true });
            states.delete(track.key);
        }
        bytes -= track.size;
        tracks.delete(track.key);
    }

    /**
     * 是否保留这个视频的数据 同时清理不再需要的视频
     * 地址里有视频ID: 只保留这个视频
     * 地址里没有 (首页 / 小窗播放): 保留最近的几个视频
     */
    function accept(videoId) {
        if (!videoId) { return false; }
        const current = pageVideoId();
        if (current) {
            if (current != videoId) { return false; }
            tracks.list().forEach(track => track.videoId != current && drop(track));
            return true;
        }
        const recent = new Map();   // 视频ID → 最后活动时间
        for (const track of tracks.list()) {
            const seen = states.get(track.key)?.seen ?? 0;
            recent.set(track.videoId, Math.max(recent.get(track.videoId) ?? 0, seen));
        }
        recent.set(videoId, Date.now());
        if (recent.size > MAX_VIDEOS) {
            const keep = new Set([...recent.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_VIDEOS).map(entry => entry[0]));
            tracks.list().forEach(track => !keep.has(track.videoId) && drop(track));
        }
        return true;
    }

    /**
     * 轨道的名称 画质来自播放器的格式表 取不到时用 itag
     * @returns {String} 例如 jNQXAC9IVRw.720p.mp4 / jNQXAC9IVRw.audio.webm
     */
    function trackName(track) {
        let label = /^audio\//.test(track.mime) ? "audio" : String(track.itag);
        try {
            const response = document.querySelector(".html5-video-player")?.getPlayerResponse?.();
            if (response?.videoDetails?.videoId == track.videoId) {
                const lmt = String(track.format.lmt ?? "");
                const formats = (response.streamingData?.adaptiveFormats ?? []).filter(item => item.itag == track.itag);
                const format = formats.find(item => item.lastModified == lmt) ?? formats[0];
                if (format?.qualityLabel) { label = format.qualityLabel; }
            }
        } catch (e) { }
        return `${track.videoId}.${label}.${track.ext}`;
    }

    // 把轨道当前的数据做成文件 上报给扩展
    function report(track) {
        if (tracks.map.get(track.key) !== track || !track.init || !track.format) { return; }
        const state = getState(track);
        const now = Date.now();
        state.reported = now;
        const url = URL.createObjectURL(new Blob(track.parts(), { type: track.mime.split(";")[0] }));
        // 轨道还在增长时 每次上报都是新地址 旧地址过一段时间再释放
        while (state.urls.length > 1 && now - state.urls[0].time > URL_LIFETIME) {
            URL.revokeObjectURL(state.urls.shift().url);
        }
        state.urls.push({ url: url, time: now });
        window.postMessage({
            action: "catCatchUmp",
            key: track.key,
            url: url,
            name: trackName(track),
            ext: track.ext,
            mime: track.mime,
            size: track.size,
            videoId: track.videoId,
            itag: track.itag,
            received: track.received,
            total: track.total,
            complete: track.complete
        });
    }
    function schedule(track) {
        const state = getState(track);
        state.seen = Date.now();
        if (state.timer) { return; }
        state.timer = setTimeout(function () {
            state.timer = 0;
            report(track);
        }, Math.max(0, state.reported + REPORT_DELAY - Date.now()));
    }

    function createDecoder() {
        return new UMP.Decoder({
            format(format) {
                if (!accept(format.videoId)) { return; }
                schedule(tracks.format(format));
            },
            segment(segment) {
                if (!accept(segment.videoId) || bytes + segment.received > MAX_BYTES) { return; }
                const track = tracks.segment(segment);
                if (!track) { return; }
                // 数据交给 Blob 保存 由浏览器管理 (数据多时会放到磁盘) 页面内存不随视频时长增长
                segment.blob = new Blob(segment.data);
                segment.data = null;
                bytes += segment.received;
                schedule(track);
            }
        });
    }

    // 旁路读取响应 不影响页面自己读取
    async function readResponse(response) {
        const decoder = createDecoder();
        try {
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) { break; }
                decoder.push(value);
            }
        } catch (e) {
            // 请求被页面取消 已经完整收到的分片仍然有效
        }
        decoder.end();
    }

    // fetch
    const _fetch = window.fetch;
    window.fetch = function () {
        const promise = _fetch.apply(this, arguments);
        promise.then(function (response) {
            try {
                if (response.ok && response.body && UMP.isUMP(response.headers.get("content-type"))) {
                    readResponse(response.clone());
                }
            } catch (e) { }
        }, function () { });
        return promise;
    };
    window.fetch.toString = function () {
        return _fetch.toString();
    };

    // XHR
    const _xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        this.addEventListener("load", function () {
            try {
                if (this.status != 200 || this.responseType != "arraybuffer" || !this.response) { return; }
                if (!UMP.isUMP(this.getResponseHeader("content-type"))) { return; }
                const decoder = createDecoder();
                decoder.push(new Uint8Array(this.response));
                decoder.end();
            } catch (e) { }
        });
        return _xhrSend.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send.toString = function () {
        return _xhrSend.toString();
    };
})();
