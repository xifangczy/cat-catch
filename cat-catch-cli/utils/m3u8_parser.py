import re
from typing import List, Optional, Tuple, Dict
from dataclasses import dataclass


@dataclass
class M3U8Segment:
    """M3U8切片"""
    duration: float
    url: str
    title: Optional[str] = None


@dataclass
class M3U8Stream:
    """M3U8流信息"""
    bandwidth: int
    resolution: Optional[str] = None
    codecs: Optional[str] = None
    segments: List[M3U8Segment] = None


class M3U8Parser:
    """M3U8解析器"""

    # EXTINF格式: #EXTINF:<duration>,[<title>]
    EXTINF_PATTERN = re.compile(r'#EXTINF:(\d+\.?\d*),?(.*)')
    # EXT-X-STREAM-INF格式: #EXT-X-STREAM-INF:BANDWIDTH=xxx,RESOLUTION=xxx
    STREAM_INF_PATTERN = re.compile(r'#EXT-X-STREAM-INF:(.+)')
    BANDWIDTH_PATTERN = re.compile(r'BANDWIDTH=(\d+)')
    RESOLUTION_PATTERN = re.compile(r'RESOLUTION=(\d+x\d+)')
    CODECS_PATTERN = re.compile(r'CODECS="(.+?)"')
    # EXT-X-KEY格式: #EXT-X-KEY:METHOD=AES-128,URI="xxx"
    KEY_PATTERN = re.compile(r'#EXT-X-KEY:(.+)')
    URI_PATTERN = re.compile(r'URI="(.+?)"')
    METHOD_PATTERN = re.compile(r'METHOD=(\w+)')

    def __init__(self, content: str, base_url: str):
        self.content = content
        self.base_url = base_url
        self.lines = content.strip().split('\n')

    def is_master(self) -> bool:
        """判断是否是master playlist"""
        return any('#EXT-X-STREAM-INF' in line for line in self.lines)

    def parse(self) -> Tuple[List[M3U8Stream], List[M3U8Segment]]:
        """解析M3U8文件"""
        if self.is_master():
            return self.parse_master(), []
        else:
            return [], self.parse_media()

    def parse_master(self) -> List[M3U8Stream]:
        """解析master playlist"""
        streams = []
        stream_info = {}

        for i, line in enumerate(self.lines):
            line = line.strip()

            if line.startswith('#EXT-X-STREAM-INF:'):
                stream_info = self._parse_stream_inf(line)
            elif line and not line.startswith('#'):
                if stream_info:
                    stream_info['url'] = self._resolve_url(line)
                    streams.append(M3U8Stream(**stream_info))
                    stream_info = {}

        return streams

    def parse_media(self) -> List[M3U8Segment]:
        """解析media playlist"""
        segments = []
        current_duration = None

        for line in self.lines:
            line = line.strip()

            match = self.EXTINF_PATTERN.match(line)
            if match:
                current_duration = float(match.group(1))
            elif line and not line.startswith('#') and current_duration is not None:
                segments.append(M3U8Segment(
                    duration=current_duration,
                    url=self._resolve_url(line)
                ))
                current_duration = None

        return segments

    def _parse_stream_inf(self, line: str) -> Dict:
        """解析流信息"""
        info = {'bandwidth': 0, 'segments': []}

        bw_match = self.BANDWIDTH_PATTERN.search(line)
        if bw_match:
            info['bandwidth'] = int(bw_match.group(1))

        res_match = self.RESOLUTION_PATTERN.search(line)
        if res_match:
            info['resolution'] = res_match.group(1)

        codecs_match = self.CODECS_PATTERN.search(line)
        if codecs_match:
            info['codecs'] = codecs_match.group(1)

        return info

    def _resolve_url(self, path: str) -> str:
        """解析相对URL为绝对URL"""
        if path.startswith('http://') or path.startswith('https://'):
            return path
        return self.base_url.rsplit('/', 1)[0] + '/' + path

    @staticmethod
    def fetch(url: str, client) -> 'M3U8Parser':
        """获取并解析M3U8"""
        content = client.get_text(url)
        base_url = client.get_base_url(url)
        return M3U8Parser(content, base_url)
