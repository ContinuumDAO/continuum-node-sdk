"""Ranked Reddit comment snippets for search hits and thread fetch."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import praw.models


def _utc_iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def comment_record(comment: praw.models.Comment, depth: int) -> dict[str, Any]:
    author_name = None
    if hasattr(comment, "author") and comment.author is not None:
        author_name = str(comment.author.name)
    parent_id = str(comment.parent_id) if comment.parent_id else None
    return {
        "comment_id": str(comment.id),
        "parent_id": parent_id,
        "depth": depth,
        "body": comment.body or "",
        "score": int(getattr(comment, "score", 0) or 0),
        "created_at": _utc_iso(getattr(comment, "created_utc", None)),
        "author": author_name,
    }


def collect_comments_flat(
    submission: praw.models.Submission,
    *,
    max_comments: int,
    max_depth: int,
    replace_more_limit: int,
    sort: str,
) -> list[dict[str, Any]]:
    submission.comment_sort = sort
    submission.comments.replace_more(limit=replace_more_limit)
    collected: list[dict[str, Any]] = []

    def walk(comment: praw.models.Comment, depth: int) -> None:
        if len(collected) >= max_comments:
            return
        if depth > max_depth:
            return
        if getattr(comment, "body", None) is None:
            return
        collected.append(comment_record(comment, depth))
        if depth >= max_depth:
            return
        for reply in comment.replies:
            if len(collected) >= max_comments:
                break
            if isinstance(reply, praw.models.Comment):
                walk(reply, depth + 1)

    for top in submission.comments:
        if len(collected) >= max_comments:
            break
        if isinstance(top, praw.models.Comment):
            walk(top, 0)

    collected.sort(key=lambda row: row.get("score") or 0, reverse=True)
    return collected[:max_comments]


def top_comment_snippets(
    submission: praw.models.Submission,
    *,
    max_comments: int,
    sort: str,
    replace_more_limit: int,
) -> list[dict[str, Any]]:
    if int(getattr(submission, "num_comments", 0) or 0) == 0:
        return []
    return collect_comments_flat(
        submission,
        max_comments=max_comments,
        max_depth=0,
        replace_more_limit=replace_more_limit,
        sort=sort,
    )
