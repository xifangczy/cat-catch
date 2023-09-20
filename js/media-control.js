(function () {
    let _tabId = -1;   // 选择的页面ID
    let _index = -1;    //选择的视频索引
    let VideoTagTimer;  // 获取所有视频标签的定时器
    let VideoStateTimer;  // 获取所有视频信息的定时器
    let compareTab = [];
    let compareVideo = [];

    function setVideoTagTimer() {
        clearInterval(VideoTagTimer);
        VideoTagTimer = setInterval(getVideoTag, 1000);
    }
    function getVideoTag() {
        chrome.tabs.query({ windowType: "normal" }, function (tabs) {
            let videoTabList = [];
            for (let tab of tabs) {
                videoTabList.push(tab.id);
            }
            if (compareTab.toString() == videoTabList.toString()) {
                return;
            }
            compareTab = videoTabList;
            // 列出所有标签
            for (let tab of tabs) {
                if ($("#option" + tab.id).length == 1) { continue; }
                $("#videoTabIndex").append(`<option value='${tab.id}' id="option${tab.id}">${stringModify(tab.title)}</option>`);
            }
            // 删除没有媒体的标签. 异步的原因，使用一个for去处理无法保证标签顺序一致
            for (let tab of videoTabList) {
                chrome.tabs.sendMessage(tab, { Message: "getVideoState", index: 0 }, { frameId: 0 }, function (state) {
                    if (chrome.runtime.lastError || state.count == 0) {
                        $("#option" + tab).remove();
                        return;
                    }
                    $("#videoTabTips").remove();
                    if (tab == G.tabId && _tabId == -1) {
                        _tabId = tab;
                        $("#videoTabIndex").val(tab);
                    }
                });
            }
        });
    }
    function setVideoStateTimer() {
        clearInterval(VideoStateTimer);
        VideoStateTimer = setInterval(getVideoState, 500);
    }
    function getVideoState(setSpeed = false) {
        if (_tabId == -1) {
            let currentTabId = $("#videoTabIndex").val();
            if (currentTabId == -1) { return; }
            _tabId = parseInt(currentTabId);
        }
        chrome.tabs.sendMessage(_tabId, { Message: "getVideoState", index: _index }, { frameId: 0 }, function (state) {
            if (chrome.runtime.lastError || state.count == 0) { return; }
            if (state.type == "audio") {
                $("#pip").hide();
                $("#screenshot").hide();
            }
            $("#volume").val(state.volume);
            if (state.duration && state.duration != Infinity) {
                $("#timeShow").html(secToTime(state.currentTime) + " / " + secToTime(state.duration));
                $("#time").val(state.time);
            }
            state.paused ? $("#control").html("播放").data("switch", "play") : $("#control").html("暂停").data("switch", "pause");
            state.speed == 1 ? $("#speed").html("倍数播放").data("switch", "speed") : $("#speed").html("正常播放").data("switch", "normal");
            $("#loop").prop("checked", state.loop);
            $("#muted").prop("checked", state.muted);
            if (setSpeed && state.speed != 1) {
                $("#playbackRate").val(state.speed);
            }
            if (compareVideo.toString() != state.src.toString()) {
                compareVideo = state.src;
                $("#videoIndex").empty();
                for (let i = 0; i < state.count; i++) {
                    let src = state.src[i].split("/").pop();
                    if (src.length >= 60) {
                        src = src.substr(0, 35) + '...' + src.substr(-35);
                    }
                    $("#videoIndex").append(`<option value='${i}'>${src}</option>`);
                }
            }
            _index = _index == -1 ? 0 : _index;
            $("#videoIndex").val(_index);
        });
    }
    // 点击其他设置标签页 开始读取tab信息以及视频信息
    getVideoTag();
    $("#otherTab").click(function () {
        chrome.tabs.get(G.mediaControl.tabid, function (tab) {
            if (chrome.runtime.lastError) {
                _tabId = -1;
                _index = -1;
                setVideoTagTimer(); getVideoState(); setVideoStateTimer();
                return;
            }
            chrome.tabs.sendMessage(G.mediaControl.tabid, { Message: "getVideoState", index: 0 }, function (state) {
                _tabId = G.mediaControl.tabid;
                if (state.count > G.mediaControl.index) {
                    _index = G.mediaControl.index;
                }
                $("#videoTabIndex").val(_tabId);
                setVideoTagTimer(); getVideoState(true); setVideoStateTimer();
                chrome.storage.local.set({ mediaControl: { tabid: _tabId, index: _index } });
            });
        });
        // setVideoTagTimer(); getVideoState(); setVideoStateTimer();
    });
    // 切换标签选择 切换视频选择
    $("#videoIndex, #videoTabIndex").change(function () {
        if (!G.isFirefox) { $("#pip").show(); }
        $("#screenshot").show();
        if (this.id == "videoTabIndex") {
            _tabId = parseInt($("#videoTabIndex").val());
        } else {
            _index = parseInt($("#videoIndex").val());
        }
        chrome.storage.local.set({ mediaControl: { tabid: _tabId, index: _index } });
        getVideoState(true);
    });
    let wheelPlaybackRateTimeout;
    $("#playbackRate").on("wheel", function (event) {
        $(this).blur();
        let speed = parseFloat($(this).val());
        speed = event.originalEvent.wheelDelta < 0 ? speed - 0.1 : speed + 0.1;
        speed = parseFloat(speed.toFixed(1));
        if (speed < 0.1 || speed > 16) { return false; }
        $(this).val(speed);
        clearTimeout(wheelPlaybackRateTimeout);
        wheelPlaybackRateTimeout = setTimeout(() => {
            chrome.storage.sync.set({ playbackRate: speed });
            chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: speed, index: _index });
        }, 200);
        return false;
    });
    // 倍速播放
    $("#speed").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        if ($(this).data("switch") == "speed") {
            const speed = parseFloat($("#playbackRate").val());
            chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: speed, index: _index });
            chrome.storage.sync.set({ playbackRate: speed });
            return;
        }
        chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: 1, index: _index });
    });
    // 画中画
    $("#pip").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "pip", index: _index }, function (state) {
            if (chrome.runtime.lastError) { return; }
            state.state ? $("#pip").html("退出") : $("#pip").html("画中画");
        });
    });
    // 全屏
    $("#fullScreen").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.get(_tabId, function (tab) {
            chrome.tabs.highlight({ 'tabs': tab.index }, function () {
                chrome.tabs.sendMessage(_tabId, { Message: "fullScreen", index: _index }, function (state) {
                    close();
                });
            });
        });
    });
    // 暂停 播放
    $("#control").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        const action = $(this).data("switch");
        chrome.tabs.sendMessage(_tabId, { Message: action, index: _index });
    });
    // 循环 静音
    $("#loop, #muted").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        const action = $(this).prop("checked");
        chrome.tabs.sendMessage(_tabId, { Message: this.id, action: action, index: _index });
    });
    // 调节音量和视频进度时 停止循环任务
    $("#volume, #time").mousedown(function () {
        if (_index < 0 || _tabId < 0) { return; }
        clearInterval(VideoStateTimer);
    });
    // 调节音量
    $("#volume").mouseup(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "setVolume", volume: $(this).val(), index: _index }, function () {
            if (chrome.runtime.lastError) { return; }
            setVideoStateTimer();
        });
    });
    // 调节视频进度
    $("#time").mouseup(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "setTime", time: $(this).val(), index: _index }, function () {
            if (chrome.runtime.lastError) { return; }
            setVideoStateTimer();
        });
    });
    // 视频截图
    $("#screenshot").click(function () {
        if (_index < 0 || _tabId < 0) { return; }
        chrome.tabs.sendMessage(_tabId, { Message: "screenshot", index: _index });
    });
})();