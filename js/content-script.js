var videoObj = [];
var videoSrc = [];
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (Message.Message == "getVideoState") {   // 获取页面视频对象
        let videoData = [];
        videoSrc = [];
        document.querySelectorAll("video").forEach(function (video) {
            if (video.src != "" && video.src != undefined) {
                videoData.push(video);
                videoSrc.push(video.src);
            }
        });
        const iframe = document.querySelectorAll("iframe");
        if (iframe.length > 0) {
            iframe.forEach(function (iframe) {
                if (iframe.contentDocument == null) { return true; }
                iframe.contentDocument.querySelectorAll("video").forEach(function (video) {
                    if (video.src != "" && video.src != undefined) {
                        videoData.push(video);
                        videoSrc.push(video.src);
                    }
                });
            });
        }
        if (videoData.length > 0) {
            let update = false;
            if (videoObj !== videoData) {
                update = true;
                videoObj = videoData;
            }
            Message.index = Message.index == -1 ? 0 : Message.index;
            const video = videoObj[Message.index];
            const currentTime = video.currentTime / video.duration * 100;
            sendResponse({ time: currentTime, volume: video.volume, count: videoObj.length, src: videoSrc, update: update });
            return;
        }
        sendResponse({ count: 0 });
        return;
    }
    if (Message.Message == "speed") { // 速度控制
        videoObj[Message.index].playbackRate = Message.speed;
        return;
    }
    if (Message.Message == "pip") { // 画中画
        try {
            videoObj[Message.index].requestPictureInPicture();
        } catch (e) { return; }
        return;
    }
    if (Message.Message == "play") { // 播放
        videoObj[Message.index].play();
        return;
    }
    if (Message.Message == "pause") { // 暂停
        videoObj[Message.index].pause();
        return;
    }
    if (Message.Message == "setVolume") {    // 设置音量
        videoObj[Message.index].volume = Message.volume;
        sendResponse("ok");
        return;
    }
    if (Message.Message == "setTime") {  // 设置视频进度
        const time = Message.time * videoObj[Message.index].duration / 100;
        videoObj[Message.index].currentTime = time;
        sendResponse("ok");
        return;
    }
});