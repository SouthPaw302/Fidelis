from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Protocol


@dataclass
class Capability:
    id: str
    kind: str
    status: str  # ready | blocked | unavailable | experimental
    label: str
    reason: str = ''
    version: str | None = None
    execution: str = 'worker'
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data['metadata'] = data['metadata'] or {}
        return data


class Adapter(Protocol):
    id: str
    kind: str

    def capability(self) -> Capability: ...
