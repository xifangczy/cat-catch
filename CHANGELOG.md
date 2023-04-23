## 更新说明
### 2.3.3
[Changed] 解析器m3u8DL默认不载入设置参数 #149

[Changed] 可以同时打开多个捕获脚本

[Changed] popup页面 css细节调整 #156

[Fixed] 清空不会删除角标的bug

[Fixed] 替换标签中 参数内包含 "|" 字符处理不正确的bug

### 2.3.2
[Changed] 设置 增加自定义文件名 删除标题正则提取

[Added] 支持深色模式 #134

[Added] popup 增加筛选

[Fixed] 修复非加密的m3u8 无法自定义密钥下载

[Fixed] mp4转码删除 创建媒体日期 属性 #142
### 2.3.1
[Added] 新的替换标签

[Changed] 边下边存 支持mp4转码

[Fixed] 修复BUG #123 #117 #114 #124
### 2.3.0
[Added] m3u8解析器 边下边存

[Added] m3u8解析器 在线ffmpeg转码

[Fixed] 特殊文件名 下载所选无法下载

[Fixed] m3u8解析器 某些情况无法下载文件

[Fixed] Header属性提取失败

[Fixed] 添加抓取类型出错 #109

[Changed] 修改 标题修剪 默认配置
### 2.2.9
[Fixed] 修复 m3u8DL调用命令范围参数 --downloadRange 不正确

