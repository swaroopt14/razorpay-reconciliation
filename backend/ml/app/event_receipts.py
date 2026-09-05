from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Optional

from app.exceptions import IdempotencyConflictError
from app.schemas import MLRequest, MLResult


@dataclass(frozen=True)
class ReceiptLookup:
    found: bool
    result: Optional[MLResult] = None


class EventReceiptRepo:
    """Durable request receipts and cached results keyed by event_id."""

    def __init__(self, path: str) -> None:
        directory = os.path.dirname(os.path.abspath(path))
        os.makedirs(directory, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=FULL")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ml_event_receipts (
                event_id TEXT PRIMARY KEY,
                request_hash TEXT NOT NULL,
                event_type TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                result_json TEXT,
                completed_at INTEGER NOT NULL
            )
            """
        )
        self._conn.commit()

    def lookup(self, req: MLRequest, request_hash: str) -> ReceiptLookup:
        with self._lock:
            row = self._conn.execute(
                "SELECT request_hash, result_json FROM ml_event_receipts WHERE event_id = ?",
                (req.event_id,),
            ).fetchone()
        if row is None:
            return ReceiptLookup(found=False)
        if row[0] != request_hash:
            raise IdempotencyConflictError(
                f"event_id={req.event_id} was already used with different request content"
            )
        result = MLResult.from_dict(json.loads(row[1])) if row[1] is not None else None
        return ReceiptLookup(found=True, result=result)

    def record(
        self,
        req: MLRequest,
        request_hash: str,
        result: Optional[MLResult],
    ) -> ReceiptLookup:
        result_json = (
            json.dumps(result.to_dict(), sort_keys=True, separators=(",", ":"))
            if result is not None
            else None
        )
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                row = self._conn.execute(
                    "SELECT request_hash, result_json FROM ml_event_receipts WHERE event_id = ?",
                    (req.event_id,),
                ).fetchone()
                if row is not None:
                    if row[0] != request_hash:
                        raise IdempotencyConflictError(
                            f"event_id={req.event_id} was already used with different request content"
                        )
                    self._conn.commit()
                    cached = (
                        MLResult.from_dict(json.loads(row[1]))
                        if row[1] is not None
                        else None
                    )
                    return ReceiptLookup(found=True, result=cached)

                self._conn.execute(
                    """
                    INSERT INTO ml_event_receipts
                        (event_id, request_hash, event_type, tenant_id, result_json, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        req.event_id,
                        request_hash,
                        req.event_type,
                        req.tenant_id,
                        result_json,
                        int(time.time()),
                    ),
                )
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise
        return ReceiptLookup(found=False, result=result)

    def close(self) -> None:
        with self._lock:
            self._conn.close()
