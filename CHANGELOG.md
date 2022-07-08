## 更新说明
### 2.1.3
[Fixed] 修复文件名出现 "~" 符号 导致chrome API无法下载
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