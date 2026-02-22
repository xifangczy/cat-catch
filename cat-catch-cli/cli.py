#!/usr/bin/env python3
"""
cat-catch-cli: 命令行媒体资源下载工具
"""

import sys
import os
import re
import argparse

# 添加当前目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.http import HttpClient
from analyzer.html import HtmlAnalyzer
from analyzer.hls import HlsAnalyzer
from analyzer.playwright_analyzer import PlaywrightAnalyzer
from analyzer.bilibili import BilibiliAnalyzer
from downloader.file_downloader import FileDownloader
from downloader.hls_downloader import HLSDownloader
from merger.ffmpeg import FFmpegMerger
from models.resource import ResourceType, MediaResource
import re


def sanitize_filename(filename: str) -> str:
    """清理文件名中的非法字符"""
    # 替换非法字符
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # 限制长度
    if len(filename) > 200:
        filename = filename[:200]
    return filename


def analyze_url(url: str, use_playwright: bool = True) -> list:
    """分析URL，返回资源列表"""
    client = HttpClient()

    # 优先检查是否是直接的m3u8链接
    if url.endswith('.m3u8'):
        hls_analyzer = HlsAnalyzer(client)
        return hls_analyzer.analyze(url)

    # B站专用分析器
    if 'bilibili.com' in url.lower() or re.search(r'BV[\w]+', url):
        print("  [使用 B站 分析器...]")
        bilibili_analyzer = BilibiliAnalyzer(client)
        resources = bilibili_analyzer.analyze(url)
        if resources:
            return resources

    # 使用 Playwright 渲染页面获取动态加载的视频
    if use_playwright:
        print("  [使用 Playwright 渲染页面...]")
        try:
            playwright_analyzer = PlaywrightAnalyzer()
            resources = playwright_analyzer.analyze(url)
            if resources:
                return resources
        except Exception as e:
            print(f"  Playwright 分析失败: {e}")
            print("  回退到静态 HTML 分析...")

    # 分析HTML页面
    html_analyzer = HtmlAnalyzer(client)
    return html_analyzer.analyze(url)


def display_resources(resources: list) -> None:
    """显示资源列表"""
    if not resources:
        print("未发现任何媒体资源")
        return

    print(f"\n发现 {len(resources)} 个媒体资源:\n")
    for i, resource in enumerate(resources, 1):
        print(resource.display_info(i))


def get_user_selection(max_num: int) -> list:
    """获取用户选择"""
    while True:
        try:
            selection = input("\n请选择要下载的资源 (输入编号，多选用逗号分隔): ").strip()
            if not selection:
                continue

            numbers = []
            for part in selection.split(','):
                part = part.strip()
                if part.isdigit():
                    num = int(part)
                    if 1 <= num <= max_num:
                        numbers.append(num - 1)
                else:
                    print(f"无效输入: {part}")
                    break
            else:
                if numbers:
                    return numbers

        except KeyboardInterrupt:
            print("\n已取消")
            return []


def download_resource(resource: MediaResource, output_dir: str = '.', need_merge: bool = False, referer: str = None) -> str:
    """下载资源，返回下载的文件路径"""
    print(f"\n开始下载: {resource.title}")

    # 生成输出文件名（清理标题中的非法字符）
    clean_title = sanitize_filename(resource.title)
    ext = get_extension(resource)
    output_path = os.path.join(output_dir, f"{clean_title}.{ext}")

    # 构建请求头
    headers = None
    if referer:
        headers = {
            'Referer': referer,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }

    if resource.type == ResourceType.HLS:
        downloader = HLSDownloader()
        success = downloader.download(resource.url, output_path, headers=headers)
    else:
        downloader = FileDownloader()
        success = downloader.download(resource.url, output_path, headers=headers)

    if success:
        return output_path
    return ""


