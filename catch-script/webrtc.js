(function () {
    console.log("webrtc.js Start");
    if (document.getElementById("catCatchWebRTC")) { return; }

    // 多语言
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
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips" data-i18n="waiting">正在等待视频流..."</div>
    <div id="time"></div>
    ${i18n("selectVideo", "选择视频")}:
        <select id="videoTrack">
            <option value="-1">${i18n("selectVideo", "选择视频")}</option>
        </select>
    ${i18n("selectAudio", "选择音频")}:
        <select id="audioTrack">
            <option value="-1">${i18n("selectAudio", "选择视频")}</option>
        </select>
    ${i18n("recordEncoding", "录制编码")}: <select id="mimeTypeList" style="max-width: 200px;"></select>
    <label><input type="checkbox" id="autoSave1"} ${checkboxStyle} data-i18n="save1hour">1小时保存一次</label>
    <label>
        <select id="videoBits">
            <option value="2500000" data-i18n="videoBits">视频码率</option>
            <option value="2500000">2.5 Mbps</option>
            <option value="5000000">5 Mbps</option>
            <option value="8000000">8 Mbps</option>
            <option value="16000000">16 Mbps</option>
        </select>
        <select id="audioBits">
            <option value="128000" data-i18n="audioBits">音频码率</option>
            <option value="128000">128 kbps</option>
            <option value="256000">256 kbps</option>
        </select>
    </label>
    <div>
        <button id="start" ${buttonStyle} data-i18n="startRecording">开始录制</button>
        <button id="stop" ${buttonStyle} data-i18n="stopRecording">停止录制</button>
        <button id="save" ${buttonStyle} data-i18n="save">保存</button>
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

    // 提示
    const $tips = CatCatch.querySelector("#tips");
    const tips = (text) => {
        $tips.innerHTML = text;
    }

    // 开始 结束 按钮切换
    const $start = CatCatch.querySelector("#start");
    const $stop = CatCatch.querySelector("#stop");
    const buttonState = (state = true) => {
        $start.style.display = state ? 'inline' : 'none';
        $stop.style.display = state ? 'none' : 'inline';
    }
    $start.style.display = 'inline';
    $stop.style.display = 'none';

    // 关闭
    CatCatch.querySelector("#close").addEventListener('click', function (event) {
        recorder?.state && recorder.stop();
        CatCatch.style.display = "none";
        window.postMessage({ action: "catCatchToBackground", Message: "script", script: "webrtc.js", refresh: true });
    });

    // 隐藏
    CatCatch.querySelector("#hide").addEventListener('click', function (event) {
        CatCatch.style.display = "none";
    });

    const tracks = { video: [], audio: [] };
    const $tracks = { video: CatCatch.querySelector('#videoTrack'), audio: CatCatch.querySelector('#audioTrack') };

    /* 核心变量 */
    let recorder = null;    // 录制器
    let autoSave1Timer = null;    // 1小时保存一次

    // #region 编码选择
    let option = { mimeType: 'video/webm;codecs=vp9,opus' };
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
    const $mimeTypeList = CatCatch.querySelector("#mimeTypeList");
    const videoTypes = ["webm", "ogg", "mp4", "x-matroska"];
    const codecs = ["should-not-be-supported", "vp9", "vp8", "avc1", "av1", "h265", "h.265", "h264", "h.264", "opus", "pcm", "aac", "mpeg", "mp4a"];
    const supportedVideos = getSupportedMimeTypes("video", videoTypes, codecs);
    supportedVideos.forEach(function (type) {
        $mimeTypeList.options.add(new Option(type, type));
    });
    option.mimeType = supportedVideos[0];
    $mimeTypeList.addEventListener('change', function (event) {
        if (recorder && recorder.state && recorder.state === 'recording') {
            tips(i18n("recordingChangeEncoding", "录制中不能更改编码"));
            return;
        }
        if (MediaRecorder.isTypeSupported(event.target.value)) {
            option.mimeType = event.target.value;
            tips(`${i18n("recordEncoding", "录制编码")}:` + event.target.value);
        } else {
            tips(i18n("formatNotSupported", "不支持此格式"));
        }
    });
    // #endregion 编码选择

    // 录制
    $time = CatCatch.querySelector("#time");
    CatCatch.querySelector("#start").addEventListener('click', function () {
        if (!tracks.video.length && !tracks.audio.length) {
            tips(i18n("streamEmpty", "媒体流为空"));
            return;
        }
        let recorderTime = 0;
        let recorderTimeer = undefined;
        let chunks = [];

        // 音频 视频 选择
        const videoTrack = +CatCatch.querySelector("#videoTrack").value;
        const audioTrack = +CatCatch.querySelector("#audioTrack").value;
        const streamTrack = [];
        if (videoTrack !== -1 && tracks.video[videoTrack]) {
            streamTrack.push(tracks.video[videoTrack]);
        }
        if (audioTrack !== -1 && tracks.audio[audioTrack]) {
            streamTrack.push(tracks.audio[audioTrack]);
        }

        // 码率
        option.audioBitsPerSecond = +CatCatch.querySelector("#audioBits").value;
        option.videoBitsPerSecond = +CatCatch.querySelector("#videoBits").value;

        const mediaStream = new MediaStream(streamTrack);
        recorder = new MediaRecorder(mediaStream, option);
        recorder.ondataavailable = event => {
            chunks.push(event.data)
        };
        recorder.onstop = () => {
            recorderTime = 0;
            clearInterval(recorderTimeer);
            clearInterval(autoSave1Timer);
            $time.innerHTML = "";
            tips(i18n("stopRecording", "已停止录制!"));
            download(chunks);
            buttonState();
        }
        recorder.onstart = () => {
            chunks = [];
            tips(i18n("recording", "视频录制中"));
            $time.innerHTML = "00:00";
            recorderTimeer = setInterval(function () {
                recorderTime++;
                $time.innerHTML = secToTime(recorderTime);
            }, 1000);
            buttonState(false);
        }
        recorder.onerror = (msg) => {
            console.error(msg);
        }
        recorder.start(60000);
    });
    // 停止录制
    CatCatch.querySelector("#stop").addEventListener('click', function () {
        if (recorder) {
            recorder.stop();
            recorder = undefined;
        }
    });
    // 保存
    CatCatch.querySelector("#save").addEventListener('click', function () {
        if (recorder) {
            recorder.stop();
            recorder.start();
        }
    });
    // 每1小时 保存一次
    CatCatch.querySelector("#autoSave1").addEventListener('click', function () {
        clearInterval(autoSave1Timer);
        if (CatCatch.querySelector("#autoSave1").checked) {
            autoSave1Timer = setInterval(function () {
                if (recorder) {
                    recorder.stop();
                    recorder.start();
                }
            }, 3600000);
        }
    });

    // 获取webRTC流
    window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
        construct(target, args) {
            const pc = new target(...args);
            pc.addEventListener('track', (event) => {
                const track = event.track;
                if (track.kind === 'video' || track.kind === 'audio') {
                    tips(`${track.kind} ${i18n("streamAdded", "流已添加")}`);
                    $tracks[track.kind].appendChild(new Option(track.label, tracks[track.kind].length));
                    $tracks[track.kind].value = tracks[track.kind].length;
                    tracks[track.kind].push(track);
                    if (tracks.video.length && tracks.audio.length) {
                        tips(i18n("videoAndAudio", "已包含音频和视频流"));
                    }
                }
            });
            pc.addEventListener('iceconnectionstatechange', (event) => {
                if (pc.iceConnectionState === 'disconnected' && recorder?.state === 'recording') {
                    recorder.stop();
                    tips(i18n("stopRecording", "连接已断开，录制已停止"));
                }
            });
            return pc;
        }
    });

    // #region 移动逻辑
    let x, y;
    const move = (event) => {
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

    function download(chunks) {
        const blob = new Blob(chunks, { type: option.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'recorded-video.mp4';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    // 秒转换成时间
    function secToTime(sec) {
        let hour = (sec / 3600) | 0;
        let min = ((sec % 3600) / 60) | 0;
        sec = (sec % 60) | 0;
        let time = hour > 0 ? hour + ":" : "";
        time += min.toString().padStart(2, '0') + ":";
        time += sec.toString().padStart(2, '0');
        return time;
    }

    // 防止网页意外关闭跳转
    window.addEventListener('beforeunload', function (e) {
        recorder && recorder.stop();
        return true;
    });

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
