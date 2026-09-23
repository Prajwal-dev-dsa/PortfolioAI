import time
from collections import defaultdict


WINDOW_SECONDS = 60
MAX_TRACKED_KEYS = 5000

_requests: dict[str, list[float]] = defaultdict(list)


def _prune_key(
    key: str,
    now: float,
) -> list[float]:
    timestamps = _requests.get(key, [])

    valid = [
        timestamp
        for timestamp in timestamps
        if now - timestamp < WINDOW_SECONDS
    ]

    if valid:
        _requests[key] = valid
    else:
        _requests.pop(key, None)

    return valid


def _cleanup_old_keys(
    now: float,
) -> None:
    if len(_requests) <= MAX_TRACKED_KEYS:
        return

    stale_keys = []

    for key, timestamps in _requests.items():
        if not timestamps:
            stale_keys.append(key)
            continue

        if now - timestamps[-1] >= WINDOW_SECONDS:
            stale_keys.append(key)

    for key in stale_keys:
        _requests.pop(key, None)

        if len(_requests) <= MAX_TRACKED_KEYS:
            break


def enforce_rate_limit(
    client_id: str,
    bucket: str,
    max_requests: int,
) -> None:
    if max_requests <= 0:
        raise ValueError(
            "Rate limit configuration must be greater than zero."
        )

    now = time.monotonic()

    _cleanup_old_keys(now)

    key = f"{bucket}:{client_id}"

    timestamps = _prune_key(
        key,
        now,
    )

    if len(timestamps) >= max_requests:
        raise ValueError(
            "Too many requests. Please try again later."
        )

    timestamps.append(now)

    _requests[key] = timestamps
