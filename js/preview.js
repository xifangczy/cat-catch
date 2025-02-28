class FilePreview {
    constructor() {
        this.fileItems = [];
        this.originalItems = [];
        this.sizeFilters = null;
        this.regexFilters = null;
        this.catDownloadIsProcessing = false;
        this.MAX_CONCURRENT = 3;   // 最大并行生成预览数
        this.MAX_LIST_SIZE = 100;  // 最大文件列表长度
        this.isSelecting = false;
        this.selectionBox = null;
        this.startPoint = { x: 0, y: 0 };

        const params = new URL(location.href).searchParams;
        this._tabId = parseInt(params.get("tabId"));

        // 全屏预览视频HLS工具
        this.previewHLS = null;

        this.init();
    }
    /**
     * 初始化
     */
    async init() {
        this.tab = await chrome.tabs.getCurrent();  // 获取当前标签
        this.setupEventListeners();     // 设置事件监听
        await this.loadFileItems();     // 载入数据
        this.setupExtensionFilters();   // 设置扩展名筛选
        this.renderFileItems();         // 渲染文件列表
        this.startPreviewGeneration();  // 开始预览生成
        this.setupSelectionBox();      // 框选
    }

    /**
     * 设置按钮、键盘 、等事件监听
     */
    setupEventListeners() {
        // 全选
        document.querySelector('#select-all').addEventListener('click', () => this.toggleSelectAll());
        // 反选
        document.querySelector('#select-reverse').addEventListener('click', () => this.toggleSelectReverse());
        // 下载选中
        document.querySelector('#download-selected').addEventListener('click', () => this.downloadSelected());
        // 合并下载
        document.querySelector('#merge-download').addEventListener('click', () => this.mergeDownload());
        // 关闭预览
        document.querySelectorAll('.preview-container').forEach(container => {
            container.addEventListener('click', () => this.closePreview());
        });
        document.addEventListener('keydown', () => this.closePreview());
        // 点击视频 阻止冒泡 以免关闭视频
        document.querySelectorAll('.preview-container video, .preview-container img').forEach(container => {
            container.addEventListener('click', (e) => e.stopPropagation());
        });
        // 排序按钮
        document.querySelectorAll('.sort-options input').forEach(input => {
            input.addEventListener('change', () => this.updateFileList());
        });
        // 正则过滤 监听回车
        document.querySelector('#regular').addEventListener('keypress', (e) => {
            if (e.keyCode == 13) {
                const value = e.target.value.trim();
                this.regexFilters = new RegExp(value);
                this.updateFileList();
            }
        });
        document.querySelector('#clear').addEventListener('click', (e) => {
            chrome.runtime.sendMessage({ Message: "clearData", type: true, tabId: this._tabId });
            chrome.runtime.sendMessage({ Message: "ClearIcon", type: true, tabId: this._tabId });
            this.originalItems = [];
            document.querySelector('#extensionFilters').innerHTML = '';
            this.updateFileList();
        });
        // debug
        document.querySelector('#debug').addEventListener('click', () => console.dir(this.fileItems));
    }
    /**
     * 全选
     */
    toggleSelectAll() {
        this.fileItems.forEach(item => item.selected = true);
        this.updateMergeDownloadButton();
    }
    /**
     * 反选
     */
    toggleSelectReverse() {
        this.fileItems.forEach(item => item.selected = !item.selected);
        this.updateMergeDownloadButton();
    }
    /**
     * 获取选中元素 转为对象
     */
    getSelectedItems() {
        return this.fileItems.filter(item => item.selected);
    }
    /**
     * 更新合并下载按钮状态
     */
    updateMergeDownloadButton() {
        const selectedItems = this.getSelectedItems();
        const button = document.querySelector('#merge-download');
        button.setAttribute('disabled', 'disabled');
        if (selectedItems.length == 2) {
            const maxSize = selectedItems.reduce((prev, current) => (prev.size > current.size) ? prev : current);
            if (maxSize.size <= G.chromeLimitSize) {
                button.removeAttribute('disabled');
            }
        }
    }
    /**
     * 合并下载
     */
    mergeDownload() {
        const checkedData = this.getSelectedItems();
        // 都是m3u8 自动合并并发送到ffmpeg
        if (checkedData.every(data => isM3U8(data))) {
            const taskId = Date.parse(new Date());
            checkedData.forEach((data) => {
                this.openM3U8(data, { quantity: checkedData.length, taskId: taskId, autoDown: true, autoClose: true });
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
            chrome.tabs.create({
                url: `/m3u8.html?${new URLSearchParams({
                    requestId: data.requestId,
                    url: data.url,
                    title: data.title,
                    filename: data.downFileName,
                    tabid: data.tabId == -1 ? this.tab.id : data.tabId,
                    initiator: data.initiator,
                    requestHeaders: data.requestHeaders ? JSON.stringify(data.requestHeaders) : undefined,
                    taskId: Date.parse(new Date()),
                    autoDown: true,
                    autoClose: true,
                })}`,
                index: this.tab.index + 1,
                active: !G.downActive
            });
            return;
        }
        this.catDownload(data);
    }
    /**
     * 下载选中
     */
    downloadSelected() {
        const data = this.getSelectedItems();
        data.length && this.catDownload(data);
    }
    /**
     * 更新文件列表
     */
    updateFileList() {
        this.fileItems = [...this.originalItems];
        this.applyExtensionFilters();
        this.applyRegexFilters();
        this.sortItems();
        this.renderFileItems();
    }
    /**
     * 扩展过滤
     */
    applyExtensionFilters() {
        const selectedExts = Array.from(document.querySelectorAll('.ext-checkbox:checked'))
            .map(checkbox => checkbox.value);
        this.fileItems = this.fileItems.filter(item => selectedExts.includes(item.ext));
    }
    /**
     * 正则过滤
     */
    applyRegexFilters() {
        if (this.regexFilters) {
            this.fileItems = this.fileItems.filter(item => this.regexFilters.test(item.url));
        }
    }
    /**
     * 排序
     */
    sortItems() {
        const order = document.querySelector('input[name="sortOrder"]:checked').value;
        const field = document.querySelector('input[name="sortField"]:checked').value;
        this.fileItems.sort((a, b) => {
            const _order = order === 'asc' ? 1 : -1;
            return _order * (a[field] - b[field]);
        });
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
            <div class="file-name">${item.name}</div>
            <div class="preview-container">
                <img src="img/icon.png" class="preview-image">
            </div>
            <div class="bottom-row">
                <div class="file-info">${item.ext.toUpperCase()}</div>
            </div>
            <div class="actions">
                <img src="img/copy.png" class="icon copy" id="copy">
            </div>`;
        // 添加文件信息
        if (item.size && item.size >= 1024) {
            item.html.querySelector('.file-info').innerHTML += ` / ${byteToSize(item.size)}`;
        }
        item.html.addEventListener('click', () => {
            item.selected = !item.selected;
            this.updateMergeDownloadButton();
        });
        // 复制图标
        item.html.querySelector('.copy').addEventListener('click', (event) => {
            event.stopPropagation();
            navigator.clipboard.writeText(item.url);
            this.alert(i18n.copiedToClipboard);
        });
        // 选中状态 添加对应class
        item._selected = false;
        Object.defineProperty(item, "selected", {
            get() {
                return item._selected;
            },
            set(newValue) {
                item._selected = newValue;
                newValue ? item.html.classList.add('selected') : item.html.classList.remove('selected');
            }
        });
        // 图片预览
        if (item.type?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(item.ext)) {
            const previewImage = item.html.querySelector('.preview-image');
            previewImage.onload = () => {
                item.html.querySelector('.file-info').innerHTML += ` / ${previewImage.naturalWidth}*${previewImage.naturalHeight}`;
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
            m3u8.addEventListener('click', (event) => {
                event.stopPropagation();
                this.openM3U8(item);
            });
            actions.appendChild(m3u8);
        }

        // 下载图标
        const download = document.createElement('img');
        download.src = 'img/download.svg';
        download.className = 'icon download';
        actions.appendChild(download);
        item.html.querySelector('.download').addEventListener('click', (event) => {
            event.stopPropagation();
            this.downloadItem(item);
        });
        return item.html;
    }
    /**
     * 设置扩展名复选框
     */
    setupExtensionFilters() {
        const extensions = [...new Set(this.originalItems.map(item => item.ext))];
        const extFilter = document.querySelector('#extensionFilters');
        extensions.forEach(ext => {
            // 检查 extFilter 是否存在ext
            if (extFilter.querySelector(`input[value="${ext}"]`)) return;
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" name="ext" value="${ext}" class="ext-checkbox" checked>${ext.toUpperCase()}`;
            label.querySelector('input').addEventListener('click', () => this.updateFileList());
            extFilter.appendChild(label);
        });
    }
    /**
     * 渲染文件列表
     */
    renderFileItems() {
        const container = document.querySelector('#file-container');
        container.innerHTML = '';
        this.fileItems.forEach((item, index) => {
            const fileElement = this.createFileElement(item, index);
            container.appendChild(fileElement);
        });
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
        return data;
    }
    /**
     * 载入数据
     */
    async loadFileItems() {
        this.fileItems = await chrome.runtime.sendMessage(chrome.runtime.id, { Message: "getData", tabId: this._tabId }) || [];
        setHeaders(this.fileItems, null, this.tab.id);
        this.originalItems = [];
        for (let index = 0; index < this.fileItems.length; index++) {
            const data = this.trimFileName(this.fileItems[index]);
            this.originalItems.push(data);
            // 最大预览数限制
            if (index > this.MAX_LIST_SIZE) {
                break;
            }
        }
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
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.loop = true;
            video.preload = 'metadata';
            video.addEventListener('loadedmetadata', () => {
                video.currentTime = 0.5;
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
            });

            let hls = null;

            const cleanup = () => {
                if (hls) hls.destroy();
            };

            const videoInfo = { video: video, height: 0, width: 0, duration: 0, type: 'video' };
            // 处理HLS视频
            if (isM3U8(item)) {
                if (!Hls.isSupported()) {
                    return reject(new Error('HLS is not supported'));
                }

                hls = new Hls();
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
            container.innerHTML = '<img src="img/music.svg" class="icon" />';
        } else {
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
            item.html.querySelector('.file-info').innerHTML += ` / ${item.previewVideo.width}*${item.previewVideo.height}`;
        }
        // 填写时长
        if (item.previewVideo.duration) {
            item.html.querySelector('.file-info').innerHTML += ` / ${item.previewVideo.duration}`;
        }

        // 点击预览容器 播放  阻止冒泡 以免选中
        container.addEventListener('click', (event) => {
            event.stopPropagation();
            this.playItem(item);
        });

        // 删除 preview-image
        item.html.querySelector('.preview-image')?.remove();
    }
    /**
     * 多线程 开始生成预览video标签
     */
    async startPreviewGeneration() {
        const pendingItems = this.fileItems.filter(item => !item.previewVideo &&
            (item.type?.startsWith('video/') || isMediaExt(item.ext) || isM3U8(item)));

        const workers = [];

        for (const _ of Array(this.MAX_CONCURRENT)) {
            workers.push(
                (async () => {
                    while (pendingItems.length) {
                        const item = pendingItems.shift();
                        if (!item || !item.url) continue;
                        try {
                            item.previewVideo = await this.generatePreview(item);
                            this.setPerviewVideo(item);

                            // console.log('Preview generated for:', item.url);
                        } catch (error) {
                            console.warn('Failed to generate preview for:', item.url);
                        }
                    }
                })()
            );
        }

        await Promise.all(workers);
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
                this.createCatDownload(data, extra);
                return;
            }
            this.catDownloadIsProcessing = false;
        });
    }
    /**
     * 创建猫抓下载器
     * @param {Object} data 
     * @param {Object} extra 
     */
    createCatDownload(data, extra) {
        chrome.tabs.get(G.tabId, (tab) => {
            const arg = {
                url: `/downloader.html?${new URLSearchParams({
                    requestId: data.map(item => item.requestId).join(","),
                    ...extra
                })}`,
                index: tab.index + 1,
                active: !G.downActive
            };
            chrome.tabs.create(arg, (tab) => {
                // 循环获取tab.id 的状态 准备就绪 重置任务状态
                const interval = setInterval(() => {
                    chrome.tabs.get(tab.id, (tab) => {
                        if (tab.status == "complete") {
                            clearInterval(interval);
                            this.catDownloadIsProcessing = false;
                        }
                    });
                });
            });
        });
    }
    /**
     * 设置框选
     */
    setupSelectionBox() {
        this.selectionBox = document.getElementById('selection-box');
        const container = document.querySelector('body');
        let isDragging = false;

        container.addEventListener('mousedown', (e) => {
            if (e.button == 2) return;
            // 如果点击的是file-item或其子元素,不启动框选
            if (e.target.closest('.file-item')) return;
            // 非body和div元素不启动框选
            if (e.target.tagName !== "BODY" && e.target.tagName !== "DIV") return;

            this.isSelecting = true;
            this.startPoint = {
                x: e.pageX,
                y: e.pageY
            };
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isSelecting) return;

            const currentPoint = {
                x: e.pageX,
                y: e.pageY
            };

            // 计算移动距离，只有真正拖动时才显示选择框
            const moveDistance = Math.sqrt(
                Math.pow(currentPoint.x - this.startPoint.x, 2) +
                Math.pow(currentPoint.y - this.startPoint.y, 2)
            );

            // 如果移动距离大于5像素，认为是拖动而不是点击
            if (!isDragging && moveDistance > 5) {
                isDragging = true;
                this.selectionBox.style.display = 'block';
            }

            if (!isDragging) return;

            // 计算选择框的位置和大小
            const left = Math.min(this.startPoint.x, currentPoint.x);
            const top = Math.min(this.startPoint.y, currentPoint.y);
            const width = Math.abs(currentPoint.x - this.startPoint.x);
            const height = Math.abs(currentPoint.y - this.startPoint.y);

            this.selectionBox.style.left = `${left}px`;
            this.selectionBox.style.top = `${top}px`;
            this.selectionBox.style.width = `${width}px`;
            this.selectionBox.style.height = `${height}px`;

            // 检查每个file-item是否在选择框内
            this.fileItems.forEach(item => {
                const rect = item.html.getBoundingClientRect();
                const itemCenter = {
                    x: rect.left + rect.width / 2 + window.scrollX,
                    y: rect.top + rect.height / 2 + window.scrollY
                };

                if (itemCenter.x >= left && itemCenter.x <= left + width &&
                    itemCenter.y >= top && itemCenter.y <= top + height) {
                    item.selected = true;
                } else {
                    item.selected = false;
                }
            });
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button == 2) return;
            if (!this.isSelecting) return;

            this.isSelecting = false;
            isDragging = false;
            this.selectionBox.style.display = 'none';
            this.selectionBox.style.width = '0';
            this.selectionBox.style.height = '0';
            this.updateMergeDownloadButton();
        });
    }

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

    alert(message, sec = 1000) {
        let toast = document.querySelector('.alert-box');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'alert-box';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('active');
        setTimeout(() => {
            toast.classList.remove('active');
        }, sec);
    }
}

awaitG(() => {
    // 自定义css
    const css = document.createElement('style');
    css.textContent = G.css;
    document.head.appendChild(css);

    // 实例化 FilePreview
    const filePreview = new FilePreview();

    // 监听新数据
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (!Message.Message || !Message.data || !filePreview || Message.data.tabId != filePreview._tabId) { return; }
        // 添加资源
        if (Message.Message == "popupAddData") {
            setHeaders(Message.data, null, filePreview.tab.id);
            filePreview.originalItems.push(filePreview.trimFileName(Message.data));
            filePreview.setupExtensionFilters();
            filePreview.updateFileList();
            filePreview.startPreviewGeneration();
            return;
        }
    });
});