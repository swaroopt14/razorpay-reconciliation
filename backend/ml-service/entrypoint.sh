#!/bin/bash
# entrypoint.sh — starts the service with an approved, pre-mounted RCA bundle.
set -e

MODEL_PATH="${RCA_MODEL_PATH:-/data/rca_model.pkl}"

if [ ! -f "$MODEL_PATH" ]; then
    echo "[entrypoint] MODEL_UNAVAILABLE: no approved RCA model at $MODEL_PATH; RCA inference will remain disabled."
else
    echo "[entrypoint] Found RCA model at $MODEL_PATH."
fi

exec python main.py
