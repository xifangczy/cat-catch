(function () {
    console.log("webrtc.js Start");
    if (document.getElementById("catCatchWebRTC")) { return; }

    const buttonStyle = 'style="border:solid 1px #000;margin:2px;padding:2px;background:#fff;border-radius:4px;border:solid 1px #c7c7c780;color:#000;"';
    const checkboxStyle = 'style="-webkit-appearance: auto;"';

    const CatCatch = document.createElement("div");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips">正在等待视频流...</div>
    <div id="time"></div>
    录制编码: <select id="mimeTypeList" style="max-width: 200px;"></select>
    <label><input type="checkbox" id="autoSave1"} ${checkboxStyle}>1小时保存一次</label>
    <div>
        <button id="start" ${buttonStyle}>开始录制</button>
        <button id="stop" ${buttonStyle}>停止录制</button>
        <button id="save" ${buttonStyle}>保存</button>
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

    // 创建 Shadow DOM 放入CatCatch
    const divShadow = document.createElement('div');
    const shadowRoot = divShadow.attachShadow({ mode: 'closed' });
    shadowRoot.appendChild(CatCatch);
    // 页面插入Shadow DOM
    document.getElementsByTagName('html')[0].appendChild(divShadow);

    const $tips = CatCatch.querySelector("#tips");

    // 开始 结束 按钮切换
    const $start = CatCatch.querySelector("#start");
    const $stop = CatCatch.querySelector("#stop");
    function buttonState(state = true) {
        $start.style.display = state ? 'inline' : 'none';
        $stop.style.display = state ? 'none' : 'inline';
    }
    buttonState();

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
    // #endregion 编码选择

    // 开始录制
    $time = CatCatch.querySelector("#time");
    CatCatch.querySelector("#start").addEventListener('click', function () {
        if (!recorderObj) {
            $tips.innerHTML = "不存在录制对象!!!";
            return;
        }
        let recorderTime = 0;
        let recorderTimeer = undefined;
        let chunks = [];
        if (!recorderObj instanceof MediaStream) {
            const track = [];
            for (let key in recorderObj) {
                if (recorderObj[key] instanceof MediaStreamTrack) {
                    track.push(recorderObj[key]);
                }
            }
            recorderObj = new MediaStream(track);
        }
        recorder = new MediaRecorder(recorderObj, option);
        recorder.ondataavailable = event => {
            chunks.push(event.data)
        };
        recorder.onstop = () => {
            recorderTime = 0;
            clearInterval(recorderTimeer);
            $time.innerHTML = "";
            $tips.innerHTML = "已停止录制!";
            download(chunks);
            buttonState();
        }
        recorder.onstart = () => {
            chunks = [];
            $tips.innerHTML = "录制中...";
            $time.innerHTML = "00:00";
            recorderTimeer = setInterval(function () {
                recorderTime++;
                $time.innerHTML = secToTime(recorderTime);
            }, 1000);
            buttonState(false);
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

    let autoSave1Timer = null;
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

    let recorder = undefined;
    let recorderObj = undefined;
    const _RTCPeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = function (...args) {
        const pc = new _RTCPeerConnection(...args);
        const _addTrack = pc.addTrack.bind(pc);
        pc.addTrack = function (...trackArgs) {
            const track = trackArgs[0];
            if (track.kind === 'video') {
                recorderObj = trackArgs[1];
                $tips.innerHTML = "视频流已添加";
            }
            return _addTrack(...trackArgs);
        };

        const _addStream = pc.addStream.bind(pc);
        pc.addStream = function (stream) {
            if (stream.getVideoTracks().length > 0) {
                recorderObj = stream;
                $tips.innerHTML = "视频流已添加";
            }
            return _addStream(stream);
        }

        const _addTransceiver = pc.addTransceiver.bind(pc);
        pc.addTransceiver = function (trackOrKind, ...rest) {
            recorderObj = {};
            const transceiver = _addTransceiver(trackOrKind, ...rest);
            if (trackOrKind instanceof MediaStreamTrack) {
                recorderObj[trackOrKind.kind] = trackOrKind;
                $tips.innerHTML = `${trackOrKind.kind}流已添加`;
            } else if (typeof trackOrKind === 'string') {
                recorderObj[trackOrKind] = transceiver.receiver.track;
                $tips.innerHTML = `${trackOrKind}流已添加`;
            }
            return transceiver;
        }
        pc.oniceconnectionstatechange = function (event) {
            if (pc.iceConnectionState === 'disconnected' && recorder?.state === 'recording') {
                recorder.stop();
                $tips.innerHTML = "连接已断开，录制已停止";
            }
        }
        return pc;
    };
    window.webkitRTCPeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection.prototype = _RTCPeerConnection.prototype;

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

    function download(chunks) {
        const blob = new Blob(chunks, { type: option.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'recorded-video.webm';
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
})();