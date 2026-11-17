(function () {
    var _videoObj = [];
    var _videoSrc = [];
    var _key = new Set();
    var m3u8Text = new Map();

    // ========== DRM ==========
    // 用了 EME (有 mediaKeys) 的媒体受 DRM 保护 不能下载 浏览器也不给截图
    // encrypted 事件里 pssh 的 SystemID 可以看出是哪种 DRM
    const DRM_SYSTEMS = {
        "edef8ba979d64acea3c827dcd51d21ed": "Widevine",
        "9a04f07998404286ab92e65be0885f95": "PlayReady",
        "94ce86fb07ff4f43adb893d2fa968ca2": "FairPlay",
        "1077efecc0b24d02ace33c1e52e2fb4b": "ClearKey",
        "e2719d58a985b3c9781ab030af78d30e": "ClearKey"
    };
    const drmNames = new WeakMap();    // 媒体元素 => Set DRM 名称
    window.addEventListener("encrypted", function (event) {
        const media = event.target;
        if (!(media instanceof HTMLMediaElement) || event.initDataType != "cenc" || !event.initData) { return; }
        const names = drmNames.get(media) ?? new Set();
        try {
            const view = new DataView(event.initData);
            // initData 是一个或多个 pssh 盒子 size(4) "pssh"(4) version flags(4) SystemID(16)
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
    }, true);
    /**
     * 媒体是否受 DRM 保护
     * @param {HTMLMediaElement} media
     * @returns {Array|Boolean} DRM 名称 (不知道是哪种时为空数组) 没有 DRM 返回 false
     */
    function getDrm(media) {
        if (!media?.mediaKeys) { return false; }
        return [...(drmNames.get(media) ?? [])];
    }
    // 同一个环境里的视频浮窗也要用
    globalThis.catCatchGetDrm = getDrm;

    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (chrome.runtime.lastError) { return; }
        // 获取页面视频对象
        if (Message.Message == "getVideoState") {
            let videoObj = [];
            let videoSrc = [];
            document.querySelectorAll("video, audio").forEach(function (video) {
                if (video.currentSrc != "" && video.currentSrc != undefined) {
                    videoObj.push(video);
                    videoSrc.push(video.currentSrc);
                }
            });
            const iframe = document.querySelectorAll("iframe");
            if (iframe.length > 0) {
                iframe.forEach(function (iframe) {
                    if (iframe.contentDocument == null) { return true; }
                    iframe.contentDocument.querySelectorAll("video, audio").forEach(function (video) {
                        if (video.currentSrc != "" && video.currentSrc != undefined) {
                            videoObj.push(video);
                            videoSrc.push(video.currentSrc);
                        }
                    });
                });
            }
            if (videoObj.length > 0) {
                if (videoObj.length !== _videoObj.length || videoSrc.toString() !== _videoSrc.toString()) {
                    _videoSrc = videoSrc;
                    _videoObj = videoObj;
                }
                Message.index = Message.index == -1 ? 0 : Message.index;
                const video = videoObj[Message.index];
                const timePCT = video.currentTime / video.duration * 100;
                sendResponse({
                    time: timePCT,
                    currentTime: video.currentTime,
                    duration: video.duration,
                    volume: video.volume,
                    count: _videoObj.length,
                    src: _videoSrc,
                    paused: video.paused,
                    loop: video.loop,
                    speed: video.playbackRate,
                    muted: video.muted,
                    pip: video.ownerDocument.pictureInPictureElement === video,
                    // 只有音轨的 video (浏览器直接打开音频文件时用的就是 video) 也按音频处理
                    type: video.tagName == "AUDIO" || (video.readyState >= 1 && !video.videoWidth && !video.videoHeight) ? "audio" : "video",
                    drm: getDrm(video),
                    videoStatus: videoObj.map(v => v.paused ? 1 : 0)
                });
                return true;
            }
            sendResponse({ count: 0 });
            return true;
        }
        // 速度控制
        if (Message.Message == "speed") {
            if (_videoObj[Message.index]?.playbackRate !== undefined) {
                _videoObj[Message.index].playbackRate = Message.speed;
            }
            return true;
        }
        // 画中画
        if (Message.Message == "pip") {
            if (document.pictureInPictureElement) {
                try { document.exitPictureInPicture(); } catch (e) { return true; }
                sendResponse({ state: false });
                return true;
            }
            try { _videoObj[Message.index].requestPictureInPicture(); } catch (e) { return true; }
            sendResponse({ state: true });
            return true;
        }
        // 全屏
        if (Message.Message == "fullScreen") {
            if (document.fullscreenElement) {
                try { document.exitFullscreen(); } catch (e) { return true; }
                sendResponse({ state: false });
                return true;
            }
            setTimeout(function () {
                try { _videoObj[Message.index].requestFullscreen(); } catch (e) { return true; }
            }, 500);
            sendResponse({ state: true });
            return true;
        }
        // 播放
        if (Message.Message == "play") {
            _videoObj[Message.index]?.play();
            return true;
        }
        // 暂停
        if (Message.Message == "pause") {
            _videoObj[Message.index]?.pause();
            return true;
        }
        // 循环播放
        if (Message.Message == "loop") {
            if (_videoObj[Message.index]?.loop !== undefined) {
                _videoObj[Message.index].loop = Message.action;
            }
            return true;
        }
        // 设置音量
        if (Message.Message == "setVolume") {
            if (_videoObj[Message.index]?.volume !== undefined) {
                _videoObj[Message.index].volume = Message.volume;
            }
            sendResponse("ok");
            return true;
        }
        // 静音
        if (Message.Message == "muted") {
            if (_videoObj[Message.index]?.muted !== undefined) {
                _videoObj[Message.index].muted = Message.action;
            }
            return true;
        }
        // 设置视频进度
        if (Message.Message == "setTime") {
            if (_videoObj[Message.index]?.currentTime !== undefined && _videoObj[Message.index]?.duration !== undefined) {
                _videoObj[Message.index].currentTime = Message.time * _videoObj[Message.index].duration / 100;
            }
            sendResponse("ok");
            return true;
        }
        // 截图视频图片
        if (Message.Message == "screenshot") {
            try {
                let video = _videoObj[Message.index];
                // 受 DRM 保护的视频 浏览器给的画面是黑的
                if (getDrm(video)) {
                    sendResponse({ drm: true });
                    return true;
                }
                let canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                let link = document.createElement("a");
                link.href = canvas.toDataURL("image/jpeg");
                link.download = `${location.hostname}-${secToTime(video.currentTime)}.jpg`;
                link.click();
                canvas = null;
                link = null;
                sendResponse("ok");
                return true;
            } catch (e) { console.log(e); return true; }
        }
        if (Message.Message == "getKey") {
            sendResponse(Array.from(_key));
            return true;
        }
        // 本页受 DRM 保护的媒体 返回 DRM 名称 没有返回 false 弹窗用来标记资源
        if (Message.Message == "getDrm") {
            let drm = false;
            document.querySelectorAll("video, audio").forEach(function (media) {
                const names = getDrm(media);
                if (names) {
                    drm = [...new Set([...(drm || []), ...names])];
                }
            });
            sendResponse(drm);
            return true;
        }
        if (Message.Message == "ffmpeg") {
            if (!Message.files) {
                window.postMessage(Message);
                sendResponse("ok");
                return true;
            }
            Message.quantity ??= Message.files.length;
            for (let item of Message.files) {
                const data = { ...Message, ...item };
                data.type = item.type ?? "video";
                if (data.data instanceof Blob) {
                    window.postMessage(data);
                } else {
                    fetch(data.data)
                        .then(response => response.blob())
                        .then(blob => {
                            data.data = blob;
                            window.postMessage(data);
                        });
                }
            }
            sendResponse("ok");
            return true;
        }
        if (Message.Message == "getPage") {
            if (Message.find) {
                const DOM = document.querySelector(Message.find);
                DOM ? sendResponse(DOM.innerHTML) : sendResponse("");
                return true;
            }
            sendResponse(document.documentElement.outerHTML);
            return true;
        }
        if (Message.Message == "getM3u8Text") {
            if (Message.url && m3u8Text.has(Message.url)) {
                sendResponse(m3u8Text.get(Message.url));
                return true;
            }
            sendResponse("");
            return true;
        }
        if (Message.Message == "getM3u8Cache") {
            fetch(Message.url, { method: "GET", cache: "force-cache" })
                .then(response => response.text())
                .then(text => sendResponse({ success: true, data: text }))
                .catch(() => sendResponse({ success: false, error: "Failed to fetch" }));
            return true;
        }
    });

    // Heart Beat
    var Port;
    function connect() {
        Port = chrome.runtime.connect(chrome.runtime.id, { name: "HeartBeat" });
        Port.postMessage("HeartBeat");
        Port.onMessage.addListener(function (message, Port) { return true; });
        Port.onDisconnect.addListener(connect);
    }
    connect();

    function secToTime(sec) {
        let time = "";
        let hour = Math.floor(sec / 3600);
        let min = Math.floor((sec % 3600) / 60);
        sec = Math.floor(sec % 60);
        if (hour > 0) { time = hour + "'"; }
        if (min < 10) { time += "0"; }
        time += min + "'";
        if (sec < 10) { time += "0"; }
        time += sec;
        return time;
    }
    const isFirefox = navigator.userAgent.includes('Firefox');
    const sendAddMedia = (data) => {
        chrome.runtime.sendMessage({
            Message: "addMedia",
            url: data.url,
            href: data.href ?? location.href,
            extraExt: data.ext,
            mime: data.mime,
            requestHeaders: { referer: data.referer },
            requestId: data.requestId
        });
    };
    window.addEventListener("message", (event) => {
        const action = ["catCatchAddMedia", "catCatchAddKey", "catCatchFFmpeg", "catCatchFFmpegResult", "catCatchCloseScript", "catCatchUmp"];
        if (!event.data || !event.data.action || event.origin !== window.location.origin || !action.includes(event.data.action)) { return; }
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (event.data.action == "catCatchAddMedia") {
            if (!event.data.url) { return; }

            /*
             * firefox 不允许直接下载跨域blob内容
             * fetch获取文本内容并缓存到m3u8Text中，供 m3u8.html调用获取。
             */
            if (event.data.url.startsWith("blob:") && isFirefox) {
                fetch(event.data.url)
                    .then(response => response.text())
                    .then(text => {
                        m3u8Text.set(event.data.url, text);
                        sendAddMedia(event.data);
                    });
                return;
            }
            sendAddMedia(event.data);
        }
        // 页面内解码 UMP 得到的轨道 (catch-script/ump.js) 交给后台登记到资源列表
        if (event.data.action == "catCatchUmp") {
            if (!event.data.key) { return; }
            chrome.runtime.sendMessage({ ...event.data, Message: "umpMedia", action: undefined });
            return;
        }
        if (event.data.action == "catCatchAddKey") {
            let key = event.data.key;
            if (key instanceof ArrayBuffer || key instanceof Array) {
                key = ArrayToBase64(key);
            }
            if (_key.has(key)) { return; }
            _key.add(key);
            chrome.runtime.sendMessage({
                Message: "send2local",
                action: "addKey",
                data: key,
            });
            chrome.runtime.sendMessage({
                Message: "popupAddKey",
                data: key,
                url: event.data.url,
            });
        }
        if (event.data.action == "catCatchFFmpeg") {
            if (!event.data.use ||
                !event.data.files ||
                !event.data.files instanceof Array ||
                event.data.files.length == 0
            ) { return; }
            event.data.title = event.data.title ?? document.title ?? new Date().getTime().toString();
            event.data.title = event.data.title.replaceAll('"', "").replaceAll("'", "").replaceAll(" ", "");
            let data = {
                Message: event.data.action,
                action: event.data.use,
                files: event.data.files,
                url: event.data.href ?? event.source.location.href,
            };
            data = { ...event.data, ...data };
            chrome.runtime.sendMessage(data);
        }
        if (event.data.action == "catCatchFFmpegResult") {
            if (!event.data.state || !event.data.tabId) { return; }
            chrome.runtime.sendMessage({ Message: "catCatchFFmpegResult", ...event.data });
        }
        if (event.data.action == "catCatchCloseScript") {
            if (!event.data.script || !event.isTrusted) { return; }
            chrome.runtime.sendMessage({ Message: "closeScript", ...event.data });
        }

    }, { capture: true });

    function ArrayToBase64(data) {
        try {
            let bytes = new Uint8Array(data);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            if (typeof _btoa == "function") {
                return _btoa(binary);
            }
            return btoa(binary);
        } catch (e) {
            return false;
        }
    }
})();