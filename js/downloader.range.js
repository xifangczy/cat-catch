/**
 * 大文件分段下载 (猫抓下载器)
 * 服务器支持范围请求时 把一个大文件分成若干段 几个连接同时下载:
 *   某一段出错只重试这一段 而且从断掉的位置接着下
 *   停止之后再开始 / 出错之后重试 已经下完的段不再下载
 *   下完的段存进 IndexedDB (js/m3u8.store.js) 页面关掉 / 崩溃之后再下载同一个文件 接着上次的进度
 * 对下载器的其余部分来说这仍然是一次普通的请求: request() 返回一个 Response 数据按顺序流出来
 * 文件太小 / 服务器不支持范围请求 / 边下边存之外的情况不满足时 和原来一样整个下载
 */
class RangeDownloader extends Downloader {
    PART_SIZE = 4 * 1024 * 1024;    // 每一段的大小
    MIN_SIZE = 16 * 1024 * 1024;    // 小于这个大小的文件不分段
    CONNECTIONS = 4;                // 一个文件同时下载几段
    PART_RETRIES = 5;               // 一段最多重试几次
    PART_TIMEOUT = 15000;           // 一段这么久没有收到数据 断开重试 毫秒

    constructor(fragments, thread) {
        super(fragments, thread);
        // 下载完成 不再需要保存的进度
        this.on('completed', (buffer, fragment) => {
            const task = fragment.rangeTask;
            fragment.rangeTask = undefined;
            task?.store && Promise.resolve(task.saving).finally(() => task.store.remove());
        });
    }
    async request(fragment, options) {
        // rangeTask: undefined 还没探测  null 不能分段  对象 分段下载的状态
        if (fragment.byteRange || fragment.rangeTask === null) {
            return super.request(fragment, options);
        }
        if (!fragment.rangeTask) {
            fragment.rangeTask = await this.createTask(fragment, options).catch(function (error) {
                if (error.name == "AbortError") { throw error; }
                console.log(error);
                return null;
            });
        }
        return fragment.rangeTask ? this.rangeResponse(fragment, options) : super.request(fragment, options);
    }
    /**
     * 探测文件大小和服务器是否支持范围请求 可以分段时返回分段下载的状态
     * @returns {Promise<Object|null>} { total, type, parts, store }
     */
    async createTask(fragment, options) {
        // 页面里的 blob / data 地址不需要分段
        if (!/^https?:/i.test(fragment.url)) { return null; }
        const response = await fetch(fragment.url, { ...options, headers: { ...options.headers, Range: "bytes=0-0" } });
        const total = Number(/\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1]);
        // 不支持范围请求时返回的是整个文件 不读它
        response.body?.cancel().catch(() => { });
        if (response.status != 206 || !(total >= this.MIN_SIZE)) { return null; }
        const parts = [];
        for (let start = 0; start < total; start += this.PART_SIZE) {
            const end = Math.min(start + this.PART_SIZE, total);
            // url / byteRange / no 是 TaskStore 认的字段 byteRange 的结尾不含在内
            parts.push({ url: fragment.url, no: parts.length, byteRange: [start, end], size: end - start, chunks: [], received: 0, flushed: 0, done: false, busy: false });
        }
        // 边下边存的数据不经过内存保留 不保存进度
        let store = null;
        if (!fragment.fileStream && typeof TaskStore != "undefined" && G.M3u8Resume !== false) {
            store = await TaskStore.open(parts, fragment.downFileName ?? "").catch(() => null);
        }
        return { total: total, type: response.headers.get("content-type") ?? "", parts: parts, store: store };
    }
    /**
     * 分段下载 返回一个 Response 各段的数据按顺序从里面流出来
     * 排在最前面还没下完的那一段 收到多少就交出去多少 后面的段先存着
     */
    rangeResponse(fragment, options) {
        const task = fragment.rangeTask;
        // 边下边存: 交出去的数据不再保留 (省内存) 所以重新开始时只能从头来
        const keep = !fragment.fileStream;
        for (const part of task.parts) {
            if (part.chunks.includes(null)) {
                Object.assign(part, { chunks: [], received: 0, done: false });
            }
            part.flushed = 0;
            part.busy = false;
        }
        const abort = new AbortController();
        const stopped = () => new DOMException("The user aborted a request.", "AbortError");
        options.signal?.addEventListener("abort", () => abort.abort(), { once: true });
        let deliver = 0;    // 按顺序 下一个要交出去的段
        let closed = false;
        const stream = new ReadableStream({
            start: (controller) => {
                const flush = () => {
                    while (!closed && deliver < task.parts.length) {
                        const part = task.parts[deliver];
                        while (part.flushed < part.chunks.length) {
                            controller.enqueue(part.chunks[part.flushed]);
                            if (!keep) { part.chunks[part.flushed] = null; }
                            part.flushed++;
                        }
                        if (!part.done) { return; }
                        deliver++;
                    }
                    if (!closed) {
                        closed = true;
                        controller.close();
                    }
                };
                const worker = async () => {
                    while (!closed) {
                        const part = task.parts.find(item => !item.done && !item.busy);
                        if (!part) { return; }
                        part.busy = true;
                        try {
                            await this.loadPart(fragment, part, options, abort.signal, flush);
                        } catch (error) {
                            part.busy = false;
                            // 服务器拒绝分段的请求 (探测时支持 真下载时不让) 这个文件之后按原来的方式整个下载
                            if (error?.cause == 'HTTPError' && !options.signal?.aborted && fragment.rangeTask === task) {
                                task.store?.remove();
                                fragment.rangeTask = null;
                            }
                            if (!closed) {
                                closed = true;
                                abort.abort();
                                controller.error(options.signal?.aborted ? stopped() : error);
                            }
                            return;
                        }
                        part.busy = false;
                        flush();
                    }
                };
                flush();
                for (let i = 0; i < this.CONNECTIONS; i++) { worker(); }
            },
            cancel: () => {
                closed = true;
                abort.abort();
            }
        });
        return new Response(stream, { status: 200, headers: { "content-length": task.total, "content-type": task.type } });
    }
    /**
     * 下载一段 出错时从断掉的位置接着下
     * @param {Function} flush 收到数据后调用 把能交出去的数据交出去
     */
    async loadPart(fragment, part, options, signal, flush) {
        const store = fragment.rangeTask.store;
        // 上次保存过的
        if (!part.received && store) {
            const saved = await store.get(part).catch(() => undefined);
            if (saved?.byteLength == part.size) {
                Object.assign(part, { chunks: [new Uint8Array(saved)], received: part.size, done: true });
                return;
            }
        }
        for (let attempt = 0; part.received < part.size; attempt++) {
            const controller = new AbortController();
            const stop = () => controller.abort();
            signal.addEventListener("abort", stop, { once: true });
            let watchdog = 0;
            const watch = () => {
                clearTimeout(watchdog);
                watchdog = setTimeout(stop, this.PART_TIMEOUT);
            };
            try {
                if (signal.aborted) { throw new DOMException("The user aborted a request.", "AbortError"); }
                watch();
                // 不走缓存: 浏览器的缓存会让同一个地址的请求排队 一个完了才轮到下一个 几个连接就白开了
                const response = await fetch(fragment.url, {
                    ...options, signal: controller.signal, cache: "no-store",
                    headers: { ...options.headers, Range: `bytes=${part.byteRange[0] + part.received}-${part.byteRange[1] - 1}` }
                });
                if (response.status != 206) {
                    throw new Error(response.status, { cause: 'HTTPError' });
                }
                const reader = response.body.getReader();
                while (part.received < part.size) {
                    const { value, done } = await reader.read();
                    if (done) { break; }
                    watch();
                    // 服务器多给的不要
                    const chunk = value.length > part.size - part.received ? value.subarray(0, part.size - part.received) : value;
                    part.chunks.push(chunk);
                    part.received += chunk.length;
                    flush();
                }
                reader.cancel().catch(() => { });
            } catch (error) {
                // 4xx (超时和限速除外) 重试也没用
                const refused = error?.cause == 'HTTPError' && /^4(?!08|29)\d\d$/.test(error.message);
                if (signal.aborted || refused || attempt >= this.PART_RETRIES) { throw error; }
                console.log(error);
                await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15000)));
            } finally {
                clearTimeout(watchdog);
                signal.removeEventListener("abort", stop);
            }
        }
        part.done = true;
        // 存下来 页面关掉之后还能接着下
        if (store && !part.chunks.includes(null)) {
            const data = new Uint8Array(part.size);
            let position = 0;
            for (const chunk of part.chunks) {
                data.set(chunk, position);
                position += chunk.length;
            }
            // 各段各存各的 (排队的话后面的段要等很久才落盘) 下载完成时等它们都存完再删除任务
            const task = fragment.rangeTask;
            task.saving = Promise.all([task.saving, store.put(part, data.buffer)]);
        }
    }
}
