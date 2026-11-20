/**
 * 资源归属
 * 页面里有多个播放器时 (信息流 / 列表页) 判断嗅探到的资源是哪个播放器的
 * 纯函数 不依赖 DOM 和浏览器的扩展接口 视频浮窗使用 node 里也能跑
 *
 * 播放器 { srcs: 播放地址, hints: 和这个视频有关的其他地址 (封面), starts: [开始加载的时间], present: 还在页面里, end: 离开页面的时间 }
 * 资源   后台记录的那种 { url, href: 规范化后的地址 (可选), getTime, parsing, ext, capture }
 *
 * 规则 前面的优先:
 * 1. 资源地址就是播放器的播放地址
 * 2. 资源地址里带着播放器独有的编号
 *    封面和视频通常放在同一个编号下 例如推特
 *      封面 pbs.twimg.com/amplify_video_thumb/<编号>/img/x.jpg
 *      视频 video.twimg.com/amplify_video/<编号>/pl/x.m3u8 以及它的子清单和分片
 *    好几个播放器都有的编号 (账号 日期 之类) 不算
 * 3. 其余的资源按时间 归给在它出现之前最近开始加载的播放器
 *    已经不在页面里的播放器也参与比较 (只管它还在页面里那段时间出现的资源) 归给它们的资源不属于现在的任何播放器
 *    (信息流会把滚出去的视频从页面里移除 不能把它们的资源算到剩下的视频头上)
 */
