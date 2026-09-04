import os


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {
        "1", "true", "yes", "on",
    }

KAFKA_BROKERS: list[str] = os.getenv("KAFKA_BROKERS", "localhost:9092").split(",")
KAFKA_GROUP_ID: str = os.getenv("KAFKA_GROUP_ID", "ml-service-group")
KAFKA_SASL_USERNAME: str = os.getenv("KAFKA_SASL_USERNAME", "")
KAFKA_SASL_PASSWORD: str = os.getenv("KAFKA_SASL_PASSWORD", "")
ML_REQUEST_TOPIC: str = os.getenv("ML_REQUEST_TOPIC", "ml.request.events")
ML_RESULT_TOPIC: str = os.getenv("ML_RESULT_TOPIC", "ml.result.events")
ML_DLQ_TOPIC: str = os.getenv("ML_DLQ_TOPIC", "ml.request.events.dlq")

# Durable idempotency receipts and cached results survive consumer restarts.
ML_RECEIPT_DB_PATH: str = os.getenv("ML_RECEIPT_DB_PATH", "/data/ml_receipts.db")

# Path for persisting the online LR model weights across restarts
LR_MODEL_PATH: str = os.getenv("LR_MODEL_PATH", "/data/lr_model.json")

# RCA HDBSCAN bundle path — never committed to git; set RCA_MODEL_PATH in env
RCA_MODEL_PATH: str = os.getenv("RCA_MODEL_PATH", "/data/rca_model.pkl")

# Minimum new labeled batches before triggering async retrain
RCA_RETRAIN_THRESHOLD: int = int(os.getenv("RCA_RETRAIN_THRESHOLD", "50"))

LEAKAGE_MODEL_PATH: str = os.getenv("LEAKAGE_MODEL_PATH", "/data/leakage_prediction_bundle.joblib")
INTELLIGENCE_DATABASE_URL: str = os.getenv("INTELLIGENCE_DATABASE_URL", "")
LEAKAGE_RETRAIN_THRESHOLD: int = int(os.getenv("LEAKAGE_RETRAIN_THRESHOLD", "50"))
LEAKAGE_REAL_SAMPLE_WEIGHT: float = float(os.getenv("LEAKAGE_REAL_SAMPLE_WEIGHT", "1.0"))

# Training scope is explicit. GLOBAL models require tenant opt-in and consume only
# aggregate feature-store rows. TENANT datasets are always filtered by tenant_id.
LR_TRAINING_SCOPE: str = os.getenv("LR_TRAINING_SCOPE", "GLOBAL").strip().upper()
LEAKAGE_TRAINING_SCOPE: str = os.getenv(
    "LEAKAGE_TRAINING_SCOPE", "GLOBAL"
).strip().upper()
RCA_TRAINING_SCOPE: str = os.getenv("RCA_TRAINING_SCOPE", "GLOBAL").strip().upper()
ML_GLOBAL_MIN_TENANTS: int = int(os.getenv("ML_GLOBAL_MIN_TENANTS", "3"))
ML_MIN_SAMPLES_PER_TENANT: int = int(
    os.getenv("ML_MIN_SAMPLES_PER_TENANT", "25")
)

# Production model governance. Postgres is authoritative; local files are caches
# populated only from promoted bundles with valid Ed25519 signatures.
MODEL_REGISTRY_REQUIRED: bool = _env_bool("MODEL_REGISTRY_REQUIRED")
MODEL_REGISTRY_ENABLED: bool = (
    _env_bool("MODEL_REGISTRY_ENABLED") or MODEL_REGISTRY_REQUIRED
)
MODEL_REGISTRY_PUBLIC_KEY: str = os.getenv("MODEL_REGISTRY_PUBLIC_KEY", "")
MODEL_REGISTRY_REFRESH_SECONDS: float = float(
    os.getenv("MODEL_REGISTRY_REFRESH_SECONDS", "30")
)

# Canonical model version strings shared with Go side
MODEL_VERSION_IF: str = "isolation_forest_v1"
MODEL_VERSION_LR: str = "logistic_regression_v1"
MODEL_VERSION_ZSCORE: str = "zscore_v1"
MODEL_VERSION_RCA: str = "rca_hdbscan_v1"
MODEL_VERSION_LEAKAGE: str = "leakage_prediction_v1"
