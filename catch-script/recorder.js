(function () {
    console.log("recorder.js Start");
    if (document.getElementById("catCatchRecorder")) {
        return;
    }
    const CatCatch = document.createElement("div");
    CatCatch.setAttribute("id", "catCatchRecorder");
    CatCatch.setAttribute("data-switch", "on");
    CatCatch.innerHTML = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;"><div id="tips"></div>';
    CatCatch.style = `position: fixed;
        z-index: 999999;
        top: 15%;
        left: 90%;
        background: #fff;
        border: solid 1px #c7c7c7;
        border-radius: 4px;
        color: rgb(26, 115, 232);
        cursor: pointer;
        padding: 5px 5px 5px 5px;
        font-size: 15px;
        font-family: "Microsoft YaHei", "Helvetica", "Arial", sans-serif;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: space-evenly;`;
    document.getElementsByTagName('html')[0].appendChild(CatCatch);
    const cat = CatCatch.querySelector("#tips");

    let isMove = false;
    CatCatch.addEventListener('click', function (event) {
        if (!isMove) {
            switch (cat.getAttribute("data-switch")) {
                case "on":
                    try {
                        recorder.start();
                    } catch (e) {
                        cat.innerHTML = "无法捕获视频<br>点击重试";
                        cat.setAttribute("data-switch", "error");
                    }
                    break;
                case "off":
                    recorder.stop(); break;
                case "error":
                    Start(); break;
                default: return;
            }
        }
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

    var buffer = [];
    var steam;
    var option = { mimeType: 'video/webm;codecs=vp9,opus' };
    var recorder = {};

    Start();
    function Start() {
        let videoCount = document.getElementsByTagName("video").length;
        if (videoCount == 0) {
            cat.innerHTML = "无法找到视频标签<br>点击重试";
            cat.setAttribute("data-switch", "error");
            return;
        }
        if (videoCount == 1) {
            getStream(0);
            return;
        }
        let HTML = '<select id="videoSelect"><option value="-1">存在多个视频标签，请选择</option>';
        for (let i = 0; i < videoCount; i++) {
            HTML += `<option value="${i}">第${i + 1}个视频标签</option>`;
        }
        HTML += `</select>`;
        cat.innerHTML = HTML;
        cat.setAttribute("data-switch", "select");
        document.getElementById("videoSelect").addEventListener('change', function (event) {
            if (event.target.value == -1) return;
            getStream(event.target.value);
        });
    }

    function getStream(index) {
        try {
            steam = document.getElementsByTagName("video")[index].captureStream();
            recorder = new MediaRecorder(steam, option);
            cat.innerHTML = "开启录制";
            cat.setAttribute("data-switch", "on");
        } catch (e) {
            console.log(e);
            cat.innerHTML = "无法捕获视频<br>点击重试";
            cat.setAttribute("data-switch", "error");
        }
    }

    recorder.ondataavailable = function (e) {
        buffer.push(e.data);
    }
    recorder.onstart = function (e) {
        buffer = [];
        cat.innerHTML = "正在录制<br>关闭录制并下载";
        cat.setAttribute("data-switch", "off");
    }
    recorder.onstop = function (e) {
        cat.setAttribute("data-switch", "on");
        cat.innerHTML = "等待下载";

        const fileBlob = new Blob(buffer, { type: option });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(fileBlob);
        a.download = `${document.title}.webm`;
        a.click();
        a.remove();
        buffer = [];

        cat.setAttribute("data-switch", "on");
        cat.innerHTML = "下载完成<br>再次开启录制";
    }
    recorder.onerror = function (event) {
        cat.innerHTML = "录制失败<br>详情看控制台信息";
        console.log(event);
    };
})();