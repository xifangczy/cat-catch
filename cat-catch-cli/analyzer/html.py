import sys
import os
import re
from typing import List
from urllib.parse import urlparse

# 添加父目录到路径以支持相对导入
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzer.base import BaseAnalyzer
from models.resource import ResourceType, MediaResource
from utils.http import HttpClient


class HtmlAnalyzer(BaseAnalyzer):
    """HTML页面分析器"""

    # 视频正则
    VIDEO_PATTERNS = [
        re.compile(r'<video[^>]+src=["\']([^"\']+)["\']', re.I),
        re.compile(r'<video[^>]+>.*?<source[^>]+src=["\']([^"\']+)["\']', re.I | re.S),
        re.compile(r'<iframe[^>]+src=["\']([^"\']+\.mp4[^"\']*)["\']', re.I),
    ]

    # 音频正则
    AUDIO_PATTERNS = [
        re.compile(r'<audio[^>]+src=["\']([^"\']+)["\']', re.I),
        re.compile(r'<audio[^>]+>.*?<source[^>]+src=["\']([^"\']+)["\']', re.I | re.S),
    ]

    # M3U8正则
    M3U8_PATTERNS = [
        re.compile(r'["\']([^"\']*\.m3u8[^"\']*)["\']', re.I),
        re.compile(r'hls\.setSource\(["\']([^"\']+)["\']', re.I),
    ]

    # MPD正则
    MPD_PATTERNS = [
        re.compile(r'["\']([^"\']*\.mpd[^"\']*)["\']', re.I),
    ]

    # 常见视频扩展名
    VIDEO_EXTENSIONS = ['.mp4', '.webm', '.m3u8', '.mpd', '.flv', '.mkv', '.avi']
    AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a']

    def __init__(self, client: HttpClient = None):
        self.client = client or HttpClient()

    @property
    def name(self) -> str:
        return "HTML Analyzer"

    def analyze(self, url: str) -> List[MediaResource]:
        """分析HTML页面"""
        resources = []

        try:
            html = self.client.get_text(url)
            base_url = self.client.get_base_url(url)

            # 提取视频
            resources.extend(self._extract_videos(html, base_url))

            # 提取音频
            resources.extend(self._extract_audios(html, base_url))

            # 提取m3u8
            resources.extend(self._extract_m3u8(html, base_url))

            # 提取mpd
            resources.extend(self._extract_mpd(html, base_url))

        except Exception as e:
            print(f"分析HTML失败: {e}")

        return resources

    def _extract_videos(self, html: str, base_url: str) -> List[MediaResource]:
        resources = []
        for pattern in self.VIDEO_PATTERNS:
            for match in pattern.finditer(html):
                url = match.group(1)
                if self._is_valid_media_url(url, 'video'):
                    resources.append(MediaResource(
                        url=url,
                        type=ResourceType.VIDEO,
                        title=self._extract_title(url)
                    ))
        return resources

    def _extract_audios(self, html: str, base_url: str) -> List[MediaResource]:
        resources = []
        for pattern in self.AUDIO_PATTERNS:
            for match in pattern.finditer(html):
                url = match.group(1)
                if self._is_valid_media_url(url, 'audio'):
                    resources.append(MediaResource(
                        url=url,
                        type=ResourceType.AUDIO,
                        title=self._extract_title(url)
                    ))
        return resources

    def _extract_m3u8(self, html: str, base_url: str) -> List[MediaResource]:
        resources = []
        for pattern in self.M3U8_PATTERNS:
            for match in pattern.finditer(html):
                url = match.group(1)
                url = self.client.join_url(base_url, url)
                if url.endswith('.m3u8'):
                    resources.append(MediaResource(
                        url=url,
                        type=ResourceType.HLS,
                        title=self._extract_title(url)
                    ))
        return resources

    def _extract_mpd(self, html: str, base_url: str) -> List[MediaResource]:
        resources = []
        for pattern in self.MPD_PATTERNS:
            for match in pattern.finditer(html):
                url = match.group(1)
                url = self.client.join_url(base_url, url)
                if url.endswith('.mpd'):
                    resources.append(MediaResource(
                        url=url,
                        type=ResourceType.DASH,
                        title=self._extract_title(url)
                    ))
        return resources

    def _is_valid_media_url(self, url: str, media_type: str) -> bool:
        """验证URL是否有效"""
        if not url:
            return False
        if url.startswith('data:'):
            return False

        ext = self._get_extension(url)
        if media_type == 'video':
            return ext in self.VIDEO_EXTENSIONS
        elif media_type == 'audio':
            return ext in self.AUDIO_EXTENSIONS
        return False

    def _get_extension(self, url: str) -> str:
        """获取文件扩展名"""
        parsed = urlparse(url)
        path = parsed.path.lower()
        for ext in self.VIDEO_EXTENSIONS + self.AUDIO_EXTENSIONS:
            if path.endswith(ext):
                return ext
        return ''

    def _extract_title(self, url: str) -> str:
        """从URL提取标题"""
        parsed = urlparse(url)
        filename = parsed.path.split('/')[-1]
        if filename:
            return filename
        return "未命名"
