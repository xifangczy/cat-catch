class Downloader {
    constructor(fragments = [], thread = 6) {
        this.fragments = fragments;      // 切片列表
        this.allFragments = fragments;   // 储存所有原始切片列表
        this.thread = thread;            // 线程数
        this.events = {};                // events
        this.decrypt = null;             // 解密函数
        this.transcode = null;           // 转码函数
        this.init();
    }
    /**
     * 初始化所有变量
     */
    init() {
        this.index = 0;                  // 当前任务索引
        this.buffer = [];                // 储存的buffer
        this.state = 'waiting';          // 下载器状态 waiting running done abort
        this.success = 0;                // 成功下载数量
        this.errorList = new Set();      // 下载错误的列表
        this.buffersize = 0;             // 已下载buffer大小
        this.duration = 0;               // 已下载时长
        this.pushIndex = 0;              // 推送顺序下载索引
        this.controller = [];            // 储存中断控制器
        this.running = 0;
    }
    /**
     * 设置监听
     * @param {string} eventName 监听名
     * @param {Function} callBack 
     */
    on(eventName, callBack) {
        if (this.events[eventName]) {
            this.events[eventName].push(callBack);
        } else {
            this.events[eventName] = [callBack];
        }
    }
    /**
     * 触发监听器
     * @param {string} eventName 监听名
     * @param  {...any} args 
     */
    emit(eventName, ...args) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(callBack => {
                callBack(...args);
            });
        }
    }
    /**
     * 设定解密函数
     * @param {Function} callback 
     */
    setDecrypt(callback) {
        this.decrypt = callback;
    }
    /**
     * 设定转码函数
     * @param {Function} callback 
     */
    setTranscode(callback) {
        this.transcode = callback;
    }
    /**
     * 停止下载 没有目标 停止所有线程
     * @param {number} index 停止下载目标
     */
    stop(index = undefined) {
        if (index !== undefined) {
            this.controller[index] && this.controller[index].abort();
            return;
        }
        this.controller.forEach(controller => { controller.abort() });
        this.state = 'abort';
    }
    /**
     * 检查对象是否错误列表内
     * @param {object} fragment 切片对象
     * @returns {boolean}
     */
    isErrorItem(fragment) {
        return this.errorList.has(fragment);
    }
    /**
     * 返回所有错误列表
     */
    get errorItem() {
        return this.errorList;
    }
    /**
     * 按照顺序推送buffer数据
     */
    sequentialPush() {
        if (!this.events["sequentialPush"]) { return; }
        for (; this.pushIndex < this.fragments.length; this.pushIndex++) {
            if (this.buffer[this.pushIndex]) {
                this.emit('sequentialPush', this.buffer[this.pushIndex]);
                delete this.buffer[this.pushIndex];
                continue;
            }
            break;
        }
    }
    /**
     * 限定下载范围
     * @param {number} start 下载范围 开始索引
     * @param {number} end 下载范围 结束索引
     * @returns {boolean}
     */
    range(start = 0, end = this.fragments.length) {
        if (start > end) {
            this.emit('error', 'start > end');
            return false;
        }
        if (end > this.fragments.length) {
            this.emit('error', 'end > total');
            return false;
        }
        if (start >= this.fragments.length) {
            this.emit('error', 'start >= total');
            return false;
        }
        if (start != 0 || end != this.fragments.length) {
            this.fragments = this.fragments.slice(start, end);
            // 更改过下载范围 重新设定index
            this.fragments.forEach((fragment, index) => {
                fragment.index = index;
            });
        }
        // 总数为空 抛出错误
        if (this.fragments.length == 0) {
            this.emit('error', 'List is empty');
            return false;
        }
        return true;
    }
    /**
     * 获取切片总数量
     * @returns {number}
     */
    get total() {
        return this.fragments.length;
    }
    /**
     * 获取切片总时间
     * @returns {number}
     */
    get totalDuration() {
        return this.fragments.reduce((total, fragment) => total + fragment.duration, 0);
    }
    /**
     * 切片对象数组的 setter getter
     */
    set fragments(fragments) {
        // 增加index参数 为多线程异步下载 根据index属性顺序保存
        this._fragments = fragments.map((fragment, index) => ({ ...fragment, index }));
    }
    get fragments() {
        return this._fragments;
    }
    /**
     * 获取 #EXT-X-MAP 标签的文件url
     * @returns {string}
     */
    get mapTag() {
        if (this.fragments[0].initSegment && this.fragments[0].initSegment.url) {
            return this.fragments[0].initSegment.url;
        }
        return "";
    }
    /**
     * 添加一条新资源
     * @param {Object} fragment
     */
    push(fragment) {
        fragment.index = this.fragments.length;
        this.fragments.push(fragment);
    }
    /**
     * 下载器 使用fetch下载文件
     * @param {object} fragment 重新下载的对象
     */
    downloader(fragment = null) {
        if (this.state === 'abort') { return; }
        // 是否直接下载对象
        const directDownload = !!fragment;

        // 非直接下载对象 从this.fragments获取下一条资源 若不存在跳出
        if (!directDownload && !this.fragments[this.index]) { return; }

        // fragment是数字 直接从this.fragments获取
        if (typeof fragment === 'number') {
            fragment = this.fragments[fragment];
        }

        // 不存在下载对象 从提取fragments
        fragment ??= this.fragments[this.index++];
        this.state = 'running';
        this.running++;

        // 资源已下载 跳过
        // if (this.buffer[fragment.index]) { return; }

        // 停止下载控制器
        const controller = new AbortController();
        this.controller[fragment.index] = controller;
        const options = { signal: controller.signal };

        // 下载前触发事件
        this.emit('start', fragment, options);

        // 开始下载
        fetch(fragment.url, options)
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.status);
                }
                const reader = response.body.getReader();
                const contentLength = parseInt(response.headers.get('content-length')) || 0;
                fragment.contentType = response.headers.get('content-type') ?? 'null';
                let receivedLength = 0;
                const chunks = [];
                const pump = async () => {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) { break; }

                        // 流式下载
                        fragment.fileStream ? fragment.fileStream.write(new Uint8Array(value)) : chunks.push(value);

                        receivedLength += value.length;
                        this.emit('itemProgress', fragment, false, receivedLength, contentLength, value);
                    }
                    const allChunks = new Uint8Array(receivedLength);
                    let position = 0;
                    for (const chunk of chunks) {
                        allChunks.set(chunk, position);
                        position += chunk.length;
                    }
                    this.emit('itemProgress', fragment, true);
                    return allChunks.buffer;
                }
                return pump();
            })
            .then(buffer => {
                this.emit('rawBuffer', buffer, fragment);
                // 存在解密函数 调用解密函数 否则直接返回buffer
                return this.decrypt ? this.decrypt(buffer, fragment) : buffer;
            })
            .then(buffer => {
                this.emit('decryptedData', buffer, fragment);
                // 存在转码函数 调用转码函数 否则直接返回buffer
                return this.transcode ? this.transcode(buffer, fragment) : buffer;
            })
            .then(buffer => {
                // 储存解密/转码后的buffer
                this.buffer[fragment.index] = buffer;

                // 成功数+1 累计buffer大小和视频时长
                this.success++;
                this.buffersize += buffer.byteLength;
                this.duration += fragment.duration ?? 0;

                // 下载对象来自错误列表 从错误列表内删除
                this.errorList.has(fragment) && this.errorList.delete(fragment);

                // 推送顺序下载
                this.sequentialPush();

                this.emit('completed', buffer, fragment);

                // 下载完成
                if (this.success == this.fragments.length) {
                    this.state = 'done';
                    this.emit('allCompleted', this.buffer, this.fragments);
                }
            }).catch((error) => {
                console.log(error);
                if (error.name == 'AbortError') {
                    this.emit('stop', fragment, error);
                    return;
                }
                this.emit('downloadError', fragment, error);

                // 储存下载错误切片
                !this.errorList.has(fragment) && this.errorList.add(fragment);
            }).finally(() => {
                this.running--;
                // 下载下一个切片
                if (!directDownload && this.index < this.fragments.length) {
                    this.downloader();
                }
            });
    }
    /**
     * 开始下载 准备数据 调用下载器
     * @param {number} start 下载范围 开始索引
     * @param {number} end 下载范围 结束索引
     */
    start(start = 0, end = this.fragments.length) {
        // 检查下载器状态
        if (this.state == 'running') {
            this.emit('error', 'state running');
            return;
        }
        // 从下载范围内 切出需要下载的部分
        if (!this.range(start, end)) {
            return;
        }
        // 初始化变量
        this.init();
        // 开始下载 多少线程开启多少个下载器
        for (let i = 0; i < this.thread && i < this.fragments.length; i++) {
            this.downloader();
        }
    }
    /**
     * 销毁 初始化所有变量
     */
    destroy() {
        this.stop();
        this._fragments = [];
        this.allFragments = [];
        this.thread = 6;
        this.events = {};
        this.decrypt = null;
        this.transcode = null;
        this.init();
    }
}