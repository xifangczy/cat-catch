(function () {
    let _tabId = -1;               // 当前选中的标签页ID
    let _index = -1;               // 当前选中的视频索引
    let VideoTagTimer;             // 标签列表刷新定时器
    let VideoStateTimer;           // 视频状态刷新定时器
    let tabOptions = {};           // 记录已添加的标签下拉选项 {tabId: true}

    // ========== 视频标签下拉列表管理 ==========
    function setVideoTagTimer() {
        clearInterval(VideoTagTimer);
        VideoTagTimer = setInterval(updateVideoTagOptions, 1000);
    }

    function updateVideoTagOptions() {
        chrome.tabs.query({ windowType: "normal" }, (tabs) => {
            const currentIds = tabs.map(t => t.id);

            // 删除已关闭标签的选项
            Object.keys(tabOptions).forEach(id => {
                if (!currentIds.includes(Number(id))) {
                    $(`#option${id}`).remove();
                    delete tabOptions[id];
                    // 如果当前选中的标签被关闭，重置 _tabId
                    if (_tabId === Number(id)) _tabId = -1;
                }
            });

            // 添加新出现的标签选项
            tabs.forEach(tab => {
                if (tabOptions[tab.id]) return; // 已存在
                const option = $(`<option value="${tab.id}" id="option${tab.id}">${stringModify(tab.title)}</option>`);
                $("#videoTabIndex").append(option);
                tabOptions[tab.id] = true;

                // 检查该标签是否有媒体，若没有则移除选项
                chrome.tabs.sendMessage(tab.id, { Message: "getVideoState", index: 0 }, { frameId: 0 }, (state) => {
                    if (chrome.runtime.lastError || !state || state.count === 0) {
                        $(`#option${tab.id}`).remove();
                        delete tabOptions[tab.id];
                        if (_tabId === tab.id) _tabId = -1;
                    } else {
                        $("#videoTabTips").remove(); // 移除“无视频”提示
                        // 如果当前没有选中标签且该标签为活动标签，自动选中
                        if (_tabId === -1 && tab.id === G.tabId) {
                            _tabId = tab.id;
                            $("#videoTabIndex").val(tab.id);
                        }
                    }
                });
            });

            // 若下拉框无任何选项，显示提示
            if ($("#videoTabIndex option").length === 0) {
                if ($("#videoTabTips").length === 0) {
                    $("#videoTabIndex").after('<span id="videoTabTips">无可用媒体</span>');
                }
            }
        });
    }

    // ========== 视频状态刷新 ==========
    function setVideoStateTimer() {
        clearInterval(VideoStateTimer);
        VideoStateTimer = setInterval(() => getVideoState(false), 500);
    }

    function getVideoState(setSpeed = false) {
        if (_tabId === -1) {
            let currentTabId = $("#videoTabIndex").val();
            if (!currentTabId || currentTabId == -1) return;
            _tabId = parseInt(currentTabId);
        }

        chrome.tabs.sendMessage(_tabId, { Message: "getVideoState", index: _index }, { frameId: 0 }, (state) => {
            if (chrome.runtime.lastError || !state || state.count === 0) return;

            // 如果是纯音频，隐藏画中画和截图按钮
            if (state.type === "audio") {
                $("#pip, #screenshot").hide();
            } else {
                if (!G.isFirefox) $("#pip").show();
                $("#screenshot").show();
            }

            // 更新音量进度
            $("#volume").val(state.volume);
            if (state.duration && state.duration !== Infinity) {
                $("#timeShow").html(`${secToTime(state.currentTime)} / ${secToTime(state.duration)}`);
                $("#time").val(state.time);
            }

            // 播放/暂停按钮
            state.paused
                ? $("#control").html(i18n.play).data("switch", "play")
                : $("#control").html(i18n.pause).data("switch", "pause");

            // 倍速按钮
            state.speed === 1
                ? $("#speed").html(i18n.speedPlayback).data("switch", "speed")
                : $("#speed").html(i18n.normalPlay).data("switch", "normal");

            $("#loop").prop("checked", state.loop);
            $("#muted").prop("checked", state.muted);

            if (setSpeed && state.speed !== 1) {
                $("#playbackRate").val(state.speed);
            }

            // 更新视频下拉菜单，带播放状态图标
            if (state.videoStatus) {
                let currentOptions = $("#videoIndex option");
                let needUpdate = currentOptions.length !== state.videoStatus.length;
                if (!needUpdate) {
                    for (let i = 0; i < state.videoStatus.length; i++) {
                        const prefix = state.videoStatus[i] ? "" : "▶ ";
                        const expectedText = prefix + truncateSrc(state.src[i]);
                        if (currentOptions.eq(i).text() !== expectedText) {
                            needUpdate = true;
                            break;
                        }
                    }
                }
                if (needUpdate) {
                    $("#videoIndex").empty();
                    state.videoStatus.forEach((isPaused, i) => {
                        const prefix = isPaused ? "" : "▶ ";
                        const src = truncateSrc(state.src[i]);
                        $(`<option value="${i}">${prefix}${src}</option>`).appendTo("#videoIndex");
                    });
                }
            }

            // 确保下拉菜单选中当前索引
            _index = _index === -1 ? 0 : _index;
            $("#videoIndex").val(_index);
        });
    }

    // 辅助函数：截断过长的视频源名称
    function truncateSrc(src) {
        let name = src.split("/").pop();
        if (name.length >= 60) {
            name = name.substr(0, 35) + "..." + name.substr(-35);
        }
        return name;
    }

    // ========== 事件监听 ==========
    // 点击其他标签页时切换
    $("#otherTab").click(() => {

        // 初始化
        updateVideoTagOptions();
        setVideoTagTimer();

        chrome.tabs.get(G.mediaControl.tabid, (tab) => {
            if (chrome.runtime.lastError) {
                _tabId = -1;
                _index = -1;
                setVideoTagTimer();
                getVideoState(false);
                setVideoStateTimer();
                return;
            }
            chrome.tabs.sendMessage(G.mediaControl.tabid, { Message: "getVideoState", index: 0 }, (state) => {
                _tabId = G.mediaControl.tabid;
                if (state && state.count > G.mediaControl.index) {
                    _index = G.mediaControl.index;
                }
                $("#videoTabIndex").val(_tabId);
                setVideoTagTimer();
                getVideoState(true);
                setVideoStateTimer();
                (chrome.storage.session ?? chrome.storage.local).set({ mediaControl: { tabid: _tabId, index: _index } });
            });
        });
    });

    // 切换标签/视频选择
    $("#videoIndex, #videoTabIndex").change(function () {
        if (this.id === "videoTabIndex") {
            _tabId = parseInt($("#videoTabIndex").val());
            _index = 0;
        } else {
            _index = parseInt($("#videoIndex").val());
        }
        (chrome.storage.session ?? chrome.storage.local).set({ mediaControl: { tabid: _tabId, index: _index } });
        getVideoState(true);
    });

    // 倍速滚轮调节
    let wheelPlaybackRateTimeout;
    $("#playbackRate").on("wheel", function (event) {
        $(this).blur();
        let speed = parseFloat($(this).val());
        speed = event.originalEvent.wheelDelta < 0 ? speed - 0.1 : speed + 0.1;
        speed = parseFloat(speed.toFixed(1));
        if (speed < 0.1 || speed > 16) return false;
        $(this).val(speed);
        clearTimeout(wheelPlaybackRateTimeout);
        wheelPlaybackRateTimeout = setTimeout(() => {
            chrome.storage.sync.set({ playbackRate: speed });
            chrome.tabs.sendMessage(_tabId, { Message: "speed", speed, index: _index });
        }, 200);
        return false;
    });

    // 倍速按钮
    $("#speed").click(function () {
        if (_index < 0 || _tabId < 0) return;
        const speed = parseFloat($("#playbackRate").val());
        chrome.storage.sync.set({ playbackRate: speed });
        chrome.tabs.sendMessage(_tabId, { Message: "speed", speed: $(this).data("switch") === "speed" ? speed : 1, index: _index });
    });

    // 画中画
    $("#pip").click(function () {
        if (_index < 0 || _tabId < 0) return;
        chrome.tabs.sendMessage(_tabId, { Message: "pip", index: _index }, (state) => {
            if (chrome.runtime.lastError) return;
            $("#pip").html(state.state ? i18n.exit : i18n.pictureInPicture);
        });
    });

    // 全屏
    $("#fullScreen").click(function () {
        if (_index < 0 || _tabId < 0) return;
        chrome.tabs.get(_tabId, (tab) => {
            chrome.tabs.highlight({ tabs: tab.index }, () => {
                chrome.tabs.sendMessage(_tabId, { Message: "fullScreen", index: _index }, () => close());
            });
        });
    });

    // 播放/暂停
    $("#control").click(function () {
        if (_index < 0 || _tabId < 0) return;
        const action = $(this).data("switch");
        chrome.tabs.sendMessage(_tabId, { Message: action, index: _index });
    });

    // 循环 / 静音
    $("#loop, #muted").click(function () {
        if (_index < 0 || _tabId < 0) return;
        const action = $(this).prop("checked");
        chrome.tabs.sendMessage(_tabId, { Message: this.id, action, index: _index });
    });

    // 调节音量 / 进度时暂停定时器
    $("#volume, #time").mousedown(function () {
        if (_index < 0 || _tabId < 0) return;
        clearInterval(VideoStateTimer);
    });

    // 音量提交
    $("#volume").mouseup(function () {
        if (_index < 0 || _tabId < 0) return;
        chrome.tabs.sendMessage(_tabId, { Message: "setVolume", volume: $(this).val(), index: _index }, () => {
            if (!chrome.runtime.lastError) setVideoStateTimer();
        });
    });

    // 进度提交
    $("#time").mouseup(function () {
        if (_index < 0 || _tabId < 0) return;
        chrome.tabs.sendMessage(_tabId, { Message: "setTime", time: $(this).val(), index: _index }, () => {
            if (!chrome.runtime.lastError) setVideoStateTimer();
        });
    });

    // 截图
    $("#screenshot").click(function () {
        if (_index < 0 || _tabId < 0) return;
        chrome.tabs.sendMessage(_tabId, { Message: "screenshot", index: _index });
    });
})();