from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from string import Template
from typing import Any

REGISTRY_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "investigation_playbooks.demo.json"
)

ALLOWED_SOURCE_STATUSES = {"PROVISIONAL_DEMO", "DEPARTMENT_REVIEWED", "OFFICIAL"}
PHASE_ORDER = {
    "INITIAL_REVIEW": 0,
    "EARLY_ACTIONS": 1,
    "FOLLOW_UP": 2,
    "SUPERVISORY_REVIEW": 3,
}


class PlaybookConfigurationError(RuntimeError):
    pass


class DocumentInputError(ValueError):
    pass


@lru_cache(maxsize=1)
def load_registry() -> dict[str, Any]:
    try:
        registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PlaybookConfigurationError("Investigation playbook registry could not be loaded") from exc

    required = {
        "profileCode",
        "version",
        "sourceStatus",
        "title",
        "disclaimer",
        "baseSteps",
        "crimeProfiles",
        "documentTemplates",
    }
    missing = sorted(required - set(registry))
    if missing:
        raise PlaybookConfigurationError(
            f"Investigation playbook registry is missing: {', '.join(missing)}"
        )
    if registry["sourceStatus"] not in ALLOWED_SOURCE_STATUSES:
        raise PlaybookConfigurationError("Investigation playbook sourceStatus is invalid")
    if registry["sourceStatus"] == "PROVISIONAL_DEMO" and not registry["disclaimer"].strip():
        raise PlaybookConfigurationError("A provisional playbook must include a disclaimer")
    if not isinstance(registry["version"], int) or registry["version"] < 1:
        raise PlaybookConfigurationError("Investigation playbook version must be a positive integer")

    task_keys: set[str] = set()
    for step in [
        *registry["baseSteps"],
        *[
            step
            for profile in registry["crimeProfiles"]
            for step in profile.get("steps", [])
        ],
    ]:
        key = str(step.get("key") or "").strip()
        if not key or key in task_keys:
            raise PlaybookConfigurationError("Investigation task keys must be present and unique")
        if step.get("phase") not in PHASE_ORDER:
            raise PlaybookConfigurationError(f"Unsupported investigation phase for task {key}")
        task_keys.add(key)

    template_keys: set[str] = set()
    for template in registry["documentTemplates"]:
        key = str(template.get("key") or "").strip()
        if not key or key in template_keys:
            raise PlaybookConfigurationError("Document template keys must be present and unique")
        template_keys.add(key)

    for step in [
        *registry["baseSteps"],
        *[
            step
            for profile in registry["crimeProfiles"]
            for step in profile.get("steps", [])
        ],
    ]:
        template_key = step.get("documentTemplateKey")
        if template_key and template_key not in template_keys:
            raise PlaybookConfigurationError(
                f"Task {step['key']} references an unknown document template"
            )
    return registry


def select_playbook(crime_type: str | None) -> dict[str, Any]:
    registry = load_registry()
    normalized = (crime_type or "").strip().lower()
    matched_profile = next(
        (
            profile
            for profile in registry["crimeProfiles"]
            if any(alias.lower() in normalized for alias in profile.get("aliases", []))
        ),
        None,
    )
    steps = [dict(step) for step in registry["baseSteps"]]
    if matched_profile:
        steps.extend(dict(step) for step in matched_profile.get("steps", []))
    steps.sort(key=lambda step: (PHASE_ORDER[step["phase"]], step["key"]))
    for index, step in enumerate(steps):
        step["sortOrder"] = index

    return {
        "profileCode": registry["profileCode"],
        "profileVersion": registry["version"],
        "profileTitle": registry["title"],
        "sourceStatus": registry["sourceStatus"],
        "disclaimer": registry["disclaimer"],
        "matchedCrimeProfile": matched_profile.get("key") if matched_profile else "GENERAL",
        "matchedCrimeProfileTitle": matched_profile.get("title") if matched_profile else "General workflow",
        "steps": steps,
    }


def list_document_templates() -> list[dict[str, Any]]:
    registry = load_registry()
    return [
        {
            "key": template["key"],
            "title": template["title"],
            "language": template.get("language") or "en",
            "requiredFields": list(template.get("requiredFields") or []),
            "sourceStatus": registry["sourceStatus"],
            "templateVersion": registry["version"],
        }
        for template in registry["documentTemplates"]
    ]


def get_document_template(template_key: str) -> dict[str, Any] | None:
    return next(
        (
            template
            for template in load_registry()["documentTemplates"]
            if template["key"] == template_key
        ),
        None,
    )


def render_document(
    template_key: str,
    *,
    case_context: dict[str, Any],
    officer_inputs: dict[str, Any],
) -> dict[str, Any]:
    registry = load_registry()
    template = get_document_template(template_key)
    if not template:
        raise DocumentInputError("Unknown routine-document template")

    normalized_inputs = {
        str(key): str(value).strip()
        for key, value in officer_inputs.items()
        if value is not None
    }
    allowed_inputs = set(template.get("requiredFields", []))
    unexpected = sorted(set(normalized_inputs) - allowed_inputs)
    if unexpected:
        raise DocumentInputError(
            f"Unsupported fields for this template: {', '.join(unexpected)}"
        )
    missing = [
        field
        for field in allowed_inputs
        if not normalized_inputs.get(field)
    ]
    if missing:
        raise DocumentInputError(f"Complete required fields: {', '.join(missing)}")

    values = dict(normalized_inputs)
    values.update({
        key: str(value or "Not recorded")
        for key, value in case_context.items()
    })
    content = Template(template["body"]).safe_substitute(values)
    return {
        "templateKey": template["key"],
        "templateVersion": registry["version"],
        "sourceStatus": registry["sourceStatus"],
        "title": template["title"],
        "language": template.get("language") or "en",
        "content": content,
        "inputData": normalized_inputs,
        "disclaimer": registry["disclaimer"],
    }
