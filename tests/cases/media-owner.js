// 资源归属 (js/core/media-owner.js)
// 纯逻辑 不需要浏览器: 页面里有好几个播放器时 资源该算谁的
'use strict';
const path = require('node:path');
const MediaOwner = require(path.join(__dirname, '..', '..', 'js', 'core', 'media-owner.js'));

let total = 0, failed = 0;
function check(title, ok, detail) {
    total++;
    ok || failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${title}${!ok && detail !== undefined ? '\n      ' + JSON.stringify(detail) : ''}`);
}
const item = (url, getTime, extra = {}) => ({ url, getTime, parsing: /\.m3u8/.test(url) ? 'm3u8' : false, ext: url.split('?')[0].split('.').pop(), ...extra });
const names = (set) => [...set].map((value) => new URL(value.url).pathname.slice(1));
// 推特的写法: 封面和视频在同一个编号下 分片的文件名是随机的
const V = 'https://video.twimg.com/', P = 'https://pbs.twimg.com/';
function tweet(kind, id, time, segments = 4) {
    const base = `${V}${kind}/${id}/${kind == 'ext_tw_video' ? 'pu/' : ''}`;
    const list = [
        item(`${base}pl/master${id.slice(-4)}.m3u8?tag=14&v=ba2&variant_version=1`, time),
        item(`${base}pl/avc1/720x1280/video${id.slice(-4)}.m3u8`, time + 80),
        item(`${base}pl/mp4a/128000/audio${id.slice(-4)}.m3u8`, time + 90),
        item(`${base}vid/avc1/0/0/720x1280/init${id.slice(-4)}.mp4`, time + 150),
        item(`${base}aud/mp4a/0/0/128000/init${id.slice(-4)}a.mp4`, time + 160),
    ];
    for (let n = 0; n < segments; n++) {
        list.push(item(`${base}vid/avc1/${n * 3000}/${n * 3000 + 3000}/720x1280/${Math.random().toString(36).slice(2, 12)}Qw.m4s`, time + 300 + n * 500));
        list.push(item(`${base}aud/mp4a/${n * 3000}/${n * 3000 + 3000}/128000/${Math.random().toString(36).slice(2, 12)}Zx.m4s`, time + 320 + n * 500));
    }
    return list;
}
const poster = (kind, id) => `${P}${kind}_thumb/${id}/${kind == 'ext_tw_video' ? 'pu/' : ''}img/-7zXQwb6XzucZXuw.jpg`;
const player = (hints, starts, present = true, extra = {}) => ({ srcs: ['blob:https://x.com/' + Math.random()], hints, starts, present, ...extra });
console.log('== 资源归属 ==');

{
    const ids = MediaOwner.tokens(poster('amplify_video', '2122609008137945088'));
    check('编号: 取出推特封面地址里的媒体编号', ids.includes('2122609008137945088') && !ids.includes('amplify_video_thumb') && !ids.includes('img'), ids);
    check('编号: 分辨率 / 通用的目录名 / blob 地址 不算', MediaOwner.tokens('https://cdn.example.com/hls/stream_1/1080x1920/seg-12.ts').length == 0 && MediaOwner.tokens('blob:https://x.com/c0a90441-b5e2-4f1a-9d53-0e8a8f1c2d3e').length == 0, MediaOwner.tokens('https://cdn.example.com/hls/stream_1/1080x1920/seg-12.ts'));
}

// 信息流: 两个视频相差 1 毫秒开始加载 (推特会成对预加载) 还有一个已经滚出页面的视频
{
    const a = '2122609008137945088', b = '2122633919434485760', gone = '2122091460132732928';
    const resources = [...tweet('amplify_video', a, 1600), ...tweet('ext_tw_video', b, 1601), ...tweet('amplify_video', gone, 200)].sort((x, y) => x.getTime - y.getTime);
    const players = [
        player([poster('amplify_video', a)], [1583]),
        player([poster('ext_tw_video', b)], [1584]),
        player([poster('amplify_video', gone)], [150], false, { end: 1500 }),
    ];
    const [ra, rb, rg] = MediaOwner.assign(players, resources);
    check('信息流: 每个视频只拿到自己编号下的资源', ra.own.size == 13 && rb.own.size == 13 && [...ra.own].every((value) => value.url.includes(a)) && [...rb.own].every((value) => value.url.includes(b)), [ra.own.size, rb.own.size]);
    const main = (result) => names(new Set([...result.own].filter((value) => !result.parts.has(value))));
    check('信息流: 要单独列出的只有主清单 子清单和分片归到组成部分', main(ra).length == 1 && main(ra)[0].includes('/pl/master') && ra.parts.size == 12 && main(rb).length == 1 && main(rb)[0].includes('/pu/pl/master'), { a: main(ra), b: main(rb) });
    check('信息流: 滚出页面的视频的资源 不算到剩下的视频头上', rg.own.size == 0 && ![...ra.own, ...rb.own].some((value) => value.url.includes(gone)));
    // 只剩一个视频在页面里
    const [only] = MediaOwner.assign([players[0], { ...players[1], present: false, end: 5000 }, players[2]], resources);
    check('信息流: 页面里只剩一个视频时 它也只拿自己的', only.own.size == 13 && [...only.own].every((value) => value.url.includes(a)), only.own.size);
    // 滚回去 同一个视频的元素被重新创建 (封面相同)
    const [old, again] = MediaOwner.assign([{ ...players[0], present: false, end: 5000 }, player([poster('amplify_video', a)], [9000])], resources);
    check('信息流: 滚回去重新创建的视频 能拿回之前嗅探到的资源', old.own.size == 0 && again.own.size == 13, [old.own.size, again.own.size]);
    // 同一个视频在页面里出现两次
    const [first, second] = MediaOwner.assign([players[0], player([poster('amplify_video', a)], [1700])], resources.filter((value) => value.url.includes(a)));
    check('信息流: 同一个视频出现两次 两个都有', first.own.size == 13 && second.own.size == 13, [first.own.size, second.own.size]);
}

// 封面里没有编号的视频 (推特有的封面是 media/xxx.jpg) 按时间分 不和已经靠编号对上的视频抢
{
    const a = '2122609008137945088', c = '2122379345549516800';
    const resources = [...tweet('amplify_video', a, 1600), ...tweet('amplify_video', c, 1650)].sort((x, y) => x.getTime - y.getTime);
    const [ra, rc] = MediaOwner.assign([player([poster('amplify_video', a)], [1583]), player([`${P}media/HXQAdFVawAAQ4cs.jpg`], [1584])], resources);
    check('封面没有编号的视频: 拿到剩下的资源 靠编号对上的视频不受影响', ra.own.size == 13 && rc.own.size == 13 && [...rc.own].every((value) => value.url.includes(c)) && rc.parts.size == 0, [ra.own.size, rc.own.size, rc.parts.size]);
}

// 好几个播放器都有的编号 (账号) 不能用来对应
{
    const resources = [item('https://cdn.example.com/u/channel20240117/v/aaaa1111bbbb/index.m3u8', 1000), item('https://cdn.example.com/u/channel20240117/v/cccc2222dddd/index.m3u8', 5000)];
    const [x, y] = MediaOwner.assign([
        player(['https://img.example.com/u/channel20240117/cover/aaaa1111bbbb.jpg'], [900]),
        player(['https://img.example.com/u/channel20240117/cover/cccc2222dddd.jpg'], [4900]),
    ], resources);
    check('共用的编号: 不参与对应 各自的编号仍然有效', names(x.own).join() == 'u/channel20240117/v/aaaa1111bbbb/index.m3u8' && names(y.own).join() == 'u/channel20240117/v/cccc2222dddd/index.m3u8', { x: names(x.own), y: names(y.own) });
}

// 没有封面的普通页面 和原来一样
{
    const resources = [item('https://cdn.example.com/live/index.m3u8', 1000), item('https://cdn.example.com/live/seg-1.ts', 1500), item('https://cdn.example.com/live/seg-2.ts', 90000)];
    const [single] = MediaOwner.assign([player([], [900])], resources);
    check('普通页面: 只有一个播放器 全部归它', single.own.size == 3 && single.parts.size == 0, single.own.size);
    const [p1, p2] = MediaOwner.assign([player([], [900]), player([], [80000])], resources);
    check('普通页面: 两个播放器按开始加载的时间就近分', p1.own.size == 2 && p2.own.size == 1, [p1.own.size, p2.own.size]);
    const direct = { srcs: ['https://cdn.example.com/a.mp4'], hints: [], starts: [100], present: true };
    const [d, m] = MediaOwner.assign([direct, player([], [900])], [item('https://cdn.example.com/a.mp4', 120), ...resources]);
    check('普通页面: 地址相同的直接对上 其余的归另一个', names(d.own).join() == 'a.mp4' && m.own.size == 3, { d: names(d.own), m: m.own.size });
}

// 已经移除的播放器
{
    const ad = [item('https://ads.example.com/spot/ad.m3u8', 1000), item('https://ads.example.com/spot/ad-1.ts', 1300)];
    const main = [item('https://cdn.example.com/show/index.m3u8', 20000), item('https://cdn.example.com/show/seg-1.ts', 20500), item('https://cdn.example.com/show/seg-900.ts', 900000)];
    const [gone, now] = MediaOwner.assign([player([], [900], false, { end: 15000 }), player([], [19900])], [...ad, ...main]);
    check('移除的播放器: 它的资源不算给后来的播放器', gone.own.size == 0 && now.own.size == 3 && [...now.own].every((value) => value.url.includes('/show/')), names(now.own));
    // 悬停预览之类的短命播放器 不能把长时间播放的视频后面的分片带走
    const [long, preview] = MediaOwner.assign([player([], [900]), player([], [400000], false, { end: 410000 })], [item('https://cdn.example.com/show/index.m3u8', 1000), item('https://cdn.example.com/show/seg-900.ts', 900000)]);
    check('移除的播放器: 离开之后出现的资源和它无关', long.own.size == 2 && preview.own.size == 0, long.own.size);
}

// 页面内解码得到的轨道
{
    const resources = [item('https://www.example.com/beep.mp3', 1000), item('https://www.example.com/track-video', 1200, { capture: {} }), item('https://www.example.com/track-audio', 1200, { capture: {} })];
    const [only] = MediaOwner.assign([player([], [900])], resources);
    check('页面内解码的轨道: 有它们时 其他对不上的资源不算播放器的', only.own.size == 2 && [...only.own].every((value) => value.capture), names(only.own));
}

console.log(`${total - failed}/${total} 通过`);
process.exit(failed ? 1 : 0);
