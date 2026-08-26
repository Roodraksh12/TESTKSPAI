"""Local privacy controls for every LLM-bound request.

This module deliberately has no network or database dependency. It performs a
deterministic, reversible-for-one-request tokenisation pass before an external
provider sees a prompt. The reverse map stays in process only long enough to
restore display values in the provider response.

Rule-based detection is a defence layer, not a claim that arbitrary police text
has been perfectly de-identified. Structured case fields and caller-supplied
known values provide the strongest protection; regex/context rules provide a
second pass for free text.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Sequence


class PrivacyPolicyError(ValueError):
    pass


@dataclass(frozen=True)
class PrivacyContext:
    purpose: str
    officer_id: str | None = None
    case_ids: tuple[str, ...] = ()
    session_id: str | None = None
    tool_names: tuple[str, ...] = ()
    known_sensitive_values: Mapping[str, Sequence[str]] = field(default_factory=dict)


@dataclass
class RedactionSummary:
    counts: Counter[str] = field(default_factory=Counter)
    egress_characters: int = 0
    processing_ms: int = 0

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    def public_dict(self) -> dict[str, Any]:
        return {
            "applied": self.total > 0,
            "total": self.total,
            "categories": [
                {"category": category, "count": count}
                for category, count in sorted(self.counts.items())
            ],
        }


SENSITIVE_KEY_CATEGORIES = {
    "id": "RECORD_IDENTIFIER",
    "caseid": "CASE_REFERENCE",
    "activecaseid": "CASE_REFERENCE",
    "matchedcaseid": "CASE_REFERENCE",
    "personid": "PERSON_IDENTIFIER",
    "matchedpersonid": "PERSON_IDENTIFIER",
    "casepersonid": "PERSON_IDENTIFIER",
    "matchid": "RECORD_IDENTIFIER",
    "firnumber": "CASE_REFERENCE",
    "fir": "CASE_REFERENCE",
    "name": "PERSON",
    "personname": "PERSON",
    "accusedname": "PERSON",
    "accusednames": "PERSON",
    "victimname": "PERSON",
    "witnessname": "PERSON",
    "officername": "OFFICER",
    "badgeid": "OFFICER_IDENTIFIER",
    "phone": "PHONE_NUMBER",
    "phonenumber": "PHONE_NUMBER",
    "mobile": "PHONE_NUMBER",
    "email": "EMAIL_ADDRESS",
    "address": "ADDRESS",
    "location": "LOCATION",
    "latitude": "PRECISE_LOCATION",
    "longitude": "PRECISE_LOCATION",
    "registrationnumber": "VEHICLE_IDENTIFIER",
    "vehicleregistration": "VEHICLE_IDENTIFIER",
    "aadhaar": "GOVERNMENT_IDENTIFIER",
    "aadhar": "GOVERNMENT_IDENTIFIER",
}


PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "EMAIL_ADDRESS",
        re.compile(r"(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])", re.I),
    ),
    (
        "PHONE_NUMBER",
        re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)"),
    ),
    (
        "GOVERNMENT_IDENTIFIER",
        re.compile(r"(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)"),
    ),
    (
        "CASE_REFERENCE",
        re.compile(r"\bFIR[/\\-][A-Z0-9/\\-]{4,40}\b", re.I),
    ),
    (
        "OFFICER_IDENTIFIER",
        re.compile(r"\bKA-[A-Z]{2,6}-\d{3,8}\b", re.I),
    ),
    (
        "VEHICLE_IDENTIFIER",
        re.compile(r"\b(?:KA|KL|TN|AP|TS|MH|RJ|DL)[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{3,4}\b", re.I),
    ),
    (
        "IP_ADDRESS",
        re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    ),
)


LABELLED_VALUE_PATTERN = re.compile(
    r"(?im)(?P<label>"
    r"name|accused|victim|witness|suspect|father(?:'s)?\s+name|mother(?:'s)?\s+name|"
    r"address|phone|mobile|email|fir(?:\s+no(?:\.|)|\s+number)|"
    r"ಹೆಸರು|ಆರೋಪಿ|ಸಂತ್ರಸ್ತ|ಸಾಕ್ಷಿ|ವಿಳಾಸ|ದೂರವಾಣಿ|ಮೊಬೈಲ್"
    r")\s*[:\-]\s*(?P<value>[^\n;,]{2,160})"
)


PERSON_CONTEXT_PATTERN = re.compile(
    r"(?i)\b(?:named|called|accused|victim|suspect|witness|person|officer)\s+"
    r"(?P<value>[A-Z\u0C80-\u0CFF][A-Za-z\u0C80-\u0CFF.'-]*"
    r"(?:\s+[A-Z\u0C80-\u0CFF][A-Za-z\u0C80-\u0CFF.'-]*){0,3})"
)


FIND_PERSON_PATTERN = re.compile(
    r"(?i)\b(?:find|search\s+for|look\s+up|what\s+about)\s+(?P<value>[^,;?]{2,80})"
)

KANNADA_PERSON_CONTEXT_PATTERN = re.compile(
    r"(?P<value>[\u0C80-\u0CFF]{2,}(?:\s+[\u0C80-\u0CFF]{2,}){0,3})"
    r"\s+(?:ಬಗ್ಗೆ|ಹುಡುಕಿ|ಹೆಸರಿನ)"
)

PROPER_NAME_PATTERN = re.compile(
    r"\b(?P<value>[A-Z][a-z.'-]{1,30}(?:\s+[A-Z][A-Za-z.'-]{1,30}){1,3})\b"
)

PUBLIC_PHRASES = {
    "Karnataka State Police",
    "Zero Data Retention",
    "Open Router",
    "Artificial Intelligence",
    "Investigating Officer",
    "First Information Report",
}

CASE_QUERY_WORDS = {
    "case",
    "cases",
    "open",
    "closed",
    "burglary",
    "theft",
    "crime",
    "crimes",
    "hotspot",
    "station",
    "district",
    "deadline",
    "risk",
    "warning",
    "statistics",
    "trend",
}


def _normalise_key(key: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def _iter_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, Mapping):
        for child in value.values():
            yield from _iter_strings(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from _iter_strings(child)


class PrivacySanitizer:
    def __init__(self, known_sensitive_values: Mapping[str, Sequence[str]] | None = None):
        self._value_to_token: dict[str, str] = {}
        self._token_to_value: dict[str, str] = {}
        self._category_counts: Counter[str] = Counter()
        self._known_values: list[tuple[str, str]] = []
        for category, values in (known_sensitive_values or {}).items():
            for value in values:
                clean = str(value or "").strip()
                if len(clean) >= 2:
                    self._known_values.append((str(category).upper(), clean))
        self._known_values.sort(key=lambda item: len(item[1]), reverse=True)

    @property
    def counts(self) -> Counter[str]:
        return self._category_counts.copy()

    def _tokenize(self, value: str, category: str) -> str:
        clean = value.strip()
        if not clean:
            return value
        existing = self._value_to_token.get(clean)
        if existing:
            return value.replace(clean, existing)
        category = re.sub(r"[^A-Z0-9_]", "_", category.upper()) or "SENSITIVE"
        index = 1 + sum(1 for token in self._token_to_value if token.startswith(f"[{category}_"))
        token = f"[{category}_{index}]"
        self._value_to_token[clean] = token
        self._token_to_value[token] = clean
        self._category_counts[category] += 1
        return value.replace(clean, token)

    def _replace_value(self, text: str, value: str, category: str) -> str:
        token = self._tokenize(value, category)
        return text.replace(value, token)

    def sanitize_structured(self, value: Any, inherited_category: str | None = None) -> Any:
        if isinstance(value, Mapping):
            sanitized: dict[str, Any] = {}
            for key, child in value.items():
                category = SENSITIVE_KEY_CATEGORIES.get(_normalise_key(key), inherited_category)
                sanitized[str(key)] = self.sanitize_structured(child, category)
            return sanitized
        if isinstance(value, list):
            return [self.sanitize_structured(child, inherited_category) for child in value]
        if isinstance(value, tuple):
            return [self.sanitize_structured(child, inherited_category) for child in value]
        if isinstance(value, str):
            if inherited_category:
                return self._tokenize(value, inherited_category)
            return self.sanitize_text(value)
        return value

    def sanitize_text(self, text: str, *, detect_proper_names: bool = True) -> str:
        if not text:
            return text

        # Tool messages and page context are commonly complete JSON values. A
        # structured pass is more reliable than trying to infer field names from
        # their serialized representation.
        stripped = text.strip()
        if stripped.startswith(("{", "[")):
            try:
                parsed = json.loads(stripped)
            except (TypeError, ValueError):
                parsed = None
            if parsed is not None:
                return json.dumps(self.sanitize_structured(parsed), ensure_ascii=False, default=str)

        result = text
        for category, value in self._known_values:
            if value in result:
                result = self._replace_value(result, value, category)

        def replace_labelled(match: re.Match[str]) -> str:
            label = match.group("label")
            value = match.group("value")
            key = _normalise_key(label)
            if "address" in key or "ವಿಳಾಸ" in label:
                category = "ADDRESS"
            elif any(part in key for part in ("phone", "mobile")) or label in {"ದೂರವಾಣಿ", "ಮೊಬೈಲ್"}:
                category = "PHONE_NUMBER"
            elif "email" in key:
                category = "EMAIL_ADDRESS"
            elif "fir" in key:
                category = "CASE_REFERENCE"
            else:
                category = "PERSON"
            return match.group(0).replace(value, self._tokenize(value, category))

        result = LABELLED_VALUE_PATTERN.sub(replace_labelled, result)
        for category, pattern in PATTERNS:
            result = pattern.sub(lambda match, cat=category: self._tokenize(match.group(0), cat), result)
        result = PERSON_CONTEXT_PATTERN.sub(
            lambda match: match.group(0).replace(
                match.group("value"), self._tokenize(match.group("value"), "PERSON")
            ),
            result,
        )

        def replace_find_candidate(match: re.Match[str]) -> str:
            candidate = match.group("value").strip()
            words = {word.lower().strip(".()") for word in candidate.split()}
            if words & CASE_QUERY_WORDS or len(candidate.split()) > 4:
                return match.group(0)
            return match.group(0).replace(candidate, self._tokenize(candidate, "PERSON"))

        result = FIND_PERSON_PATTERN.sub(replace_find_candidate, result)
        result = KANNADA_PERSON_CONTEXT_PATTERN.sub(
            lambda match: match.group(0).replace(
                match.group("value"), self._tokenize(match.group("value"), "PERSON")
            ),
            result,
        )
        if detect_proper_names:
            result = PROPER_NAME_PATTERN.sub(
                lambda match: (
                    match.group(0)
                    if match.group("value") in PUBLIC_PHRASES
                    else self._tokenize(match.group("value"), "PERSON")
                ),
                result,
            )
        return result

    def sanitize_messages(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sanitized: list[dict[str, Any]] = []
        for message in messages:
            next_message: dict[str, Any] = {}
            for key, value in message.items():
                if key == "content" and isinstance(value, str):
                    next_message[key] = self.sanitize_text(
                        value,
                        detect_proper_names=message.get("role") != "system",
                    )
                elif key == "tool_calls" and isinstance(value, list):
                    next_message[key] = self._sanitize_tool_calls(value)
                else:
                    next_message[key] = value
            sanitized.append(next_message)
        return sanitized

    def _sanitize_tool_calls(self, calls: list[Any]) -> list[Any]:
        sanitized: list[Any] = []
        for call in calls:
            if not isinstance(call, Mapping):
                sanitized.append(call)
                continue
            next_call = dict(call)
            function = next_call.get("function")
            if isinstance(function, Mapping):
                next_function = dict(function)
                arguments = next_function.get("arguments")
                if isinstance(arguments, str):
                    try:
                        parsed = json.loads(arguments)
                    except ValueError:
                        next_function["arguments"] = self.sanitize_text(arguments)
                    else:
                        next_function["arguments"] = json.dumps(
                            self.sanitize_structured(parsed), ensure_ascii=False
                        )
                next_call["function"] = next_function
            sanitized.append(next_call)
        return sanitized

    def restore(self, value: Any) -> Any:
        if isinstance(value, str):
            restored = value
            for token, original in sorted(
                self._token_to_value.items(), key=lambda item: len(item[0]), reverse=True
            ):
                restored = restored.replace(token, original)
            return restored
        if isinstance(value, Mapping):
            return {key: self.restore(child) for key, child in value.items()}
        if isinstance(value, list):
            return [self.restore(child) for child in value]
        if isinstance(value, tuple):
            return tuple(self.restore(child) for child in value)
        return value


def count_egress_characters(messages: list[dict[str, Any]]) -> int:
    return sum(len(value) for value in _iter_strings(messages))


def known_values_from_case(case_data: Mapping[str, Any] | None) -> dict[str, list[str]]:
    values: dict[str, list[str]] = {
        "CASE_REFERENCE": [],
        "PERSON": [],
        "PERSON_IDENTIFIER": [],
        "PHONE_NUMBER": [],
        "ADDRESS": [],
        "LOCATION": [],
    }
    if not case_data:
        return values

    def add(category: str, value: Any) -> None:
        clean = str(value or "").strip()
        if len(clean) >= 2 and clean not in values[category]:
            values[category].append(clean)

    add("CASE_REFERENCE", case_data.get("id"))
    add("CASE_REFERENCE", case_data.get("firNumber"))
    station = case_data.get("station")
    if isinstance(station, Mapping):
        add("LOCATION", station.get("name"))
    for case_person in case_data.get("casePersons") or []:
        if not isinstance(case_person, Mapping):
            continue
        add("PERSON_IDENTIFIER", case_person.get("id"))
        add("PERSON_IDENTIFIER", case_person.get("personId"))
        person = case_person.get("person")
        if not isinstance(person, Mapping):
            continue
        add("PERSON_IDENTIFIER", person.get("id"))
        add("PERSON", person.get("name"))
        add("PHONE_NUMBER", person.get("phone"))
        add("ADDRESS", person.get("address"))
    return values


def merge_public_privacy(events: Sequence[dict[str, Any]]) -> dict[str, Any] | None:
    if not events:
        return None
    counts: Counter[str] = Counter()
    total_duration = 0
    total_privacy_ms = 0
    for event in events:
        total_duration += int(event.get("durationMs") or 0)
        total_privacy_ms += int(event.get("privacyProcessingMs") or 0)
        for item in (event.get("redaction") or {}).get("categories") or []:
            category = str(item.get("category") or "SENSITIVE")
            counts[category] = max(counts[category], int(item.get("count") or 0))
    last = events[-1]
    return {
        "processingMode": last.get("processingMode"),
        "provider": last.get("provider"),
        "model": last.get("model"),
        "external": bool(last.get("external")),
        "retentionPolicy": last.get("retentionPolicy"),
        "redaction": {
            "applied": bool(counts),
            "total": sum(counts.values()),
            "categories": [
                {"category": category, "count": count}
                for category, count in sorted(counts.items())
            ],
        },
        "durationMs": total_duration,
        "privacyProcessingMs": total_privacy_ms,
    }