(function (root) {
    const START_SLACK = 3000;   // 资源比播放器开始加载早出现 这个毫秒数以内仍然算它的 (默认值)

    function parse(url) {
        try {
            const parsing = new URL(url);
            return parsing.protocol.startsWith("http") ? parsing : null;
        } catch (e) { return null; }
    }
    // 看起来像编号: 10 位以上的数字 或者 10 个字符以上 数字和字母都有 (stream_1 这种通用的名字不算)
    function isId(text) {
        if (/^\d{10,}$/.test(text)) { return true; }
        return text.length >= 10 && text.length <= 64 && /\d/.test(text) && /[a-z]/i.test(text) && !/^[a-z_-]+\d{1,3}$/i.test(text);
    }
    /**
     * 地址里的编号 取自路径的每一段 (文件名不含后缀) 和参数的值
     * @param {String} url
     * @returns {Array}
     */
    function tokens(url) {
        const parsing = parse(url);
        if (!parsing) { return []; }
        const list = new Set();
        const path = parsing.pathname.split("/");
        path.forEach(function (text, index) {
            try { text = decodeURIComponent(text); } catch (e) { }
            if (index == path.length - 1 && text.lastIndexOf(".") > 0) {
                text = text.slice(0, text.lastIndexOf("."));
            }
            isId(text) && list.add(text);
        });
        for (const value of parsing.searchParams.values()) {
            isId(value) && list.add(value);
        }
        return [...list];
    }
    const isManifest = item => item.parsing == "m3u8" || item.parsing == "mpd" || /^(m3u8|m3u|mpd)$/i.test(item.ext ?? "");
    // 地址的目录有几层 清单里层数最少的是主清单
    function depth(item) {
        const parsing = parse(item.url);
        return parsing ? parsing.pathname.split("/").length : Infinity;
    }

    /**
     * 按时间找出资源属于哪些播放器
     * 优先 资源出现之前 (或之后很短时间内) 开始加载的 取时间最近的
     * 其次 资源出现之后才开始加载的 取最早的
     * 最后 没有记录到开始加载时间的
     */
    function nearest(time, candidates, slack) {
        let near = Infinity;
        let later = Infinity;
        let nearOwners = [];
        let laterOwners = [];
        const unknown = [];
        for (const player of candidates) {
            // 已经不在页面里的播放器 和它离开之后才出现的资源无关
            if (!player.present && player.end !== undefined && time > player.end + slack) { continue; }
            const starts = player.starts;
            if (!starts || !starts.length) {
                unknown.push(player);
                continue;
            }
            let before = Infinity;
            let after = Infinity;
            for (const start of starts) {
                if (start <= time + slack) {
                    before = Math.min(before, Math.abs(time - start));
                } else {
                    after = Math.min(after, start - time);
                }
            }
            if (before < near) {
                near = before;
                nearOwners = [player];
            } else if (before == near && before != Infinity) {
                nearOwners.push(player);
            }
            if (after < later) {
                later = after;
                laterOwners = [player];
            } else if (after == later && after != Infinity) {
                laterOwners.push(player);
            }
        }
        if (nearOwners.length) { return nearOwners; }
        if (laterOwners.length) { return laterOwners; }
        return unknown;
    }

    /**
     * 把资源分配给播放器
     * @param {Array} players 出现过的播放器 包括已经不在页面里的
     * @param {Array} resources 资源
     * @param {Object} options { slack: 资源比播放器开始加载早出现 多少毫秒以内仍然算它的 }
     * @returns {Array} 和 players 一一对应 [{ own: Set 属于它的资源, parts: Set 其中不需要单独列出的 (同一个编号下 主清单以外的子清单和分片) }]
     *                  不在页面里的播放器 两个都是空的
     */
    function assign(players, resources, options = {}) {
        const slack = options.slack ?? START_SLACK;
        const states = players.map(function (player) {
            const ids = new Set();
            for (const url of [...(player.hints ?? []), ...(player.srcs ?? [])]) {
                tokens(url).forEach(id => ids.add(id));
            }
            return {
                player: player, present: !!player.present, starts: player.starts, end: player.end,
                srcs: new Set(player.srcs ?? []), ids: ids, key: [...ids].sort().join("\n"),
                direct: false, keyed: false, own: new Set(), parts: new Set(), groups: new Map(),
            };
        });
        // 编号 => 带着它的播放器 封面相同的播放器 (同一个视频 被重新创建过) 算同一个
        const holders = new Map();
        for (const state of states) {
            for (const id of state.ids) {
                holders.has(id) || holders.set(id, []);
                holders.get(id).push(state);
            }
        }
        const exclusive = new Map();
        for (const [id, list] of holders) {
            new Set(list.map(state => state.key)).size == 1 && exclusive.set(id, list);
        }

        let pool = [];
        for (const item of resources) {
            // 1. 地址相同
            const href = item.href ?? item.url;
            const same = states.filter(state => state.srcs.has(href));
            if (same.length) {
                same.forEach(function (state) {
                    state.direct = true;
                    state.present && state.own.add(item);
                });
                continue;
            }
            // 2. 带着播放器独有的编号
            const id = exclusive.size ? tokens(item.url).find(id => exclusive.has(id)) : undefined;
            if (id) {
                exclusive.get(id).forEach(function (state) {
                    state.keyed = true;
                    if (!state.present) { return; }
                    state.own.add(item);
                    state.groups.has(id) || state.groups.set(id, []);
                    state.groups.get(id).push(item);
                });
                continue;
            }
            pool.push(item);
        }

        // 3. 按时间
        // 页面内解码得到的轨道就是播放器正在播放的内容 有它们时 其他对不上的资源 (例如页面的提示音) 不再算作播放器的
        const captured = pool.filter(item => item.capture);
        pool = captured.length ? captured : pool;
        // 优先在没有靠编号对上资源的播放器里找 没有这样的播放器 再在全部里找
        let candidates = states.filter(state => !state.direct && !state.keyed);
        if (!candidates.some(state => state.present)) {
            candidates = states.filter(state => !state.direct);
        }
        if (candidates.some(state => state.present)) {
            for (const item of pool) {
                nearest(item.getTime || 0, candidates, slack).forEach(state => state.present && state.own.add(item));
            }
        }

        // 同一个编号下有清单时 主清单以外的子清单 / 分片 不需要单独列出
        for (const state of states) {
            for (const group of state.groups.values()) {
                const manifests = group.filter(isManifest);
                if (!manifests.length) { continue; }
                let main = manifests[0];
                for (const item of manifests) {
                    if (depth(item) < depth(main) || (depth(item) == depth(main) && (item.getTime || 0) < (main.getTime || 0))) {
                        main = item;
                    }
                }
                group.forEach(item => item !== main && state.parts.add(item));
            }
        }
        return states.map(state => ({ own: state.own, parts: state.parts }));
    }

    const MediaOwner = { tokens, assign };
    root.MediaOwner = MediaOwner;
    if (typeof module == "object" && module.exports) { module.exports = MediaOwner; }
})(globalThis);
