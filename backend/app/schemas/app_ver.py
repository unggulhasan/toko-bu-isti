from __future__ import annotations

from .common import CamelModel


class AppVersionOut(CamelModel):
    version: str
