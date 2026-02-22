import sys
import os
from typing import List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzer.base import BaseAnalyzer
from models.resource import ResourceType, MediaResource
from utils.http import HttpClient
from utils.m3u8_parser import M3U8Parser


class HlsAnalyzer(BaseAnalyzer):
    """HLS (m3u8) 分析器"""

    def __init__(self, client: HttpClient = None):
        self.client = client or HttpClient()

    @property
    def name(self) -> str:
        return "HLS Analyzer"

    def analyze(self, url: str) -> List[MediaResource]:
        """分析m3u8 URL"""
        resources = []

        try:
            parser = M3U8Parser.fetch(url, self.client)

            if parser.is_master():
                # Master playlist - 可能有多个质量选项
                streams = parser.parse_master()
                for stream in streams:
                    resources.append(MediaResource(
                        url=stream.url,
                        type=ResourceType.HLS,
                        title=self._extract_title(stream.url),
                        quality=stream.resolution,
                        segments=[]
                    ))
            else:
                # Media playlist
                segments = parser.parse_media()
                resources.append(MediaResource(
                    url=url,
                    type=ResourceType.HLS,
                    title=self._extract_title(url),
                    segments=[seg.url for seg in segments]
                ))

        except Exception as e:
            print(f"分析HLS失败: {e}")

        return resources

    def _extract_title(self, url: str) -> str:
        """从URL提取标题"""
        filename = url.split('/')[-1]
        if filename.endswith('.m3u8'):
            return filename[:-5]
        return filename
