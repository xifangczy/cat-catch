(function () {
    console.log("recorder.js Start");
    if (document.getElementById("catCatchRecorder")) { return; }

    const buttonStyle = 'style="border:solid 1px #000;margin:2px;padding:2px;background:#fff;border-radius:4px;border:solid 1px #c7c7c780;color:#000;"';
    const checkboxStyle = 'style="-webkit-appearance: auto;"';

    const CatCatch = document.createElement("div");
    CatCatch.setAttribute("id", "CatCatchCatch");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips"></div>
    选择视频: <select id="videoList" style="max-width: 200px;"></select>
    录制编码: <select id="mimeTypeList" style="max-width: 200px;"></select>
    <label><input type="checkbox" id="ffmpeg"} ${checkboxStyle}>使用ffmpeg转码</label>
    <div>
        <button id="getVideo" ${buttonStyle}>读取视频</button>
        <button id="start" ${buttonStyle}>开始录制</button>
        <button id="stop" ${buttonStyle}>停止录制</button>
        <button id="hide" ${buttonStyle}>隐藏</button>
        <button id="close" ${buttonStyle}>关闭</button>
    </div>`;
    CatCatch.style = `
        position: fixed;
        z-index: 999999;
        top: 10%;
        left: 80%;
        background: rgb(255 255 255 / 85%);
        border: solid 1px #c7c7c7;
        border-radius: 4px;
        color: rgb(26, 115, 232);
        padding: 5px 5px 5px 5px;
        font-size: 12px;
        font-family: "Microsoft YaHei", "Helvetica", "Arial", sans-serif;
        user-select: none;
        display: flex;
        align-items: flex-start;
        justify-content: space-evenly;
        flex-direction: column;
        line-height: 20px;`;
    document.getElementsByTagName('html')[0].appendChild(CatCatch);

    const $tips = CatCatch.querySelector("#tips");
    const $videoList = CatCatch.querySelector("#videoList");
    const $mimeTypeList = CatCatch.querySelector("#mimeTypeList");
    const $start = CatCatch.querySelector("#start");
    const $stop = CatCatch.querySelector("#stop");
    let videoList = [];
    $tips.innerHTML = "没有检测到视频, 请重新读取";
    let recorder = {};
    let option = { mimeType: 'video/webm;codecs=vp9,opus' };

    CatCatch.querySelector("#hide").addEventListener('click', function (event) {
        CatCatch.style.display = "none";
    });
    CatCatch.querySelector("#close").addEventListener('click', function (event) {
        recorder?.state && recorder.stop();
        CatCatch.style.display = "none";
        window.postMessage({ action: "catCatchToBackground", Message: "script", script: "recorder.js", refresh: false });
    });

    function init() {
        getVideo();
        $start.style.display = 'inline';
        $stop.style.display = 'none';
    }
    setTimeout(init, 500);

    // #region 视频编码选择
    function setMimeType() {
        function getSupportedMimeTypes(media, types, codecs) {
            const supported = [];
            types.forEach((type) => {
                const mimeType = `${media}/${type}`;
                codecs.forEach((codec) => [`${mimeType};codecs=${codec}`].forEach(variation => {
                    if (MediaRecorder.isTypeSupported(variation)) {
                        supported.push(variation);
                    }
                }));
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    supported.push(mimeType);
                }
            });
            return supported;
        };
        const videoTypes = ["webm", "ogg", "mp4", "x-matroska"];
        const codecs = ["should-not-be-supported", "vp9", "vp8", "avc1", "av1", "h265", "h.265", "h264", "h.264", "opus", "pcm", "aac", "mpeg", "mp4a"];
        const supportedVideos = getSupportedMimeTypes("video", videoTypes, codecs);
        supportedVideos.forEach(function (type) {
            $mimeTypeList.options.add(new Option(type, type));
        });
        option.mimeType = supportedVideos[0];

        $mimeTypeList.addEventListener('change', function (event) {
            if (recorder && recorder.state && recorder.state === 'recording') {
                $tips.innerHTML = "录制中不能更改编码";
                return;
            }
            if (MediaRecorder.isTypeSupported(event.target.value)) {
                option.mimeType = event.target.value;
                $tips.innerHTML = "已选择编码：" + event.target.value;
            } else {
                $tips.innerHTML = "不支持此格式";
            }
        });
    }
    setMimeType();
    // #endregion 视频编码选择

    // #region 获取视频列表
    function getVideo() {
        videoList = [];
        $videoList.options.length = 0;
        document.querySelectorAll("video, audio").forEach(function (video, index) {
            if (video.currentSrc) {
                const src = video.currentSrc.split("/").pop();
                videoList.push(video);
                $videoList.options.add(new Option(src, index));
            }
        });
        $tips.innerHTML = videoList.length ? "请点击开始录制" : "没有检测到视频, 请重新读取";
    }
    CatCatch.querySelector("#getVideo").addEventListener('click', getVideo);
    CatCatch.querySelector("#stop").addEventListener('click', function () {
        recorder.stop();
    });
    // #endregion 获取视频列表

    CatCatch.querySelector("#start").addEventListener('click', function (event) {
        if (!MediaRecorder.isTypeSupported(option.mimeType)) {
            $tips.innerHTML = "不支持录制此格式";
            return;
        }
        init();
        const index = $videoList.value;
        if (index && videoList[index]) {
            const stream = videoList[index].captureStream();
            recorder = new MediaRecorder(stream, option);
            recorder.ondataavailable = function (event) {
                if (CatCatch.querySelector("#ffmpeg").checked) {
                    window.postMessage({
                        action: "catCatchFFmpeg",
                        use: "transcode",
                        media: [{ data: URL.createObjectURL(event.data), type: option.mimeType }],
                        title: document.title.trim()
                    });
                    $tips.innerHTML = "已推送到ffmpeg";
                    return;
                }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(event.data);
                a.download = `${document.title}`;
                a.click();
                a.remove();
                $tips.innerHTML = "下载完成";
            }
            recorder.onstart = function (event) {
                $stop.style.display = 'inline';
                $start.style.display = 'none';
                $tips.innerHTML = "正在录制";
            }
            recorder.onstop = function (event) {
                $tips.innerHTML = "已停止录制";
                init();
            }
            recorder.onerror = function (event) {
                init();
                $tips.innerHTML = "录制失败<br>详情看控制台信息";
                console.log(event);
            };
            recorder.start();
            videoList[index].play();
            setTimeout(() => {
                if (recorder.state === 'recording') {
                    $stop.style.display = 'inline';
                    $start.style.display = 'none';
                    $tips.innerHTML = "正在录制";
                }
            }, 500);
        } else {
            $tips.innerHTML = "请确认视频是否存在";
        }
    });

    // #region 移动逻辑
    let x, y;
    function move(event) {
        CatCatch.style.left = event.pageX - x + 'px';
        CatCatch.style.top = event.pageY - y + 'px';
    }
    CatCatch.addEventListener('mousedown', function (event) {
        x = event.pageX - CatCatch.offsetLeft;
        y = event.pageY - CatCatch.offsetTop;
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', function () {
            document.removeEventListener('mousemove', move);
        });
    });
    // #endregion 移动逻辑
})();