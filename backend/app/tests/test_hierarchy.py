from app.services.hierarchy import (
    can_invite_rank,
    child_hierarchy_path,
    has_wide_case_scope,
    inviteable_ranks,
    is_police_it,
    platform_capabilities,
    required_geo_fields,
)


def test_police_it_can_invite_gazetted() -> None:
    assert can_invite_rank("POLICE_IT", "SP")
    assert can_invite_rank("POLICE_IT", "ASP_ACP")
    assert not can_invite_rank("POLICE_IT", "DYSP")
    assert not can_invite_rank("POLICE_IT", "CONSTABLE")


def test_cascade_edges() -> None:
    assert can_invite_rank("ASP_ACP", "DYSP")
    assert can_invite_rank("DYSP", "SHO")
    assert can_invite_rank("DYSP", "INSPECTOR")
    assert can_invite_rank("SHO", "CONSTABLE")
    assert can_invite_rank("INSPECTOR", "SI")
    assert not can_invite_rank("SHO", "DYSP")
    assert not can_invite_rank("SP", "SP")
    assert not can_invite_rank("CONSTABLE", "SI")


def test_wide_scope() -> None:
    assert has_wide_case_scope("SP")
    assert has_wide_case_scope("POLICE_IT")
    assert has_wide_case_scope("DYSP")
    assert not has_wide_case_scope("INSPECTOR")
    assert not has_wide_case_scope("CONSTABLE")
    assert is_police_it("POLICE_IT")


def test_child_path() -> None:
    assert child_hierarchy_path("it", "officer-sp-demo") == "it.officer_sp_demo"
    assert child_hierarchy_path(None, "abc") == "abc"


def test_inviteable_ranks_sho() -> None:
    ranks = inviteable_ranks("SHO")
    assert "CONSTABLE" in ranks
    assert "DYSP" not in ranks


def test_platform_capabilities_police_it() -> None:
    caps = platform_capabilities({"role": "POLICE_IT"})
    assert caps["canWriteCases"] is False
    assert caps["defaultHome"] == "/overview"
    assert caps["nav"]["analytics"] is False
    assert caps["nav"]["cases"] is False
    assert caps["nav"]["invite"] is True
    assert caps["nav"]["passwordResets"] is True


def test_required_geo_igp() -> None:
    assert "commandRangeId" in required_geo_fields("IGP")
