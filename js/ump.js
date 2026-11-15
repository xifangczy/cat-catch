/**
 * UMP (application/vnd.yt-ump) 解码
 *
 * YouTube 的 SABR 流媒体响应格式。一个响应由若干 part 依次排列而成, 每个 part 是
 *     [类型 varint][长度 varint][内容]
 * 音频、视频的分片和控制信息交错在同一个响应里:
 *     FORMAT_INITIALIZATION_METADATA  某个格式的说明 (mime / 总分片数 / 时长)
 *     MEDIA_HEADER                    一个分片的开始 给出 header_id 以及它是哪个格式的第几片
 *     MEDIA                           分片数据 第一个字节是 header_id 一个分片可以拆成多个 MEDIA
 *     MEDIA_END                       分片结束
 * 同一个格式的头部分片加上按序号排列的各个分片 就是原始的 mp4 / webm 文件
 *
 * 用法:
 *     const tracks = new UMP.Tracks();
 *     const decoder = tracks.decoder();     // 每个响应用一个 decoder 它们可以共用同一个 tracks
 *     decoder.push(chunk);                  // 响应的数据可以分多次送入 不要求按 part 对齐
 *     decoder.end();
 *     tracks.list()                         // 解出的各条轨道 track.parts() 是按顺序排好的数据块
 */
