/**
 * HLS 的字幕
 * 字幕轨道也是一个 m3u8 里面是一段一段的 WebVTT
 * 每一段都带着自己的文件头和时间映射 直接拼起来不是合法的字幕文件
 * 这里把各段合成一个 .vtt: 时间换算到同一条时间线上 去掉跨段重复的字幕
 * parse / merge 是纯函数 node 里也能跑
 */
(function (root) {
    // 00:01:02.345 或 01:02.345 转成秒
    function toSeconds(text) {
        const parts = text.trim().split(":");
        let seconds = 0;
        for (const part of parts) {
            seconds = seconds * 60 + parseFloat(part.replace(",", "."));
        }
        return seconds;
    }
    function toTime(seconds) {
        seconds = Math.max(0, seconds);
        const ms = Math.round(seconds * 1000);
        const pad = (value, length = 2) => String(value).padStart(length, "0");
        return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
    }
    /**
     * 字幕的 m3u8 里的分片地址
     * @param {String} text m3u8 的内容
     * @param {String} base m3u8 的地址
     * @returns {Array} 分片的完整地址 不是 m3u8 (直接就是一个字幕文件) 时返回空数组
     */
    function parse(text, base) {
        if (!/^\s*#EXTM3U/.test(text)) { return []; }
        const list = [];
        for (const line of text.split(/\r?\n/)) {
            const value = line.trim();
            if (!value || value.startsWith("#")) { continue; }
            try { list.push(new URL(value, base).href); } catch (e) { }
        }
        return list;
    }
    /**
     * 把各段 WebVTT 合成一个
     * X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000 的意思是 这一段里的时间 LOCAL 对应节目时间 MPEGTS (90000 分之一秒)
     * 有的字幕每一段都从 0 开始计时 靠它才知道这一段实际在什么位置 以第一段为起点换算
     * @param {Array} segments 各段的文本 按顺序
     * @returns {String} 合并后的 WebVTT
     */
    function merge(segments) {
        const styles = [];
        const cues = [];
        const seen = new Set();
        let origin = null;  // 第一段的节目时间 (秒)
        for (const segment of segments) {
            const blocks = String(segment ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
            let offset = 0;
            const header = blocks[0] && /^WEBVTT/.test(blocks[0]) ? blocks.shift() : "";
            const map = /X-TIMESTAMP-MAP=([^\n]+)/.exec(header);
            if (map) {
                const local = /LOCAL:([\d:.]+)/.exec(map[1]);
                const mpegts = /MPEGTS:(\d+)/.exec(map[1]);
                if (local && mpegts) {
                    const start = Number(mpegts[1]) / 90000 - toSeconds(local[1]);
                    origin ??= start;
                    offset = start - origin;
                }
            }
            for (const block of blocks) {
                const lines = block.split("\n").filter(line => line.trim() != "");
                if (!lines.length) { continue; }
                if (/^(STYLE|REGION)\b/.test(lines[0])) {
                    styles.includes(block.trim()) || styles.push(block.trim());
                    continue;
                }
                const at = lines.findIndex(line => line.includes("-->"));
                // 没有时间的不是字幕 (NOTE 之类)
                if (at < 0 || at > 1) { continue; }
                const timing = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)(.*)$/.exec(lines[at]);
                if (!timing) { continue; }
                const start = toSeconds(timing[1]) + offset;
                const end = toSeconds(timing[2]) + offset;
                const text = lines.slice(at + 1).join("\n");
                // 跨段的字幕在前后两段里各出现一次
                const key = `${Math.round(start * 1000)}|${Math.round(end * 1000)}|${text}`;
                if (seen.has(key)) { continue; }
                seen.add(key);
                cues.push({ start: start, text: `${toTime(start)} --> ${toTime(end)}${timing[3].trimEnd()}\n${text}` });
            }
        }
        cues.sort((a, b) => a.start - b.start);
        return ["WEBVTT", ...styles, ...cues.map(cue => cue.text)].join("\n\n") + "\n";
    }
    /**
     * 下载一条字幕轨道 合成一个 WebVTT
     * @param {String} url 字幕 m3u8 的地址 (也可以直接是一个字幕文件)
     * @param {Function} progress (已完成数, 总数) 进度
     * @returns {Promise<String>}
     */
    async function download(url, progress) {
        const get = async function (address) {
            const response = await fetch(address);
            if (!response.ok) { throw new Error(response.status); }
            return response.text();
        };
        const text = await get(url);
        const list = parse(text, url);
        if (!list.length) { return merge([text]); }
        const segments = new Array(list.length);
        let next = 0;
        let done = 0;
        const worker = async function () {
            while (next < list.length) {
                const index = next++;
                segments[index] = await get(list[index]);
                progress && progress(++done, list.length);
            }
        };
        await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
        return merge(segments);
    }

    const M3u8Subtitle = { parse, merge, download };
    root.M3u8Subtitle = M3u8Subtitle;
    if (typeof module == "object" && module.exports) { module.exports = M3u8Subtitle; }
})(globalThis);
