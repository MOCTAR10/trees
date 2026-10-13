"""Training-data export of reference-measured scans (Slice 15)."""

import csv

from tools import export_trunk_dataset as exporter


def _media(root, key, with_mask=True):
    folder = root / key
    folder.mkdir(parents=True)
    (folder / "dbh.jpg").write_bytes(b"jpg-" + key.encode())
    if with_mask:
        (folder / "mask.png").write_bytes(b"png")


def _row(key, ref, vision, scan_id=1):
    return {
        "id": scan_id,
        "media_key": key,
        "species_scientific_name": "Aucoumea klaineana",
        "measured_dbh_cm": ref,
        "dbh_method": "tape_circumference",
        "dbh_vision_cm": vision,
        "ar_depth_m": 2.0,
    }


def test_export_keeps_agreeing_masked_scans(tmp_path):
    media, out = tmp_path / "media", tmp_path / "out"
    _media(media, "good")
    _media(media, "far")
    _media(media, "nomask", with_mask=False)
    rows = [
        _row("good", 55.0, 53.6, 1),
        _row("far", 55.0, 70.0, 2),  # +27 %: mask suspicious
        _row("nomask", 60.0, 59.0, 3),
        _row("missing", 60.0, 60.0, 4),  # files gone
    ]
    summary = exporter.export(rows, media, out, max_discrepancy=10.0)
    assert summary == {"exported": 1, "skipped": 3, "out": str(out)}
    assert (out / "images" / "good.jpg").read_bytes() == b"jpg-good"
    assert (out / "masks" / "good.png").exists()
    with (out / "manifest.csv").open(encoding="utf-8") as fh:
        rows_out = list(csv.DictReader(fh))
    assert [r["media_key"] for r in rows_out] == ["good"]
    assert rows_out[0]["discrepancy_pct"] == "-2.5"


def test_export_without_filter_and_unmasked(tmp_path):
    media, out = tmp_path / "media", tmp_path / "out"
    _media(media, "far")
    _media(media, "nomask", with_mask=False)
    rows = [_row("far", 55.0, 70.0), _row("nomask", 60.0, None)]
    summary = exporter.export(rows, media, out, max_discrepancy=None, include_unmasked=True)
    assert summary["exported"] == 2
    assert not (out / "masks" / "nomask.png").exists()