(function (root) {
    "use strict";

    // part 类型
    const PART = {
        ONESIE_HEADER: 10,
        ONESIE_DATA: 11,
        ONESIE_ENCRYPTED_MEDIA: 12,
        MEDIA_HEADER: 20,
        MEDIA: 21,
        MEDIA_END: 22,
        LIVE_METADATA: 31,
        HOSTNAME_CHANGE_HINT: 32,
        LIVE_METADATA_PROMISE: 33,
        LIVE_METADATA_PROMISE_CANCELLATION: 34,
        NEXT_REQUEST_POLICY: 35,
        USTREAMER_VIDEO_AND_FORMAT_DATA: 36,
        FORMAT_SELECTION_CONFIG: 37,
        USTREAMER_SELECTED_MEDIA_STREAM: 38,
        FORMAT_INITIALIZATION_METADATA: 42,
        SABR_REDIRECT: 43,
        SABR_ERROR: 44,
        SABR_SEEK: 45,
        RELOAD_PLAYER_RESPONSE: 46,
        PLAYBACK_START_POLICY: 47,
        ALLOWED_CACHED_FORMATS: 48,
        START_BW_SAMPLING_HINT: 49,
        PAUSE_BW_SAMPLING_HINT: 50,
        SELECTABLE_FORMATS: 51,
        REQUEST_IDENTIFIER: 52,
        REQUEST_CANCELLATION_POLICY: 53,
        ONESIE_PREFETCH_REJECTION: 54,
        TIMELINE_CONTEXT: 55,
        REQUEST_PIPELINING: 56,
        SABR_CONTEXT_UPDATE: 57,
        STREAM_PROTECTION_STATUS: 58,
        SABR_CONTEXT_SENDING_POLICY: 59,
        LAWNMOWER_POLICY: 60,
        SABR_ACK: 61,
        END_OF_TRACK: 62,
        CACHE_LOAD_POLICY: 63,
        LAWNMOWER_MESSAGING_POLICY: 64,
        PREWARM_CONNECTION: 65,
        PLAYBACK_DEBUG_INFO: 66,
        SNACKBAR_MESSAGE: 67
    };
    const PART_NAME = {};
    for (const name in PART) { PART_NAME[PART[name]] = name; }

    // 单个 part 的长度上限 超过就认为数据不是 UMP 或者已经错位
    const MAX_PART_SIZE = 256 * 1024 * 1024;

    /**
     * 读取 UMP 的变长整数 (和 protobuf 的 varint 不是一回事)
     * 第一个字节高位连续的 1 的个数决定总长度 (1-5 字节) 其余位是数值的低位 后续字节按小端排列
     * @param {Uint8Array} bytes
     * @param {Number} offset
     * @returns {Object|null} { value, length } 数据不够时返回 null
     */
    function readVarInt(bytes, offset = 0) {
        if (offset >= bytes.length) { return null; }
        const first = bytes[offset];
        const length = first < 128 ? 1 : first < 192 ? 2 : first < 224 ? 3 : first < 240 ? 4 : 5;
        if (offset + length > bytes.length) { return null; }
        let value;
        switch (length) {
            case 1: value = first; break;
            case 2: value = (first & 0x3f) + 64 * bytes[offset + 1]; break;
            case 3: value = (first & 0x1f) + 32 * (bytes[offset + 1] + 256 * bytes[offset + 2]); break;
            case 4: value = (first & 0x0f) + 16 * (bytes[offset + 1] + 256 * (bytes[offset + 2] + 256 * bytes[offset + 3])); break;
            default: value = bytes[offset + 1] + 256 * (bytes[offset + 2] + 256 * (bytes[offset + 3] + 256 * bytes[offset + 4]));
        }
        return { value, length };
    }

    /**
     * 写出 UMP 的变长整数 readVarInt 的逆运算
     * @param {Number} value 0 到 2^32-1
     * @returns {Array} 字节数组
     */
    function writeVarInt(value) {
        if (value < 128) { return [value]; }
        if (value < 16384) { return [0x80 | (value & 0x3f), value >>> 6]; }
        if (value < 2097152) { return [0xc0 | (value & 0x1f), (value >>> 5) & 0xff, value >>> 13]; }
        if (value < 268435456) { return [0xe0 | (value & 0x0f), (value >>> 4) & 0xff, (value >>> 12) & 0xff, value >>> 20]; }
        return [0xf0, value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24];
    }

    /**
     * 读取 protobuf 的 varint 按 int64 解释 超出 2^53 的值会损失精度 (UMP 里用不到这么大的数)
     * @returns {Array} [数值, 下一个偏移]
     */
    function protoVarInt(bytes, pos) {
        let low = 0, high = 0, index = 0, byte;
        do {
            if (pos >= bytes.length) { throw new Error("UMP: protobuf 数据不完整"); }
            byte = bytes[pos++];
            if (index < 4) {
                low |= (byte & 0x7f) << (7 * index);
            } else if (index == 4) {
                low |= (byte & 0x0f) << 28;
                high = (byte & 0x7f) >> 4;
            } else {
                high |= (byte & 0x7f) << (7 * (index - 5) + 3);
            }
            index++;
        } while ((byte & 0x80) && index < 10);
        low >>>= 0;
        high >>>= 0;
        if (high >= 0x80000000) {
            // 负数 取补码
            return [-((~high >>> 0) * 4294967296 + (~low >>> 0) + 1), pos];
        }
        return [high * 4294967296 + low, pos];
    }

    const utf8 = new TextDecoder("utf-8");

    /**
     * 按字段表读取一个 protobuf 消息 表里没有的字段直接跳过
     * @param {Uint8Array} bytes
     * @param {Object} schema 字段号 → [名称, 类型, 是否重复]  类型: "int" | "bool" | "string" | "bytes" | 子消息的字段表
     * @returns {Object}
     */
    function readMessage(bytes, schema) {
        const message = {};
        let pos = 0;
        while (pos < bytes.length) {
            let tag, value;
            [tag, pos] = protoVarInt(bytes, pos);
            const field = Math.floor(tag / 8);
            const wire = tag % 8;
            if (wire == 0) {
                [value, pos] = protoVarInt(bytes, pos);
            } else if (wire == 2) {
                let length;
                [length, pos] = protoVarInt(bytes, pos);
                if (length < 0 || pos + length > bytes.length) { throw new Error("UMP: protobuf 字段越界"); }
                value = bytes.subarray(pos, pos + length);
                pos += length;
            } else if (wire == 1 || wire == 5) {
                const length = wire == 1 ? 8 : 4;
                if (pos + length > bytes.length) { throw new Error("UMP: protobuf 字段越界"); }
                value = bytes.subarray(pos, pos + length);
                pos += length;
            } else {
                throw new Error("UMP: 不支持的 protobuf 类型 " + wire);
            }
            const define = schema[field];
            if (!define) { continue; }
            const [name, type, repeated] = define;
            const isBytes = value instanceof Uint8Array;
            if (type == "int" || type == "bool") {
                if (isBytes) { continue; }
                value = type == "bool" ? value != 0 : value;
            } else {
                if (!isBytes || wire != 2) { continue; }
                if (type == "string") {
                    value = utf8.decode(value);
                } else if (typeof type == "object") {
                    value = readMessage(value, type);
                }
            }
            if (repeated) {
                (message[name] ??= []).push(value);
            } else {
                message[name] = value;
            }
        }
        return message;
    }

    // 各消息的字段表
    const FORMAT_ID = { 1: ["itag", "int"], 2: ["lmt", "int"], 3: ["xtags", "string"] };
    const RANGE = { 1: ["start", "int"], 2: ["end", "int"] };
    const TIME_RANGE = { 1: ["start", "int"], 2: ["duration", "int"], 3: ["timescale", "int"] };
    const SCHEMA = {
        [PART.MEDIA_HEADER]: {
            1: ["headerId", "int"],
            2: ["videoId", "string"],
            3: ["itag", "int"],
            4: ["lmt", "int"],
            5: ["xtags", "string"],
            6: ["start", "int"],            // 分片在原始文件里的字节偏移
            7: ["compression", "int"],
            8: ["init", "bool"],            // 是否头部分片
            9: ["sequence", "int"],         // 分片序号 从 1 开始 头部分片没有
            11: ["startMs", "int"],
            12: ["durationMs", "int"],
            13: ["formatId", FORMAT_ID],
            14: ["size", "int"],            // 分片的字节数
            15: ["timeRange", TIME_RANGE]
        },
        [PART.FORMAT_INITIALIZATION_METADATA]: {
            1: ["videoId", "string"],
            2: ["formatId", FORMAT_ID],
            3: ["endTimeMs", "int"],
            4: ["endSegment", "int"],       // 最后一个分片的序号 也就是总分片数
            5: ["mime", "string"],
            6: ["initRange", RANGE],
            7: ["indexRange", RANGE],
            9: ["duration", "int"],
            10: ["timescale", "int"]
        },
        [PART.NEXT_REQUEST_POLICY]: {
            1: ["targetAudioReadaheadMs", "int"],
            2: ["targetVideoReadaheadMs", "int"],
            4: ["backoffTimeMs", "int"],
            7: ["playbackCookie", "bytes"]
        },
        [PART.SABR_REDIRECT]: { 1: ["url", "string"] },
        [PART.SABR_ERROR]: { 1: ["type", "string"], 2: ["code", "int"] },
        [PART.SABR_SEEK]: { 1: ["seekTime", "int"], 2: ["timescale", "int"] },
        [PART.STREAM_PROTECTION_STATUS]: { 1: ["status", "int"], 2: ["maxRetries", "int"] }
    };

    function toBytes(data) {
        if (data instanceof Uint8Array) { return data; }
        if (data instanceof ArrayBuffer) { return new Uint8Array(data); }
        if (ArrayBuffer.isView(data)) { return new Uint8Array(data.buffer, data.byteOffset, data.byteLength); }
        throw new TypeError("UMP: 需要 Uint8Array 或 ArrayBuffer");
    }

    /**
     * 轨道的标识 同一个视频的同一个格式
     * itag 相同但 lmt / xtags 不同的是不同的文件 (例如开启了音量均衡的音轨) 不能混在一起
     */
    function trackKey(videoId, format) {
        return `${videoId ?? ""}/${format.itag ?? 0}.${format.lmt ?? 0}.${format.xtags ?? ""}`;
    }

    /**
     * 根据 mime 给出文件后缀
     * @param {String} mime 例如 video/mp4; codecs="avc1.4D400C"
     */
    function mimeToExt(mime) {
        const type = (mime ?? "").split(";")[0].trim().toLowerCase();
        if (type == "audio/mp4") { return "m4a"; }
        if (type.endsWith("/mp4")) { return "mp4"; }
        if (type.endsWith("/webm")) { return "webm"; }
        return type.split("/")[1] || "bin";
    }

    /**
     * 分帧: 把连续送入的数据切成一个个 part
     * 数据可以在任意位置断开 不完整的 part 会留到下一次
     */
    class Reader {
        constructor() {
            this.pending = [];  // 还没凑成完整 part 的数据块
            this.length = 0;    // pending 的总字节数
            this.need = 0;      // 至少凑够多少字节才值得再解析一次
            this.error = null;
        }
        /**
         * @param {Uint8Array} chunk
         * @returns {Array} 完整的 part 列表 [{ type, data }]  data 是原数据的视图 不复制
         */
        push(chunk) {
            const parts = [];
            if (this.error || !chunk.length) { return parts; }
            this.pending.push(chunk);
            this.length += chunk.length;
            if (this.length < this.need) { return parts; }

            let data = this.pending[0];
            if (this.pending.length > 1) {
                data = new Uint8Array(this.length);
                let position = 0;
                for (const item of this.pending) {
                    data.set(item, position);
                    position += item.length;
                }
            }
            let offset = 0;
            this.need = 0;
            while (offset < data.length) {
                const type = readVarInt(data, offset);
                const size = type && readVarInt(data, offset + type.length);
                if (!size) { break; }
                if (size.value > MAX_PART_SIZE) {
                    this.error = new Error(`UMP: part 长度异常 (${size.value})`);
                    this.pending = [];
                    this.length = 0;
                    return parts;
                }
                const start = offset + type.length + size.length;
                const end = start + size.value;
                if (end > data.length) {
                    this.need = end - offset;
                    break;
                }
                parts.push({ type: type.value, data: data.subarray(start, end) });
                offset = end;
            }
            if (offset >= data.length) {
                this.pending = [];
                this.length = 0;
            } else {
                const rest = data.subarray(offset);
                this.pending = [rest];
                this.length = rest.length;
            }
            return parts;
        }
    }

    /**
     * 解码一个响应: 分帧 + 把 MEDIA 按 header_id 重组成分片
     * handlers:
     *     format(format)    收到一个格式的说明
     *     segment(segment)  一个分片接收完毕
     *     control(name, message, part)  其他已知的控制信息
     *     part(part)        每一个 part (调试用)
     */
    class Decoder {
        constructor(handlers = {}) {
            this.handlers = handlers;
            this.reader = new Reader();
            this.open = new Map();  // header_id → 正在接收的分片
            this.count = 0;         // 已解出的 part 数
        }
        get error() {
            return this.reader.error;
        }
        /**
         * 送入响应的数据 可以分多次
         * @param {Uint8Array|ArrayBuffer} chunk
         */
        push(chunk) {
            for (const part of this.reader.push(toBytes(chunk))) {
                this.count++;
                try {
                    this.part(part);
                } catch (e) {
                    // 单个 part 的内容解不出来不影响后面的 part 分帧不依赖内容
                    this.handlers.error?.(e, part);
                }
                this.handlers.part?.(part);
            }
        }
        part(part) {
            const data = part.data;
            if (part.type == PART.MEDIA) {
                const segment = this.open.get(data[0]);
                if (!segment || data.length < 1) { return; }
                segment.data.push(data.subarray(1));
                segment.received += data.length - 1;
                return;
            }
            if (part.type == PART.MEDIA_HEADER) {
                const header = readMessage(data, SCHEMA[PART.MEDIA_HEADER]);
                const format = header.formatId ?? header;
                this.open.set(header.headerId ?? 0, {
                    key: trackKey(header.videoId, format),
                    videoId: header.videoId,
                    itag: format.itag,
                    lmt: format.lmt,
                    xtags: format.xtags,
                    init: !!header.init,
                    sequence: header.sequence,
                    start: header.start,
                    size: header.size,
                    startMs: header.startMs,
                    durationMs: header.durationMs,
                    compression: header.compression ?? 0,
                    data: [],
                    received: 0
                });
                return;
            }
            if (part.type == PART.MEDIA_END) {
                const segment = this.open.get(data[0]);
                if (!segment) { return; }
                this.open.delete(data[0]);
                // 声明了长度的分片 字节数对不上说明中间有丢失
                segment.complete = segment.size === undefined || segment.received == segment.size;
                this.handlers.segment?.(segment);
                return;
            }
            if (part.type == PART.FORMAT_INITIALIZATION_METADATA) {
                const info = readMessage(data, SCHEMA[part.type]);
                const format = info.formatId ?? {};
                this.handlers.format?.({
                    key: trackKey(info.videoId, format),
                    videoId: info.videoId,
                    itag: format.itag,
                    lmt: format.lmt,
                    xtags: format.xtags,
                    mime: info.mime,
                    ext: mimeToExt(info.mime),
                    endSegment: info.endSegment,
                    durationMs: info.duration && info.timescale ? Math.round(info.duration * 1000 / info.timescale) : info.endTimeMs,
                    initRange: info.initRange,
                    indexRange: info.indexRange
                });
                return;
            }
            if (SCHEMA[part.type] && this.handlers.control) {
                this.handlers.control(PART_NAME[part.type], readMessage(data, SCHEMA[part.type]), part);
            }
        }
        /**
         * 响应结束 没收到 MEDIA_END 的分片是不完整的 直接丢弃
         * @returns {Number} 丢弃的分片数
         */
        end() {
            const dropped = this.open.size;
            this.open.clear();
            return dropped;
        }
    }

    /**
     * 一条轨道: 一个视频的一个格式 由头部分片和若干按序号排列的分片组成
     */
    class Track {
        constructor(key) {
            this.key = key;
            this.format = null;         // FORMAT_INITIALIZATION_METADATA 的内容 可能晚于分片到达
            this.videoId = undefined;
            this.itag = undefined;
            this.init = null;           // 头部分片
            this.segments = new Map();  // 序号 → 分片
            this.size = 0;              // 已收到的字节数 (含头部)
        }
        get mime() {
            return this.format?.mime;
        }
        get ext() {
            return this.format?.ext ?? "bin";
        }
        // 总分片数 直播等情况下未知
        get total() {
            return this.format?.endSegment || 0;
        }
        get received() {
            return this.segments.size;
        }
        // 头部和全部分片都已收到
        get complete() {
            if (!this.init || !this.total || this.segments.size < this.total) { return false; }
            for (let sequence = 1; sequence <= this.total; sequence++) {
                if (!this.segments.has(sequence)) { return false; }
            }
            return true;
        }
        /**
         * 加入一个分片 重复的分片不会重复加入
         * @returns {Boolean} 是否加入
         */
        add(segment) {
            if (!segment.complete || segment.compression > 1) { return false; }
            this.videoId ??= segment.videoId;
            this.itag ??= segment.itag;
            if (segment.init) {
                if (this.init) { return false; }
                this.init = segment;
            } else {
                // 没有序号的分片 (直播的某些情况) 用起始时间代替
                const sequence = segment.sequence ?? segment.startMs;
                if (sequence === undefined || this.segments.has(sequence)) { return false; }
                this.segments.set(sequence, segment);
            }
            this.size += segment.received;
            return true;
        }
        // 已收到的分片序号 从小到大
        sequences() {
            return Array.from(this.segments.keys()).sort((a, b) => a - b);
        }
        /**
         * 缺失的分片区间 [[起, 止], ...] 总分片数未知时只算已收到的范围之内的
         */
        gaps() {
            const gaps = [];
            const sequences = this.sequences();
            let expect = 1;
            for (const sequence of sequences) {
                if (sequence > expect) { gaps.push([expect, sequence - 1]); }
                expect = sequence + 1;
            }
            if (this.total && expect <= this.total) { gaps.push([expect, this.total]); }
            return gaps;
        }
        /**
         * 按文件顺序排好的数据块 头部在最前 交给 new Blob(parts) 即可得到文件
         * 分片不全时得到的是残缺但仍可播放的文件
         * @returns {Array}
         */
        parts() {
            const parts = [];
            const append = (segment) => {
                // 分片的数据可以被外部换成别的容器 (例如 Blob) 放在 segment.blob
                segment.blob ? parts.push(segment.blob) : parts.push(...segment.data);
            };
            this.init && append(this.init);
            for (const sequence of this.sequences()) {
                append(this.segments.get(sequence));
            }
            return parts;
        }
    }

    /**
     * 多条轨道的集合 多个响应解出的分片汇总到这里
     */
    class Tracks {
        constructor() {
            this.map = new Map();
        }
        get(key) {
            let track = this.map.get(key);
            if (!track) {
                track = new Track(key);
                this.map.set(key, track);
            }
            return track;
        }
        list() {
            return Array.from(this.map.values());
        }
        delete(key) {
            return this.map.delete(key);
        }
        format(format) {
            const track = this.get(format.key);
            track.format = format;
            track.videoId ??= format.videoId;
            track.itag ??= format.itag;
            return track;
        }
        segment(segment) {
            const track = this.get(segment.key);
            return track.add(segment) ? track : null;
        }
        /**
         * 新建一个把结果汇总到这里的 Decoder
         * @param {Object} handlers 额外的回调 format / segment 的参数后面会多一个所属的 track
         */
        decoder(handlers = {}) {
            return new Decoder({
                ...handlers,
                format: (format) => {
                    const track = this.format(format);
                    handlers.format?.(format, track);
                },
                segment: (segment) => {
                    const track = this.segment(segment);
                    handlers.segment?.(segment, track);
                }
            });
        }
    }

    /**
     * 一次性解码一个完整的响应
     * @param {Uint8Array|ArrayBuffer} data
     * @returns {Tracks}
     */
    function decode(data) {
        const tracks = new Tracks();
        const decoder = tracks.decoder();
        decoder.push(data);
        decoder.end();
        if (decoder.error) { throw decoder.error; }
        return tracks;
    }

    /**
     * 判断 Content-Type 是不是 UMP
     */
    function isUMP(contentType) {
        return typeof contentType == "string" && contentType.toLowerCase().startsWith("application/vnd.yt-ump");
    }

    const UMP = { PART, PART_NAME, readVarInt, writeVarInt, readMessage, trackKey, mimeToExt, isUMP, Reader, Decoder, Track, Tracks, decode };
    if (typeof module == "object" && module.exports) {
        module.exports = UMP;
    } else {
        root.CatCatchUMP = UMP;
    }
})(typeof globalThis == "object" ? globalThis : this);
