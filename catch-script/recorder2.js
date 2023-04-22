(function () {
    console.log("recorder2.js Start");
    if (document.getElementById("catCatchRecorder2")) {
        return;
    }
    if (!navigator.mediaDevices) {
        alert("当前网页不支持屏幕分享");
        return;
    }
    // 添加style
    const style = document.createElement("style");
    style.innerHTML = `
        @keyframes color-change{
            0% { outline: 4px solid rgb(26, 115, 232); }
            50% { outline: 4px solid red; }
            100% { outline: 4px solid rgb(26, 115, 232); }
        }
        #catCatchRecorder2{
            font-weight: bold;
            position: absolute;
            cursor: move;
            z-index: 999999999;
            outline: 4px solid rgb(26, 115, 232);
            resize: both;
            overflow: hidden;
            height: 720px;
            width: 1024px;
            top: 30%;
            left: 30%;
            pointer-events: none;
            font-size: 10px;
        }
        #catCatchRecorderHeader{
            background: rgb(26, 115, 232);
            color: white;
            text-align: center;
            height: 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-evenly;
            align-items: center;
            pointer-events: auto;
        }
        #catCatchRecorderTitle{
            cursor: move;
            user-select: none;
            width: 66%;
        }
        #catCatchRecorderinnerCropArea{
            height: calc(100% - 20px);
            width: 100%;
        }
        .animation{
            animation: color-change 5s infinite;
        }`;
    document.getElementsByTagName('html')[0].appendChild(style);

    // 添加div
    let cat = document.createElement("div");
    cat.setAttribute("id", "catCatchRecorder2");
    cat.innerHTML = `<div id="catCatchRecorderinnerCropArea"></div>
        <div id="catCatchRecorderHeader">
            <div id="catCatchRecorderStart">开始录制</div>
            <div id="catCatchRecorderTitle">拖动窗口</div>
            <div id="catCatchRecorderClose">关闭窗口</div>
        </div>`;

    // 事件绑定
    const catCatchRecorderStart = cat.querySelector("#catCatchRecorderStart");
    catCatchRecorderStart.onclick = function () {
        if (recorder) {
            recorder.stop();
            return;
        }
        try { startRecording(); } catch (e) { console.log(e); return; }
    }
    cat.querySelector("#catCatchRecorderClose").onclick = function () {
        recorder && recorder.stop();
        cat.remove();
    }

    // 拖动div
    const catCatchRecorderinnerCropArea = cat.querySelector("#catCatchRecorderinnerCropArea");
    cat.querySelector("#catCatchRecorderTitle").onpointerdown = (e) => {
        let pos1, pos2, pos3, pos4;
        pos3 = e.clientX;
        pos4 = e.clientY;
        if (pos3 - cat.offsetWidth - cat.offsetLeft > - 20 &&
            pos4 - cat.offsetHeight - cat.offsetTop > - 20) {
            return;
        }
        document.onpointermove = (e) => {
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            cat.style.top = cat.offsetTop - pos2 + "px";
            cat.style.left = cat.offsetLeft - pos1 + "px";
        }
        document.onpointerup = () => {
            document.onpointerup = null;
            document.onpointermove = null;
        }
    }
    document.getElementsByTagName('html')[0].appendChild(cat);

    // 初始化位置
    const video = document.querySelector("video");
    if (video) {
        // 调整和video一样大小
        if (video.clientHeight >= 0 && video.clientWidth >= 0) {
            cat.style.height = video.clientHeight + 20 + "px";
            cat.style.width = video.clientWidth + "px";
        }
        // 调整到video的位置
        const videoOffset = getElementOffset(video);
        if (videoOffset.top >= 0 && videoOffset.left >= 0) {
            cat.style.top = videoOffset.top + "px";
            cat.style.left = videoOffset.left + "px";
        }
        // 防止遮挡菜单
        let catAttr = cat.getBoundingClientRect();
        if (document.documentElement.scrollTop + catAttr.bottom > document.documentElement.scrollTop + window.innerHeight) {
            cat.style.top = document.documentElement.scrollTop + window.innerHeight - catAttr.height + "px";
        }
    }

    // 录制
    var recorder;
    async function startRecording() {
        const buffer = [];
        let option = { mimeType: 'video/webm;codecs=vp8,opus' };
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
            option = { mimeType: 'video/webm;codecs=vp9,opus' };
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
            option = { mimeType: 'video/webm;codecs=h264' };
        }
        const cropTarget = await CropTarget.fromElement(catCatchRecorderinnerCropArea);
        const stream = await navigator.mediaDevices
            .getDisplayMedia({
                preferCurrentTab: true,
                video: {
                    cursor: "never"
                },
                audio: {
                    sampleRate: 48000,
                    sampleSize: 16,
                    channelCount: 2
                }
            });
        const [track] = stream.getVideoTracks();
        await track.cropTo(cropTarget);
        recorder = new MediaRecorder(stream, option);
        recorder.start();
        recorder.onstart = function (e) {
            buffer.slice(0);
            catCatchRecorderStart.innerHTML = "停止录制";
            cat.classList.add("animation");
        }
        recorder.ondataavailable = function (e) {
            buffer.push(e.data);
        }
        recorder.onstop = function () {
            const fileBlob = new Blob(buffer, { type: option });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(fileBlob);
            a.download = `${document.title}.webm`;
            a.click();
            a.remove();
            buffer.slice(0);
            stream.getTracks().forEach(track => track.stop());
            recorder = undefined;
            catCatchRecorderStart.innerHTML = "开始录制";
            cat.classList.remove("animation");
        }
    }
    function getElementOffset(el) {
        let parentTop = el.offsetTop;
        let parentLeft = el.offsetLeft;
        let current = el.offsetParent;
        while (current) {
            parentTop += current.offsetTop;
            parentLeft += current.offsetLeft
            current = current.offsetParent;
        }
        return { top: parentTop, left: parentLeft };
    }
})();