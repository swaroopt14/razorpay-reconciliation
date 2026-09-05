"""Approve, sign, promote, and roll back centrally registered model bundles."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import config  # noqa: E402
from app.model_registry import (  # noqa: E402
    MODEL_LEAKAGE,
    MODEL_LR,
    MODEL_RCA,
    ModelBundle,
    ModelRegistry,
    load_private_key,
)
from app.training_governance import TrainingGovernanceRepo  # noqa: E402

MODEL_NAMES = (MODEL_LR, MODEL_RCA, MODEL_LEAKAGE)


def _json_object(value: str, label: str) -> dict:
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError(f"{label} must be a JSON object")
    return parsed


def _registry() -> ModelRegistry:
    return ModelRegistry(
        config.INTELLIGENCE_DATABASE_URL,
        config.MODEL_REGISTRY_PUBLIC_KEY,
    )


def _register(args: argparse.Namespace) -> None:
    artifact = Path(args.artifact).read_bytes()
    private_key = load_private_key(os.environ.get("MODEL_REGISTRY_PRIVATE_KEY", ""))
    bundle = ModelBundle.sign(
        model_name=args.model,
        version=args.version,
        artifact=artifact,
        training_dataset_lineage=_json_object(args.lineage, "lineage"),
        metrics=_json_object(args.metrics, "metrics"),
        approver=args.approver,
        private_key=private_key,
    )
    _registry().publish_approved(bundle)
    print(json.dumps({
        "action": "registered",
        "model": bundle.model_name,
        "version": bundle.version,
        "digest": bundle.digest,
        "approver": bundle.approver,
    }, sort_keys=True))


def _approve_candidate(args: argparse.Namespace) -> None:
    private_key = load_private_key(os.environ.get("MODEL_REGISTRY_PRIVATE_KEY", ""))
    bundle = _registry().approve_candidate(
        args.model, args.version, args.approver, private_key
    )
    print(json.dumps({
        "action": "approved",
        "model": bundle.model_name,
        "version": bundle.version,
        "digest": bundle.digest,
        "approver": bundle.approver,
    }, sort_keys=True))


def _promote(args: argparse.Namespace) -> None:
    _registry().promote(args.model, args.version, args.promoted_by)
    print(json.dumps({
        "action": "rollback" if args.command == "rollback" else "promote",
        "model": args.model,
        "version": args.version,
        "promoted_by": args.promoted_by,
    }, sort_keys=True))

def _set_tenant_policy(args: argparse.Namespace) -> None:
    policy = TrainingGovernanceRepo(
        config.INTELLIGENCE_DATABASE_URL
    ).upsert_policy(
        tenant_id=args.tenant_id,
        tenant_models_enabled=args.tenant_models_enabled,
        global_training_opt_in=args.global_training_opt_in,
        allowed_feature_families=args.families.split(","),
        aggregate_features_only=True,
        minimum_sample_count=args.minimum_samples,
        approved_by=args.approved_by,
    )
    print(json.dumps({
        "action": "tenant-training-policy-set",
        "policy_id": policy.policy_id,
        "tenant_id": policy.tenant_id,
        "tenant_models_enabled": policy.tenant_models_enabled,
        "global_training_opt_in": policy.global_training_opt_in,
        "allowed_feature_families": list(policy.allowed_feature_families),
        "minimum_sample_count": policy.minimum_sample_count,
    }, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    register = commands.add_parser("register", help="sign and register an approved artifact")
    register.add_argument("--model", choices=MODEL_NAMES, required=True)
    register.add_argument("--version", required=True)
    register.add_argument("--artifact", required=True)
    register.add_argument("--lineage", required=True, help="training lineage JSON object")
    register.add_argument("--metrics", required=True, help="evaluation metrics JSON object")
    register.add_argument("--approver", required=True)
    register.set_defaults(run=_register)

    approve = commands.add_parser("approve-candidate", help="sign a staged LR candidate")
    approve.add_argument("--model", choices=MODEL_NAMES, required=True)
    approve.add_argument("--version", required=True)
    approve.add_argument("--approver", required=True)
    approve.set_defaults(run=_approve_candidate)

    policy = commands.add_parser(
        "set-tenant-policy",
        help="set explicit tenant/global training consent and data scope",
    )
    policy.add_argument("--tenant-id", required=True)
    policy.add_argument(
        "--families",
        required=True,
        help="comma-separated feature families, e.g. AMBIGUITY,LEAKAGE",
    )
    policy.add_argument("--tenant-models-enabled", action="store_true")
    policy.add_argument("--global-training-opt-in", action="store_true")
    policy.add_argument(
        "--minimum-samples",
        type=int,
        default=config.ML_MIN_SAMPLES_PER_TENANT,
    )
    policy.add_argument("--approved-by", required=True)
    policy.set_defaults(run=_set_tenant_policy)

    for command in ("promote", "rollback"):
        promotion = commands.add_parser(
            command,
            help="atomically set the promoted version"
            if command == "promote"
            else "atomically restore an older approved version",
        )
        promotion.add_argument("--model", choices=MODEL_NAMES, required=True)
        promotion.add_argument("--version", required=True)
        promotion.add_argument("--promoted-by", required=True)
        promotion.set_defaults(run=_promote)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
