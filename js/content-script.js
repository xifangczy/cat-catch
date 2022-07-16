var _videoObj = [];
var _videoSrc = [];
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    // 获取页面视频对象
    if (Message.Message == "getVideoState") {
        let videoObj = [];
        let videoSrc = [];
        document.querySelectorAll("video").forEach(function (video) {
            if (video.src != "" && video.src != undefined) {
                videoObj.push(video);
                videoSrc.push(video.src);
            }
        });
        const iframe = document.querySelectorAll("iframe");
        if (iframe.length > 0) {
            iframe.forEach(function (iframe) {
                if (iframe.contentDocument == null) { return true; }
                iframe.contentDocument.querySelectorAll("video").forEach(function (video) {
                    if (video.src != "" && video.src != undefined) {
                        videoObj.push(video);
                        videoSrc.push(video.src);
                    }
                });
            });
        }
        if (videoObj.length > 0) {
            let update = false;
            if (videoObj.length !== _videoObj.length || videoSrc.toString() !== _videoSrc.toString()) {
                update = true;
                _videoSrc = videoSrc;
                _videoObj = videoObj;
            }
            Message.index = Message.index == -1 ? 0 : Message.index;
            const video = videoObj[Message.index];
            const currentTime = video.currentTime / video.duration * 100;
            sendResponse({
                time: currentTime,
                volume: video.volume,
                count: _videoObj.length,
                src: _videoSrc,
                update: update,
                paused: video.paused,
                loop: video.loop,
                speed: video.playbackRate,
                muted: video.muted
            });
            return;
        }
        sendResponse({ count: 0 });
        return;
    }
    // 速度控制
    if (Message.Message == "speed") {
        _videoObj[Message.index].playbackRate = Message.speed;
        return;
    }
    // 画中画
    if (Message.Message == "pip") {
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
            sendResponse({ state: false });
            return;
        }
        _videoObj[Message.index].requestPictureInPicture();
        sendResponse({ state: true });
        return;
    }
    // 全屏
    if (Message.Message == "fullScreen") {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            sendResponse({ state: false });
            return;
        }
        _videoObj[Message.index].requestFullscreen();
        sendResponse({ state: true });
        return;
    }
    // 播放
    if (Message.Message == "play") {
        _videoObj[Message.index].play();
        return;
    }
    // 暂停
    if (Message.Message == "pause") {
        _videoObj[Message.index].pause();
        return;
    }
    // 循环播放
    if (Message.Message == "loop") {
        _videoObj[Message.index].loop = Message.action;
        return;
    }
    // 设置音量
    if (Message.Message == "setVolume") {
        _videoObj[Message.index].volume = Message.volume;
        sendResponse("ok");
        return;
    }
    // 静音
    if (Message.Message == "muted") {
        _videoObj[Message.index].muted = Message.action;
        return;
    }
    // 设置视频进度
    if (Message.Message == "setTime") {
        const time = Message.time * _videoObj[Message.index].duration / 100;
        _videoObj[Message.index].currentTime = time;
        sendResponse("ok");
        return;
    }
});

// Heart Beat
var Port;
function connect() {
    Port = chrome.runtime.connect(chrome.runtime.id, { name: "HeartBeat" });
    Port.postMessage("HeartBeat");
    Port.onMessage.addListener(function (message, Port) { return; });
    Port.onDisconnect.addListener(connect);
}
connect();