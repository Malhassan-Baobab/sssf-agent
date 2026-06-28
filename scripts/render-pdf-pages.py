"""
render-pdf-pages.py — render PDF pages to PNG for OCR.

Several SSSF source PDFs (the contributions procedures guide, board decisions,
HR executive regulation) have a CORRUPT text layer: they were exported with a
custom font glyph encoding, so pdfplumber/PyMuPDF return scrambled Arabic
(e.g. "ܦج Ȗ", "ʈﺔ"). The visual rendering is correct, so the reliable path is
OCR on rendered images (Tesseract `ara`, or a vision LLM) followed by a human/
article-level verification pass before anything is embedded.

Do NOT embed raw extracted text from these PDFs. See Notion "09 · Knowledge
Data Model & Retrieval" and corpus/MANIFEST.md.

Usage:
  python scripts/render-pdf-pages.py "corpus/raw/<file>.pdf" <out_dir> [dpi]
"""

import sys
import os
import fitz  # PyMuPDF

def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/render-pdf-pages.py <pdf> <out_dir> [dpi]")
        sys.exit(1)
    pdf_path, out_dir = sys.argv[1], sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    os.makedirs(out_dir, exist_ok=True)
    zoom = dpi / 72.0

    doc = fitz.open(pdf_path)
    base = os.path.splitext(os.path.basename(pdf_path))[0]
    for i in range(doc.page_count):
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        out = os.path.join(out_dir, f"{base}_p{i + 1:03d}.png")
        pix.save(out)
    print(f"Rendered {doc.page_count} pages of '{base}' to {out_dir} at {dpi} dpi")

if __name__ == "__main__":
    main()
