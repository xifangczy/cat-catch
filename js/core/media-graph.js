/**
 * 媒体资源的关联图
 * 把一个页面里零散的资源整理出它们之间的关系:
 *   分片流   同一条流的分片归并成一项 (一个视频几百个分片请求 不再各占一行)
 *   清单     分片流属于哪个 m3u8 / mpd
 *   轨道     音频和视频分开的资源 互相配对 可以直接合并
 * 资源逐个加入 (add) 关系随时可以查询 不依赖浏览器的扩展接口
 * 只在同一个标签的同一个 frame 里建立关系
 */
(function (root) {
    const MediaAsset = root.MediaAsset ?? require("./media-asset.js");
    const MIN = 3;          // 看起来像分片的资源 至少几个才算一条流
    const MIN_PLAIN = 5;    // 看不出是分片的资源 (例如 001.mp4 002.mp4) 至少几个 而且序号连续才算
    const PAIR_TIME = 5 * 60 * 1000;    // 配对的音频和视频 出现的时间相差不超过这么久

    // 序号是不是基本连续 (间隔固定)
    function sequential(numbers) {
        const list = [...new Set(numbers.filter(value => !Number.isNaN(value)))].sort((a, b) => a - b);
        if (list.length < MIN_PLAIN) { return false; }
        const steps = new Map();
        for (let i = 1; i < list.length; i++) {
            steps.set(list[i] - list[i - 1], (steps.get(list[i] - list[i - 1]) ?? 0) + 1);
        }
        return Math.max(...steps.values()) >= (list.length - 1) * 0.8;
    }

    class MediaGraph {
        constructor() {
            this.nodes = new Map();     // 资源 => 节点 { item, role, track, scope, dir, keys, stream }
            this.streams = new Map();   // 分片流 标识 => { key, nodes, numbers, size, hint, active }
        }
        /**
         * 加入一个资源
         * @param {Object} item 资源对象 { url, ext, type, size, tabId, frameId, getTime }
         * @returns {Object} 节点 node.stream 是它所在的分片流 (stream.active 为 true 时才确定是分片流)
         */
        add(item) {
            const node = {
                item: item,
                role: MediaAsset.role(item),
                scope: `${item.tabId}|${item.frameId ?? 0}`,
                dir: MediaAsset.dir(item),
                keys: MediaAsset.keys(item),
                stream: null,
                init: false,
            };
            this.nodes.set(item, node);
            if (node.role != "media") { return node; }
            node.track = MediaAsset.track(item);
            node.init = MediaAsset.init(item);
            const info = MediaAsset.stream(item);
            if (!info) { return node; }
            const key = node.scope + "\n" + info.key;
            const stream = this.streams.get(key) ?? { key: key, nodes: [], numbers: [], size: 0, hint: false, active: false };
            this.streams.set(key, stream);
            stream.nodes.push(node);
            stream.numbers.push(info.number);
            stream.size += typeof item.size == "number" ? item.size : 0;
            stream.hint = stream.hint || info.hint;
            stream.active = stream.active || (stream.hint ? stream.nodes.length >= MIN : stream.nodes.length >= MIN_PLAIN && sequential(stream.numbers));
            node.stream = stream;
            return node;
        }
        // 移除一个资源
        remove(item) {
            const node = this.nodes.get(item);
            if (!node) { return; }
            this.nodes.delete(item);
            if (node.stream) {
                const index = node.stream.nodes.indexOf(node);
                node.stream.nodes.splice(index, 1);
                node.stream.numbers.splice(index, 1);
            }
        }
        clear() {
            this.nodes.clear();
            this.streams.clear();
        }
        // 是不是完整的媒体文件 (不是分片)
        complete(node) {
            return node.role == "media" && !node.init && !node.stream?.active && !node.stream?.hint;
        }
        // 两个资源是不是同一个媒体的: 同一个 frame 里 目录相同或者身份标识相同
        related(a, b) {
            return a.scope == b.scope && !!a.dir && (a.dir == b.dir || a.keys.some(key => b.keys.includes(key)));
        }
        /**
         * 资源属于哪条分片流
         * 分片在它自己的流里 初始化分片归到相关的流 优先同是音频 / 视频的那条
         * @param {Object} item 资源对象
         * @returns {Object|null} 分片流 不是分片返回 null
         */
        owner(item) {
            const node = this.nodes.get(item);
            if (!node) { return null; }
            if (node.stream?.active) { return node.stream; }
            if (!node.init) { return null; }
            let found = null;
            for (const stream of this.streams.values()) {
                const first = stream.nodes[0];
                if (!stream.active || !first || !this.related(first, node)) { continue; }
                if (first.track == node.track) { return stream; }
                found = found ?? stream;
            }
            return found;
        }
        /**
         * 分片流里的全部资源 包括归到它的初始化分片
         * @param {Object} stream 分片流
         * @returns {Array} 资源对象
         */
        members(stream) {
            const list = stream.nodes.map(node => node.item);
            for (const node of this.nodes.values()) {
                node.init && !node.stream?.active && this.owner(node.item) === stream && list.push(node.item);
            }
            return list;
        }
        /**
         * 分片流属于哪个清单
         * 同一个 frame 里 身份标识相同 或者 分片在清单所在目录之下 有多个时取最具体的 (目录最深) 再取分片出现之前最近的
         * @param {Object} stream 分片流
         * @returns {Object|null} 清单的资源对象
         */
        manifest(stream) {
            const first = stream.nodes[0];
            if (!first) { return null; }
            let found = null;
            let best = [-1, -1, -Infinity];
            for (const node of this.nodes.values()) {
                if (node.role != "manifest" || node.scope != first.scope) { continue; }
                const sameKey = node.keys.some(key => first.keys.includes(key));
                if (!sameKey && !(node.dir && first.dir.startsWith(node.dir))) { continue; }
                // 清单比分片晚出现的排在后面
                const time = (node.item.getTime ?? 0) - (first.item.getTime ?? 0);
                const score = [sameKey ? 1 : 0, node.dir.length, time <= 0 ? time : -Infinity];
                if (score[0] > best[0] || (score[0] == best[0] && (score[1] > best[1] || (score[1] == best[1] && score[2] > best[2])))) {
                    best = score;
                    found = node.item;
                }
            }
            return found;
        }
        /**
         * 音频和视频分开的资源 找到和它配对的另一条轨道
         * 同一个 frame 里 目录相同或者身份标识相同 一个是音频一个是视频 取出现时间最接近的
         * 分片 (包括还没凑够数量 但地址看起来像分片的) 和清单不参与
         * @param {Object} item 资源对象
         * @returns {Object|null} 另一条轨道的资源对象
         */
        counterpart(item) {
            const node = this.nodes.get(item);
            if (!node || !this.complete(node)) { return null; }
            let found = null;
            let nearest = PAIR_TIME;
            for (const other of this.nodes.values()) {
                if (other === node || other.track == node.track || !this.complete(other) || !this.related(node, other)) { continue; }
                const time = Math.abs((other.item.getTime ?? 0) - (item.getTime ?? 0));
                if (time <= nearest) {
                    nearest = time;
                    found = other.item;
                }
            }
            return found;
        }
    }

    root.MediaGraph = MediaGraph;
    if (typeof module == "object" && module.exports) { module.exports = MediaGraph; }
})(globalThis);