[Added] 正则修剪标题 [#90](https://github.com/xifangczy/cat-catch/issues/94)

[Added] 下载前选择保存目录 选项

[Fixed] m3u8解析器 部分情况无法下载ts文件

[Changed] `复制所选`按钮 现在能被 `复制选项`设置影响
### 2.2.8
[Changed] m3u8解析器现在会记忆你设定的参数

[Changed] 幽灵数据 更改为 其他页面(幽灵数据同样归类其他页面)

[Changed] popup页面的性能优化

[Changed] 增加 始终不启用下载器 选项

[Fixed] 修复 使用第三方下载器猫抓下载器也会被调用
### 2.2.7
[Fixed] 修正 文件大小显示不正确

[Changed] 性能优化

[Fixed] 修复 没有正确清理冗余数据 导致CPU占用问题

### 2.2.6
[Added] 深度搜索 尝试收集m3u8文件的密钥 具体使用查看 [用户文档](https://o2bmm.gitbook.io/cat-catch/docs/m3u8parse#maybekey)

[Added] popup 资源详情增加二维码按钮

[Added] m3u8解析器 自定义文件名 只要音频 另存为 m3u8DL命令完善 部分代码来自 [#80](https://github.com/xifangczy/cat-catch/pull/80)

[Added] 非Chrome扩展商店版本 现在支持Youtube

[Added] Firefox版 现在支持m3u8视频预览

[Fixed] m3u8解析器 超长名字无法保存文件 [#80](https://github.com/xifangczy/cat-catch/pull/80)

[Fixed] 修正 媒体控制 某些情况检测不到视频

### 2.2.5
[Fixed] 修复mpd解析器丢失音轨 [#70](https://github.com/xifangczy/cat-catch/issues/70)

[Changed] 优化在网络状况不佳下的直播m3u8录制

[Changed] 更新 深度搜索 search.js 进一步增加分析能力

[Changed] 减少mp4转码时内存占用

[Changed] 自定义调用本地播放器的协议

### 2.2.4
[Changed] 更新 hls.js

[Changed] m3u8文件现在能显示更多媒体信息

[Added] 增加 Dash mpd文件解析

[Added] 增加 深度搜索 脚本

[Fixed] 修复 捕获按钮偶尔失效

### 2.2.3
[Added] m3u8解析器增加录制直播

[Added] m3u8解析器增加处理EXT-X-MAP标签

[Added] 新增捕获脚本 recorder2.js 需要Chromium 104以上版本

[Added] 增加选项 刷新、跳转到新页面 清空当前标签抓取的数据

[Fixed] 修正 m3u8解析器使用mp4转码生成的文件，媒体时长信息不正确

### 2.2.2
[Changed] m3u8解析器使用hls.js替代，多项改进，自定义功能添加

[Changed] 分离下载器和m3u8解析器

[Fixed] 修复 m3u8解析器`调用N_m3u8DL-CLI下载`按钮失效

[Fixed] 修复幽灵数据随机丢失问题

[Fixed] 修复m3u8解析器key下载器在某些时候无法下载的问题

### 2.2.1
[Fixed] 修复浏览器字体过大，按钮遮挡资源列表的问题。

[Fixed] 调整关键词替换

[Fixed] 修复Firefox download API无法下载data URL问题

[Changed] m3u8解析器多个KEY显示问题

[Changed] 视频控制现在可以控制其他页面的视频

[Changed] 视频控制现在可以对视频截图

[Changed] 自定义复制选项增加 其他文件 选项

[Added] m3u8解析器现在可以转换成mp4格式

### 2.2.0
[Fixed] 修复文件名出现 "~" 符号 导致chrome API无法下载

[Fixed] 修复Firefox中popup页面下载按钮被滚动条遮挡

[Fixed] 储存路劲有中文时 m3u8dl协议调用错误

[Changed] 增加/删除一些默认配置

[Added] 增加操控当前网页视频功能

[Added] 增加自定义复制选项

### 2.1.2
[Changed] 细节调整

### 2.1.1
[Changed] 调整正则匹配 现在能提取多个网址

[Fixed] 修复选择脚本在m3u8解析器里不起作用 并提高安全性

[Fixed] m3u8解析器在Firefox中不能正常播放m3u8视频

[Fixed] 修复Firefox中手机端模拟无法还原的问题

[Fixed] 修复初始化错误BUG 导致扩展失效

### 2.1.0
[Changed] 新增referer获取 不存在再使用initiator或者直接使用url

[Changed] 重新支持Firefox 需要93版本以上

[Changed] chromium内核的浏览器最低要求降为93 小部分功能需要102版本以上，低版本会隐藏功能按钮

[Fixed] 部分m3u8 key文件解析错误问题

[Fixed] 修复 保存文件名使用网页标题 选项在m3u8解析器里不起作用

### 2.0.0
[Changed] 模拟手机端，现在会修改navigator.userAgent变量

[Added] 视频捕获功能，解决被动嗅探无法下载视频的问题

[Added] 视频录制功能，解决被动嗅探无法下载视频的问题

[Added] 支持N_m3u8DL-CLI的m3u8dl://协议

[Added] m3u8解析器增强，现在能在线合并下载m3u8文件

[Added] popup页面无法下载的视频，会交给m3u8解析器修改Referer下载

[Added] popup页面和m3u8页面可以在线预览m3u8

[Added] json查看工具，和m3u8解析器一样在popoup页面显示图标进入

[Fixed] 无数BUG

[Fixed] 解决1.0.17以来会丢失数据的问题

[Fixed] 该死的Service Worker... 现在后台被杀死能立刻唤醒自己... 继续用肮脏的手段对抗Manifest V3

### 1.0.26
[Fixed] 解决关闭网页不能正确删除当前页面储存的数据问题

### 1.0.25
[Changed] 正则匹配增强

[Changed] Heart Beat

[Added] 手机端模拟，手机环境下有更多资源可以被下载。

[Added] 自动下载

### 1.0.24
[Added] 导入/导出配置

[Added] Heart Beat 解决Service Worker休眠问题

[Added] firefox.js兼容层 并上架Firefox

### 1.0.23
[Added] 正则匹配

### 1.0.22
[Fixed] 一个严重BUG，导致Service Worker无法使用 *

### 1.0.21
[Added] 自定义抓取类型

[Refactor] 设置页面新界面

### 1.0.20
[Added] 抓取image/*类型文件选项

### 1.0.19
[Fixed] 重构导致的许多BUG *

### 1.0.18
[Added] 抓取application/octet-stream选项

[Refactor] 重构剩余代码

### 1.0.17
[Refactor] Manifest 更新到 V3 部分代码

[Added] 使用PotPlayer预览媒体