def get_extension(resource: MediaResource) -> str:
    """获取文件扩展名"""
    if resource.type == ResourceType.HLS:
        return 'mp4'
    elif resource.type == ResourceType.DASH:
        return 'mp4'
    elif resource.type == ResourceType.VIDEO:
        # 清理URL中的查询参数
        url_path = resource.url.split('?')[0]
        ext = url_path.split('.')[-1] if '.' in url_path else ''
        return ext if ext else 'mp4'
    elif resource.type == ResourceType.AUDIO:
        url_path = resource.url.split('?')[0]
        ext = url_path.split('.')[-1] if '.' in url_path else ''
        return ext if ext else 'mp3'
    return 'mp4'


def main():
    parser = argparse.ArgumentParser(
        description='cat-catch-cli: 命令行媒体资源下载工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python cli.py https://www.bilibili.com/video/BV1VLZ4BgEwC/
  python cli.py https://example.com/video.mp4 --path ~/Downloads
  python cli.py https://example.com/video.m3u8 -p /tmp/videos
        '''
    )
    parser.add_argument('url', help='视频URL')
    parser.add_argument('-p', '--path', default='~/Downloads',
                        help='下载目录 (默认: ~/Downloads)')

    args = parser.parse_args()

    # 处理下载路径
    download_dir = os.path.expanduser(args.path)
    if not os.path.exists(download_dir):
        os.makedirs(download_dir)

    url = args.url

    print(f"正在分析: {url}")
    print(f"下载目录: {download_dir}")
    print()

    try:
        # 分析URL
        resources = analyze_url(url)

        # 显示资源
        display_resources(resources)

        if not resources:
            return

        # 获取用户选择
        selection = get_user_selection(len(resources))

        if not selection:
            return

        # 检查是否同时选择了视频和音频
        selected_resources = [resources[i] for i in selection]
        has_video = any(r.type == ResourceType.VIDEO for r in selected_resources)
        has_audio = any(r.type == ResourceType.AUDIO for r in selected_resources)

        need_merge = False
        if has_video and has_audio:
            print("\n检测到同时选择了视频和音频")
            while True:
                try:
                    answer = input("是否需要合并为完整视频? (y/n): ").strip().lower()
                    if answer in ['y', 'yes', '是']:
                        need_merge = True
                        break
                    elif answer in ['n', 'no', '否']:
                        need_merge = False
                        break
                    else:
                        print("请输入 y 或 n")
                except KeyboardInterrupt:
                    print("\n已取消")
                    return
        else:
            need_merge = False

        # 下载选中的资源
        downloaded_files = {}
        for idx in selection:
            resource = resources[idx]
            # 为 B站资源添加 Referer
            referer = "https://www.bilibili.com/" if 'bilibili.com' in url.lower() else None
            file_path = download_resource(resource, output_dir=download_dir, need_merge=need_merge, referer=referer)
            if file_path:
                if resource.type == ResourceType.VIDEO:
                    downloaded_files['video'] = file_path
                elif resource.type == ResourceType.AUDIO:
                    downloaded_files['audio'] = file_path

        # 如果需要合并
        if need_merge and 'video' in downloaded_files and 'audio' in downloaded_files:
            video_path = downloaded_files['video']
            audio_path = downloaded_files['audio']
            # 生成合并后的文件名
            base_name = os.path.splitext(video_path)[0]
            merged_path = base_name + "_merged.mp4"

            print(f"\n开始合并视频和音频...")
            merger = FFmpegMerger()
            if merger.is_available():
                success = merger.merge_video_audio(video_path, audio_path, merged_path)
                if success:
                    print(f"合并完成: {merged_path}")
                    # 询问是否删除原始文件
                    while True:
                        try:
                            answer = input("是否删除原始分离文件? (y/n): ").strip().lower()
                            if answer in ['y', 'yes', '是']:
                                try:
                                    os.remove(video_path)
                                    os.remove(audio_path)
                                    print(f"已删除原始文件")
                                except:
                                    pass
                                break
                            elif answer in ['n', 'no', '否']:
                                break
                            else:
                                print("请输入 y 或 n")
                        except KeyboardInterrupt:
                            break
            else:
                print("ffmpeg 不可用，无法合并")

        print("\n完成!")

    except KeyboardInterrupt:
        print("\n已取消")
    except Exception as e:
        print(f"错误: {e}")


if __name__ == '__main__':
    main()
