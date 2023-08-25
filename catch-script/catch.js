(function () {
    console.log("catch.js Start");
    if (document.getElementById("CatCatchCatch")) { return; }

    const buttonStyle = 'style="all: unset; border:solid 1px #000; margin: 2px;padding: 2px; background: #fff; border-radius: 4px; border: solid 1px #c7c7c780;"';
    const checkboxStyle = 'style="all: unset; -webkit-appearance: auto;"';

    const CatCatch = document.createElement("div");
    CatCatch.setAttribute("id", "CatCatchCatch");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips"></div>
    <button id="download" ${buttonStyle}>下载已捕获的数据</button>
    <button id="clean" ${buttonStyle}>删除已捕获数据</button>
    <button id="restart" ${buttonStyle}>从头捕获</button>
    <button id="close" ${buttonStyle}>关闭</button>
    <label><input type="checkbox" id="autoDown" ${localStorage.getItem("CatCatchCatch_autoDown")} ${checkboxStyle}>完成捕获自动下载</label>
    <label><input type="checkbox" id="ffmpeg" ${localStorage.getItem("CatCatchCatch_ffmpeg")} ${checkboxStyle}>使用ffmpeg合并</label>
    <details>
        <summary>文件名设置</summary>
        文件名: <div id="fileName" style="font-weight:bold;"></div>
        表达式: <div id="selector" style="font-weight:bold;">未设置</div>
        <button id="setName" ${buttonStyle}>设置表达式</button>
    </details>`;
    CatCatch.style = `all: unset;
        position: fixed;
        z-index: 999999;
        top: 10%;
        left: 90%;
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
    const tips = CatCatch.querySelector("#tips");

    CatCatch.querySelector("#autoDown").addEventListener('change', function (event) {
        localStorage.setItem("CatCatchCatch_autoDown", this.checked ? "checked" : "");
    });
    CatCatch.querySelector("#ffmpeg").addEventListener('change', function (event) {
        localStorage.setItem("CatCatchCatch_ffmpeg", this.checked ? "checked" : "");
    });
    const $clean = CatCatch.querySelector("#clean");
    $clean.addEventListener('click', function (event) {
        clearCache();
        $clean.innerHTML = "清理完成!";
        setTimeout(() => { $clean.innerHTML = "清理缓存"; }, 1000);
    });
    CatCatch.querySelector("#download").addEventListener('click', function (event) {
        catchDownload();
    });
    CatCatch.querySelector("#close").addEventListener('click', function (event) {
        CatCatch.style.display = "none";
        console.log(`猫抓\n恢复显示捕获面板\ndocument.getElementById("CatCatchCatch").style.display = "flex";`);
    });
    CatCatch.querySelector("#restart").addEventListener('click', function (event) {
        clearCache();
        document.querySelectorAll("video").forEach(function (element) {
            element.currentTime = 0;
            element.play();
        });
    });

    // 文件名设置
    const fileName = CatCatch.querySelector("#fileName");
    const selector = CatCatch.querySelector("#selector");
    selector.innerHTML = localStorage.getItem("CatCatchCatch_selector") ?? "未设置";
    CatCatch.querySelector("#setName").addEventListener('click', function (event) {
        const result = window.prompt("文件名获取Selector表达式", localStorage.getItem("CatCatchCatch_selector") ?? "");
        if (result == null) { return; }
        if (result == "") { clearFileNameSelector(); return; }
        const title = document.querySelector(result);
        if (title && title.innerHTML) {
            fileName.innerHTML = title.innerHTML;
            selector.innerHTML = result;
            localStorage.setItem("CatCatchCatch_selector", result);
        } else {
            clearFileNameSelector("表达式错误, 无法获取或内容为空!");
        }
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
    let bufferList = {};
    let mediaSize = 0;
    const _AddSourceBuffer = window.MediaSource.prototype.addSourceBuffer;
    window.MediaSource.prototype.addSourceBuffer = function (mimeType) {
        // 标题获取
        if (localStorage.getItem("CatCatchCatch_selector")) {
            const title = document.querySelector(localStorage.getItem("CatCatchCatch_selector"));
            fileName.innerHTML = title && title.innerHTML ? title.innerHTML : document.title;
        } else {
            fileName.innerHTML = document.title;
        }
        tips.innerHTML = "捕获数据中...";
        const sourceBuffer = _AddSourceBuffer.call(this, mimeType);
        const _appendBuffer = sourceBuffer.appendBuffer;
        const type = mimeType.split("/").shift();
        bufferList[type] = [];
        catchMedia.push({ mimeType, bufferList: bufferList[type] });
        sourceBuffer.appendBuffer = function (data) {
            mediaSize += data.byteLength;
            tips.innerHTML = "捕获数据中: " + byteToSize(mediaSize);
            bufferList[type].push(data);
            _appendBuffer.call(this, data);
        }
        return sourceBuffer;
    }
    window.MediaSource.prototype.addSourceBuffer.toString = function () {
        return _AddSourceBuffer.toString();
    }

    const _endOfStream = window.MediaSource.prototype.endOfStream;
    window.MediaSource.prototype.endOfStream = function () {
        isComplete = true;
        tips.innerHTML = "捕获完成";
        _endOfStream.call(this);
        localStorage.getItem("CatCatchCatch_autoDown") == "checked" && catchDownload();
    }
    window.MediaSource.prototype.endOfStream.toString = function () {
        return _endOfStream.toString();
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
            window.postMessage({ action: "catCatchFFmpeg", use: "merge", media: media, title: fileName.innerHTML.trim() });
        } else {
            const a = document.createElement('a');
            for (let item of catchMedia) {
                const mime = item.mimeType.split(';')[0];
                const type = mime.split('/')[0] == "video" ? "mp4" : "mp3";
                const fileBlob = new Blob(item.bufferList, { type: mime });
                a.href = URL.createObjectURL(fileBlob);
                a.download = `${fileName.innerHTML.trim()}.${type}`;
                a.click();
            }
            a.remove();
        }
        if (isComplete) {
            clearCache(true);
            tips.innerHTML = "下载完毕...";
        }
    }

    function clearFileNameSelector(warning = "") {
        localStorage.removeItem("CatCatchCatch_selector");
        selector.innerHTML = "未设置";
        fileName.innerHTML = document.title;
        warning && alert(warning);
    }

    function clearCache(all = false) {
        isComplete = false;
        mediaSize = 0;
        if (all) {
            catchMedia = [];
            bufferList = {};
            return;
        }
        Object.keys(bufferList).forEach(key => {
            bufferList[key].splice(1);
        });
    }
    function byteToSize(byte) {
        if (!byte || byte < 1024) { return 0; }
        if (byte < 1024 * 1024) {
            return (byte / 1024).toFixed(1) + "KB";
        } else if (byte < 1024 * 1024 * 1024) {
            return (byte / 1024 / 1024).toFixed(1) + "MB";
        } else {
            return (byte / 1024 / 1024 / 1024).toFixed(1) + "GB";
        }
    }
})();