# config/__init__.py
# Re-export `settings` so callers can do:
#   from config import settings
from config.settings import settings

__all__ = ["settings"]
