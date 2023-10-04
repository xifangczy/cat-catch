class FragmentDownloader {
    constructor() {
        this.init();
    }
    /**
     * 初始化所有变量
     */
    init() {
        this.fragments = [];             // 切片列表
        this.thread = 32;                // 线程数
        this.index = 0;                  // 当前任务索引
        this.buffer = [];                // 储存的buffer
        this.events = {};                // events
        this._stop = true;               // 停止下载
        this.done = false;               // 下载完成
        this.decrypt = null;             // 解密函数
        this.transcode = null;           // 转码器函数
        this.success = 0;                // 成功下载数量
        this.total = 0;                  //列表总数
        this.errorList = new WeakSet();  // 下载错误的列表
        this.bufferize = 0;              // 已下载buffer大小
        this.duration = 0;               // 已下载时长
        this.totalDuration = 0;          // 总时长
        this.pushIndex = 0;              // 推送顺序下载索引
    }
    /**
     * 初始化所有变量 init的别名
     */
    clear() {
        this.init();
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
     * 设定转码器
     * @param {Function} callback 
     */
    setTranscode(callback) {
        this.transcode = callback;
    }
    /**
     * 停止下载
     */
    stop() {
        this._stop = true;
    }
    /**
     * 检查对象是否错误列表内
     * @param {object} fragment 切片对象
     * @returns {boolean}
     */
    isErrorObj(fragment) {
        return this.errorList.has(fragment);
    }
    /**
     * 按照顺序推送buffer数据
     */
    async sequentialPush() {
        for (; this.pushIndex < this.total; this.pushIndex++) {
            if (this.buffer[this.pushIndex]) {
                this.emit('sequentialPush', this.buffer[this.pushIndex]);
                continue;
            }
            break;
        }
    }
    /**
     * 下载器 使用fetch下载文件
     * @param {object} fragment 重新下载的对象
     */
    downloader(fragment = null) {
        if (this._stop) {
            this.emit('stop', this._stop);
            return;
        }
        // 是否直接下载对象
        const directDownload = !!fragment;
        // 不存在下载对象 从提取fragments
        fragment ??= this.fragments[this.index++];
        this.emit('start', fragment);
        fetch(fragment.url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.status);
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                this.emit('rawBuffer', buffer);
                // 存在解密函数 调用解密函数 否则直接返回buffer
                return this.decrypt ? this.decrypt(buffer, fragment) : buffer;
            })
            .then(buffer => {
                this.emit('decryptedData', buffer);
                // 存在转码 调用转码函数 否则直接返回buffer
                return this.transcode ? this.transcode(buffer, fragment.index == 0) : buffer;
            })
            .then(buffer => {
                // 储存解密/转码后的buffer
                this.buffer[fragment.index] = buffer;
                if (this._stop) {
                    this.emit('stop', this._stop);
                    return;
                }
                // 成功数+1 累计buffer大小和视频时长
                this.success++;
                this.bufferize += buffer.byteLength;
                this.duration += fragment.duration;

                // 下载对象来自错误列表 从错误列表内删除
                this.errorList.has(fragment) && this.errorList.delete(fragment);

                // 推送顺序下载
                this.sequentialPush();

                this.emit('completed', buffer, fragment);

                // 下载下一个切片
                if (!directDownload && this.index < this.total) {
                    this.downloader();
                    return;
                }
                // 下载完成
                if (this.success == this.total) {
                    this.done = true;
                    this.emit('allCompleted', this.buffer, this.fragments);
                }
            }).catch((error) => {
                this.emit('error', { ...error, type: "download" }, fragment);
                // 储存下载错误切片
                !this.errorList.has(fragment) && this.errorList.add(fragment);
            });
    }
    /**
     * 开始下载 准备数据 调用下载器
     * @param {number} start 下载范围 开始索引
     * @param {number} end 下载范围 结束索引
     */
    start(start = 0, end = this.fragments.length) {
        // 从下载范围内 切出需要下载的部分
        this.fragments = this.fragments.slice(start, end);
        // 设置下载所需总数
        this.total = this.fragments.length;
        // 总数为空 抛出错误
        if (this.total == 0) {
            this.emit('error', { type: "other" });
            return;
        }
        // 获取总时长
        this.totalDuration = this.fragments.reduce((total, fragment) => total + fragment.duration, 0);
        // 如果不存在index属性则添加
        if (!this.fragments.every(f => f.hasOwnProperty("index"))) {
            this.fragments.map((fragment, index) => { fragment.index = index; return fragment; });
        }
        this._stop = false;
        this.done = false;
        // 开始下载 多少线程开启多少个下载器
        for (let i = 0; i < this.thread && i < this.total; i++) {
            this.downloader();
        }
    }
}