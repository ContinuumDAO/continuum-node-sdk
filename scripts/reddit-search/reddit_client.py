"""Shared PRAW client for Reddit social search scripts."""

from __future__ import annotations

import os

import praw


def get_reddit() -> praw.Reddit:
    client_id = os.environ.get("REDDIT_CLIENT_ID", "").strip()
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET", "").strip()
    user_agent = os.environ.get("REDDIT_USER_AGENT", "").strip()
    if not client_id or not client_secret or not user_agent:
        raise RuntimeError(
            "Missing REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, or REDDIT_USER_AGENT"
        )
    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent=user_agent,
    )
    reddit.read_only = True
    return reddit


def normalize_subreddit(name: str) -> str:
    return str(name).strip().removeprefix("r/").removeprefix("R/")
