/**
 * m3u8 下载任务的持久化 (IndexedDB)
 * 切片下载到的原始数据 (未解密) 存进数据库
 * 标签关闭 / 崩溃 / 浏览器重启 / 页面出错重新加载后 再次下载同一个清单 已经保存的切片不再请求 接着上次的进度
 * 下载完成后删除 没完成的任务保留 7 天
 *
 * task 任务 { id, asset, data, total, title, expire, time }
 *   id     所有切片地址 (含参数) 的哈希 地址完全相同才是同一个任务
 *   asset  所有切片地址去掉参数后的哈希 用来找出 "同一个资源 签名参数换了" 的旧任务
 *   data   切片储存在哪个编号下 接管旧任务时沿用它的编号 不复制数据
 *   expire 地址的有效期 毫秒时间戳 认不出为 0
 * segment 切片 键 [data, no] no 是切片在清单里的序号 值是 ArrayBuffer
 */
const TaskStore = (function () {
    const KEEP = 7 * 24 * 60 * 60 * 1000;
    let db;
    function open() {
        db ??= new Promise(function (resolve, reject) {
            const request = indexedDB.open("CatCatchTask", 1);
            request.onupgradeneeded = function () {
                request.result.createObjectStore("task", { keyPath: "id" }).createIndex("asset", "asset");
                request.result.createObjectStore("segment");
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return db;
    }
    /**
     * 在一个事务里操作 事务完成后返回 fn 返回的请求的结果
     * @param {String|Array} stores 表名
     * @param {String} mode readonly / readwrite
     * @param {Function} fn (事务) => IDBRequest
     */
    async function run(stores, mode, fn) {
        const transaction = (await open()).transaction(stores, mode);
        return new Promise(function (resolve, reject) {
            const request = fn(transaction);
            transaction.oncomplete = () => resolve(request?.result);
            transaction.onerror = transaction.onabort = () => reject(transaction.error);
        });
    }
    const segments = data => IDBKeyRange.bound([data, 0], [data, Infinity]);
    const getTask = id => run("task", "readonly", transaction => transaction.objectStore("task").get(id));
    const getSegment = (data, no) => run("segment", "readonly", transaction => transaction.objectStore("segment").get([data, no]));
    const getSaved = data => run("segment", "readonly", transaction => transaction.objectStore("segment").getAllKeys(segments(data)));
    // 删除任务和它的切片
    function remove(task) {
        return run(["task", "segment"], "readwrite", function (transaction) {
            transaction.objectStore("segment").delete(segments(task.data));
            return transaction.objectStore("task").delete(task.id);
        });
    }

    async function hash(list) {
        const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(list.join("\n")));
        return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, "0")).join("");
    }
    const byteRange = fragment => fragment.byteRange?.length == 2 ? "@" + fragment.byteRange.join("-") : "";
    // 去掉参数的地址
    function path(url) {
        try {
            const parsing = new URL(url);
            return parsing.protocol.startsWith("http") ? parsing.origin + parsing.pathname : url;
        } catch (e) { return url; }
    }
    /**
     * 旧任务和现在的清单是不是同一个资源
     * 地址去掉参数后相同 不一定是同一个资源 (例如画质写在参数里) 用现在的地址重新下载旧任务保存过的切片 内容相同才算
     */
    async function same(task, fragments) {
        const saved = await getSaved(task.data);
        if (task.total != fragments.length || !saved.length) { return false; }
        for (const no of new Set([saved[0][1], saved[saved.length - 1][1]])) {
            const fragment = fragments[no];
            const headers = fragment.byteRange?.length == 2 ? { Range: `bytes=${fragment.byteRange[0]}-${fragment.byteRange[1] - 1}` } : {};
            const response = await fetch(fragment.url, { headers });
            if (!response.ok) { return false; }
            const [fresh, old] = [new Uint8Array(await response.arrayBuffer()), new Uint8Array(await getSegment(task.data, no))];
            if (fresh.length != old.length || fresh.some((value, index) => value != old[index])) { return false; }
        }
        return true;
    }

    class TaskStore {
        constructor(task) {
            this.task = task;
            this.saved = new Set();     // 已经保存的切片序号
            this.written = false;       // 任务信息是否已经写入
            this.failed = false;        // 保存失败过 (空间不足等) 不再保存
        }
        /**
         * 打开清单对应的任务 读取已经保存的进度
         * @param {Array} fragments 清单的全部切片 每个切片的 no 是它的序号
         * @param {String} title 标题
         * @returns {Promise<TaskStore>}
         */
        static async open(fragments, title) {
            const id = await hash(fragments.map(fragment => fragment.url + byteRange(fragment)));
            // 清理过期的任务
            for (const task of await run("task", "readonly", transaction => transaction.objectStore("task").getAll())) {
                Date.now() - task.time > KEEP && await remove(task);
            }
            let task = await getTask(id);
            const store = new TaskStore(task ?? { id: id, data: id, total: fragments.length, title: title });
            store.written = !!task;
            if (!task) {
                task = store.task;
                task.asset = await hash(fragments.map(fragment => path(fragment.url) + byteRange(fragment)));
                // 地址参数变了的同一个资源 (重新签名) 接着用旧任务保存的切片
                const list = await run("task", "readonly", transaction => transaction.objectStore("task").index("asset").getAll(task.asset));
                for (const old of list.sort((a, b) => b.time - a.time)) {
                    if (!await same(old, fragments).catch(() => false)) { continue; }
                    task.data = old.data;
                    task.time = Date.now();
                    await run("task", "readwrite", function (transaction) {
                        transaction.objectStore("task").delete(old.id);
                        return transaction.objectStore("task").put(task);
                    });
                    store.written = true;
                    break;
                }
            }
            task.expire = TaskStore.expire(fragments[0].url);
            (await getSaved(task.data)).forEach(key => store.saved.add(key[1]));
            return store;
        }
        /**
         * 读取保存的切片
         * @returns {Promise<ArrayBuffer|undefined>}
         */
        async get(fragment) {
            return this.saved.has(fragment.no) ? getSegment(this.task.data, fragment.no) : undefined;
        }
        // 保存切片 失败不影响下载
        async put(fragment, buffer) {
            if (this.failed || fragment.no === undefined) { return; }
            try {
                await run(["task", "segment"], "readwrite", (transaction) => {
                    // 任务信息 第一次保存切片时写入 之后每分钟更新一次时间
                    if (!this.written || Date.now() - this.task.time > 60000) {
                        this.written = true;
                        this.task.time = Date.now();
                        transaction.objectStore("task").put(this.task);
                    }
                    return transaction.objectStore("segment").put(buffer, [this.task.data, fragment.no]);
                });
                this.saved.add(fragment.no);
            } catch (e) {
                this.failed = true;
                console.log(e);
            }
        }
        // 删除任务 下载完成 或者不再需要
        async remove() {
            this.saved.clear();
            this.written = false;
            await remove(this.task);
        }
        /**
         * 地址里的有效期 只认常见的写法 认不出返回 0
         * @param {String} url
         * @returns {Number} 毫秒时间戳
         */
        static expire(url) {
            let params;
            try { params = new URL(url).searchParams; } catch (e) { return 0; }
            const times = [];
            for (const [name, value] of params) {
                const key = name.toLowerCase();
                // 开始时间 + 有效秒数 (AWS / Google)
                const date = /^x-(amz|goog)-expires$/.test(key) && /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(params.get(name.replace(/expires$/i, "Date")) ?? "");
                if (date) {
                    times.push(Date.UTC(date[1], date[2] - 1, date[3], date[4], date[5], date[6]) + value * 1000);
                } else if (key == "se") {
                    // Azure
                    times.push(Date.parse(value));
                } else if (/^(expires?|exp|e|deadline|validto)$/.test(key) && /^\d{10}(\d{3})?$/.test(value)) {
                    times.push(value.length == 10 ? value * 1000 : +value);
                } else if (/^(txtime|wstime)$/.test(key) && /^[\da-f]{8}$/i.test(value)) {
                    times.push(parseInt(value, 16) * 1000);
                } else if (/(^|~)exp=(\d{10})(~|$)/.test(value)) {
                    // Akamai
                    times.push(/(^|~)exp=(\d{10})(~|$)/.exec(value)[2] * 1000);
                }
            }
            // 离现在太远的不是有效期
            const valid = times.filter(time => Math.abs(time - Date.now()) < 365 * 24 * 60 * 60 * 1000);
            return valid.length ? Math.min(...valid) : 0;
        }
    }
    return TaskStore;
})();
