class FilePreview {
    constructor() {
        this.fileItems = [];
        this.originalItems = [];
        this.sizeFilters = null;
        this.regexFilters = null;
        this.sortField = { field: 'getTime', order: 'desc' };
        this.catDownloadIsProcessing = false;
        this.MAX_CONCURRENT = 3;   // 最大并行生成预览数
        this.MAX_LIST_SIZE = 100;  // 最大文件列表长度
        this.init();
    }
    async init() {
        this.tab = await chrome.tabs.getCurrent();  // 获取当前标签
        this.setupEventListeners();     // 设置事件监听
        await this.loadFileItems();     // 载入数据
        this.setupExtensionFilters();   // 设置扩展名筛选
        this.renderFileItems();         // 渲染文件列表
        this.startPreviewGeneration();  // 开始预览生成
    }
    // 按钮监听
    setupEventListeners() {
        // 全选、反选、下载按钮、关闭视频按钮
        document.querySelector('#select-all').addEventListener('click', () => this.toggleSelectAll());
        document.querySelector('#select-reverse').addEventListener('click', () => this.toggleSelectReverse());
        document.querySelector('#download-selected').addEventListener('click', () => this.downloadSelected());
        document.querySelector('#merge-download').addEventListener('click', () => this.mergeDownload());
        document.querySelector('.play-container video').addEventListener('click', (e) => e.stopPropagation());
        document.querySelector('.play-container').addEventListener('click', () => {
            document.querySelector('.play-container').classList.add('hide');
            const video = document.querySelector('#video-player');
            video.pause();
            video.src = '';
        });

        // 排序按钮
        document.querySelectorAll('.sort-options input').forEach(input => {
            input.addEventListener('change', (e) => {
                this.sortField = {
                    field: document.querySelector('input[name="sortField"]:checked').value,
                    order: document.querySelector('input[name="sortOrder"]:checked').value
                };
                this.updateFileList();
            });
        });

        document.querySelector('#regular').addEventListener('keypress', (e) => {
            if (e.keyCode == 13) {
                const value = e.target.value.trim();
                this.regexFilters = new RegExp(value);
                this.updateFileList();
            }
        });
    }
    // 选中切换
    toggleSelection(element) {
        element.classList.toggle('selected');
        this.updateMergeDownloadButton();
    }
    // 全选
    toggleSelectAll() {
        const items = document.querySelectorAll('.file-item');
        items.forEach(item => {
            item.classList.add('selected');
        });
        this.updateMergeDownloadButton();
    }
    // 反选
    toggleSelectReverse() {
        const items = document.querySelectorAll('.file-item');
        items.forEach(item => {
            item.classList.toggle('selected')
        });
        this.updateMergeDownloadButton();
    }

    getSelectedItems() {
        const selectedItems = document.querySelectorAll('.file-item.selected');
        const indexs = Array.from(selectedItems).map(item => parseInt(item.getAttribute('data-index')));
        if (indexs.length == 0) { return []; }
        return indexs.map(index => this.fileItems[index]);
    }
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

    mergeDownload() {
        const checkedData = this.getSelectedItems();
        // 都是m3u8 自动合并并发送到ffmpeg
        if (checkedData.every(data => isM3U8(data))) {
            checkedData.forEach((data) => {
                const url = `/m3u8.html?${new URLSearchParams({
                    url: data.url,
                    title: data.title,
                    filename: data.downFileName,
                    tabid: data.tabId == -1 ? this.tab.id : data.tabId,
                    initiator: data.initiator,
                    tabid: this.tab.id,
                    requestHeaders: data.requestHeaders ? JSON.stringify(data.requestHeaders) : undefined,
                    quantity: checkedData.length,
                    taskId: Date.parse(new Date()),
                    autoDown: true,
                    autoClose: true,
                })}`
                chrome.tabs.create({ url: url, index: this.tab.index + 1, active: true });
            });
            return;
        }
        this.catDownload(checkedData, { ffmpeg: "merge" });
    }

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
                    tabid: this.tab.id,
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

    downloadSelected() {
        const data = this.getSelectedItems();
        this.catDownload(data);
    }

    // 更新文件列表
    updateFileList() {
        this.fileItems = [...this.originalItems];
        this.applyExtensionFilters();
        this.applyRegexFilters();
        this.sortItems();
        this.renderFileItems();
    }
    // 扩展过滤
    applyExtensionFilters() {
        const selectedExts = Array.from(document.querySelectorAll('.ext-checkbox:checked'))
            .map(checkbox => checkbox.value);
        this.fileItems = this.fileItems.filter(item => selectedExts.includes(item.ext));
    }
    // 正则过滤
    applyRegexFilters() {
        if (this.regexFilters) {
            this.fileItems = this.fileItems.filter(item => this.regexFilters.test(item.url));
        }
    }
    // 排序
    sortItems() {
        this.fileItems.sort((a, b) => {
            const order = this.sortField.order === 'asc' ? 1 : -1;
            return order * (a[this.sortField.field] - b[this.sortField.field]);
        });
    }

