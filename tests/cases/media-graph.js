// 资源关联图 (js/core/media-graph.js)
// 纯逻辑 不需要浏览器: 各种网站的资源地址长什么样 归并和配对的结果应该是什么
'use strict';
const path = require('node:path');
const MediaGraph = require(path.join(__dirname, '..', '..', 'js', 'core', 'media-graph.js'));

let total = 0, failed = 0, time = 1000;
function check(title, ok, detail) {
    total++;
    ok || failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${title}${!ok && detail !== undefined ? '\n      ' + JSON.stringify(detail) : ''}`);
}
// 一个资源 默认都在同一个标签的主框架里 每个比上一个晚 100 毫秒
function item(url, type, extra = {}) {
    const name = new URL(url).pathname.split('/').pop();
    return { url, name, type, ext: name.includes('.') ? name.split('.').pop().toLowerCase() : undefined, size: 1000, tabId: 1, frameId: 0, getTime: time += 100, ...extra };
}
function build(items) {
    const graph = new MediaGraph();
    items.forEach((value) => graph.add(value));
    const streams = [...graph.streams.values()].filter((stream) => stream.active);
    return { graph, streams, loose: items.filter((value) => !graph.owner(value)) };
}
console.log('== 资源关联图 ==');

// SharePoint: 清单和分片不在一个域名 分片的路径都一样 只靠参数区分 音频 / 视频 / 画质
{
    const id = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', drive = 'b!AbCdEf1234567890';
    const manifest = item('https://region-mediap.svc.ms/transform/videomanifest?provider=spo&docid=' + encodeURIComponent(`https://tenant-my.sharepoint.com/personal/user/_api/v2.0/drives/${drive}/items/${id}?version=Published`) + '&part=index&format=dash', 'application/dash+xml');
    const segment = (track, quality, n) => item(`https://tenant-my.sharepoint.com/_api_cached/v2.1/drives/${drive}/items/${id}/oneDrive.transcode?version=Published&P1=1795032622&P4=${'x'.repeat(60)}&part=${n < 0 ? 'initsegment' : 'mediasegment'}&track=${track}&quality=${quality}${n < 0 ? '' : '&segmentTime=' + n * 150000}&wsd=150000&ppd=1637000`, `${track}/mp4`);
    const media = [segment('audio', 'audhigh', -1), segment('video', 'v240p', -1)];
    for (let n = 0; n < 6; n++) { media.push(segment('audio', 'audhigh', n), segment('video', 'v240p', n)); }
    media.push(segment('video', 'v720p', -1));
    for (let n = 6; n < 12; n++) { media.push(segment('audio', 'audhigh', n), segment('video', 'v720p', n)); }
    const { graph, streams, loose } = build([manifest, ...media]);
    check('SharePoint: 39 个分片归并成 3 条流 (音频 / 240p / 720p)', streams.length == 3 && streams.map((stream) => stream.nodes.length).join() == '12,6,6', streams.map((stream) => stream.nodes.length));
    check('SharePoint: 初始化分片也归进去 只剩清单单独一行', loose.length == 1 && loose[0] === manifest, loose.map((value) => value.url.slice(-60)));
    check('SharePoint: 每条流都对应到另一个域名上的清单', streams.every((stream) => graph.manifest(stream) === manifest));
    check('SharePoint: 分片不参与音视频配对', media.every((value) => !graph.counterpart(value)));
}
// HLS: 主清单 + 各画质的清单 + ts 分片
{
    const base = 'https://cdn.example.com/v/abc123def456';
    const master = item(base + '/master.m3u8', 'application/vnd.apple.mpegurl');
    const level = item(base + '/720p/index.m3u8', 'application/vnd.apple.mpegurl');
    const other = item('https://cdn.example.com/v/zzz999yyy888/720p/index.m3u8', 'application/vnd.apple.mpegurl');
    const segments = Array.from({ length: 5 }, (_, n) => item(`${base}/720p/seg-${String(n).padStart(4, '0')}.ts`, 'video/mp2t'));
    const { graph, streams, loose } = build([master, level, other, ...segments]);
    check('HLS: ts 分片归并成 1 条流', streams.length == 1 && streams[0].nodes.length == 5 && loose.length == 3);
    check('HLS: 对应到最具体的那个清单 (同目录的画质清单 不是主清单 也不是别的视频的)', streams.length == 1 && graph.manifest(streams[0]) === level);
    check('HLS: 画质清单算在主清单名下 别的视频的不算', graph.root(level) === master && graph.root(other) === null && graph.root(master) === null);
}
// DASH (ffmpeg 的命名): 两个 Representation 的分片只差编号 不能混成一条
{
    const base = 'https://cdn.example.com/dash/movie20260101/';
    const manifest = item(base + 'manifest.mpd', 'application/dash+xml');
    const media = [item(base + 'init-stream0.m4s', 'video/mp4'), item(base + 'init-stream1.m4s', 'audio/mp4')];
    for (let n = 1; n <= 4; n++) { media.push(item(`${base}chunk-stream0-${String(n).padStart(5, '0')}.m4s`, 'video/mp4'), item(`${base}chunk-stream1-${String(n).padStart(5, '0')}.m4s`, 'audio/mp4')); }
    const { graph, streams, loose } = build([manifest, ...media]);
    check('DASH: 视频和音频各一条流 没有混在一起', streams.length == 2 && streams.every((stream) => stream.nodes.length == 4 && new Set(stream.nodes.map((node) => node.track)).size == 1), streams.map((stream) => stream.nodes.length));
    check('DASH: 初始化分片各归各的流 只剩清单', loose.length == 1 && streams.every((stream) => graph.members(stream).length == 5), streams.map((stream) => graph.members(stream).length));
    check('DASH: 两条流都对应到清单', streams.every((stream) => graph.manifest(stream) === manifest));
}
// 用字节范围请求的流 (videoplayback?itag=..&range=..) itag 是轨道的编号 不是序号
{
    const request = (itag, n) => item(`https://rr1---sn-abc.example.com/videoplayback?expire=1795000000&id=o-AbCdEfGh123456&itag=${itag}&sig=${'s'.repeat(40)}&range=${n * 1000}-${n * 1000 + 999}&rn=${n}&rbuf=0`, itag == 140 ? 'audio/mp4' : 'video/mp4');
    const media = [];
    for (let n = 0; n < 4; n++) { media.push(request(137, n), request(140, n)); }
    const { streams, loose } = build(media);
    check('字节范围: 按 itag 分成视频和音频两条流', streams.length == 2 && streams.every((stream) => stream.nodes.length == 4) && loose.length == 0, streams.map((stream) => stream.nodes.length));
}
// 名字带编号但不是分片的文件 不能归并
{
    const previews = [1083, 22, 907, 3310, 15, 640, 77].map((n) => item(`https://img.example.com/previews/preview-${n}.mp4`, 'video/mp4'));
    check('编号不连续的独立视频: 不归并', build(previews).streams.length == 0);
    const numbered = Array.from({ length: 6 }, (_, n) => item(`https://cdn.example.com/hls/xyz/${String(n).padStart(3, '0')}.mp4`, 'video/mp4'));
    check('编号连续的文件 (伪装成 mp4 的分片): 归并成 1 条流', build(numbered).streams.length == 1);
    check('少于 5 个时不归并', build(numbered.slice(0, 4)).streams.length == 0);
}
// 音频和视频分开的完整文件 配对
{
    const dir = 'https://v.example.com/abcdefghijk12/';
    const video = item(dir + 'DASH_720.mp4', 'video/mp4'), audio = item(dir + 'DASH_AUDIO_128.mp4', 'video/mp4');
    const single = item('https://v.example.com/zyxwvutsrqp98/movie.mp4', 'video/mp4');
    const { graph, streams } = build([video, audio, single]);
    check('音视频分离: 类型都是 video/mp4 时按名字认出音频 互相配对', streams.length == 0 && graph.counterpart(video) === audio && graph.counterpart(audio) === video);
    check('音视频分离: 别的视频不参与配对', graph.counterpart(single) === null);
}
{
    // 同一个目录里放着两个视频各自的音频和视频 相隔 10 分钟
    const a = [item('https://cdn.example.com/media/a_video.mp4', 'video/mp4'), item('https://cdn.example.com/media/a_audio.m4a', 'audio/mp4')];
    time += 10 * 60 * 1000;
    const b = [item('https://cdn.example.com/media/b_video.mp4', 'video/mp4'), item('https://cdn.example.com/media/b_audio.m4a', 'audio/mp4')];
    const { graph } = build([...a, ...b]);
    check('同目录的两个视频: 按出现的时间各自配对', graph.counterpart(a[0]) === a[1] && graph.counterpart(b[1]) === b[0] && graph.counterpart(b[0]) === b[1]);
    const frames = [item('https://cdn.example.com/media/c_video.mp4', 'video/mp4', { frameId: 0 }), item('https://cdn.example.com/media/c_audio.m4a', 'audio/mp4', { frameId: 7 })];
    check('不同 frame 的资源不配对', build(frames).graph.counterpart(frames[0]) === null);
}
// 推特: 分片的文件名是随机的 归不成分片流 靠编号算到主清单名下
{
    const name = () => Math.random().toString(36).slice(2, 12) + 'Qw';
    const tweet = (id, kind = 'amplify_video') => {
        const base = `https://video.twimg.com/${kind}/${id}/${kind == 'ext_tw_video' ? 'pu/' : ''}`;
        const list = [
            item(`${base}pl/${name()}.m3u8?tag=14&v=ba2&variant_version=1`, 'application/x-mpegURL'),
            item(`${base}pl/avc1/720x1280/${name()}.m3u8`, 'application/x-mpegURL'),
            item(`${base}pl/mp4a/128000/${name()}.m3u8`, 'application/x-mpegURL'),
            item(`${base}vid/avc1/0/0/720x1280/${name()}.mp4`, 'video/mp4', { size: 1200 }),
            item(`${base}aud/mp4a/0/0/128000/${name()}.mp4`, 'audio/mp4', { size: 900 }),
        ];
        for (let n = 0; n < 6; n++) {
            list.push(item(`${base}vid/avc1/${n * 3000}/${n * 3000 + 3000}/720x1280/${name()}.m4s`, 'video/mp4', { size: 400000 }));
            list.push(item(`${base}aud/mp4a/${n * 3000}/${n * 3000 + 3000}/128000/${name()}.m4s`, 'audio/mp4', { size: 50000 }));
        }
        return list;
    };
    const a = tweet('2122609008137945088'), b = tweet('2122633919434485760', 'ext_tw_video');
    // 两个视频的请求交错在一起
    const mixed = [];
    a.forEach((value, index) => mixed.push(value, b[index]));
    const { graph, streams } = build(mixed);
    const rows = mixed.filter((value) => !graph.owner(value) && !graph.root(value));
    check('推特: 两个视频 34 个资源 只剩两个主清单单独成行', streams.length == 0 && rows.length == 2 && rows[0] === a[0] && rows[1] === b[0], rows.map((value) => value.url.slice(24, 80)));
    check('推特: 子清单 / 初始化分片 / 分片 都算在自己那个视频的主清单名下', a.slice(1).every((value) => graph.root(value) === a[0]) && b.slice(1).every((value) => graph.root(value) === b[0]) && graph.parts(a[0]).length == 16);
    check('推特: 主清单名下的资源不参与音视频配对', mixed.every((value) => !graph.counterpart(value)));
    const big = item('https://video.twimg.com/amplify_video/2122609008137945088/vid/avc1/720x1280/progressiveFile1.mp4?tag=14', 'video/mp4', { size: 8 * 1024 * 1024 });
    graph.add(big);
    check('推特: 同一个编号下完整的 mp4 仍然单独成行', graph.root(big) === null && graph.owner(big) === null);
    graph.remove(a[0]);
    check('移除主清单后 它名下的子清单不再挂着它', a.slice(1, 3).every((value) => graph.root(value) === null));
}
// 同一个目录里的几个清单 分不清是不是同一个视频的 各自成行
{
    const base = 'https://cdn.example.com/channel20240117/';
    const list = [item(base + 'video1.m3u8', 'application/vnd.apple.mpegurl'), item(base + 'video2.m3u8', 'application/vnd.apple.mpegurl')];
    const { graph } = build(list);
    check('同目录的清单: 各自成行', list.every((value) => graph.root(value) === null));
}
// 移除和清空
{
    const media = Array.from({ length: 4 }, (_, n) => item(`https://cdn.example.com/x/abcdef123456/seg-${n}.m4s`, 'video/mp4'));
    const { graph, streams } = build(media);
    graph.remove(media[0]);
    check('移除资源后 流里少一个', streams[0].nodes.length == 3 && graph.owner(media[0]) === null);
    graph.clear();
    check('清空', graph.nodes.size == 0 && graph.streams.size == 0 && graph.roots.size == 0);
}

console.log(`${total - failed}/${total} 通过`);
process.exit(failed ? 1 : 0);
