## 简介
猫抓 Chrome资源嗅探扩展

## 安装地址
### Chrome
https://chrome.google.com/webstore/detail/jfedfbgedapdagkghmgibemcoggfppbb
### Edge
https://microsoftedge.microsoft.com/addons/detail/oohmdefbjalncfplafanlagojlakmjci

目前上架版本BUG较多，审核新版本非常漫长，优先使用GitHub里Releases发布的版本。非Crhome浏览器可以使用crx文件。
接下来还是GitHub版本为主 避免官方再次下架扩展。

## 源码加载方法
1. https://github.com/xifangczy/cat-catch/releases 下载 Source code 并解压。
2. Chrome扩展管理页面 chrome://extensions/ 右上角 打开 "开发者模式"。
3. 左上角点击 "加载已解压的扩展程序" 然后选中你解压好的猫抓的目录即可。

## 幽灵数据？
之前版本经常出现某条资源不属于任何网页（具体原因不详，有可能是因为通过JS加载的视频 Chrome无法判断来源页面），老版本会丢弃该数据。1.0.17之后得到修复并称这部分数据称为“幽灵数据”。

## 更新说明
### 1.0.21
自定义抓取类型, 设置页面新界面
### 1.0.20
一些小修改 设置增加抓取image/*类型文件选项，避免网站把媒体伪装成图片导致无法抓取。
### 1.0.19
重写导致的巨多BUG修复
### 1.0.18
增加application/octet-stream选项，继续部分代码重写
### 1.0.17
Manifest 更新到 V3 部分代码重写，增加“使用PotPlayer预览媒体”选项。

## License
MIT