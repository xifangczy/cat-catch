# 回归测试

用本机的 Chrome 加载未打包的扩展，在本地起一个测试站点，模拟各种网站的行为，检查扩展的表现。只用 Node 自带的模块，不需要 `npm install`。

```bash
node tests/run.js            # 全部
node tests/run.js resume     # 只跑文件名里带 resume 的
```

需要 Node 18 以上和 Google Chrome（要用 Chrome，Chromium 没有 H.264 / AAC 解码器）。找不到 Chrome 时用环境变量 `CHROME` 指定路径；`CAT_CATCH_EXT` 可以指定被测的扩展目录，默认是仓库根目录。

| 文件 | 内容 |
| --- | --- |
| `cases/multi-video.js` | 一个页面多个视频时，浮窗里的资源和视频的对应关系 |
| `cases/drm-manifest.js` | 没有 pssh 的 DRM 清单、页面里用 EME 播放的媒体，要标出不能下载 |
| `cases/signed-url.js` | 带有效期和签名的切片地址；签名变了之后接着上次的进度下载 |
| `cases/service-worker.js` | Service Worker 发起的请求归到正确的标签 |
| `cases/stream-save.js` | 边下边存：多线程乱序完成时按顺序写入，边下边写 |
| `cases/resume.js` | 下载到一半结束浏览器进程，重启后只下载剩下的切片 |

`lib/harness.js` 负责启动浏览器、加载扩展、本地站点和输出结果，`lib/parser.js` 是 m3u8 解析器页面的常用操作，`fixtures/` 是用 ffmpeg 的测试图案生成的几个很小的媒体文件。

加一组测试：在 `cases/` 下新建文件，照着现有的写。被测的功能不在当前版本里时用 `c.skip()` 跳过。测试之间不要并行。
