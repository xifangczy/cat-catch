window.onload = function(){
    console.log("recorder.js");
    // 添加html
    if (document.getElementById("catCatchRecorder")) {
        return;
    }
    let cat = document.createElement("div");
    cat.setAttribute("id", "catCatchRecorder");
    cat.setAttribute("data-switch", "on");
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
        font-size: 15px;
        font-family: "Microsoft YaHei", "Helvetica", "Arial", sans-serif;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: space-evenly;`;
    const icon = `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYBAMAAAASWSDLAAAAKlBMVEUAAADLlROxbBlRAD16GS5oAjWWQiOCIytgADidUx/95gHqwwTx0gDZqwT6kfLuAAAACnRSTlMA/vUejV7kuzi8za0PswAAANpJREFUGNNjwA1YSxkYTEqhnKZLLi6F1w0gnKA1shdvHYNxdq1atWobjLMKCOAyC3etlVrUAOH4HtNZmLgoAMKpXX37zO1FwcZAwMDguGq1zKpFmTNnzqx0Bpp2WvrU7ttn9py+I8JgLn1R8Pad22vurNkjwsBReHv33junzuyRnOnMwNCSeFH27K5dq1SNgcZxFMnuWrNq1W5VkNntihdv7ToteGcT0C7mIkE1qbWCYjJnM4CqEoWKdoslChXuUgXJqIcLebiphSgCZRhaPDhcDFhdmUMCGIgEAFA+Uc02aZg9AAAAAElFTkSuQmCC" style="-webkit-user-drag: none;width: 20px;">`;
    document.getElementsByTagName('html')[0].appendChild(cat);
    
    let isMove = false;
    cat.addEventListener('click', function (event) {
        isMove = !isMove;
        if (isMove) {
            if (cat.getAttribute("data-switch") === "on") {
                buffer = [];
                cat.setAttribute("data-switch", "off");
                cat.innerHTML = `${icon}关闭录制并下载`;
                recorder.start();
            } else {
                cat.setAttribute("data-switch", "on");
                cat.innerHTML = `${icon}开启录制`;
                recorder.stop();
            }
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
    cat.innerHTML = `${icon}开启录制`;

    var buffer = [];
    const steam = document.getElementsByTagName("video")[0].captureStream();
    const option = { mimeType: 'video/webm;codecs=vp8,opus' };
    let recorder = new MediaRecorder(steam, option);
    recorder.ondataavailable = function (e) {
        buffer.push(e.data);
    }
    recorder.onstop = function (e) {
        let fileBlob = new Blob(buffer, { type: option });
        let a = document.createElement('a');
        a.href = URL.createObjectURL(fileBlob);
        a.download = `${document.title}.webm`;
        a.click();
        a.remove();
        buffer = [];
    }
    recorder.onerror = function (event) {
        cat.innerHTML = `${icon}录制失败，详情看控制台信息`;
        console.log(event);
    };
}