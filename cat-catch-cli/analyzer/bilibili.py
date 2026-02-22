import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List
from analyzer.base import BaseAnalyzer
from models.resource import ResourceType, MediaResource
from utils.http import HttpClient


class BilibiliAnalyzer(BaseAnalyzer):
    """B站视频分析器"""

    def __init__(self, client: HttpClient = None):
        self.client = client or HttpClient()

    @property
    def name(self) -> str:
        return "Bilibili Analyzer"

    def analyze(self, url: str) -> List[MediaResource]:
        """分析B站URL，获取视频资源"""
        resources = []

        # 提取BV号
        bv_match = re.search(r'BV[\w]+', url)
        if not bv_match:
            return resources

        bv_id = bv_match.group(0)

        try:
            # 获取视频基本信息
            print("  获取视频信息...")
            api_url = f'https://api.bilibili.com/x/web-interface/view?bvid={bv_id}'
            resp = self.client.get(api_url, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com/'
            })
            data = resp.json()

            if data.get('code') != 0:
                print(f"B站API错误: {data.get('message')}")
                return resources

            video_info = data['data']
            title = video_info['title']
            aid = video_info['aid']
            cid = video_info['cid']
            duration = video_info.get('duration', 0)  # 视频总时长（秒）

            # 获取播放地址 (DASH)
            # fnval=16 表示返回 DASH 格式
            print("  获取播放地址...")
            playurl_api = f'https://api.bilibili.com/x/player/playurl?avid={aid}&cid={cid}&qn=80&fnval=16'
            resp2 = self.client.get(playurl_api, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com/'
            })
            playurl_data = resp2.json()

            if playurl_data.get('code') != 0:
                print(f"B站播放地址API错误: {playurl_data.get('message')}")
                return resources

            dash = playurl_data['data']['dash']

            # 处理视频流
            if 'video' in dash:
                print("  分析视频流...")
                for i, video in enumerate(dash['video']):
                    base_url = video['baseUrl']
                    # 获取视频编码信息
                    codecs = video.get('codecs', '')
                    # 解析编码得到质量描述
                    quality_str = self._parse_codecs(codecs)

                    # 获取文件大小
                    print(f"  获取视频大小: {quality_str}...")
                    size = self._get_file_size(base_url)

                    resources.append(MediaResource(
                        url=base_url,
                        type=ResourceType.VIDEO,
                        title=f"{title}",
                        quality=quality_str,
                        duration=duration,
                        size=size
                    ))

            # 处理音频流
            if 'audio' in dash:
                print("  分析音频流...")
                for i, audio in enumerate(dash['audio']):
                    base_url = audio['baseUrl']
                    # 获取文件大小
                    print(f"  获取音频大小...")
                    size = self._get_file_size(base_url)
                    resources.append(MediaResource(
                        url=base_url,
                        type=ResourceType.AUDIO,
                        title=f"{title}_audio",
                        duration=duration,
                        size=size
                    ))

        except Exception as e:
            print(f"B站分析失败: {e}")

        return resources

    def _parse_codecs(self, codecs: str) -> str:
        """从codecs解析视频质量"""
        if not codecs:
            return "未知"
        # 格式: avc1.640033 或 hev1.1.6.L120.90
        if 'hev' in codecs.lower() or 'hevc' in codecs.lower():
            return "H265/HEVC"
        elif 'avc' in codecs.lower():
            return "H264/AVC"
        return codecs

    def _get_file_size(self, url: str) -> int:
        """通过HEAD请求获取文件大小"""
        try:
            # 需要添加 Referer 头才能获取大小
            headers = {
                'Referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
            resp = self.client.session.head(url, headers=headers, allow_redirects=True, timeout=10)
            if resp.status_code == 200:
                content_length = resp.headers.get('Content-Length')
                if content_length:
                    return int(content_length)
        except Exception as e:
            print(f"    获取大小失败: {e}")
        return 0
