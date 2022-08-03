(function () {
    console.log("recorder2.js Start");
    if (document.getElementById("catCatchRecorder")) {
        return;
    }
    let cat = document.createElement("div");
    cat.setAttribute("id", "catCatchRecorder");
    cat.setAttribute("data-switch", "on");
    cat.innerHTML = `<div id="catCatchRecorderHeader">猫抓 点击开始录制</div><div id="catCatchRecorderinnerCropArea"></div>`;
    cat.style = `font-weight: bold;
        position: absolute;
        cursor: move;
        z-index: 999999999;
        outline: 4px solid rgb(26, 115, 232);
        resize: both;
        overflow: auto;
        height: 720px;
        width: 1024px;
        top: 30%;
        left: 30%;`;
    const catCatchRecorderHeader = cat.querySelector("#catCatchRecorderHeader");
    catCatchRecorderHeader.style = `background: rgb(26, 115, 232);
        color: white;
        text-transform: uppercase;
        text-align: center;
        height: 20px;
        cursor: pointer;`
    catCatchRecorderHeader.onclick = function () {
        if (recorder) {
            recorder.stop();
            return;
        }
        if (!navigator.mediaDevices) {
            alert("当前网页不支持屏幕分享");
            return;
        }
        try { startRecording(); } catch (e) { console.log(e); return; }
    }
    const catCatchRecorderinnerCropArea = cat.querySelector("#catCatchRecorderinnerCropArea");
    catCatchRecorderinnerCropArea.style = `height: calc(100% - 20px); width: 100%;`
    catCatchRecorderinnerCropArea.onpointerdown = (e) => {
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

    const video = document.querySelector("video");
    if (video) {
        cat.style.height = video.clientHeight + 20 + "px";
        cat.style.width = video.clientWidth + "px";
        const videoOffset = getElementOffset(video);
        cat.style.top = videoOffset.top - 20 + "px";
        cat.style.left = videoOffset.left + "px";
    }

    var recorder;
    async function startRecording() {
        const buffer = [];
        // const option = { mimeType: 'video/webm;codecs=vp8,opus' };
        const option = { mimeType: 'video/webm;codecs=vp9,opus' };
        // const option = { mimeType: 'video/webm;codecs=h264,opus' };
        const innerCropArea = cat.querySelector("#catCatchRecorderinnerCropArea");
        const cropTarget = await CropTarget.fromElement(innerCropArea);
        const stream = await navigator.mediaDevices
            .getDisplayMedia({
                preferCurrentTab: true,
                video: true,
                audio: {
                    sampleRate: 44100,
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
            catCatchRecorderHeader.innerHTML = "猫抓 停止录制";
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
            catCatchRecorderHeader.innerHTML = "猫抓 点击开始录制";
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