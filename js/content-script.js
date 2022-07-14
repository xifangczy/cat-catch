var _videoObj = [];
var _videoSrc = [];
var pipSwitch = false;
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (Message.Message == "getVideoState") {   // 获取页面视频对象
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
            sendResponse({ time: currentTime, volume: video.volume, count: _videoObj.length, src: _videoSrc, update: update, paused: video.paused, loop: video.loop });
            return;
        }
        sendResponse({ count: 0 });
        return;
    }
    if (Message.Message == "speed") { // 速度控制
        _videoObj[Message.index].playbackRate = Message.speed;
        return;
    }
    if (Message.Message == "pip") { // 画中画
        try {
            if(pipSwitch){
                document.exitPictureInPicture();
                pipSwitch = false;
                return;
            }
            _videoObj[Message.index].requestPictureInPicture();
            pipSwitch = true;
        } catch (e) { return; }
        return;
    }
    if (Message.Message == "play") { // 播放
        _videoObj[Message.index].play();
        return;
    }
    if (Message.Message == "pause") { // 暂停
        _videoObj[Message.index].pause();
        return;
    }
    if (Message.Message == "loop") { // 循环播放
        _videoObj[Message.index].loop = Message.loop;
        return;
    }
    if (Message.Message == "setVolume") {    // 设置音量
        _videoObj[Message.index].volume = Message.volume;
        sendResponse("ok");
        return;
    }
    if (Message.Message == "setTime") {  // 设置视频进度
        const time = Message.time * _videoObj[Message.index].duration / 100;
        _videoObj[Message.index].currentTime = time;
        sendResponse("ok");
        return;
    }
});