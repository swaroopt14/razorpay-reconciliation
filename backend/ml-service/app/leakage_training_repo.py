from __future__ import annotations

import json
from typing import Any

import psycopg

from app import config


class LeakageTrainingRepo:
    def __init__(self, dsn: str | None = None) -> None:
        self._dsn = (dsn or config.INTELLIGENCE_DATABASE_URL).strip()

    def is_configured(self) -> bool:
        return bool(self._dsn)

    def count_labeled_rows(self) -> int:
        if not self._dsn:
            return 0

        sql = """
            SELECT COUNT(*)
            FROM ml_feature_store
            WHERE feature_family = 'LEAKAGE'
              AND scope_type = 'BATCH'
              AND label_json IS NOT NULL
        """
        with psycopg.connect(self._dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                row = cur.fetchone()
        return int(row[0] if row else 0)

    def load_labeled_rows(self) -> list[dict[str, Any]]:
        if not self._dsn:
            return []

        sql = """
            SELECT tenant_id, scope_ref, features_json::text, label_json::text, created_at
            FROM ml_feature_store
            WHERE feature_family = 'LEAKAGE'
              AND scope_type = 'BATCH'
              AND label_json IS NOT NULL
            ORDER BY created_at ASC
        """
        rows: list[dict[str, Any]] = []
        with psycopg.connect(self._dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                for tenant_id, batch_id, features_text, label_text, created_at in cur.fetchall():
                    features = json.loads(features_text or "{}")
                    label = json.loads(label_text or "{}")
                    rows.append(
                        {
                            "tenant_id": tenant_id,
                            "batch_id": batch_id,
                            "features": features,
                            "label": label,
                            "created_at": created_at,
                        }
                    )
        return rows
