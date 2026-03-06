"""
Logging configuration for the application.
Call setup_logging() once at startup.
"""

import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    log_level = getattr(logging, level.upper(), logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)-8s %(name)-30s %(message)s",
            datefmt="%H:%M:%S",
        )
    )
    root = logging.getLogger()
    root.setLevel(log_level)
    root.handlers.clear()
    root.addHandler(handler)
    # Suppress noisy third-party loggers
    for noisy in ("httpcore", "httpx", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
