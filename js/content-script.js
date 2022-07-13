chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (Message.Message == "speed") { // 速度控制
        document.querySelectorAll("video").forEach(function (video) {
            video.playbackRate = Message.speed;
        });
        document.querySelectorAll("audio").forEach(function (audio) {
            audio.playbackRate = Message.speed;
        });
    } else if (Message.Message == "pip") { // 画中画
        document.querySelectorAll("video").forEach(function (video) {
            try {
                video.requestPictureInPicture();
            } catch (e) { return; }
        });
    } else if (Message.Message == "play") { // 播放
        document.querySelectorAll("video").forEach(function (video) {
            video.play();
        });
        document.querySelectorAll("audio").forEach(function (audio) {
            audio.play();
        });
    } else if (Message.Message == "pause") { // 暂停
        document.querySelectorAll("video").forEach(function (video) {
            video.pause();
        });
        document.querySelectorAll("audio").forEach(function (audio) {
            audio.pause();
        });
    }
});