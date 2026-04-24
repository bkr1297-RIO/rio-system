"""
MANTIS Event Types v0.1
Simple event type constants for trigger classification.
"""


class EventType:
    PRE_ACTION = "pre_action"       # send, execute, external action
    PRE_COMMIT = "pre_commit"       # save, publish, commit
    USER_REQUEST = "user_request"   # explicit request for contrast


# All valid event types
VALID_EVENT_TYPES = {
    EventType.PRE_ACTION,
    EventType.PRE_COMMIT,
    EventType.USER_REQUEST,
}


def is_valid_event_type(event_type: str) -> bool:
    """Check if an event type string is recognized."""
    return event_type in VALID_EVENT_TYPES
