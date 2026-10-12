"""Extract Loi 016/01 articles into the RAG legal corpus (one chunk per article).

Usage:
    python -m tools.ingest_law [--pdf PATH] [--out PATH] [--dry-run]

Reads the official PDF (text-selectable; the file's custom font encoding drops
accents, so extraction is faithful but unaccented in places — key compliance
terms such as DME, AAC, autorisation and abattage are ASCII-safe), splits on
article boundaries, and writes ``knowledge/legal/loi_016_01_articles.json``
for the standard ``python -m ingestion.ingest`` pipeline (doc_type='legal').

Only ``main()`` needs pypdf; parsing helpers are pure and unit-tested.
"""

import argparse
import json
import re
import sys
from pathlib import Path

PDF_DEFAULT = (
    Path(__file__).resolve().parent.parent.parent / "docs" / "LOI N°016_01 code forestier.pdf"
)
OUT_DEFAULT = (
    Path(__file__).resolve().parent.parent / "knowledge" / "legal" / "loi_016_01_articles.json"
)

ARTICLE_RE = re.compile(r"Article\s+(\d+)\s*[\.\-–]+", re.IGNORECASE)
SOURCE_LABEL = "docs/LOI N°016_01 code forestier.pdf"


def clean_text(text: str) -> str:
    """Collapse whitespace, dehyphenate line breaks, drop page-number lines."""
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln and not re.fullmatch(r"\d+", ln)]
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def split_articles(full_text: str) -> list[tuple[int, str]]:
    """Split full law text into (article_number, body) pairs in order."""
    matches = list(ARTICLE_RE.finditer(full_text))
    chunks: list[tuple[int, str]] = []
    for i, match in enumerate(matches):
        number = int(match.group(1))
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        body = clean_text(full_text[start:end])
        if len(body) >= 40:
            chunks.append((number, body))
    return chunks


def build_entries(chunks: list[tuple[int, str]]) -> list[dict]:
    """Wrap article chunks in knowledge/legal JSON entries."""
    entries = []
    for number, body in chunks:
        entries.append(
            {
                "id": f"loi016_art_{number:03d}",
                "content": f"LOI N°016/01 portant Code forestier en République Gabonaise — Article {number}. {body}",
                "metadata": {
                    "legal_framework_reference": "loi_016_01",
                    "residue_type": "mixed",
                    "language": "fr",
                    "source": SOURCE_LABEL,
                    "article": number,
                },
            }
        )
    return entries


def extract_pdf_text(pdf_path: Path) -> str:
    """Read-only PDF text extraction (pypdf imported lazily)."""
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=PDF_DEFAULT)
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    full = extract_pdf_text(args.pdf)
    chunks = split_articles(full)
    entries = build_entries(chunks)
    print(f"articles: {len(chunks)} from {args.pdf}")
    if args.dry_run:
        for entry in entries[:3]:
            print(f"  {entry['id']} ({len(entry['content'])} chars)")
        return
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(entries)} entries to {args.out}")


if __name__ == "__main__":
    sys.exit(main() or 0)
