(function () {
    console.log("catch.js Start");
    // 添加html
    if (document.getElementById("CatCatch")) {
        return;
    }
    let cat = document.createElement("div");
    cat.setAttribute("id", "CatCatch");
    cat.innerHTML = '<div></div>';
    cat.style = `position: fixed;
        z-index: 999999;
        top: 15%;
        left: 90%;
        background: #fff;
        border: solid 1px #c7c7c7;
        border-radius: 4px;
        color: rgb(26, 115, 232);
        cursor: pointer;
        padding: 5px 5px 5px 5px;
        font-size: 12px;
        font-family: "Microsoft YaHei", "Helvetica", "Arial", sans-serif;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: space-evenly;`;
    const icon = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">`;
    document.getElementsByTagName('html')[0].appendChild(cat);

    // 操作按钮
    let isMove = false;
    let isComplete = false;
    cat.addEventListener('click', function (event) {
        isMove = !isMove;
        if (isMove) {
            catchDownload();
            isMove = false;
        }
    });
    cat.addEventListener('mousedown', function (event) {
        let x = event.pageX - cat.offsetLeft;
        let y = event.pageY - cat.offsetTop;
        document.addEventListener('mousemove', move);
        function move(event) {
            isMove = true;
            cat.style.left = event.pageX - x + 'px';
            cat.style.top = event.pageY - y + 'px';
        }
        document.addEventListener('mouseup', function () {
            document.removeEventListener('mousemove', move);
        });
    });

    console.log("等待视频播放");
    cat.innerHTML = `${icon}等待视频播放`;
    let catchMedia = [];
    let _AddSourceBuffer = window.MediaSource.prototype.addSourceBuffer;
    window.MediaSource.prototype.addSourceBuffer = function (mimeType) {
        cat.innerHTML = `${icon}捕获数据中...<br>下载已捕获的数据`;
        let sourceBuffer = _AddSourceBuffer.call(this, mimeType);
        let _appendBuffer = sourceBuffer.appendBuffer;
        let bufferList = [];
        catchMedia.push({ mimeType, bufferList });
        sourceBuffer.appendBuffer = function (data) {
            bufferList.push(data);
            _appendBuffer.call(this, data);
        }
        return sourceBuffer;
    }

    let _endOfStream = window.MediaSource.prototype.endOfStream;
    window.MediaSource.prototype.endOfStream = function () {
        isComplete = true;
        cat.innerHTML = `${icon}捕获完成<br>点击下载`;
        _endOfStream.call(this);
    }

    // 下载资源
    function catchDownload() {
        if (catchMedia.length == 0) {
            alert("没抓到有效数据");
            return;
        }
        if (isComplete || confirm("提前下载可能会导致视频无法播放，确定下载吗？")) {
            for (let item of catchMedia) {
                let mime = item.mimeType.split(';')[0];
                let type = mime.split('/')[1];
                let fileBlob = new Blob(item.bufferList, { type: mime });
                let a = document.createElement('a');
                a.href = URL.createObjectURL(fileBlob);
                a.download = `${document.title}.${type}`;
                a.click();
                a.remove();
            }
            if (isComplete) {
                catchMedia = [];
                isComplete = false;
            }
        }
    }
})();