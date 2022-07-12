chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (Message.Message == "Speed") {
        document.querySelectorAll("video").forEach(function (video) {
            video.playbackRate = Message.speed;
        });
        document.querySelectorAll("audio").forEach(function (video) {
            video.playbackRate = Message.speed;
        });
        sendResponse("Speed set to " + Message.speed);
    }
    if(Message.Message == "requestPictureInPicture"){
        document.querySelectorAll("video").forEach(function (video) {
            video.requestPictureInPicture();
        });
    }
});