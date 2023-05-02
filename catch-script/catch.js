(function () {
    console.log("catch.js Start");
    if (document.getElementById("CatCatchCatch")) { return; }
    
    const CatCatch = document.createElement("div");
    CatCatch.setAttribute("id", "CatCatchCatch");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips"></div>
    <button id="download">下载已捕获的数据</button>
    <button id="clean">清理缓存</button>
    <label><input type="checkbox" id="autoDown" ${localStorage.getItem("CatCatchCatch_autoDown")}>完成捕获自动下载</label>
    <label><input type="checkbox" id="ffmpeg" ${localStorage.getItem("CatCatchCatch_ffmpeg")}>使用ffmpeg合并</label>`;
    CatCatch.style = `position: fixed;
        z-index: 999999;
        top: 10%;
        left: 90%;
        background: rgb(255 255 255 / 70%);
        border: solid 1px #c7c7c7;
        border-radius: 4px;
        color: rgb(26, 115, 232);
        cursor: grab;
        padding: 5px 5px 5px 5px;
        font-size: 12px;
        font-family: "Microsoft YaHei", "Helvetica", "Arial", sans-serif;
        user-select: none;
        display: flex;
        align-items: flex-start;
        justify-content: space-evenly;
        flex-direction: column;`;
    document.getElementsByTagName('html')[0].appendChild(CatCatch);
    const tips = CatCatch.querySelector("#tips");

    CatCatch.querySelector("#autoDown").addEventListener('change', function (event) {
        localStorage.setItem("CatCatchCatch_autoDown", this.checked ? "checked" : "");
    });
    CatCatch.querySelector("#ffmpeg").addEventListener('change', function (event) {
        localStorage.setItem("CatCatchCatch_ffmpeg", this.checked ? "checked" : "");
    });
    CatCatch.querySelector("#clean").addEventListener('click', function (event) {
        catchMedia = [];
        isComplete = false;
        alert("清理完毕");
    });
    CatCatch.querySelector("#download").addEventListener('click', function (event) {
        catchDownload();
    });

    // 操作按钮
    let isMove = false;
    let isComplete = false;
    CatCatch.addEventListener('click', function (event) {
        isMove = false;
    });
    let x, y;
    function move(event) {
        isMove = true;
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

    tips.innerHTML = "等待视频播放";
    let catchMedia = [];
    const _AddSourceBuffer = window.MediaSource.prototype.addSourceBuffer;
    window.MediaSource.prototype.addSourceBuffer = function (mimeType) {
        tips.innerHTML = "捕获数据中...";
        const sourceBuffer = _AddSourceBuffer.call(this, mimeType);
        const _appendBuffer = sourceBuffer.appendBuffer;
        const bufferList = [];
        catchMedia.push({ mimeType, bufferList });
        sourceBuffer.appendBuffer = function (data) {
            bufferList.push(data);
            _appendBuffer.call(this, data);
        }
        return sourceBuffer;
    } 
    // 反检测
    window.MediaSource.prototype.addSourceBuffer.toString = function () {
        return _AddSourceBuffer.toString();
    }

    let _endOfStream = window.MediaSource.prototype.endOfStream;
    window.MediaSource.prototype.endOfStream = function () {
        isComplete = true;
        tips.innerHTML = "捕获完成";
        _endOfStream.call(this);
        localStorage.getItem("CatCatchCatch_autoDown") == "checked" && catchDownload();
    }

    // 下载资源
    function catchDownload() {
        if (catchMedia.length == 0) {
            alert("没抓到有效数据");
            return;
        }
        if (catchMedia.length >= 2 && localStorage.getItem("CatCatchCatch_ffmpeg") == "checked") {
            const media = [];
            for (let item of catchMedia) {
                const mime = item.mimeType.split(';')[0];
                const fileBlob = new Blob(item.bufferList, { type: mime });
                const type = mime.split('/')[0];
                media.push({ data: URL.createObjectURL(fileBlob), type: type });
            }
            window.postMessage({ action: "catCatchFFmpeg", use: "merge", media: media, title: document.title });
        } else {
            const a = document.createElement('a');
            for (let item of catchMedia) {
                const mime = item.mimeType.split(';')[0];
                const type = mime.split('/')[0] == "video" ? "mp4" : "mp3";
                const fileBlob = new Blob(item.bufferList, { type: mime });
                a.href = URL.createObjectURL(fileBlob);
                a.download = `${document.title}.${type}`;
                a.click();
            }
            a.remove();
        }
        if (isComplete) {
            catchMedia = [];
            isComplete = false;
            tips.innerHTML = "下载完毕...";
        }
    }
})();