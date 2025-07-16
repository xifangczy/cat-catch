class FilePreview {

    MAX_CONCURRENT = 3;   // 最大并行生成预览数
    MAX_LIST_SIZE = 128;  // 最大文件列表长度

    constructor() {
        this.fileItems = [];         // 文件列表
        this.originalItems = [];     // 原始文件列表
        this.regexFilters = null;    // 正则过滤
        this.pushDebounce = null;   // 添加文件防抖
        this.alertTimer = null;     // 提示信息定时器
        this.isDragging = false;    // 是否正在拖动
        this.previewHLS = null;     // 全屏预览视频HLS工具
        this.catDownloadIsProcessing = false; // 猫抓下载器是否正在处理

        // 获取tabId
        const params = new URL(location.href).searchParams;
        this._tabId = parseInt(params.get("tabId"));
        if (isNaN(this._tabId)) {
            this.alert(i18n.noData, 1500);
            return;
        }

        // 显示范围
        this.currentRange = params.get("range")?.split("-").map(Number);
        if (this.currentRange) {
            this.currentRange = { start: this.currentRange[0], end: this.currentRange[1] || undefined };
        }

        // 分页
        this.currentPage = params.get("page");
        this.currentPage = this.currentPage ? parseInt(this.currentPage) : 1;

        // 初始化
        this.init();
    }
    /**
     * 初始化
     */
    async init() {
        this.tab = await chrome.tabs.getCurrent();  // 获取当前标签
        this.setupEventListeners();     // 设置事件监听
        await this.loadFileItems();     // 载入数据
        this.setupFilters();            // 设置 后缀/类型 筛选
        this.renderFileItems();         // 渲染文件列表
        this.startPreviewGeneration();  // 开始预览生成
        this.setupSelectionBox();       // 框选
        this.srciptList();              // 脚本列表
        this.updateSrciptButton();      // 更新按钮状态
        this.checkVersion();            // 检查版本
    }

    /**
     * 设置按钮、键盘 、等事件监听
     */
    setupEventListeners() {
        // 全选
        document.querySelector('#select-all').addEventListener('click', () => this.toggleSelection('all'));
        // 反选
        document.querySelector('#select-reverse').addEventListener('click', () => this.toggleSelection('reverse'));
        // 下载选中
        document.querySelector('#download-selected').addEventListener('click', () => this.downloadSelected());
        // 合并下载
        document.querySelector('#merge-download').addEventListener('click', () => this.mergeDownload());
        // 点击非视频区域 关闭视频
        document.querySelectorAll('.preview-container').forEach(container => {
            container.addEventListener('click', (event) => {
                if (event.target.closest('video, img')) { return; }
                this.closePreview()
            });
        });
        // 按键盘ESC关闭视频
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closePreview();
                return;
            }
            // ctrl + a
            if ((event.ctrlKey || event.metaKey) && event.key === 'a' && event.target.tagName != "INPUT") {
                this.toggleSelection('all');
                event.preventDefault();
            }
        });
        // 排序按钮
        document.querySelectorAll('.sort-options input').forEach(input => {
            input.addEventListener('change', () => this.updateFileList());
        });
        // 正则过滤 监听回车
        document.querySelector('#regular').addEventListener('keypress', (e) => {
            if (e.keyCode == 13) {
                const value = e.target.value.trim();
                try {
                    this.regexFilters = value ? new RegExp(value) : null;
                } catch (error) {
                    this.regexFilters = null;
                    this.alert(i18n.noMatch);
                }
                this.updateFileList();
            }
        });
        // 复制
        document.querySelector('#copy-selected').addEventListener('click', () => this.copy());
        // 清理数据
        document.querySelector('#clear').addEventListener('click', () => this.clearData());
        // 删除
        document.querySelector('#delete-selected').addEventListener('click', () => this.deleteItem());
        // debug
        document.querySelector('#debug').addEventListener('click', () => console.dir(this.fileItems));
        // 显示标题
        document.querySelector('input[name="showTitle"]').addEventListener('change', (e) => {
            this.fileItems.forEach(item => {
                item.html.querySelector('.file-title').classList.toggle('hide', !e.target.checked);
            });
            this.updateFileList();
        });
        // aria2
        if (G.enableAria2Rpc) {
            const aria2 = document.querySelector("#aria2-selected");
            aria2.classList.remove("hide");
            aria2.addEventListener('click', () => {
                this.getSelectedItems().forEach(item => this.aria2(item));
            });
        }
        // 发送
        if (G.send2localManual) {
            const send = document.querySelector("#send-selected");
            send.classList.remove("hide");
            send.addEventListener('click', () => {
                this.getSelectedItems().forEach(item => this.send(item));
            });
        }

        // 默认弹出模式
        document.querySelector('#defaultPopup').addEventListener('change', (e) => {
            chrome.storage.sync.set({ popup: e.target.checked });
        });
    }
    // 全选/反选
    toggleSelection(type) {
        this.fileItems.forEach(item => {
            item.selected = type === 'all' ? true :
                type === 'reverse' ? !item.selected : false;
        });
        this.updateButtonStatus();
    }
    /**
     * 获取选中元素 转为对象
     */
    getSelectedItems() {
        return this.fileItems.filter(item => item.selected);
    }
    /**
     * 更新按钮状态
     */
    updateButtonStatus() {
        const selectedItems = this.getSelectedItems();

        const hasItems = selectedItems.length > 0;
        const canMerge = selectedItems.length === 2 && (
            selectedItems.every(item => (item.size ?? 0) <= G.chromeLimitSize && isMedia(item)) ||
            selectedItems.every(isM3U8)
        );

        document.querySelector('#delete-selected').disabled = !hasItems;
        document.querySelector('#merge-download').disabled = !canMerge;
        document.querySelector('#copy-selected').disabled = !hasItems;
        document.querySelector('#download-selected').disabled = !hasItems;
        document.querySelector('#aria2-selected').disabled = !hasItems;
        document.querySelector('#send-selected').disabled = !hasItems;
    }
    /**
     * 合并下载
     */
    mergeDownload() {
        chrome.runtime.sendMessage({
            Message: "catCatchFFmpeg",
            action: "openFFmpeg",
            extra: i18n.waitingForMedia
        });
        const checkedData = this.getSelectedItems();
        // 都是m3u8 自动合并并发送到ffmpeg
        if (checkedData.every(data => isM3U8(data))) {
            const taskId = Date.parse(new Date());
            checkedData.forEach((data) => {
                this.openM3U8(data, { ffmpeg: "merge", quantity: checkedData.length, taskId: taskId, autoDown: true, autoClose: true });
            });
            return;
        }
        this.catDownload(checkedData, { ffmpeg: "merge" });
    }

    /**
     * 下载文件
     * @param {Object} data 下载数据
     */
    downloadItem(data) {
        if (G.m3u8dl && isM3U8(data)) {
            if (!data.url.startsWith("blob:")) {
                const m3u8dlArg = data.m3u8dlArg ?? templates(G.m3u8dlArg, data);
                const url = 'm3u8dl:' + (G.m3u8dl == 1 ? Base64.encode(m3u8dlArg) : m3u8dlArg);
                if (url.length >= 2046) {
                    navigator.clipboard.writeText(m3u8dlArg);
                    alert(i18n.M3U8DLparameterLong);
                    return;
                }
                if (G.isFirefox) {
                    window.location.href = url;
                    return;
                }
                chrome.tabs.update({ url: url });
                return;
            }
        }
        if (G.m3u8AutoDown && isM3U8(data)) {
            this.openM3U8(data, { taskId: Date.parse(new Date()), autoDown: true, autoClose: true });
            return;
        }
        this.catDownload(data);
    }
    /**
     * 删除文件
     * @param {Object|null} data 
     */
    deleteItem(data = null) {
        data = data ? [data] : this.getSelectedItems();
        data.forEach(item => {
            const index = this.originalItems.findIndex(originalItem => originalItem.requestId === item.requestId);
            if (index !== -1) {
                this.originalItems.splice(index, 1);
            }
        });
        this.updateFileList();
    }
    /**
     * 复制文件链接
     * @param {Object|null} item 
     */
    copy(data = null) {
        data = data ? [data] : this.getSelectedItems();
        const url = [];
        data.forEach(function (item) {
            url.push(copyLink(item));
        });
        navigator.clipboard.writeText(url.join("\n"));
        this.alert(i18n.copiedToClipboard);
    }
    /**
     * 下载选中
     */
    downloadSelected() {
        const data = this.getSelectedItems();
        data.length && this.catDownload(data);
    }
    /**
     * 发送到aria2
     * @param {Object} data 文件对象
     */
    aria2(data) {
        aria2AddUri(data, (success) => {
            this.alert(success, 1000);
        }, (msg) => {
            this.alert(msg, 1500);
        });
    }
    /**
     * 调用第三方工具
     * @param {Object} data 文件对象
     */
    invoke(data) {
        const url = templates(G.invokeText, data);
        if (G.isFirefox) {
            window.location.href = url;
        } else {
            chrome.tabs.update({ url: url });
        }
    }
    /**
     * 发送到远程或本地地址
     * @param {Object} data 文件对象
     */
    send(data) {
        send2local("catch", data, this._tabId).then((success) => {
            success && success?.ok && this.alert(i18n.hasSent, 1000);
        }).catch((error) => {
            error ? this.alert(error, 1500) : this.alert(i18n.sendFailed, 1500);
        });
    }
    /**
     * 更新文件列表
     */
    updateFileList() {
        this.fileItems = [...this.originalItems];
        // 获取勾选扩展
        const selectedExts = Array.from(document.querySelectorAll('input[name="ext"]:checked'))
            .map(checkbox => checkbox.value);

        //勾选类型
        const selectedTyps = Array.from(document.querySelectorAll('input[name="type"]:checked'))
            .map(checkbox => checkbox.value);

        // 应用 正则 and 扩展过滤
        this.fileItems = this.fileItems.filter(item =>
            selectedExts.includes(item.ext) && selectedTyps.includes(item.type) &&
            (!this.regexFilters || this.regexFilters.test(item.url))
        );
        // 排序
        const order = document.querySelector('input[name="sortOrder"]:checked').value === 'asc' ? 1 : -1;
        const field = document.querySelector('input[name="sortField"]:checked').value;
        if (field === 'name') {
            this.fileItems.sort((a, b) => order * a[field].localeCompare(b[field]));
        } else {
            this.fileItems.sort((a, b) => order * (a[field] - b[field]));
        }

        // 更新显示
        this.renderFileItems();
        this.updateButtonStatus();
    }
    /**
     * 创建文件元素
     * @param {Object} item 数据
     * @param {Number} index 索引
     */
    createFileElement(item, index) {
        if (item.html) { return item.html; }
        item.html = document.createElement('div');
        item.html.setAttribute('data-index', index);
        item.html.className = 'file-item';
        item.html.innerHTML = `
            <div class="file-title hide">${item.title}</div>
            <div class="file-name">${item.name}</div>
            <div class="preview-container">
                <img src="${item.favIconUrl || 'img/icon.png'}" class="preview-image icon">
            </div>
            <div class="bottom-row">
                <img src="img/regex.png" class="${item.isRegex ? "" : "hide"}" title="${i18n.regexTitle}" style="width: 23px;">
                <div class="file-info">${item.ext}</div>
            </div>
            <div class="actions">
                <img src="img/copy.png" class="icon copy" title="${i18n.copy}">
                <img src="img/delete.svg" class="icon delete" title="${i18n.delete}">
                <img src="img/download.svg" class="icon download" title="${i18n.download}">
            </div>`;
        // 添加文件信息
        if (item.size && item.size >= 1024) {
            item.html.querySelector('.file-info').textContent += ` / ${byteToSize(item.size)}`;
        }
        item.html.addEventListener('click', (event) => {
            if (event.target.closest('.icon') || this.isDragging) { return; }
            item.selected = !item.selected;
            this.updateButtonStatus();
        });
        // 复制图标
        item.html.querySelector('.copy').addEventListener('click', () => this.copy(item));
        // 删除图标
        item.html.querySelector('.delete').addEventListener('click', () => this.deleteItem(item));
        // 下载图标
        item.html.querySelector('.download').addEventListener('click', () => this.downloadItem(item));
        // 选中状态 添加对应class
        item._selected = false;
        Object.defineProperty(item, "selected", {
            get: () => item._selected,
            set(newValue) {
                item._selected = newValue;
                item.html.classList.toggle('selected', newValue);
            }
        });
        // 图片预览
        if (isPicture(item)) {
            const previewImage = item.html.querySelector('.preview-image');
            previewImage.onload = () => {
                item.html.querySelector('.file-info').textContent += ` / ${previewImage.naturalWidth}*${previewImage.naturalHeight}`;
            };
            previewImage.src = item.url;
            // 点击预览图片
            previewImage.addEventListener('click', (event) => {
                event.stopPropagation();
                const container = document.querySelector('.image-container');
                container.querySelector('img').src = item.url;
                container.classList.remove('hide');
            });
        }

        // 添加一些图标 和 事件
        const actions = item.html.querySelector('.actions');

        if (isM3U8(item)) {
            const m3u8 = document.createElement('img');
            m3u8.src = 'img/parsing.png';
            m3u8.className = 'icon m3u8';
            m3u8.title = i18n.parser;
            m3u8.addEventListener('click', () => this.openM3U8(item));
            actions.appendChild(m3u8);
        }

        // 发送到aria2
        if (G.enableAria2Rpc) {
            const aria2 = document.createElement('img');
            aria2.src = 'img/aria2.png';
            aria2.className = 'icon aria2';
            aria2.title = "aria2";
            aria2.addEventListener('click', () => this.aria2(item));
            actions.appendChild(aria2);
        }

        // 调用第三方工具
        if (G.invoke) {
            const invoke = document.createElement('img');
            invoke.src = 'img/invoke.svg';
            invoke.className = 'icon invoke';
            invoke.title = i18n.invoke;
            invoke.addEventListener('click', () => this.invoke(item));
            actions.appendChild(invoke);
        }

        // 发送到远程或本地地址
        if (G.send2localManual) {
            const send = document.createElement('img');
            send.src = 'img/send.svg';
            send.className = 'icon send';
            send.title = i18n.send2local;
            send.addEventListener('click', () => this.send(item));
            actions.appendChild(send);
        }

        return item.html;
    }
    /**
     * 设置复选框
     * @param {String} filterId 过滤器的DOM ID
     * @param {Array} items 数据项
     * @param {String} property 数据项的属性
     */
    setupFilters(filterId, property) {
        if (arguments.length === 0) {
            this.setupFilters('extensionFilters', 'ext');
            this.setupFilters('typeFilters', 'type');
            return;
        }
        const uniqueValues = [...new Set(this.originalItems.map(item => item[property]))];
        const filterContainer = document.querySelector(`#${filterId}`);
        uniqueValues.forEach(value => {
            if (filterContainer.querySelector(`input[value="${value}"]`)) return;
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" name="${property}" value="${value}" checked>${value == 'Unknown' ? value : value.toLowerCase()}`;
            label.querySelector('input').addEventListener('click', () => this.updateFileList());
            filterContainer.appendChild(label);
        });
    }

    /**
     * 渲染文件列表
     */
    renderFileItems() {
        const fragment = document.createDocumentFragment();
        this.fileItems.forEach((item, index) => {
            fragment.appendChild(this.createFileElement(item, index));
        });
        const container = document.querySelector('#file-container');
        container.innerHTML = '';
        container.appendChild(fragment);
    }
    /**
     * 修剪文件名
     * @param {Object} data 数据
     */
    trimFileName(data) {
        data._title = data.title;
        data.title = stringModify(data.title);

        data.name = isEmpty(data.name) ? data.title + '.' + data.ext : decodeURIComponent(stringModify(data.name));

        data.downFileName = G.TitleName ? templates(G.downFileName, data) : data.name;
        data.downFileName = filterFileName(data.downFileName);
        if (isEmpty(data.downFileName)) {
            data.downFileName = data.name;
        }
        data.ext = data.ext ? data.ext : 'Unknown';
        data.type = data.type ? data.type : 'Unknown';
        return data;
    }
    /**
     * 载入数据
     */
    async loadFileItems() {
        this.originalItems = await chrome.runtime.sendMessage(chrome.runtime.id, { Message: "getData", tabId: this._tabId }) || [];
        if (this.originalItems.length == 0) {
            this.alert(i18n.noData, 1500);
            return;
        }
        // 设置分页
        if (this.originalItems.length > this.MAX_LIST_SIZE) {
            this.setupPage(this.originalItems.length);
            this.originalItems = this.originalItems.slice((this.currentPage - 1) * this.MAX_LIST_SIZE, this.currentPage * this.MAX_LIST_SIZE);
        }
        // 显示范围
        if (this.currentRange) {
            this.originalItems = this.originalItems.slice(this.currentRange.start, this.currentRange.end ?? this.originalItems.length);
        }
        this.originalItems = this.originalItems.map(data => this.trimFileName(data));
        this.fileItems = [...this.originalItems];
        setHeaders(this.fileItems, null, this.tab.id);

    }
    /**
     * 关闭预览视频
     */
    closePreview() {
        document.querySelector('.play-container').classList.add('hide');
        const video = document.querySelector('#video-player');
        video.pause();
        video.src = '';
        this.previewHLS && this.previewHLS.destroy();

        const imageContainer = document.querySelector('.image-container');
        imageContainer.classList.add('hide');
    }
    /**
     * 播放文件
     * @param {Object} item 
     */
    playItem(item) {
        const video = document.querySelector('#video-player');
        const container = document.querySelector('.play-container');
        if (isM3U8(item)) {
            this.previewHLS = new Hls({ enableWorker: false });
            this.previewHLS.loadSource(item.url);
            this.previewHLS.attachMedia(video);
            this.previewHLS.on(Hls.Events.ERROR, (event, data) => {
                this.previewHLS.stopLoad();
                this.previewHLS.destroy();
            });
            this.previewHLS.on(Hls.Events.MEDIA_ATTACHED, () => {
                container.classList.remove('hide');
                video.play();
            });
        } else {
            video.src = item.url;
            container.classList.remove('hide');
            video.play();
        }
    }
    /**
     * 生成预览video标签
     * @param {Object} item 数据
     */
    async generatePreview(item) {
        return new Promise((resolve, reject) => {
            const getVideoInfo = (video) => {
                video.pause();
                videoInfo.height = video.videoHeight;
                videoInfo.width = video.videoWidth;

                if (video.duration && video.duration != Infinity) {
                    videoInfo.duration = secToTime(video.duration);
                }

                // 判断是否为音频文件
                if (item.type?.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(item.ext)) {
                    videoInfo.type = 'audio';
                    videoInfo.video = null;
                    videoInfo.height = 0;
                    videoInfo.width = 0;
                }
                resolve(videoInfo);
            };
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.loop = true;
            video.preload = 'metadata';
            video.addEventListener('loadedmetadata', () => {
                video.currentTime = 0.5;
                if (video.videoHeight && video.videoWidth) {
                    getVideoInfo(video);
                } else {
                    setTimeout(getVideoInfo, 500, video);
                }
            });

            let hls = null;

            const cleanup = () => {
                if (hls) hls.destroy();
                video.remove();
            };

            const videoInfo = { video: video, height: 0, width: 0, duration: 0, type: 'video' };
            // 处理HLS视频
            if (isM3U8(item)) {
                if (!Hls.isSupported()) {
                    return reject(new Error('HLS is not supported'));
                }

                hls = new Hls({ enableWorker: false });
                hls.loadSource(item.url);
                hls.attachMedia(video);
                videoInfo.type = 'hlsVideo';

                hls.on(Hls.Events.ERROR, (event, data) => {
                    cleanup();
                    reject(data);
                });
            }
            // 处理普通视频
            else {
                video.src = item.url;
                video.addEventListener('error', () => {
                    cleanup();
                    reject(new Error('Video load failed'));
                });
            }
        });
    }
    /**
     * 设置预览video标签到对应位置 以及添加鼠标悬停事件
     * @param {Object} item data
     */
    setPerviewVideo(item) {
        // 视频放入预览容器 增加class
        const container = item.html.querySelector('.preview-container');
        container.classList.add('video-preview');

        if (item.previewVideo.type == 'audio' || (item.previewVideo.width == 0 && item.previewVideo.height == 0)) {
            // 如果是音频文件，使用音乐图标
            container.innerHTML = '<img src="img/music.svg" class="preview-music icon" />';
        } else {
            if (container.querySelector('video')) return;
            // 如果是视频文件，使用视频预览
            container.appendChild(item.previewVideo.video);
            // 鼠标悬停事件
            item.html.addEventListener('mouseenter', () => {
                item.previewVideo.video.play();
            });
            item.html.addEventListener('mouseleave', () => {
                item.previewVideo.video.pause();
            });
            // 填写视频信息
            item.html.querySelector('.file-info').textContent += ` / ${item.previewVideo.width}*${item.previewVideo.height}`;
        }
        // 点击视频 全屏播放 阻止冒泡 以免选中
        container.querySelectorAll("video, .preview-music").forEach((element) => {
            element.addEventListener('click', (event) => {
                event.stopPropagation();
                this.playItem(item);
            });
        });
        // 填写时长
        if (item.previewVideo.duration) {
            item.html.querySelector('.file-info').textContent += ` / ${item.previewVideo.duration}`;
        }

        // 删除 preview-image
        item.html.querySelector('.preview-image')?.remove();
    }
    /**
     * 多线程 开始生成预览video标签
     */
    async startPreviewGeneration() {
        const pendingItems = this.fileItems.filter(item =>
            !item.previewVideo &&
            !item.previewVideoError &&
            (item.type?.startsWith('video/') ||
                item.type?.startsWith('audio/') ||
                isMediaExt(item.ext) ||
                isM3U8(item))
        );

        const processItem = async () => {
            while (pendingItems.length) {
                const item = pendingItems.shift();
                if (!item?.url) continue;
                try {
                    item.previewVideo = await this.generatePreview(item);
                    this.setPerviewVideo(item);
                    // console.log('Preview generated for:', item.url);
                } catch (e) {
                    item.previewVideoError = true;
                    // console.warn('Failed to generate preview for:', item.url, e);
                }
            }
        };
        await Promise.all(Array(this.MAX_CONCURRENT).fill().map(processItem));
    }
    /**
     * 猫抓下载器
     * @param {Object} data 
     * @param {Object} extra 
     */
    catDownload(data, extra = {}) {
        // 防止连续多次提交
        if (this.catDownloadIsProcessing) {
            setTimeout(() => {
                catDownload(data, extra);
            }, 233);
            return;
        }
        this.catDownloadIsProcessing = true;
        if (!Array.isArray(data)) { data = [data]; }

        // 储存数据到临时变量 提高检索速度
        localStorage.setItem('downloadData', JSON.stringify(data));

        // 如果大于2G 询问是否使用流式下载
        if (!extra.ffmpeg && !G.downStream && Math.max(...data.map(item => item._size)) > G.chromeLimitSize && confirm(i18n("fileTooLargeStream", ["2G"]))) {
            extra.downStream = 1;
        }
        // 发送消息给下载器
        chrome.runtime.sendMessage(chrome.runtime.id, { Message: "catDownload", data: data }, (message) => {
            // 不存在下载器或者下载器出错 新建一个下载器
            if (chrome.runtime.lastError || !message || message.message != "OK") {
                chrome.tabs.create({
                    url: `/downloader.html?${new URLSearchParams({
                        requestId: data.map(item => item.requestId).join(","),
                        ...extra
                    })}`,
                    index: this.tab.index + 1,
                    active: !G.downActive
                }, (tab) => {
                    const listener = (tabId, info) => {
                        if (tab && tabId === tab.id && info.status === "complete") {
                            chrome.tabs.onUpdated.removeListener(listener);
                            this.catDownloadIsProcessing = false;
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });
                return;
            }
            this.catDownloadIsProcessing = false;
        });
    }
    /**
     * 设置框选
     */
    setupSelectionBox() {
        const selectionBox = document.getElementById('selection-box');
        const container = document.querySelector('body');
        // let isDragging = false;
        let isSelecting = false;
        const startPoint = { x: 0, y: 0 };

        container.addEventListener('mousedown', (e) => {
            if (e.button == 2) return;
            // 限定起始位范围
            if (e.target.closest('.icon, .preview-image, video, button, input')) return;

            isSelecting = true;
            startPoint.x = e.pageX;
            startPoint.y = e.pageY;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isSelecting) return;

            const currentPoint = {
                x: e.pageX,
                y: e.pageY
            };

            // 计算移动距离，只有真正拖动时才显示选择框
            const moveDistance = Math.sqrt(
                Math.pow(currentPoint.x - startPoint.x, 2) +
                Math.pow(currentPoint.y - startPoint.y, 2)
            );

            // 如果移动距离大于5像素，认为是拖动而不是点击
            if (!this.isDragging && moveDistance > 5) {
                this.isDragging = true;
                selectionBox.style.display = 'block';
            }

            if (!this.isDragging) return;

            // 计算选择框的位置和大小
            const left = Math.min(startPoint.x, currentPoint.x);
            const top = Math.min(startPoint.y, currentPoint.y);
            const width = Math.abs(currentPoint.x - startPoint.x);
            const height = Math.abs(currentPoint.y - startPoint.y);

            selectionBox.style.left = `${left}px`;
            selectionBox.style.top = `${top}px`;
            selectionBox.style.width = `${width}px`;
            selectionBox.style.height = `${height}px`;

            // 检查每个file-item是否在选择框内
            this.fileItems.forEach(item => {
                const rect = item.html.getBoundingClientRect();
                if (rect.left + window.scrollX < left + width &&
                    rect.left + rect.width + window.scrollX > left &&
                    rect.top + window.scrollY < top + height &&
                    rect.top + rect.height + window.scrollY > top) {
                    item.selected = true;
                } else {
                    item.selected = false;
                }
            });
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button == 2 || !isSelecting) return;

            isSelecting = false;
            setTimeout(() => { this.isDragging = false; }, 10);
            selectionBox.style.display = 'none';
            selectionBox.style.width = '0';
            selectionBox.style.height = '0';
            this.updateButtonStatus();
        });
    }

    /**
     * 打开m3u8解析器
     * @param {Object} data 
     * @param {Object} options 
     */
    openM3U8(data, options = {}) {
        const url = `/m3u8.html?${new URLSearchParams({
            url: data.url,
            title: data.title,
            filename: data.downFileName,
            tabid: data.tabId == -1 ? this._tabId : data.tabId,
            initiator: data.initiator,
            requestHeaders: data.requestHeaders ? JSON.stringify(data.requestHeaders) : undefined,
            ...Object.fromEntries(Object.entries(options).map(([key, value]) => [key, typeof value === 'boolean' ? 1 : value])),
        })}`
        chrome.tabs.create({ url: url, index: this.tab.index + 1, active: !options.autoDown });
    }
    /**
     * 提示信息
     * @param {String} message 提示信息
     * @param {Number} sec 显示时间
     */
    alert(message, sec = 1000) {
        let toast = document.querySelector('.alert-box');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'alert-box';
            document.body.appendChild(toast);
        }
        // 显示期间新消息顶替
        clearTimeout(this.alertTimer);
        toast.classList.remove('active');

        toast.textContent = message;
        toast.classList.add('active');
        this.alertTimer = setTimeout(() => {
            toast.classList.remove('active');
        }, sec);
    }
    /**
     * 添加文件
     * @param {Object} data 
     */
    push(data) {
        if (this.originalItems.length >= this.MAX_LIST_SIZE) {
            return;
        }
        setHeaders(data, null, this.tab.id);
        this.originalItems.push(this.trimFileName(data));

        // this.startPreviewGeneration(); 防抖
        clearTimeout(this.pushDebounce);
        this.pushDebounce = setTimeout(() => {
            this.setupFilters();
            this.updateFileList();
            this.startPreviewGeneration();
        }, 1000);
    }

    /**
     * 设置分页
     * @param {Number} fileLength 文件数
     */
    setupPage(fileLength) {
        const url = new URL(location.href);
        document.querySelector('.pagination').classList.remove('hide'); // 显示页面组件
        const maxPage = Math.ceil(fileLength / this.MAX_LIST_SIZE); // 最大页数

        // 设置页码
        document.querySelector('.page-numbers').textContent = `${this.currentPage} / ${maxPage}`;

        // 上一页按钮
        if (this.currentPage != 1) {
            const prev = document.querySelector('#prev-page');
            prev.disabled = false;
            prev.addEventListener('click', () => {
                url.searchParams.set('page', this.currentPage - 1);
                chrome.tabs.update({ url: url.toString() });
            });
        }

        // 下一页按钮
        if (this.currentPage != maxPage) {
            const next = document.querySelector('#next-page');
            next.disabled = false;
            next.addEventListener('click', () => {
                url.searchParams.set('page', this.currentPage + 1);
                chrome.tabs.update({ url: url.toString() });
            });
        }
    }

    // 清理数据
    clearData() {
        chrome.runtime.sendMessage({ Message: "clearData", type: true, tabId: this._tabId });
        chrome.runtime.sendMessage({ Message: "ClearIcon", type: true, tabId: this._tabId });
        this.originalItems = [];
        document.querySelector('#extensionFilters').innerHTML = '';
        this.updateFileList();
    }

    // 脚本
    srciptList() {
        document.querySelectorAll("[type='script']").forEach((script) => {
            script.addEventListener('click', (e) => {
                chrome.runtime.sendMessage({ Message: "script", tabId: this._tabId, script: e.target.id + ".js" }, () => {
                    G.autoClearMode > 0 && this.clearData();
                    this.updateSrciptButton();
                });
            });
        });
    }

    // 更新脚本按钮状态
    updateSrciptButton() {
        chrome.runtime.sendMessage({ Message: "getButtonState", tabId: this._tabId }, (state) => {
            Object.entries(state).forEach(([key, value]) => {
                const element = document.getElementById(key);
                if (!element) return;
                const script = G.scriptList.get(`${key}.js`);
                if (script) {
                    element.textContent = value ? script.off : script.name;
                }
            });
        });

        document.querySelector('#defaultPopup').checked = G.popup;
    }

    // 版本检测
    checkVersion() {
        if (G.version < 102 || (G.isFirefox && G.version < 128)) {
            document.querySelectorAll("[type='script']").forEach(script => script.style.display = 'none');
        }
    }
}

awaitG(() => {
    loadCSS();

    // 实例化 FilePreview
    const filePreview = new FilePreview();

    // 监听新数据
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (!Message.Message || !Message.data || !filePreview || Message.data.tabId != filePreview._tabId) { return; }
        // 添加资源
        if (Message.Message == "popupAddData") {
            filePreview.push(Message.data);
            return;
        }
    });
});