"""App version -- shown in the frontend header so it is obvious which build a PC
is running when debugging.

Display only: nothing compares versions or triggers an update from it.
Unauthenticated because a version string is not sensitive. It comes from
pyproject.toml, so bump it there on each release.

Plain `def`, like every route -- see the note in main.py.
"""

from __future__ import annotations

from fastapi import APIRouter

from ..config import APP_VERSION
from ..schemas.app_ver import AppVersionOut

router = APIRouter(prefix="/app", tags=["app"])


@router.get("/version", response_model=AppVersionOut)
def get_app_version() -> AppVersionOut:
    """Return the version of the running backend."""
    return AppVersionOut(version=APP_VERSION)
