import subprocess
import os
import shutil
import time
import threading
from typing import List


class FFmpegMerger:
    """FFmpeg封装"""

    def __init__(self):
        self.ffmpeg_path = self._find_ffmpeg()
        self._stop_timer = False

    def _find_ffmpeg(self) -> str:
        """查找ffmpeg路径"""
        ffmpeg = shutil.which('ffmpeg')
        if not ffmpeg:
            raise RuntimeError("ffmpeg未安装，请先安装: https://ffmpeg.org/download.html")
        return ffmpeg

    def is_available(self) -> bool:
        """检查ffmpeg是否可用"""
        try:
            subprocess.run([self.ffmpeg_path, '-version'],
                         capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False

    def _print_timer(self, start_time: float):
        """定时打印已用时间"""
        while not self._stop_timer:
            elapsed = time.time() - start_time
            print(f"\r已用时间: {self._format_time(elapsed)}", end='', flush=True)
            time.sleep(1)

    def merge_ts_files(self, input_files: List[str], output_file: str) -> bool:
        """
        合并TS切片文件

        Args:
            input_files: 输入文件列表
            output_file: 输出文件路径

        Returns:
            是否成功
        """
        if not input_files:
            return False

        start_time = time.time()

        try:
            # 创建临时文件列表
            list_file = output_file + '.txt'
            with open(list_file, 'w') as f:
                for file in input_files:
                    f.write(f"file '{os.path.abspath(file)}'\n")

            cmd = [
                self.ffmpeg_path,
                '-f', 'concat',
                '-safe', '0',
                '-i', list_file,
                '-c', 'copy',
                '-y',
                output_file
            ]

            print("开始合并切片...")
            # 启动计时器线程
            self._stop_timer = False
            timer_thread = threading.Thread(target=self._print_timer, args=(start_time,))
            timer_thread.daemon = True
            timer_thread.start()

            result = subprocess.run(cmd, capture_output=True, text=True)

            # 停止计时器
            self._stop_timer = True
            timer_thread.join(timeout=1)

            # 清理临时文件
            os.remove(list_file)

            elapsed = time.time() - start_time
            print(f"\r合并完成! 耗时: {self._format_time(elapsed)}")

            if result.returncode != 0:
                print(f"合并失败: {result.stderr}")
                return False

            return True

        except Exception as e:
            self._stop_timer = True
            print(f"合并失败: {e}")
            return False

    def merge_video_audio(
        self,
        video_file: str,
        audio_file: str,
        output_file: str
    ) -> bool:
        """
        合并视频和音频

        Args:
            video_file: 视频文件
            audio_file: 音频文件
            output_file: 输出文件

        Returns:
            是否成功
        """
        start_time = time.time()

        try:
            cmd = [
                self.ffmpeg_path,
                '-i', video_file,
                '-i', audio_file,
                '-c', 'copy',
                '-y',
                output_file
            ]

            print("开始合并视频和音频...")
            # 启动计时器线程
            self._stop_timer = False
            timer_thread = threading.Thread(target=self._print_timer, args=(start_time,))
            timer_thread.daemon = True
            timer_thread.start()

            result = subprocess.run(cmd, capture_output=True, text=True)

            # 停止计时器
            self._stop_timer = True
            timer_thread.join(timeout=1)

            elapsed = time.time() - start_time
            print(f"\r合并完成! 耗时: {self._format_time(elapsed)}")

            if result.returncode != 0:
                print(f"合并失败: {result.stderr}")
                return False

            return True

        except Exception as e:
            self._stop_timer = True
            print(f"合并失败: {e}")
            return False

    def _format_time(self, seconds: float) -> str:
        """格式化时间"""
        if seconds < 60:
            return f"{seconds:.1f}秒"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}分{secs}秒"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            return f"{hours}小时{minutes}分{secs}秒"
