## 更新说明
### 2.0.0
[Changed] 模拟手机端，现在会修改navigator.userAgent变量

[Added] 视频捕获功能，解决被动嗅探无法下载视频的问题。

[Added] 支持N_m3u8DL-CLI的m3u8dl://协议

[Added] m3u8解析增强，现在能合并下载m3u8文件，通过修改Referer能够下载更多文件。

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