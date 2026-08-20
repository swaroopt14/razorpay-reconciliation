class NonRetryableMessageError(ValueError):
    """The request is invalid and may be committed only after durable DLQ delivery."""


class UnsupportedEventTypeError(NonRetryableMessageError):
    """The request uses an event type this service does not support."""


class UnsupportedSchemaVersionError(NonRetryableMessageError):
    """The request declares an envelope schema this service cannot process."""


class PayloadHashMismatchError(NonRetryableMessageError):
    """The declared payload digest does not match the canonical payload."""


class IdempotencyConflictError(NonRetryableMessageError):
    """An event ID was reused for different request content."""



class TrainingGovernanceError(NonRetryableMessageError):
    """A training event is outside the tenant's approved data-use policy."""
