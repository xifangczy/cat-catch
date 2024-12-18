(function () {
    console.log("recorder.js Start");
    if (document.getElementById("catCatchRecorder")) { return; }

    // let language = "en";
    let language = navigator.language.replace("-", "_");
    if (window.CatCatchI18n) {
        if (!window.CatCatchI18n.languages.includes(language)) {
            language = language.split("_")[0];
            if (!window.CatCatchI18n.languages.includes(language)) {
                language = "en";
            }
        }
    }

    const buttonStyle = 'style="border:solid 1px #000;margin:2px;padding:2px;background:#fff;border-radius:4px;border:solid 1px #c7c7c780;color:#000;"';
    const checkboxStyle = 'style="-webkit-appearance: auto;"';

    const CatCatch = document.createElement("div");
    CatCatch.setAttribute("id", "catCatchRecorder");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips"></div>
    <span data-i18n="selectVideo">选择视频</span> <select id="videoList" style="max-width: 200px;"></select>
    <span data-i18n="recordEncoding">录制编码</span> <select id="mimeTypeList" style="max-width: 200px;"></select>
    <label><input type="checkbox" id="ffmpeg" ${checkboxStyle}><span data-i18n="ffmpeg">使用ffmpeg转码</span></label>
    <label>
        <select id="videoBits">
            <option value="2500000" data-i18n="videoBits">视频码率</option>
            <option value="2500000">2.5 Mbps</option>
            <option value="5000000">5 Mbps</option>
            <option value="8000000">8 Mbps</option>
            <option value="16000000">16 Mbps</option>
        </select>
        <select id="audioBits">
            <option value="128000" data-i18n="audioBits">视频码率</option>
            <option value="128000">128 kbps</option>
            <option value="256000">256 kbps</option>
        </select>
        <select id="frameRate">
            <option value="0" data-i18n="frameRate">帧率</option>
            <option value="25">25 FPS</option>
            <option value="30">30 FPS</option>
            <option value="60">60 FPS</option>
            <option value="120">120 FPS</option>
        </select>
    </label>
    <div>
        <button id="getVideo" ${buttonStyle} data-i18n="readVideo">读取视频</button>
        <button id="start" ${buttonStyle} data-i18n="startRecording">开始录制</button>
        <button id="stop" ${buttonStyle} data-i18n="stopRecording">停止录制</button>
        <button id="hide" ${buttonStyle} data-i18n="hide">隐藏</button>
        <button id="close" ${buttonStyle} data-i18n="close">关闭</button>
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

    // 创建 Shadow DOM 放入CatCatch
    const divShadow = document.createElement('div');
    const shadowRoot = divShadow.attachShadow({ mode: 'closed' });
    shadowRoot.appendChild(CatCatch);
    // 页面插入Shadow DOM
    document.getElementsByTagName('html')[0].appendChild(divShadow);

    const $tips = CatCatch.querySelector("#tips");
    const $videoList = CatCatch.querySelector("#videoList");
    const $mimeTypeList = CatCatch.querySelector("#mimeTypeList");
    const $start = CatCatch.querySelector("#start");
    const $stop = CatCatch.querySelector("#stop");
    let videoList = [];
    $tips.innerHTML = i18n("noVideoDetected", "没有检测到视频, 请重新读取");
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
                $tips.innerHTML = i18n("recordingChangeEncoding", "录制中不能更改编码");
                return;
            }
            if (MediaRecorder.isTypeSupported(event.target.value)) {
                option.mimeType = event.target.value;
                $tips.innerHTML = event.target.value;
            } else {
                $tips.innerHTML = i18n("formatNotSupported", "不支持此格式");
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
        $tips.innerHTML = videoList.length ? i18n("clickToStartRecording", "请点击开始录制") : i18n("noVideoDetected", "没有检测到视频, 请重新读取");
    }
    CatCatch.querySelector("#getVideo").addEventListener('click', getVideo);
    CatCatch.querySelector("#stop").addEventListener('click', function () {
        recorder.stop();
    });
    // #endregion 获取视频列表

    CatCatch.querySelector("#start").addEventListener('click', function (event) {
        if (!MediaRecorder.isTypeSupported(option.mimeType)) {
            $tips.innerHTML = i18n("formatNotSupported", "不支持此格式");
            return;
        }
        init();
        const index = $videoList.value;
        if (index && videoList[index]) {
            let stream = null;
            try {
                const frameRate = +CatCatch.querySelector("#frameRate").value;
                if (frameRate) {
                    stream = videoList[index].captureStream(frameRate);
                } else {
                    stream = videoList[index].captureStream();
                }
            } catch (e) {
                $tips.innerHTML = i18n("recordingNotSupported", "不支持录制");
                return;
            }
            // 码率
            option.audioBitsPerSecond = +CatCatch.querySelector("#audioBits").value;
            option.videoBitsPerSecond = +CatCatch.querySelector("#videoBits").value;

            recorder = new MediaRecorder(stream, option);
            recorder.ondataavailable = function (event) {
                if (CatCatch.querySelector("#ffmpeg").checked) {
                    window.postMessage({
                        action: "catCatchFFmpeg",
                        use: "transcode",
                        files: [{ data: URL.createObjectURL(event.data), type: option.mimeType }],
                        title: document.title.trim()
                    });
                    $tips.innerHTML = i18n("clickToStartRecording", "请点击开始录制");
                    return;
                }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(event.data);
                a.download = `${document.title}`;
                a.click();
                a.remove();
                $tips.innerHTML = i18n("downloadCompleted", "下载完成");;
            }
            recorder.onstart = function (event) {
                $stop.style.display = 'inline';
                $start.style.display = 'none';
                $tips.innerHTML = i18n("recording", "视频录制中");
            }
            recorder.onstop = function (event) {
                $tips.innerHTML = i18n("stopRecording", "停止录制");
                init();
            }
            recorder.onerror = function (event) {
                init();
                $tips.innerHTML = i18n("recordingFailed", "录制失败");;
                console.log(event);
            };
            recorder.start();
            videoList[index].play();
            setTimeout(() => {
                if (recorder.state === 'recording') {
                    $stop.style.display = 'inline';
                    $start.style.display = 'none';
                    $tips.innerHTML = i18n("recording", "视频录制中");
                }
            }, 500);
        } else {
            $tips.innerHTML = i18n("noVideoDetected", "请确认视频是否存在");
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

    // i18n
    if (window.CatCatchI18n) {
        CatCatch.querySelectorAll('[data-i18n]').forEach(function (element) {
            element.innerHTML = window.CatCatchI18n[element.dataset.i18n][language];
        });
        CatCatch.querySelectorAll('[data-i18n-outer]').forEach(function (element) {
            element.outerHTML = window.CatCatchI18n[element.dataset.i18nOuter][language];
        });
    }
    function i18n(key, original = "") {
        if (!window.CatCatchI18n) { return original };
        return window.CatCatchI18n[key][language];
    }
})();