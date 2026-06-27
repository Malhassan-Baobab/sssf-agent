# Corpus Manifest

`corpus/raw/` is gitignored — files live on local disk only. This manifest is the committed record.

## Status legend
- ✅ Clean — text-based, ready to chunk directly
- 🔧 OCR needed — scanned image PDF, needs extraction + verification
- 📊 Reference — calculator / eval data, not ingested as RAG
- 📋 SRS — system specs, Pillar 3 context (not in RAG pilot)

---

## A. Legal corpus (RAG Pillar 1)

| File | Type | Status | doc_key | Notes |
|---|---|---|---|---|
| `قانون الضمان بالعناوين.docx` | AR law | ✅ Clean | `law_5_2018_ar` | 72 articles with headings — **primary chunk source** |
| `English SSSF Law word.docx` | EN law | ✅ Clean | `law_5_2018_en` | English rendering; Arabic governs in conflict |
| `قانون-رقم-(5)-لسنة-2018م-...-compressed.pdf` | AR law PDF | ✅ (backup) | — | PDF backup of the docx; use docx for chunking |
| `قوانين معاشات ذات العلاقة بالحاسبة إلكترونية.docx` | AR pension provisions | ✅ Clean | `pension_calc_provisions` | Bridges Pillar 1 ↔ Pillar 2 |
| `نسخة اللائحة التنفيذية للموارد البشرية -36.pdf` | AR exec regulation | 🔧 OCR | `hr_exec_reg_36` | HR executive regulation |
| `نسخة ملاحق اللائحة التنفيذية للموارد البشرية -36.pdf` | AR appendices | 🔧 OCR | `hr_exec_reg_36_appendices` | Appendices to HR exec reg |
| `9- بشأن تنظيم صندوق...scan.pdf` | AR board decision | 🔧 OCR | `board_decision_9` | Organizing SSSF |
| `70- بشأن اخضاع...scan.pdf` | AR board decision | 🔧 OCR | `board_decision_70` | Subjecting SHJ Gov employees |
| `71- بشأن تشكيل...scan.pdf` | AR board decision | 🔧 OCR | `board_decision_71` | Board formation |
| `دليل الاجراءات لادارة الاشتراكات - 1.pdf` | AR guide | 🔧 OCR | `contributions_guide` | Contributions/subscriptions procedures |

## B. Forms (RAG + action layer)

| File | Status | doc_key |
|---|---|---|
| `نموذج رقم 3 ضم خدمة للصندوق.pdf` | 🔧 OCR | `form_3_annexation` |
| `نموذج رقم 4 شراء مدة خدمة اعتبارية.pdf` | 🔧 OCR | `form_4_purchase` |
| `Purchase & Service Addition.docx` | ✅ Clean | `purchase_service_addition_logic` |

## C. Calculation reference (Pillar 2 — seeded to Supabase, not RAG)

| File | Purpose |
|---|---|
| `Final Version الحاسبة الصورة الأخيرة.xlsx` | Production calculator — source of truth for `final_v1` config |
| `Calc.xlsx` | Eligibility matrices (pension vs. gratuity) |
| `شكل حالات المعاش والمكافأة.xlsx` | Pension/gratuity case shapes |

## D. Evaluation seed

| File | Purpose |
|---|---|
| `Questions_and_Answers.xlsx` | ~40 Arabic Q&A pairs — FAQ fast-path + gold eval seed |

## E. System specifications (Pillar 3 context — not in RAG pilot)

| File |
|---|
| `(Official Version 2.0) Benefits Module SRS - SSSF.pdf` |
| `(Official Version 2.0) Registration Module SRS - SSSF.pdf` |
| `(Draft Version 1.0) Payments & Disbursement Module SRS - SSSF.pdf` |
| `(Official Version 2.0) Contributions Collection Service Module SRS - SSSF.pdf` |
| `(Official Version 2.0) Add-Buy Service Module SRS - SSSF.pdf` |
| `(Official Version 3.0) Add-Buy Service Module SRS - SSSF.pdf` |

---

## corpus/clean/ contents (committed)

Files here are quality-passed, chunking-ready. Each corresponds to a `doc_key` above.

| File | Source | Description |
|---|---|---|
| *(populated by ingestion scripts)* | | |

## OCR backlog

Decisions 9/70/71, contributions guide, HR exec reg + appendices, Form 3/4.
Priority: exec reg > contributions guide > decisions > forms.
Approach: run through Tesseract (`ara` lang) or GPT-4o Vision, verify each article reads correctly before adding to `corpus/clean/`.
