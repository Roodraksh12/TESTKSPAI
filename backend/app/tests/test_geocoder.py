from app.services.geocoder import JITTER_DEG, KA_BOUNDS, geocode_location


def test_mysuru_locality_resolves_near_mysuru_not_bengaluru() -> None:
    lat, lng = geocode_location("Kuvempunagar, Mysuru")
    assert abs(lat - 12.28) <= JITTER_DEG
    assert abs(lng - 76.62) <= JITTER_DEG


def test_vague_text_uses_station_hint() -> None:
    lat, lng = geocode_location("near the old water tank", "Whitefield PS")
    assert abs(lat - 12.9698) <= JITTER_DEG
    assert abs(lng - 77.7500) <= JITTER_DEG


def test_deterministic_same_input_twice() -> None:
    first = geocode_location("ITPL parking lot, Whitefield")
    second = geocode_location("ITPL parking lot, Whitefield")
    assert first == second


def test_two_different_inputs_at_one_locality_are_distinct() -> None:
    a = geocode_location("ITPL back gate, Whitefield")
    b = geocode_location("Whitefield main road near signal")
    assert a != b


def test_longest_key_wins_over_shorter_substring() -> None:
    lat, lng = geocode_location("Electronic City phase 1")
    assert abs(lat - 12.8452) <= JITTER_DEG
    assert abs(lng - 77.6602) <= JITTER_DEG


def test_unmatched_location_falls_back_to_bengaluru_centre() -> None:
    lat, lng = geocode_location("somewhere unspecified")
    assert abs(lat - 12.9716) <= JITTER_DEG
    assert abs(lng - 77.5946) <= JITTER_DEG


def test_all_outputs_within_karnataka_bounds() -> None:
    lat_min, lat_max, lng_min, lng_max = KA_BOUNDS
    samples = [
        geocode_location("Whitefield"),
        geocode_location("Mysuru"),
        geocode_location("Belagavi"),
        geocode_location("Mangaluru"),
        geocode_location("Kalaburagi"),
        geocode_location("Hubballi"),
        geocode_location("Dharwad"),
        geocode_location(None, None),
        geocode_location("totally unknown place, nowhere in particular"),
    ]
    for lat, lng in samples:
        assert lat_min <= lat <= lat_max
        assert lng_min <= lng <= lng_max


def test_none_location_and_hint_returns_bengaluru_centre() -> None:
    lat, lng = geocode_location(None, None)
    assert abs(lat - 12.9716) <= JITTER_DEG
    assert abs(lng - 77.5946) <= JITTER_DEG
