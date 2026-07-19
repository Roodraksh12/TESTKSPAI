from __future__ import annotations

import hashlib

# Offline gazetteer geocoder. Deliberately no paid geocoding API — a small
# dictionary of Karnataka localities plus deterministic jitter so cases at the
# same locality spread into a visible cluster instead of stacking on one pixel.

JITTER_DEG = 0.0075  # ~0.8 km
BENGALURU_CENTRE = (12.9716, 77.5946)
KA_BOUNDS = (11.0, 18.5, 74.0, 78.6)  # lat_min, lat_max, lng_min, lng_max

GAZETTEER: dict[str, tuple[float, float]] = {
    # Bengaluru localities
    "whitefield": (12.9698, 77.7500),
    "indiranagar": (12.9716, 77.6412),
    "koramangala": (12.9352, 77.6245),
    "itpl": (12.9860, 77.7371),
    "mg road": (12.9758, 77.6045),
    "electronic city": (12.8452, 77.6602),
    "hebbal": (13.0355, 77.5970),
    "jayanagar": (12.9308, 77.5838),
    "hsr layout": (12.9116, 77.6389),
    "hsr": (12.9116, 77.6389),
    "btm layout": (12.9166, 77.6101),
    "btm": (12.9166, 77.6101),
    "marathahalli": (12.9591, 77.6974),
    "yelahanka": (13.1007, 77.5963),
    "malleswaram": (13.0027, 77.5697),
    "rajajinagar": (12.9911, 77.5528),
    "banashankari": (12.9250, 77.5665),
    "vijayanagar": (12.9719, 77.5326),
    "rt nagar": (13.0198, 77.5975),
    "kr puram": (12.9975, 77.6960),
    "bellandur": (12.9257, 77.6783),
    "sarjapur road": (12.9010, 77.6870),
    "sarjapur": (12.9010, 77.6870),
    "cubbon park": (12.9763, 77.5929),
    "vidhana soudha": (12.9794, 77.5912),
    "yeshwanthpur": (13.0284, 77.5540),
    "domlur": (12.9611, 77.6387),
    "ulsoor": (12.9815, 77.6205),
    "jp nagar": (12.9077, 77.5851),
    # District centres
    "mysuru": (12.28, 76.62),
    "belagavi": (15.8497, 74.4977),
    "mangaluru": (12.9141, 74.8560),
    "kalaburagi": (17.3297, 76.8343),
    "hubballi": (15.3647, 75.1240),
    "dharwad": (15.4589, 75.0078),
}

_SORTED_KEYS = sorted(GAZETTEER.keys(), key=len, reverse=True)


def _deterministic_jitter(seed_text: str) -> tuple[float, float]:
    digest = hashlib.md5(seed_text.encode("utf-8")).hexdigest()
    lat_unit = int(digest[:8], 16) / 0xFFFFFFFF
    lng_unit = int(digest[8:16], 16) / 0xFFFFFFFF
    return (
        (lat_unit * 2 - 1) * JITTER_DEG,
        (lng_unit * 2 - 1) * JITTER_DEG,
    )


def _clamp_to_karnataka(point: tuple[float, float]) -> tuple[float, float]:
    lat_min, lat_max, lng_min, lng_max = KA_BOUNDS
    lat, lng = point
    return (min(max(lat, lat_min), lat_max), min(max(lng, lng_min), lng_max))


def geocode_location(location_text: str | None, hint_text: str | None = None) -> tuple[float, float]:
    combined = f"{location_text or ''} {hint_text or ''}".strip().lower()
    if not combined:
        return _clamp_to_karnataka(BENGALURU_CENTRE)

    base = BENGALURU_CENTRE
    for key in _SORTED_KEYS:
        if key in combined:
            base = GAZETTEER[key]
            break

    lat_offset, lng_offset = _deterministic_jitter(combined)
    return _clamp_to_karnataka((base[0] + lat_offset, base[1] + lng_offset))
