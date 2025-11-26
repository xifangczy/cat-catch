## 更新说明

### 2.6.5

[Added] 部分网站不希望被本扩展抓取 添加 全局强制屏蔽 [屏蔽列表](https://o2bmm.gitbook.io/cat-catch/blockedsite)

[Added] 增加土耳其语 感谢 @ilker-binzet

[Added] 增加西班牙语 感谢 @Oleada1

[Fixed] 部分浏览器 侧边栏无法使用问题

[Fixed] 发送到 Aria2 User-Agent 传递错误

[Fixed] 模板标签替换 双引号处理错误

[Fixed] 导入配置时部分设置丢失问题

[Fixed] 深度搜索导致部分网站无法正常使用问题

### 2.6.4

[Updated] webrtc 录制脚本 更新

[Updated] 深度搜索脚本 更新

[Updated] 更新日语 感谢@hmaoraze

[Added] 支持 MQTT 协议 感谢@jetsung

[Added] 筛选 删除重复文件名

[Added] 始终打开 深度搜索 选项 (慎用)

[Added] 弹出模式 可选择页面

[Added] 筛选页面 支持时长排序

### 2.6.3

[Fixed] Chromium 114 版本以下缺少 `sidePanel` 功能，导致扩展无法使用

### 2.6.2

[Added] m3u8 解析器 录制失败重试功能 (测试)

[Added] m3u8 解析器 尝试估算文件大小

[Added] 增加 其他设置 `使用侧边栏` 选项。从 popup 模式改为浏览器侧边栏打开扩展 (不支持 firefox)

[Updated] m3u8 预览现在支持 hevc/h265 编码

[Updated] 深度搜索 支持解析 vimeo playlist.json

[Changed] 重构 缓存捕捉 脚本 减少头部数据缺失问题

[Changed] 重构 排除重复的资源 减少资源占用

[Fixed] 缓存捕捉脚本导致视频无法播放问题

[Deleted] m3u8 解析器 删除了旧版本下载器

[Deleted] 启用新弹出页 删除旧弹出页

### 2.6.1

[Changed] 对手机浏览器进行一些适配

### 2.6.0

[Added] 全新的弹出页面(`弹出`按钮) 文件预览/筛选帮助你下载需要的文件 (设置`feat newPopup`关闭新版)

[Changed] 增强数据发送功能，现在能自定义发送数据 感谢 @helson-lin 的支持

[Changed] 正则匹配 现在能获取到请求头

[Changed] 支持夸克浏览器 (部分功能不可用)

[Updated] 深度搜索脚本 找到更多资源

[Fixed] Fifefox 导入功能 bug 导致扩展不可用

[Fixed] 偶尔会弹出多个 ffmpeg 页面的 bug

[Fixed] 下载器 打开`边下边存` 无法自动关闭的 bug

### 2.5.9

[Added] 增加屏蔽网址功能 添加不希望开启扩展的网站 (可设为白名单, 只允许添加网址开启扩展)

[Fixed] 新版下载器 下载大文件时 出错 #610

[Changed] 限制每页面最大储存 9999 条资源

[Changed] 设置增加导航栏

[Changed] 自动下载 允许自定义保存文件名

### 2.5.8

[Changed] 如果资源 url 不存在文件名 尝试使用页面标题作为文件名

### 2.5.7

[Fixed] 自定义保存文件名使用 `/` 无法创建目录

[Changed] firefox 升级 manifest v3

[Changed] firefox 128 以上版本 支持使用深度搜索 缓存录制 等脚本功能

[Fixed] firefox 无法发送到在线 ffmpeg 问题

[Added] 重构 猫抓下载器 如需旧版本请在设置 关闭 `Test version` 选项

[Added] `URL Protocol m3u8dl` `调用程序` 增加下载前确认参数设置

[Added] m3u8 为疑似密钥增加验证密钥功能

[Changed] 增强 深度搜索 现在能找到更多疑似密钥

### 2.5.6

[Fixed] m3u8 解析器 自动关闭 bug #531

[Fixed] chrome 130 自定义 url 新规范导致 `m3u8dl://` 调用失败 #528

[Fixed] m3u8 解析器 文件不正确无法解析 造成死循环占用 CPU 问题

[Changed] 猫抓下载器 添加更多请求头 增加下载成功率

### 2.5.5

[Fixed] 修复一个严重 bug #483

[Added] 在线 ffmpeg 提供服务器选择

[Fixed] m3u8 解析器 文件名存在`|`字符 无法下载问题

[Changed] 发送数据 提供完整请求头

### 2.5.4

[Added] m3u8DL 增加切换 RE 版本 (RE 版 需[URLProtocol](https://github.com/xifangczy/URLProtocol))

[Added] 录制相关脚本 增加码率设置

[Fixed] 深度搜索 脚本错误导致无法使用

[Fixed] m3u8 解析器录制直播 录制时间显示错误

### 2.5.3

[Added] 增加`弹出`模式 (以新窗口打开资源列表页面)

[Added] 增加`调用本地程序`设置, 程序没有调用协议, 可以使用[URLProtocol](https://github.com/xifangczy/URLProtocol)帮助程序注册调用协议。具体使用方法查看 [调用本地协议](https://o2bmm.gitbook.io/cat-catch/docs/invoke)

[Added] 下载器 增加`边下边存`选项 可以用来下载一些直播视频链接

[Added] 现在使用`深度搜索` 或其他脚本得到的疑似密钥, 直接显示在 popup 页面 `疑似密钥` 标签内。

[Added] 增加 葡萄牙语

[Changed] 重写 `录制webRTC` 脚本

[Changed] `m3u8解析器` `下载器`页面内更改设置不会被储存。所有设置更改统一到扩展设置页面。

[Changed] storage.local 更改为 storage.session 以减少 IO 错误导致扩展无法使用.(要求 chrome 104 以上)

[Changed] 优化与 ffmpeg 网页端的通信, 避免多任务时的数据错乱。
(请提前打开 [在线 ffmpeg](https://ffmpeg.bmmmd.com/) ctrl+f5 刷新页面 避免页面缓存造成的问题)

[Changed] 稍微增大一些按钮图标 不再训练大家的鼠标精准度 🙄...如果你不喜欢想还原 设置-自定义 css 填入 `body{font-size:12px;width:550px;}.icon,.favicon{width:18px;height:18px;}.DownCheck{width:15px;height:15px;}`

### 2.5.2

[Added] 添加测试功能 数据发送 嗅探数据和密钥发送到指定地址

[Added] 替换标签 增加 `${origin}`

[Added] 显示 图标数字角标 开关

[Fixed] 猫抓下载器 小部分网站需要指定 range

[Fixed] 修复 标题作为文件名 文件名含有非法字符问题 #339

### 2.5.1

[Added] 多语言 增加繁体中文

[Fixed] 修复 深度搜索 死循环 bug

[Fixed] 兼容低版本 chromium 缺少 API 导致扩展无法使用

[Changed] popup 页面 现在能合并两个 m3u8 文件

### 2.5.0

[Added] 多语言支持

[Changed] m3u8 解析 新下载器 性能优化

[Fixed] 视频捕捉 不使用`从头捕获`也会丢掉头部数据的问题

[Changed] 深度搜索 现在能找到更多密钥

### 2.4.9

[Fixed] `$url$` 标签 修复(自动更新成`${url}`) #281

[Fixed] 修复 加密 m3u8 存在 EXT-X-MAP 标签，解密会失败的 bug

[Added] 设置页面 添加自动合并 m3u8 选项 #286 (测试)

[Added] 增加录制 webRTC 流脚本 更多功能-录制 webRTC (测试)

### 2.4.8

[Fixed] 修复 m3u8 新下载器 ${referer} 标签问题 #272

[Fixed] 修复 m3u8 新下载器 全部重新下载 bug #274

[Fixed] 修复 m3u8 新下载器 下载失败丢失线程 #276

[Fixed] 修复 m3u8 新下载器 勾选 ffmpeg 转码 下载超过 2G 大小 不会强制下载

[Changed] 完善 Aria2 Rpc 协议 增加密钥 和 cookie 支持

[Added] 增加${cookie}标签 如果资源存在 cookie

### 2.4.7

[Fixed] 缓存捕获 延迟获取标题 #241

[Fixed] 特殊字符造成无法下载的问题 #253

[Fixed] m3u8 解析器 没有解析出全部嵌套 m3u8 的 bug #265

[Added] firefox 增加 privacy 协议页面 第一次安装显示

[Added] 增加 Aria2 Rpc 协议下载 感谢 @aar0u

[Changed] 重写录制脚本

[Changed] 增强深度搜索

[Changed] m3u8 解析器 现在可以自定义头属性

[Changed] m3u8 解析器 最大下载线程调整为 6

[Changed] m3u8 解析器 默认开启新下载器

### 2.4.6

[Fixed] 缓存捕获 多个视频问题 #239

[Changed] 更新 mux m3u8-decrypt mpd-parser 版本

[Changed] 设置 刷新跳转清空当前标签抓取的数据 现在可以调节模式

[Changed] firefox 版本要求 113+

[test] m3u8 解析器 增加测试项 `重构的下载器`

### 2.4.5

[Changed] 增强 深度搜索 解决"一次性"m3u8

[Changed] m3u8 解析器 下载范围允许填写时间格式 HH:MM:SS

[Added] 增加 缓存捕获 从头捕获、正则提取文件名、手动填写文件名

[Added] 增加 设置 正则匹配 屏蔽资源功能

[Added] 增加 下载器 后台打开页面设置

[deleted] 删除 "幽灵资源" 设定 不确定来源的资源归于当前标签

[Fixed] 修复 缓存捕获 清理缓存

[Fixed] 修复 正则匹配 有时会匹配失效(lastIndex 没有复位)

[Fixed] 修复 媒体控制 有时检测不到媒体

[Fixed] 修复 重置所有设置 丢失配置

[Fixed] 修复 firefox 兼容问题

### 2.4.4

[Changed] 增强 深度搜索

[Fixed] m3u8 解析器 无限触发错误的 bug

### 2.4.3

[Fixed] 修复 缓存捕获 获取文件名为空

[Changed] 增强 深度搜索 可以搜到更多密钥

[Changed] 增强 注入脚本 现在会注入到所有 iframe

[Changed] 删除 youtube 支持 可以使用缓存捕捉

### 2.4.2

[Added] 设置页面增加 排除重复的资源 选项

[Added] popup 增加暂停抓取按钮

[Changed] 超过 500 条资源 popup 可以中断加载

[Changed] 调整默认配置 默认不启用 ts 文件 删除多余正则

[Changed] 正则匹配的性能优化

[Fixed] 修复 m3u8 解析器录制功能 直播结束导致自动刷新页面丢失已下载数据的问题

[Fixed] 修复 m3u8 解析器边下边存和 mp4 转码一起使用 编码不正确的 bug

[Fixed] 修复 扩展重新启动后 造成的死循环

### 2.4.1

[Added] 捕获脚本 现在可以通过表达式获取文件名

[Changed] 删除 打开自动下载的烦人提示

[Changed] 优化 firefox 下 资源严重占用问题

[Fixed] 猫抓下载器 不再限制 2G 文件大小 #179

### 2.4.0

[Added] 加入自定义 css

[Added] 音频 视频 一键合并

[Added] popup 页面正则筛选

[Added] 自定义快捷键支持

[Added] popup 页面支持正则筛选

[Added] m3u8 碎片文件自定义参数

[Changed] 筛选 现在能隐藏不要的数据 而不是取消勾选

[Changed] 重写优化 popup 大部分代码

[Changed] 重写初始化部分代码

[Changed] m3u8 解析器 默认设置改为 ffmpeg 转码 而不是 mp4 转码

[Changed] 删除 调试模式

[Fixed] 深度搜索 深度判断的 bug

[Fixed] 很多 bug

### 2.3.3

[Changed] 解析器 m3u8DL 默认不载入设置参数 #149

[Changed] 可以同时打开多个捕获脚本

[Changed] popup 页面 css 细节调整 #156

[Fixed] 清空不会删除角标的 bug

[Fixed] 替换标签中 参数内包含 "|" 字符处理不正确的 bug

### 2.3.2

[Changed] 设置 增加自定义文件名 删除标题正则提取

[Added] 支持深色模式 #134

[Added] popup 增加筛选

[Fixed] 修复非加密的 m3u8 无法自定义密钥下载

[Fixed] mp4 转码删除 创建媒体日期 属性 #142

### 2.3.1

[Added] 新的替换标签

[Changed] 边下边存 支持 mp4 转码

[Fixed] 修复 BUG #123 #117 #114 #124

### 2.3.0

[Added] m3u8 解析器 边下边存

[Added] m3u8 解析器 在线 ffmpeg 转码

[Fixed] 特殊文件名 下载所选无法下载

[Fixed] m3u8 解析器 某些情况无法下载文件

[Fixed] Header 属性提取失败

[Fixed] 添加抓取类型出错 #109

[Changed] 修改 标题修剪 默认配置

### 2.2.9

[Fixed] 修复 m3u8DL 调用命令范围参数 --downloadRange 不正确

[Added] 正则修剪标题 [#90](https://github.com/xifangczy/cat-catch/issues/94)

[Added] 下载前选择保存目录 选项

[Fixed] m3u8 解析器 部分情况无法下载 ts 文件

[Changed] `复制所选`按钮 现在能被 `复制选项`设置影响

### 2.2.8

[Changed] m3u8 解析器现在会记忆你设定的参数

[Changed] 幽灵数据 更改为 其他页面(幽灵数据同样归类其他页面)

[Changed] popup 页面的性能优化

[Changed] 增加 始终不启用下载器 选项

[Fixed] 修复 使用第三方下载器猫抓下载器也会被调用

### 2.2.7

[Fixed] 修正 文件大小显示不正确

[Changed] 性能优化

[Fixed] 修复 没有正确清理冗余数据 导致 CPU 占用问题

### 2.2.6

[Added] 深度搜索 尝试收集 m3u8 文件的密钥 具体使用查看 [用户文档](https://o2bmm.gitbook.io/cat-catch/docs/m3u8parse#maybekey)

[Added] popup 资源详情增加二维码按钮

[Added] m3u8 解析器 自定义文件名 只要音频 另存为 m3u8DL 命令完善 部分代码来自 [#80](https://github.com/xifangczy/cat-catch/pull/80)

[Added] 非 Chrome 扩展商店版本 现在支持 Youtube

[Added] Firefox 版 现在支持 m3u8 视频预览

[Fixed] m3u8 解析器 超长名字无法保存文件 [#80](https://github.com/xifangczy/cat-catch/pull/80)

[Fixed] 修正 媒体控制 某些情况检测不到视频

### 2.2.5

[Fixed] 修复 mpd 解析器丢失音轨 [#70](https://github.com/xifangczy/cat-catch/issues/70)

[Changed] 优化在网络状况不佳下的直播 m3u8 录制

[Changed] 更新 深度搜索 search.js 进一步增加分析能力

[Changed] 减少 mp4 转码时内存占用

[Changed] 自定义调用本地播放器的协议

### 2.2.4

[Changed] 更新 hls.js

[Changed] m3u8 文件现在能显示更多媒体信息

[Added] 增加 Dash mpd 文件解析

[Added] 增加 深度搜索 脚本

[Fixed] 修复 捕获按钮偶尔失效

### 2.2.3

[Added] m3u8 解析器增加录制直播

[Added] m3u8 解析器增加处理 EXT-X-MAP 标签

[Added] 新增捕获脚本 recorder2.js 需要 Chromium 104 以上版本

[Added] 增加选项 刷新、跳转到新页面 清空当前标签抓取的数据

[Fixed] 修正 m3u8 解析器使用 mp4 转码生成的文件，媒体时长信息不正确

### 2.2.2

[Changed] m3u8 解析器使用 hls.js 替代，多项改进，自定义功能添加

[Changed] 分离下载器和 m3u8 解析器

[Fixed] 修复 m3u8 解析器`调用N_m3u8DL-CLI下载`按钮失效

[Fixed] 修复幽灵数据随机丢失问题

[Fixed] 修复 m3u8 解析器 key 下载器在某些时候无法下载的问题

### 2.2.1

[Fixed] 修复浏览器字体过大，按钮遮挡资源列表的问题。

[Fixed] 调整关键词替换

[Fixed] 修复 Firefox download API 无法下载 data URL 问题

[Changed] m3u8 解析器多个 KEY 显示问题

[Changed] 视频控制现在可以控制其他页面的视频

[Changed] 视频控制现在可以对视频截图

[Changed] 自定义复制选项增加 其他文件 选项

[Added] m3u8 解析器现在可以转换成 mp4 格式

### 2.2.0

[Fixed] 修复文件名出现 "~" 符号 导致 chrome API 无法下载

[Fixed] 修复 Firefox 中 popup 页面下载按钮被滚动条遮挡

[Fixed] 储存路劲有中文时 m3u8dl 协议调用错误

[Changed] 增加/删除一些默认配置

[Added] 增加操控当前网页视频功能

[Added] 增加自定义复制选项

### 2.1.2

[Changed] 细节调整

### 2.1.1

[Changed] 调整正则匹配 现在能提取多个网址

[Fixed] 修复选择脚本在 m3u8 解析器里不起作用 并提高安全性

[Fixed] m3u8 解析器在 Firefox 中不能正常播放 m3u8 视频

[Fixed] 修复 Firefox 中手机端模拟无法还原的问题

[Fixed] 修复初始化错误 BUG 导致扩展失效

### 2.1.0

[Changed] 新增 referer 获取 不存在再使用 initiator 或者直接使用 url

[Changed] 重新支持 Firefox 需要 93 版本以上

[Changed] chromium 内核的浏览器最低要求降为 93 小部分功能需要 102 版本以上，低版本会隐藏功能按钮

[Fixed] 部分 m3u8 key 文件解析错误问题

[Fixed] 修复 保存文件名使用网页标题 选项在 m3u8 解析器里不起作用

### 2.0.0

[Changed] 模拟手机端，现在会修改 navigator.userAgent 变量

[Added] 视频捕获功能，解决被动嗅探无法下载视频的问题

[Added] 视频录制功能，解决被动嗅探无法下载视频的问题

[Added] 支持 N_m3u8DL-CLI 的 m3u8dl://协议

[Added] m3u8 解析器增强，现在能在线合并下载 m3u8 文件

[Added] popup 页面无法下载的视频，会交给 m3u8 解析器修改 Referer 下载

[Added] popup 页面和 m3u8 页面可以在线预览 m3u8

[Added] json 查看工具，和 m3u8 解析器一样在 popup 页面显示图标进入

[Fixed] 无数 BUG

[Fixed] 解决 1.0.17 以来会丢失数据的问题

[Fixed] 该死的 Service Worker... 现在后台被杀死能立刻唤醒自己... 继续用肮脏的手段对抗 Manifest V3

### 1.0.26

[Fixed] 解决关闭网页不能正确删除当前页面储存的数据问题

### 1.0.25

[Changed] 正则匹配增强

[Changed] Heart Beat

[Added] 手机端模拟，手机环境下有更多资源可以被下载。

[Added] 自动下载

### 1.0.24

[Added] 导入/导出配置

[Added] Heart Beat 解决 Service Worker 休眠问题

[Added] firefox.js 兼容层 并上架 Firefox

### 1.0.23

[Added] 正则匹配

### 1.0.22

[Fixed] 一个严重 BUG，导致 Service Worker 无法使用 \*

### 1.0.21

[Added] 自定义抓取类型

[Refactor] 设置页面新界面

### 1.0.20

[Added] 抓取 image/\*类型文件选项

### 1.0.19

[Fixed] 重构导致的许多 BUG \*

### 1.0.18

[Added] 抓取 application/octet-stream 选项

[Refactor] 重构剩余代码

### 1.0.17

[Refactor] Manifest 更新到 V3 部分代码

[Added] 使用 PotPlayer 预览媒体
