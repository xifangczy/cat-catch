import sys
import os
from typing import Optional, Callable, Dict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.http import HttpClient
from utils.m3u8_parser import M3U8Parser


class HLSDownloader:
    """HLS下载器 - 下载切片并合并"""

    def __init__(self, client: HttpClient = None):
        self.client = client or HttpClient()

    def download(
        self,
        url: str,
        output_path: str,
        progress_callback: Optional[Callable[[int, int], None]] = None,
        headers: Optional[Dict] = None
    ) -> bool:
        """
        下载HLS流

        Args:
            url: m3u8 URL
            output_path: 输出文件路径
            progress_callback: 进度回调
            headers: 额外的请求头

        Returns:
            是否成功
        """
        try:
            # 解析m3u8
            parser = M3U8Parser.fetch(url, self.client)
            base_url = self.client.get_base_url(url)

            if parser.is_master():
                # Master playlist - 选择最高质量
                streams = parser.parse_master()
                if streams:
                    # 选择带宽最高的
                    streams.sort(key=lambda x: x.bandwidth, reverse=True)
                    url = streams[0].url
                    parser = M3U8Parser.fetch(url, self.client)

            segments = parser.parse_media()
            if not segments:
                print("未找到切片")
                return False

            # 下载目录
            temp_dir = output_path + '.temp'
            os.makedirs(temp_dir, exist_ok=True)

            # 下载所有切片
            print(f"发现 {len(segments)} 个切片，开始下载...")
            for i, segment in enumerate(segments):
                segment_path = os.path.join(temp_dir, f'{i:05d}.ts')
                if not os.path.exists(segment_path):
                    self._download_segment(segment.url, segment_path, headers)
                if progress_callback:
                    progress_callback(i + 1, len(segments))

            # 合并切片
            self._merge_segments(temp_dir, output_path)

            # 清理临时目录
            self._cleanup(temp_dir)

            print(f"下载完成: {output_path}")
            return True

        except Exception as e:
            print(f"HLS下载失败: {e}")
            return False

    def _download_segment(self, url: str, path: str, headers: Dict = None):
        """下载单个切片"""
        try:
            content = self.client.get_content(url, headers=headers)
            with open(path, 'wb') as f:
                f.write(content)
        except Exception as e:
            print(f"下载切片失败 {url}: {e}")

    def _merge_segments(self, temp_dir: str, output_path: str):
        """合并切片"""
        import subprocess

        segments = sorted(os.listdir(temp_dir))
        list_file = os.path.join(temp_dir, 'list.txt')

        with open(list_file, 'w') as f:
            for seg in segments:
                f.write(f"file '{seg}'\n")

        cmd = ['ffmpeg', '-f', 'concat', '-safe', '0', '-i', list_file, '-c', 'copy', '-y', output_path]
        subprocess.run(cmd, capture_output=True)

    def _cleanup(self, temp_dir: str):
        """清理临时文件"""
        import shutil
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
