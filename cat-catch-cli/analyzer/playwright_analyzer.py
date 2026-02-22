import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List
from analyzer.base import BaseAnalyzer
from models.resource import ResourceType, MediaResource
from urllib.parse import urlparse


class PlaywrightAnalyzer(BaseAnalyzer):
    """使用 Playwright 渲染页面并提取视频资源"""

    def __init__(self, browser_type: str = 'chromium'):
        self.browser_type = browser_type

    @property
    def name(self) -> str:
        return "Playwright Analyzer"

    def analyze(self, url: str) -> List[MediaResource]:
        """使用 Playwright 获取页面中的视频资源"""
        from playwright.sync_api import sync_playwright

        resources = []
        video_urls = set()  # 用于去重

        try:
            with sync_playwright() as p:
                # 启动浏览器
                if self.browser_type == 'chromium':
                    browser = p.chromium.launch(headless=True)
                elif self.browser_type == 'firefox':
                    browser = p.firefox.launch(headless=True)
                elif self.browser_type == 'webkit':
                    browser = p.webkit.launch(headless=True)
                else:
                    browser = p.chromium.launch(headless=True)

                context = browser.new_context(
                    user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                )
                page = context.new_page()

                # 记录所有网络请求
                def handle_request(request):
                    url = request.url
                    # 匹配常见的视频 URL 模式
                    if any(ext in url.lower() for ext in ['.mp4', '.m3u8', '.webm', '.flv']):
                        video_urls.add(url)
                    # 匹配 B站 API
                    if 'bilibili.com/video' in url and 'playurl' in url:
                        video_urls.add(url)

                page.on('request', handle_request)

                # 访问页面
                page.goto(url, wait_until='domcontentloaded', timeout=30000)

                # 等待视频元素加载
                try:
                    page.wait_for_selector('video', timeout=10000)
                except:
                    pass

                # 等待更长时间让 JavaScript 执行和请求发出
                page.wait_for_timeout(8000)

                # 尝试点击播放按钮来触发视频加载
                try:
                    page.click('.bpx-player-ctrl-play', timeout=3000)
                    page.wait_for_timeout(3000)
                except:
                    pass

                # 检查所有收集到的 URL
                for video_url in video_urls:
                    if video_url.startswith('http'):
                        # 判断类型
                        if '.m3u8' in video_url:
                            resource_type = ResourceType.HLS
                        elif '.mpd' in video_url:
                            resource_type = ResourceType.DASH
                        elif '.mp4' in video_url or '.webm' in video_url:
                            resource_type = ResourceType.VIDEO
                        elif '.mp3' in video_url or '.m4a' in video_url:
                            resource_type = ResourceType.AUDIO
                        else:
                            resource_type = ResourceType.VIDEO

                        resources.append(MediaResource(
                            url=video_url,
                            type=resource_type,
                            title=self._extract_title(video_url)
                        ))

                # 获取页面中所有 video 和 audio 元素的 src
                video_srcs = page.evaluate("""
                    () => {
                        const videos = [];
                        document.querySelectorAll('video').forEach(v => {
                            if (v.src && v.src.startsWith('http')) {
                                videos.push({
                                    src: v.src,
                                    type: 'video',
                                    currentSrc: v.currentSrc,
                                    duration: v.duration
                                });
                            }
                            // 检查 source 子元素
                            v.querySelectorAll('source').forEach(s => {
                                if (s.src && s.src.startsWith('http')) {
                                    videos.push({
                                        src: s.src,
                                        type: s.type || 'video',
                                        duration: v.duration
                                    });
                                }
                            });
                        });
                        return videos;
                    }
                """)

                for video in video_srcs:
                    src = video.get('currentSrc') or video.get('src')
                    if src and src.startswith('http'):
                        resources.append(MediaResource(
                            url=src,
                            type=ResourceType.VIDEO,
                            title=self._extract_title(src),
                            duration=video.get('duration')
                        ))

                # 尝试获取 audio 元素
                audio_srcs = page.evaluate("""
                    () => {
                        const audios = [];
                        document.querySelectorAll('audio').forEach(a => {
                            if (a.src && a.src.startsWith('http')) {
                                audios.push({
                                    src: a.src,
                                    currentSrc: a.currentSrc,
                                    duration: a.duration
                                });
                            }
                            a.querySelectorAll('source').forEach(s => {
                                if (s.src && s.src.startsWith('http')) {
                                    audios.push({
                                        src: s.src,
                                        duration: a.duration
                                    });
                                }
                            });
                        });
                        return audios;
                    }
                """)

                for audio in audio_srcs:
                    src = audio.get('currentSrc') or audio.get('src')
                    if src and src.startswith('http'):
                        resources.append(MediaResource(
                            url=src,
                            type=ResourceType.AUDIO,
                            title=self._extract_title(src),
                            duration=audio.get('duration')
                        ))

                # 尝试获取 embeded video (iframe 中的视频)
                iframes = page.evaluate("""
                    () => {
                        const results = [];
                        document.querySelectorAll('iframe').forEach(iframe => {
                            try {
                                if (iframe.src && iframe.src.includes('video')) {
                                    results.push(iframe.src);
                                }
                            } catch(e) {}
                        });
                        return results;
                    }
                """)

                # 关闭浏览器
                context.close()
                browser.close()

        except Exception as e:
            print(f"Playwright 分析失败: {e}")

        return resources

    def _extract_title(self, url: str) -> str:
        """从URL提取标题"""
        parsed = urlparse(url)
        filename = parsed.path.split('/')[-1]
        if filename:
            # 移除查询参数
            filename = filename.split('?')[0]
            return filename
        return "未命名"
