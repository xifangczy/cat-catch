from abc import ABC, abstractmethod
from typing import List
from models.resource import MediaResource


class BaseAnalyzer(ABC):
    """分析器基类"""

    @abstractmethod
    def analyze(self, url: str) -> List[MediaResource]:
        """
        分析URL并返回资源列表

        Args:
            url: 目标URL

        Returns:
            资源列表
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """分析器名称"""
        pass
