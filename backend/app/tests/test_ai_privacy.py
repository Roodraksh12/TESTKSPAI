from __future__ import annotations

import json

from app.services.ai_privacy import (
    PrivacySanitizer,
    count_egress_characters,
    merge_public_privacy,
)


def test_structured_case_fields_are_tokenised_and_restorable() -> None:
    sanitizer = PrivacySanitizer()
    raw = {
        "id": "case-internal-1",
        "firNumber": "FIR/2026/0001",
        "name": "Anitha B",
        "phone": "+91 9876543210",
        "address": "12 Test Road, Bengaluru",
        "crimeType": "Burglary",
        "count": 3,
    }

    protected = sanitizer.sanitize_structured(raw)

    assert protected["crimeType"] == "Burglary"
    assert protected["count"] == 3
    assert "Anitha B" not in json.dumps(protected)
    assert "FIR/2026/0001" not in json.dumps(protected)
    assert protected["name"].startswith("[PERSON_")
    assert sanitizer.restore(protected) == raw


def test_free_text_redacts_indian_identifiers_and_labelled_names() -> None:
    sanitizer = PrivacySanitizer()
    text = (
        "Name: Raghav Sharma\nMobile: +91 98765 43210\n"
        "FIR No: FIR/2026/EXTRA-101\nVehicle: KA-05-MJ-1113"
    )

    protected = sanitizer.sanitize_text(text)

    assert "Raghav Sharma" not in protected
    assert "98765" not in protected
    assert "EXTRA-101" not in protected
    assert "KA-05-MJ-1113" not in protected
    assert sanitizer.restore(protected) == text
    assert sanitizer.counts["PERSON"] == 1


def test_known_active_case_values_are_removed_from_narrative() -> None:
    sanitizer = PrivacySanitizer(
        {
            "PERSON": ["Iqbal Pasha"],
            "CASE_REFERENCE": ["case-secret-id"],
        }
    )

    protected = sanitizer.sanitize_text(
        "Review Iqbal Pasha in case-secret-id and explain the recorded link."
    )

    assert "Iqbal Pasha" not in protected
    assert "case-secret-id" not in protected
    assert sanitizer.restore(protected).startswith("Review Iqbal Pasha")


def test_person_lookup_is_tokenised_but_generic_case_search_remains_usable() -> None:
    person_sanitizer = PrivacySanitizer()
    case_sanitizer = PrivacySanitizer()

    protected_person = person_sanitizer.sanitize_text("find Anitha B")
    protected_case_query = case_sanitizer.sanitize_text(
        "find open burglary cases in my district"
    )

    assert "Anitha B" not in protected_person
    assert "open burglary cases" in protected_case_query
    assert person_sanitizer.restore(protected_person) == "find Anitha B"


def test_names_in_follow_up_history_are_tokenised_without_rewriting_public_system_name() -> None:
    sanitizer = PrivacySanitizer()
    protected = sanitizer.sanitize_messages(
        [
            {"role": "system", "content": "Assistant for Karnataka State Police"},
            {"role": "assistant", "content": "Anitha Rao appears in a verified source."},
            {"role": "user", "content": "what about anitha rao?"},
        ]
    )

    assert protected[0]["content"] == "Assistant for Karnataka State Police"
    assert "Anitha Rao" not in protected[1]["content"]
    assert "anitha rao" not in protected[2]["content"]
    assert sanitizer.restore(protected)[1]["content"].startswith("Anitha Rao")


def test_kannada_contextual_person_reference_is_tokenised() -> None:
    sanitizer = PrivacySanitizer()
    protected = sanitizer.sanitize_text("ಅನಿತಾ ರಾವ್ ಬಗ್ಗೆ ಮಾಹಿತಿ ತೋರಿಸಿ")

    assert "ಅನಿತಾ ರಾವ್" not in protected
    assert sanitizer.restore(protected) == "ಅನಿತಾ ರಾವ್ ಬಗ್ಗೆ ಮಾಹಿತಿ ತೋರಿಸಿ"


def test_tool_arguments_and_results_use_one_temporary_token_map() -> None:
    sanitizer = PrivacySanitizer()
    messages = [
        {"role": "user", "content": "find Anitha B"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call-1",
                    "function": {
                        "name": "search_cases",
                        "arguments": json.dumps({"personName": "Anitha B"}),
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-1",
            "content": json.dumps(
                {
                    "results": [
                        {
                            "id": "case-1",
                            "firNumber": "FIR/2026/0001",
                            "name": "Anitha B",
                        }
                    ]
                }
            ),
        },
    ]

    protected = sanitizer.sanitize_messages(messages)
    serialized = json.dumps(protected)

    assert "Anitha B" not in serialized
    assert "FIR/2026/0001" not in serialized
    restored_arguments = sanitizer.restore(
        protected[1]["tool_calls"][0]["function"]["arguments"]
    )
    assert json.loads(restored_arguments)["personName"] == "Anitha B"


def test_public_privacy_merge_does_not_expose_token_values() -> None:
    merged = merge_public_privacy(
        [
            {
                "processingMode": "SANITISED_EXTERNAL",
                "provider": "OpenRouter",
                "model": "test-model",
                "external": True,
                "retentionPolicy": "ZDR_REQUIRED",
                "redaction": {
                    "categories": [
                        {"category": "PERSON", "count": 2},
                        {"category": "PHONE_NUMBER", "count": 1},
                    ]
                },
                "durationMs": 100,
                "privacyProcessingMs": 5,
            },
            {
                "processingMode": "SANITISED_EXTERNAL",
                "provider": "OpenRouter",
                "model": "test-model",
                "external": True,
                "retentionPolicy": "ZDR_REQUIRED",
                "redaction": {
                    "categories": [{"category": "PERSON", "count": 3}]
                },
                "durationMs": 120,
                "privacyProcessingMs": 6,
            },
        ]
    )

    assert merged is not None
    assert merged["redaction"]["total"] == 4
    assert merged["durationMs"] == 220
    assert count_egress_characters([{"content": "abc"}, {"content": "de"}]) == 5
