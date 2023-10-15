(function () {
    console.log("catch.js Start");
    if (document.getElementById("CatCatchCatch")) { return; }

    // 启用开关
    let enable = true;

    const buttonStyle = 'style="border:solid 1px #000;margin:2px;padding:2px;background:#fff;border-radius:4px;border:solid 1px #c7c7c780;color:#000;"';
    const checkboxStyle = 'style="-webkit-appearance: auto;"';

    const CatCatch = document.createElement("div");
    CatCatch.setAttribute("id", "CatCatchCatch");
    CatCatch.innerHTML = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">
    <div id="tips"></div>
    <button id="download" ${buttonStyle}>下载已捕获的数据</button>
    <button id="clean" ${buttonStyle}>删除已捕获数据</button>
    <button id="restart" ${buttonStyle}>从头捕获</button>
    <div><button id="hide" ${buttonStyle}>隐藏</button><button id="close" ${buttonStyle}>关闭</button></div>
    <label><input type="checkbox" id="autoDown" ${localStorage.getItem("CatCatchCatch_autoDown")} ${checkboxStyle}>完成捕获自动下载</label>
    <label><input type="checkbox" id="ffmpeg" ${localStorage.getItem("CatCatchCatch_ffmpeg")} ${checkboxStyle}>使用ffmpeg合并</label>
    <details>
        <summary>文件名设置</summary>
        <div style="font-weight:bold;">文件名: </div><div id="fileName"></div>
        <div style="font-weight:bold;">表达式: </div><div id="selector">未设置</div>
        <div style="font-weight:bold;">正则: </div><div id="regular">未设置</div>
        <button id="setSelector" ${buttonStyle}>表达式提取</button>
        <button id="setRegular" ${buttonStyle}>正则提取</button>
        <button id="setFileName" ${buttonStyle}>手动填写</button>
    </details>
    <details>
    <summary>test</summary>
        <label><input type="checkbox" id="checkHead" ${checkboxStyle} checked>清理多余头部数据</label>
        <button id="test" ${buttonStyle}>test</button>
    </details>`;
    CatCatch.style = `
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
        if (isComplete || window.confirm("提前下载可能会造成数据混乱.确认？")) {
            catchDownload();
        }
    });
    CatCatch.querySelector("#hide").addEventListener('click', function (event) {
        CatCatch.style.display = "none";
    });
    CatCatch.querySelector("#close").addEventListener('click', function (event) {
        enable = false;
        CatCatch.style.display = "none";
        window.postMessage({ action: "catCatchToBackground", Message: "script", script: "catch.js", refresh: false });
    });
    CatCatch.querySelector("#restart").addEventListener('click', function (event) {
        clearCache();
        document.querySelectorAll("video").forEach(function (element) {
            element.currentTime = 0;
            element.play();
        });
    });
    CatCatch.querySelector("#setFileName").addEventListener('click', function (event) {
        setFileName = window.prompt("输入文件名, 不包含扩展名", setFileName ?? "");
        getFileName();
    });
    CatCatch.querySelector("#test").addEventListener('click', function (event) {
        console.log(catchMedia);
        console.log(bufferList);
    });

    // 文件名设置
    let setFileName = null;
    const fileName = CatCatch.querySelector("#fileName");
    const selector = CatCatch.querySelector("#selector");
    selector.innerHTML = localStorage.getItem("CatCatchCatch_selector") ?? "未设置";
    CatCatch.querySelector("#setSelector").addEventListener('click', function (event) {
        const result = window.prompt("文件名获取Selector表达式", localStorage.getItem("CatCatchCatch_selector") ?? "");
        if (result == null) { return; }
        if (result == "") { clearFileName("selector"); return; }
        const title = document.querySelector(result);
        if (title && title.innerHTML) {
            selector.innerHTML = stringModify(result);
            localStorage.setItem("CatCatchCatch_selector", result);
            getFileName();
        } else {
            clearFileName("selector", "表达式错误, 无法获取或内容为空!");
        }
    });
    const regular = CatCatch.querySelector("#regular");
    regular.innerHTML = localStorage.getItem("CatCatchCatch_regular") ?? "未设置";
    CatCatch.querySelector("#setRegular").addEventListener('click', function (event) {
        let result = window.prompt("文件名获取正则", localStorage.getItem("CatCatchCatch_regular") ?? "");
        if (result == null) { return; }
        if (result == "") { clearFileName("regular"); return; }
        try {
            new RegExp(result);
            regular.innerHTML = stringModify(result);
            localStorage.setItem("CatCatchCatch_regular", result);
            getFileName();
        } catch (e) { clearFileName("regular", "正则表达式错误"); console.log(e); }
    });

    // 操作按钮
    let isComplete = false;
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

    tips.innerHTML = "等待视频播放";
    let catchMedia = [];
    let bufferList = {};
    let mediaSize = 0;
    let index = 0;
    const _AddSourceBuffer = window.MediaSource.prototype.addSourceBuffer;
    window.MediaSource.prototype.addSourceBuffer = function (mimeType) {
        // 标题获取
        setTimeout(() => { getFileName(); }, 2000);
        tips.innerHTML = "捕获数据中...";
        const sourceBuffer = _AddSourceBuffer.call(this, mimeType);
        const _appendBuffer = sourceBuffer.appendBuffer;
        const type = mimeType.split("/").shift() + (++index);
        bufferList[type] = [];
        catchMedia.push({ mimeType, bufferList: bufferList[type] });
        sourceBuffer.appendBuffer = function (data) {
            if (enable) {
                mediaSize += data.byteLength;
                tips.innerHTML = "捕获数据中: " + byteToSize(mediaSize);
                bufferList[type].push(data);
            }
            _appendBuffer.call(this, data);
        }
        return sourceBuffer;
    }
    window.MediaSource.prototype.addSourceBuffer.toString = function () {
        return _AddSourceBuffer.toString();
    }

    const _endOfStream = window.MediaSource.prototype.endOfStream;
    window.MediaSource.prototype.endOfStream = function () {
        if (enable) {
            isComplete = true;
            tips.innerHTML = "捕获完成";
            localStorage.getItem("CatCatchCatch_autoDown") == "checked" && catchDownload();
        }
        _endOfStream.call(this);
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
        // catchMedia 预处理 解决 从头捕获 文件头重复 临时解决办法
        if (CatCatch.querySelector("#checkHead").checked) {
            for (let key in catchMedia) {
                const data = new Uint8Array(catchMedia[key].bufferList[1]);
                if (data[4] == 0x66 && data[5] == 0x74 && data[6] == 0x79 && data[7] == 0x70) {
                    catchMedia[key].bufferList.shift();
                }
            }
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
    function clearFileName(obj = "selector", warning = "") {
        localStorage.removeItem("CatCatchCatch_" + obj);
        (obj == "selector" ? selector : regular).innerHTML = "未设置";
        getFileName();
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
        for (let key in catchMedia) {
            catchMedia[key].bufferList.splice(1);
            mediaSize += catchMedia[key].bufferList[0].byteLength;
        }
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
    function getFileName() {
        if (setFileName) {
            fileName.innerHTML = stringModify(setFileName);
            return;
        }
        let name = "";
        if (localStorage.getItem("CatCatchCatch_selector")) {
            const title = document.querySelector(localStorage.getItem("CatCatchCatch_selector"));
            if (title && title.innerHTML) {
                name = title.innerHTML;
            }
        }
        if (localStorage.getItem("CatCatchCatch_regular")) {
            const str = name == "" ? document.documentElement.outerHTML : name;
            try {
                const reg = new RegExp(localStorage.getItem("CatCatchCatch_regular"), "g");
                let result = str.match(reg);
                console.log(result, reg);
                if (result) {
                    result = result.filter((item) => { return item !== ""; });
                    name = result.join("_");
                }
            } catch (e) { console.log(e); }
        }
        fileName.innerHTML = name ? stringModify(name) : stringModify(document.title);
    }
    function stringModify(str) {
        if (!str) { return str; }
        return str.replace(/['\\:\*\?"<\/>\|~]/g, function (m) {
            return {
                "'": '&#39;',
                '\\': '&#92;',
                '/': '&#47;',
                ':': '&#58;',
                '*': '&#42;',
                '?': '&#63;',
                '"': '&quot;',
                '<': '&lt;',
                '>': '&gt;',
                '|': '&#124;',
                '~': '_'
            }[m];
        });
    }
})();