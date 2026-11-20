/**
 * 媒体资源的特征
 * 纯函数 不依赖浏览器的扩展接口 后台 / 弹窗 / 页面脚本 / node 都能用
 * 资源对象是后台记录的那种 { url, name, ext, type, size, tabId, frameId, getTime }
 */
(function (root) {
    const SUBTITLE_EXT = new Set(["vtt", "srt", "ass", "ssa", "ttml", "dfxp", "sbv"]);
    const AUDIO_EXT = new Set(["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "weba", "ac3"]);
    const VIDEO_EXT = new Set(["mp4", "webm", "mkv", "mov", "flv", "m4v", "ogv", "3gp", "mpeg"]);
    const SEGMENT_EXT = new Set(["ts", "m4s", "m4f", "cmfv", "cmfa", "cmft"]);
    // 地址参数里表示 序号 / 时间 / 字节范围 的名字 同一条流的分片只有这些不一样
    const SEQUENCE = /^(range|bytes|start|end|offset|pos|seq|sq|sn|n|no|num|index|idx|rn|rbuf|t|ts|time|pts|seg\w*|frag\w*|chunk\w*)$/i;
    // 文件名或参数里带这些字样的 多半是分片
    const SEGMENT_WORD = /(seg(ment)?|chunk|frag(ment)?|[?&](range|bytes|sq|sn)=)/i;
    // 表示媒体编号的参数名
    const ID = /^(id|v|vid|guid|uuid|(video|media|asset|content|doc|item|file)_?id)$/i;

    function parse(url) {
        try {
            const parsing = new URL(url);
            return parsing.protocol.startsWith("http") ? parsing : null;
        } catch (e) { return null; }
    }
    const lower = text => (text ?? "").toLowerCase();

    /**
     * 资源的角色
     * @returns {String} manifest 清单 | subtitle 字幕 | media 媒体 (完整的文件或者分片 是不是分片由 MediaGraph 判断) | other
     */
    function role(item) {
        const ext = lower(item.ext);
        const type = lower(item.type);
        if (ext == "m3u8" || ext == "m3u" || ext == "mpd" || /mpegurl|dash\+xml/.test(type)) { return "manifest"; }
        if (SUBTITLE_EXT.has(ext) || /^text\/vtt|ttml|subrip/.test(type)) { return "subtitle"; }
        if (/^(video|audio)\//.test(type) || AUDIO_EXT.has(ext) || VIDEO_EXT.has(ext) || SEGMENT_EXT.has(ext)) { return "media"; }
        return "other";
    }
    /**
     * 媒体资源是音频还是视频
     * @returns {String} audio | video
     */
    function track(item) {
        if (lower(item.type).startsWith("audio/") || AUDIO_EXT.has(lower(item.ext))) { return "audio"; }
        // 有些网站音频的类型也是 video/mp4 只能看名字和参数
        const parsing = parse(item.url);
        return parsing && /(^|[^a-z])audio([^a-z]|$)/i.test(parsing.pathname.split("/").pop() + parsing.search) ? "audio" : "video";
    }
    /**
     * 分片流的标识
     * 同一条流的分片 只有文件名 (不含后缀) 里最后一串数字 和 表示序号 / 时间 / 字节范围的参数 不一样
     * 很长的参数值 (签名之类) 不参与比较
     * @returns {Object|null} { key: 标识, number: 这个分片的序号 (认不出为 NaN), hint: 看起来像分片 } 地址里没有会变的部分返回 null
     */
    function stream(item) {
        const parsing = parse(item.url);
        if (!parsing) { return null; }
        let number = NaN;
        let varying = false;
        const path = parsing.pathname.split("/");
        const file = path.pop();
        const dot = file.lastIndexOf(".");
        const stem = dot > 0 ? file.slice(0, dot) : file;
        const name = stem.replace(/\d+(?=\D*$)/, function (value) {
            number = Number(value);
            varying = true;
            return "#";
        }) + file.slice(stem.length);
        const query = [];
        for (const [key, value] of parsing.searchParams) {
            if (SEQUENCE.test(key) && /^\d+(-\d*)?$/.test(value)) {
                number = parseInt(value);
                varying = true;
                query.push(key + "=#");
            } else {
                query.push(key + "=" + (value.length >= 24 ? "*" : value));
            }
        }
        if (!varying) { return null; }
        return {
            key: parsing.origin + path.join("/") + "/" + name + "?" + query.join("&"),
            number: number,
            hint: segment(item),
        };
    }
    /**
     * 看起来是不是分片 (分片的后缀 或者文件名 / 参数里带着分片的字样)
     * @returns {Boolean}
     */
    function segment(item) {
        const parsing = parse(item.url);
        return SEGMENT_EXT.has(lower(item.ext)) || (!!parsing && SEGMENT_WORD.test(parsing.pathname.split("/").pop() + parsing.search));
    }
    /**
     * 是不是初始化分片 (地址里没有序号 不会被归进分片流 要另外认)
     * @returns {Boolean}
     */
    function init(item) {
        const parsing = parse(item.url);
        return !!parsing && /(^|[^a-z])(init|header)/i.test(parsing.pathname.split("/").pop() + parsing.search);
    }
    // 资源所在的目录
    function dir(item) {
        const parsing = parse(item.url);
        return parsing ? parsing.origin + parsing.pathname.replace(/[^/]*$/, "") : "";
    }
    // 目录里最靠后的 看起来像编号的一段 (够长 有字母有数字 或者全是数字 不是 stream_1 这种通用的名字)
    function pathKey(pathname) {
        const list = pathname.split("/").slice(0, -1).map(text => { try { return decodeURIComponent(text); } catch (e) { return text; } });
        return list.reverse().find(text => text.length >= 10 && (/^\d+$/.test(text) || (/\d/.test(text) && /[a-z]/i.test(text) && !/^[a-z_-]+\d{1,3}$/i.test(text))));
    }
    /**
     * 资源的身份标识 用来把清单和它的分片 / 轨道对应起来 (它们常常不在同一个域名)
     * 取 目录里最靠后的编号 和 表示媒体编号的参数 参数值是地址时取那个地址里的编号
     * @returns {Array}
     */
    function keys(item) {
        const parsing = parse(item.url);
        if (!parsing) { return []; }
        const list = [pathKey(parsing.pathname)];
        for (const [key, value] of parsing.searchParams) {
            if (!ID.test(key)) { continue; }
            const inner = parse(value);
            list.push(inner ? pathKey(inner.pathname + "/") : (value.length >= 8 ? value : undefined));
        }
        return list.filter(Boolean);
    }

    const MediaAsset = { role, track, stream, segment, init, dir, keys };
    root.MediaAsset = MediaAsset;
    if (typeof module == "object" && module.exports) { module.exports = MediaAsset; }
})(globalThis);
