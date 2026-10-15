from datetime import date, datetime

from app.core import fr_format


def test_fr_date():
    assert fr_format.fr_date(date(2026, 10, 14)) == "14/10/2026"
    assert fr_format.fr_date(datetime(2026, 3, 31, 12, 5)) == "31/03/2026"
    assert fr_format.fr_date("2026-10-14T08:00:00Z") == "14/10/2026"
    assert fr_format.fr_date(None) == ""
    assert fr_format.fr_date("inconnue") == "inconnue"


def test_fr_num():
    assert fr_format.fr_num(3500000.0) == "3 500 000"
    assert fr_format.fr_num(95.5, 1) == "95,5"
    assert fr_format.fr_num(80.0, 1) == "80"
    assert fr_format.fr_num(1234.567, 2) == "1 234,57"
    assert fr_format.fr_num(None) == ""
    assert fr_format.fr_num("n/a") == "n/a"


def test_authorization_labels():
    assert fr_format.authorization_label("cae") == "Cahier des charges (CAE)"
    assert fr_format.authorization_label("autre") == "autre"
    assert (
        fr_format.with_authorization_label("permis_annuel_operations · AAC-1")
        == "Permis annuel d'opérations · AAC-1"
    )
    assert fr_format.with_authorization_label(None) == ""
