import sys
import os
from typing import Optional, Callable, Dict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.http import HttpClient


class FileDownloader:
    """普通文件下载器"""

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
        下载文件

        Args:
            url: 文件URL
            output_path: 输出路径
            progress_callback: 进度回调 (current, total)
            headers: 额外的请求头

        Returns:
            是否成功
        """
        try:
            response = self.client.get(url, headers=headers, stream=True)
            response.raise_for_status()

            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0

            os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)

            # 使用 tqdm 显示进度条
            from tqdm import tqdm
            progress_bar = tqdm(
                total=total_size,
                unit='B',
                unit_scale=True,
                unit_divisor=1024,
                desc=os.path.basename(output_path)[:30],
                ncols=80,
                mininterval=0.1,
                bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]'
            )

            with open(output_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        progress_bar.update(len(chunk))
                        if progress_callback and total_size:
                            progress_callback(downloaded, total_size)

            progress_bar.close()
            return True

        except Exception as e:
            print(f"下载失败: {e}")
            return False
