// HLS 字幕合并 (js/m3u8.subtitle.js)
// 纯逻辑 不需要浏览器: 一段一段的 WebVTT 合成一个字幕文件
'use strict';
const path = require('node:path');
const M3u8Subtitle = require(path.join(__dirname, '..', '..', 'js', 'm3u8.subtitle.js'));

let total = 0, failed = 0;
function check(title, ok, detail) {
    total++;
    ok || failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${title}${!ok && detail !== undefined ? '\n      ' + JSON.stringify(detail) : ''}`);
}
const cues = (text) => text.split('\n\n').filter((block) => block.includes('-->')).map((block) => block.trim());
console.log('== HLS 字幕合并 ==');

{
    const list = M3u8Subtitle.parse('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg-0.vtt\n#EXTINF:6,\n../other/seg-1.vtt?x=1\n#EXTINF:6,\nhttps://cdn.example.com/seg-2.vtt\n#EXT-X-ENDLIST\n', 'https://example.com/subs/en/index.m3u8?token=1');
    check('清单: 相对地址按清单的地址补全', list.join() == 'https://example.com/subs/en/seg-0.vtt,https://example.com/subs/other/seg-1.vtt?x=1,https://cdn.example.com/seg-2.vtt', list);
    check('清单: 不是 m3u8 时没有分片', M3u8Subtitle.parse('WEBVTT\n\n00:00.000 --> 00:01.000\nhi\n', 'https://example.com/a.vtt').length == 0);
}

// 最常见的写法: 每一段里的时间已经是整条时间线上的 映射都一样 跨段的字幕在两段里各出现一次
{
    const head = 'WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\n';
    const text = M3u8Subtitle.merge([
        head + '00:00:01.000 --> 00:00:03.000\nHello\n\n00:00:05.000 --> 00:00:07.500\nSpans two segments\n',
        head + '00:00:05.000 --> 00:00:07.500\nSpans two segments\n\n00:00:09.000 --> 00:00:11.000 line:90% align:center\n<i>Second</i>\nsecond line\n',
        head,
    ]);
    const list = cues(text);
    check('时间已经在同一条时间线上: 原样保留', list.length == 3 && list[0] == '00:00:01.000 --> 00:00:03.000\nHello', list);
    check('跨段重复的字幕只留一条', list.filter((cue) => cue.includes('Spans two')).length == 1);
    check('位置设置和多行内容保留', list[2] == '00:00:09.000 --> 00:00:11.000 line:90% align:center\n<i>Second</i>\nsecond line', list[2]);
    check('只有一个文件头', text.startsWith('WEBVTT\n\n') && text.split('WEBVTT').length == 2 && !text.includes('X-TIMESTAMP-MAP'), text.slice(0, 60));
}

// 每一段都从 0 开始计时 靠 X-TIMESTAMP-MAP 才知道实际位置
{
    const segment = (index, body) => `WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${900000 + index * 6 * 90000}\n\n${body}`;
    const text = M3u8Subtitle.merge([
        segment(0, '00:00:01.000 --> 00:00:02.000\nA\n'),
        segment(1, '00:00:01.000 --> 00:00:02.000\nB\n'),
        segment(2, '00:00.500 --> 00:02.250\nC\n'),
    ]);
    check('每段从 0 计时: 按映射换算到整条时间线', cues(text).join(' | ') == '00:00:01.000 --> 00:00:02.000\nA | 00:00:07.000 --> 00:00:08.000\nB | 00:00:12.500 --> 00:00:14.250\nC', cues(text));
}

// 其他内容
{
    const text = M3u8Subtitle.merge([
        '﻿WEBVTT - Title\r\n\r\nSTYLE\r\n::cue { color: yellow }\r\n\r\nNOTE this is a comment\r\n\r\nintro\r\n00:00:01.000 --> 00:00:02.000\r\nWith identifier\r\n',
        'WEBVTT\n\nSTYLE\n::cue { color: yellow }\n\n00:00:03.000 --> 00:00:04.000\nNext\n',
    ]);
    check('样式保留一份 注释去掉 Windows 换行和 BOM 能处理', text.split('STYLE').length == 2 && !text.includes('NOTE') && !text.includes('\r') && cues(text).length == 2, text);
    check('字幕前面的编号行去掉 (各段的编号会重复)', cues(text)[0] == '00:00:01.000 --> 00:00:02.000\nWith identifier', cues(text)[0]);
    check('没有时间映射的 时间原样保留', cues(M3u8Subtitle.merge(['WEBVTT\n\n01:02:03.004 --> 01:02:05.000\nLong\n']))[0].startsWith('01:02:03.004 --> 01:02:05.000'));
    check('空的输入得到只有文件头的字幕', M3u8Subtitle.merge([]) == 'WEBVTT\n' && M3u8Subtitle.merge(['', undefined]) == 'WEBVTT\n');
}

console.log(`${total - failed}/${total} 通过`);
process.exit(failed ? 1 : 0);