    // 创建文件元素
    createFileElement(item, index) {
        const div = document.createElement('div');
        div.setAttribute('data-index', index);
        div.className = 'file-item';
        div.innerHTML = `
            <div class="file-name">${item.name}</div>
            <div class="preview-container">
                <img src="${item.preview ? item.preview : 'img/icon.png'}" class="preview-image">
            </div>
            <div class="bottom-row">
                <div class="file-size">${byteToSize(item.size)}</div>
                <div class="media-actions">
                    <button class="button2" data-action="play">${i18n.play}</button>
                    <button class="button2" data-action="download">${i18n.download}</button>
                </div>
            </div>
        `;
        div.querySelector('[data-action="play"]').addEventListener('click', (event) => {
            event.stopPropagation();
            this.playItem(item);
        });
        div.querySelector('[data-action="download"]').addEventListener('click', (event) => {
            event.stopPropagation();
            this.downloadItem(item);
        });
        div.addEventListener('click', () => { this.toggleSelection(div) });
        item.html = div;
        return div;
    }
    // 设置扩展名筛选
    setupExtensionFilters() {
        const extensions = [...new Set(this.originalItems.map(item => item.ext))];
        const extFilter = document.querySelector('#extensionFilters');
        extensions.forEach(ext => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" name="ext" value="${ext}" class="ext-checkbox" checked> ${ext.toUpperCase()}`;
            label.querySelector('input').addEventListener('click', () => this.updateFileList());
            extFilter.appendChild(label);
        });
    }
    renderFileItems() {
        const container = document.querySelector('#file-container');
        container.innerHTML = '';
        this.fileItems.forEach((item, index) => {
            const fileElement = this.createFileElement(item, index);
            container.appendChild(fileElement);
        });
    }
    // 载入数据
    async loadFileItems() {
        const params = new URL(location.href).searchParams;
        const _tabId = parseInt(params.get("tabId"));
        this.fileItems = await chrome.runtime.sendMessage(chrome.runtime.id, { Message: "getData", tabId: _tabId }) || [];
        setHeaders(this.fileItems, null, this.tab.id);
        this.originalItems = [];
        for (let index = 0; index < this.fileItems.length; index++) {
            const data = this.fileItems[index];
            data._title = data.title;
            data.title = stringModify(data.title);

            data.name = isEmpty(data.name) ? data.title + '.' + data.ext : decodeURIComponent(stringModify(data.name));

            data.downFileName = G.TitleName ? templates(G.downFileName, data) : data.name;
            data.downFileName = filterFileName(data.downFileName);
            if (isEmpty(data.downFileName)) {
                data.downFileName = data.name;
            }
            this.originalItems.push(data);
            // 最大预览数限制
            if (index > this.MAX_LIST_SIZE) {
                break;
            }
        }
    }

    // 播放文件
    playItem(item) {
        const video = document.querySelector('#video-player');
        const container = document.querySelector('.play-container');
        let hls = null;
        if (isM3U8(item)) {
            hls = new Hls({ enableWorker: false });
            hls.loadSource(item.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (event, data) => {
                hls.stopLoad();
            });
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                container.classList.remove('hide');
                video.play();
            });
        } else {
            video.src = item.url;
            container.classList.remove('hide');
            video.play();
        }
    }

    // 生成预览图
    generatePreview(item) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.style.display = 'none';
            document.body.appendChild(video);

            let hls = null;
            let timeoutId = null;

            const cleanup = () => {
                clearTimeout(timeoutId);
                document.body.removeChild(video);
                if (hls) hls.destroy();
            };

            const handleSuccess = (blob) => {
                item.preview = URL.createObjectURL(blob);
                item.html.querySelector('.preview-image').src = item.preview;
                cleanup();
                resolve();
            };

            const handleError = (error) => {
                console.error('Preview generation failed:', error);
                cleanup();
                reject(error);
            };

            // 设置10秒超时
            timeoutId = setTimeout(() => {
                handleError(new Error('Preview generation timeout'));
            }, 10000);

            // 截图处理函数
            const captureFrame = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 360;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                try {
                    canvas.toBlob(blob => {
                        if (!blob) {
                            reject(new Error('Canvas conversion failed'));
                            return;
                        }
                        handleSuccess(blob);
                    }, 'image/jpeg', 0.8);
                } catch (e) {
                    handleError(e);
                }
            };

            // 视频准备就绪后定位到指定时间点
            const prepareVideo = () => {
                if (video.duration === Infinity) { // 处理直播流
                    video.currentTime = Math.min(10, video.buffered.end(0));
                } else {
                    video.currentTime = Math.min(10, video.duration * 0.1);
                }
            };

            // 处理HLS视频
            if (isM3U8(item)) {
                if (!Hls.isSupported()) {
                    return handleError(new Error('HLS is not supported'));
                }

                hls = new Hls();
                hls.loadSource(item.url);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.addEventListener('loadedmetadata', prepareVideo);
                });

                hls.on(Hls.Events.ERROR, (event, data) => {
                    handleError(data);
                });
            }
            // 处理普通视频
            else {
                video.src = item.url;
                video.addEventListener('loadedmetadata', prepareVideo);
            }

            // 监听时间点定位完成事件
            video.addEventListener('seeked', captureFrame);
            video.addEventListener('error', handleError);
        });
    }

    async startPreviewGeneration() {
        const pendingItems = this.fileItems.filter(item => !item.preview);
        const workers = [];

        // 创建并行任务池
        for (const _ of Array(this.MAX_CONCURRENT)) {
            workers.push(
                (async () => {
                    while (pendingItems.length) {
                        const item = pendingItems.shift();
                        if (item.preview || !item.url) {
                            continue;
                        }
                        if (item.type.startsWith('video') || isM3U8(item)) {
                            try {
                                await this.generatePreview(item);
                                console.log('Preview generated for:', item.url);
                            } catch (error) {
                                console.warn('Failed to generate preview for:', item.url);
                            }
                        }
                    }
                })()
            );
        }

        await Promise.all(workers);
    }

    // 猫抓下载器
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
}

awaitG(() => { new FilePreview(); });