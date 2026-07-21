# KisanNetra — Project Context & Session Handoff

> **Purpose of this file:** A running context/handoff document. If the API limit
> is hit or a new chat session starts, paste this file (or point the assistant at
> it) so it has full context of what has been done, decisions made, and what's
> next. **Update the "Session Log" section after every meaningful prompt.**

**Last updated:** 2026-07-14
**Project root:** `C:\Users\Prashant\Desktop\KisanNetra\KisanNetra`
**Platform:** Windows (darwin shell reported), git repo present.

---

## 1. What this project is

**KisanNetra** — a crop-disease image classification system. Farmers photograph
crops on a smartphone; the model identifies the disease.

- **Design spec:** `ML.md` (in project root). Describes a hybrid architecture:
  - **Web app** → *Teacher* model (EfficientNetV2-S, ~21M params), server-side (FastAPI + GPU), highest accuracy, online.
  - **Mobile app** → *Student* model (MobileNetV3-Large / EfficientNet-Lite0, ~5M params), on-device, fully offline, syncs when online.
  - Student is created via **knowledge distillation** from the teacher.
- **ML.md is a design document, NOT implemented code yet.** No `src/`, `serving/`,
  `mobile/` etc. exist — only the spec + the dataset work below.

### ML.md target taxonomy (IMPORTANT — differs from current data)
ML.md specifies **30 classes across 7 crops**: Tomato, Potato, Pepper, Maize,
Wheat, Rice, Groundnut. Naming convention: `{Crop}___{Disease}`.
- Note ML.md uses `Wheat___Stripe_Rust` / `Wheat___Leaf_Rust`, but the merged
  dataset (below) has `Wheat___Yellow_Rust` / `Wheat___Brown_Rust`. **These need
  remapping** (Yellow→Stripe, Brown→Leaf) when filtering to the ML.md taxonomy.
- The merged dataset is **broader** than ML.md (49 classes incl. Apple, Grape,
  Orange, Soybean, Sugarcane, etc.). A filtering/remapping step is still TODO.

---

## 2. Datasets

### Source datasets (Kaggle downloads — DO NOT DELETE without explicit OK)
| Folder | Size | Structure |
|---|---|---|
| `Crop Diseases Dataset/Crop Diseases/Crop___Disease/<Crop>/<Class>/` | 4.5 GB | "direct" — crop folders, no train/valid split. **Sugarcane subclasses have NO crop prefix** (e.g. `Red Rot`, `Healthy`). Source tag `cd_`. |
| `New Plant Diseases Dataset(Augmented)/New Plant Diseases Dataset(Augmented)/{train,valid}/<Class>/` | 1.6 GB | "split" — has train + valid; class folders fully qualified (e.g. `Corn_(maize)___Common_rust_`). Source tag `np_`. |
| `PlantDoc-Dataset-master/{train,test}/<Class>/` | small | "split" — real FIELD-condition images (fixes PlantVillage lab-bias). Idiosyncratic folder names (`Apple rust leaf`, `Tomato mold leaf`) → explicit `PLANTDOC_CLASS_MAP`. 2,572 imgs. Source tag `pd_`. |
| `Rice Disease/<Class>/` | ~29k imgs | "direct" — 18 flat rice classes, NO crop prefix, no split. Source tag `rd_`. Adds 14 NEW rice classes beyond the 4 already present. |

### FINAL dataset — `Final_KisanNetra_Dataset` (CURRENT, use this for training)
- **`Final_KisanNetra_Dataset/{train,valid,test}/<Canonical_Class>/`**
- **62 classes** (was 48; Rice grew 4 → 18 via the Rice Disease dataset).
- **train:** 101,666 · **valid:** 21,529 · **test:** 3,191 · **total:** 126,386 images
- Built by `build_final_dataset.py`: pre-merged base (`Final_Plant_Dataset`) + `Rice Disease`.
  126,386 copied · 1,933 content-dups skipped · 0 errors.
- Rice Disease (flat, no split) was **auto-split 80/10/10 deterministically** (hash of
  filename → reproducible). `test/` kept as a SEPARATE holdout (ML.md §24).
- **`test/` has only 45 of 62 classes** — small classes are thin/absent there; treat as a
  PARTIAL holdout, not a full test set.
- Artifacts written: `Final_KisanNetra_Dataset/classes.txt` (62 lines) + `class_map.json`
  (per-dataset mapping, per-class counts, stats).
- **Known weak spots (imbalance ~50×):** several Rice classes ~90–100 imgs
  (Sheath_Rot 91, Bakanae/Stem_Rot/Grassy_Stunt/Ragged_Stunt 100, Bacterial_Streak 99,
  False_Smut 117); 3 Sugarcane classes 100 each. Largest ~5,000 (Rice_Brown_Spot).
  Handle with weighted sampler + focal loss (§8), collect more, or drop.

### Intermediate — `Final_Plant_Dataset` (48-class, now the pre-merged BASE)
- **`Final_Plant_Dataset/{train,valid,test}/<Canonical_Class>/`**
- 48 classes. train 80,052 · valid 18,668 · test 236 (PlantDoc test only).
- This is the merge of Crop Diseases + New Plant + PlantDoc (files tagged `cd_`/`np_`/`pd_`).
  `build_final_dataset.py` consumes it as `type: "premerged"` and treats those 3 raw
  sources as DISABLED (re-merging them would only create dedup churn).
- Kept intact as a fallback; superseded by `Final_KisanNetra_Dataset` for training.

### Merge history (historical)
- Original 2-dataset merge: 96,782 copied · 4,409 dup-skipped (before cleanup).
- Post-cleanup: 48 classes, train 77,716 · valid 18,668.
- + PlantDoc (`add_plantdoc.py`): +2,336 train, +236 new `test/` split → train 80,052.
- + Rice Disease (`build_final_dataset.py`): → `Final_KisanNetra_Dataset`, 62 classes.

---

## 3. Key artifacts created this session

| File | What it is |
|---|---|
| `build_final_dataset.py` | **Current unifier.** Merges pre-merged base + Rice Disease → `Final_KisanNetra_Dataset`. Supports `premerged`/`split`/`direct` layouts, strong class mapping (`CLASS_ALIASES` + per-dataset maps + crop_hint), deterministic auto-split for direct datasets, filename + optional MD5 dedup, `DRY_RUN`, `TEST_DESTINATION`, writes `classes.txt`/`class_map.json`. Stdlib only. |
| `add_plantdoc.py` | Folds PlantDoc into `Final_Plant_Dataset` (train→train, test→new `test/`). Reuses `normalize_class_name` + explicit `PLANTDOC_CLASS_MAP`. `DRY_RUN`, dedup, `pd_` tag. |
| `build_final.log` / `dryrun_final.log` | Logs of the real build and the dry-run for `Final_KisanNetra_Dataset`. |
| `merge_datasets.py` | Original 2-dataset merge script (stdlib). **NOTE: only the compiled `__pycache__/*.pyc` remains on disk; the `.py` source is missing** — restore from git/backup if edits needed. |
| `cleanup_dataset.py` | Post-merge cleanup (Maize dup merge, valid-set backfill, LOW flags). **Also only `.pyc` on disk.** |
| `merge_run.log` / `cleanup_run.log` | Logs of the earlier merge + cleanup runs. |
| `PROJECT_CONTEXT.md` | **This file** — the handoff/context doc. |
| `Steps.md` | Phased implementation roadmap (Phase 0–16) mapping every ML.md section to concrete steps + acceptance criteria + release gates. |

---

## 4. Important decisions & rationale (so they aren't re-litigated)

1. **Class-name normalization** → canonical `Crop___Disease`, title-cased.
   - Strips parentheticals (`Corn_(maize)` → `Corn`), collapses separators,
     drops noise tokens (`maize`, `bell`) via `TOKEN_ALIASES`.
   - **Crop-hint aware:** for the "direct" dataset, the parent folder supplies the
     crop, so unprefixed sugarcane classes become `Sugarcane___Red_Rot` etc.
   - Result: `Corn___Common_Rust` (ds1) and `Corn_(maize)___Common_rust_` (ds2)
     both merge into the SAME `Corn___Common_Rust` folder. **Verified:** that
     folder has 1,192 `cd_` + 952 `np_` images.

2. **Dedup by MD5 content hash, NOT filename.** Both datasets reuse generic
   filenames (`image (1).JPG`, `S_RR (1).jpg`), so filename dedup would wrongly
   drop distinct images. Output files are prefixed with a source tag
   (`cd_` = Crop Diseases, `np_` = New Plant) to prevent overwrites.

3. **Nothing has been deleted.** User chose "Nothing yet (recommended)" — keep the
   6.1 GB source datasets as a fallback until training/validation is confirmed
   against `Final_Plant_Dataset`. Delete only on explicit future request.

---

## 5. Open TODOs / next steps

- [ ] **[NOW — before training] Collect field data** — real smartphone photos per
      class (target 200–500, even 50–100 helps; currently only PlantDoc's ~2.5k across
      27 classes). See "Field Data Sources" below. Still the #1 real-world blocker.
- [ ] Build the train pipeline against **`Final_KisanNetra_Dataset` (62 classes)**:
      `config/classes.py` (62-class list from `classes.txt`), leakage-safe splits,
      `src/datasets.py`, augmentation (§7), training (§9-11).
- [ ] **Handle heavy imbalance (~50×)** — small Rice classes ~90–100 imgs, Sugarcane 100,
      vs ~5,000 for big classes. Weighted sampler + focal loss (§8); collect more or drop
      the tiniest (Rice Sheath_Rot 91, Bacterial_Streak 99, etc.).
- [ ] **`test/` is a PARTIAL holdout** (45/62 classes) — decide whether to rebalance the
      test split or add field-only test images before using it as a release gate.
- [ ] Consider `TEST_DESTINATION="valid"` if a dedicated field holdout will be sourced
      separately (currently PlantDoc/auto-split test is the only holdout).
- [ ] (Optional) True ML.md 30-class taxonomy: source Groundnut (Mendeley
      x6x5jkk873); Wheat rust remap (Yellow→Stripe, Brown→Leaf). Rice Bacterial Blight
      is now PRESENT (`Rice___Bacterial_Blight`, 3,974 imgs).
- [ ] **Restore missing `merge_datasets.py` / `cleanup_dataset.py` sources** (only `.pyc`
      on disk) from git/backup if further edits to them are needed.
- [ ] (Optional, when confirmed) Reclaim disk by deleting raw source datasets — but
      `Final_Plant_Dataset` is now the pre-merged BASE, so keep it until training is confirmed.

## 5b. Field Data Sources (advice captured 2026-07-13)

**A. Existing field datasets to download first (fastest):**
- **PlantDoc** (~2,600 field-condition images) — best match; built to fix PlantVillage lab-bias. Has Tomato/Potato/Corn etc.
- iNaturalist / GBIF — real-world, geotagged, filter by species.
- Cassava Leaf Disease (Kaggle) — real African field photos.
- Search Kaggle `"field" plant disease` (newest); Google Dataset Search per disease.
- ⚠️ Re-map their labels to our taxonomy (like `merge_datasets.py` did).

**B. Web/search images (fast, noisy — expert-verify each):**
- Google/Bing per class via `bing-image-downloader` / `icrawler`.
- Good for rough 50–100/class to MIX INTO TRAINING; never into the test set.

**C. Real collection (only path to a truly solid agent — ML.md §4.2):**
- Agricultural universities / KVKs (Krishi Vigyan Kendras) — district-level, have plots + agronomists. Best channel in India.
- Extension workers / NGOs — WhatsApp photo+label pipeline.
- Local farmers directly; own campus/nearby farms with 2–3 phone models.

**Golden rules:** label quality > volume · verify look-alike diseases with an expert ·
keep the field TEST set expert-labeled & never web-scraped · maximize geo/device/time diversity.

---

## 6. Session Log (append newest at top — UPDATE EVERY PROMPT)

### 2026-07-14
- **Built `Final_KisanNetra_Dataset` (62 classes)** via new `build_final_dataset.py`.
  train 101,666 · valid 21,529 · test 3,191 · total 126,386. 126,386 copied,
  1,933 content-dups skipped, 0 errors. Wrote `classes.txt` + `class_map.json`.
- **Key realization:** `Final_Plant_Dataset` was ALREADY the merge of Crop Diseases +
  New Plant + PlantDoc (files tagged `cd_`/`np_`/`pd_`). So the new builder uses it as a
  `premerged` BASE and disables those 3 raw sources; only **Rice Disease** was genuinely new.
- **Rice Disease** (18 flat classes, ~29k imgs, no split) auto-split 80/10/10
  deterministically and merged: 4 existing Rice classes boosted + **14 new** Rice classes
  (Bacterial_Blight, Tungro, Hispa, Leaf_Scald, Leaf_Smut, Narrow_Brown_Spot, Bakanae,
  False_Smut, Sheath_Blight, Sheath_Rot, Stem_Rot, Grassy/Ragged_Stunt_Virus, Bacterial_Streak).
  48 → 62 classes. `Rice___Bacterial_Blight` now present (closes an old ML.md-taxonomy gap).
- Flagged: `test/` covers only 45/62 classes (partial holdout); imbalance now ~50×
  (small Rice/Sugarcane ~90–100 vs ~5,000).
- Earlier: added PlantDoc via `add_plantdoc.py` (+2,336 train, new `test/` 236) → base 80,052 train.
- Noticed `merge_datasets.py`/`cleanup_dataset.py` `.py` sources are missing (only `.pyc`);
  recovered their exact `normalize_class_name`/`_tokenize` logic from bytecode to reuse it.

### 2026-07-13
- **DECISION: pausing until field data is collected.** User will start training
  tomorrow AFTER gathering proper real-field photos (not lab-only) for best
  real-world performance. Prototype-now was declined in favor of data-first.
- Advice given on WHERE to get field data (see "Field Data Sources" section below).
- Discussed real-field readiness (ML.md §4.2/§7/§14): field data is the #1 unlock,
  §7 augmentation is the free win, §13-14 OOD guard is the trust/safety net.
  Confirmed: current lab-only data is enough to BUILD a model, not to TRUST one
  in the field. Same-resolution Google photos predict reliably ONLY if they look
  lab-style (plain bg, single leaf); real field/cluttered photos are unreliable.
- Ran `cleanup_dataset.py` → dataset now **48 classes, both train+valid**.
  Fix1: merged duplicate Maize class (Cercospora → Gray_Leaf_Spot). Fix2: moved
  15% train→valid for the 11 no-valid classes (Rice×4, Wheat×3, Sugarcane×3,
  Corn_Gray_Leaf_Spot resolved via merge). Fix3: flagged 3 Sugarcane classes as LOW.
  Final: train 77,716 · valid 18,668. **Decided on FULL 48-class model.**
- Analyzed per-class counts: most classes 500–2,150 imgs (healthy for transfer
  learning); Sugarcane critically sparse (100 each); confirmed Groundnut + Rice
  Bacterial Blight missing vs ML.md taxonomy.
- Created `Steps.md` — phased implementation roadmap (17 phases, Phase 0–16)
  covering every ML.md section, with acceptance criteria + release gates. Phase 1
  merge marked done; taxonomy filter (Phase 2) is the immediate next action.
- Created `PROJECT_CONTEXT.md` (this file) as an ongoing handoff doc.
- User chose NOT to delete anything yet (kept 6.1 GB sources as fallback). A stray
  background `du` command reported failed (exit 2) — harmless, sizes already known.
- Ran the merge in background → completed: 96,782 images copied, 4,409 dup-skipped,
  0 errors. Verified cross-dataset merge + sugarcane crop-hint fix worked.
- Inspected real dataset layout; found paths nested deeper than assumed, sugarcane
  classes lack crop prefix, and filenames are generic/reused. Rewrote
  `merge_datasets.py` accordingly (crop-hint normalization + MD5 dedup).
- Wrote first version of `merge_datasets.py` (dataset merge script).
- Read and summarized `ML.md` (the system design spec).

---

## 7. How to use this file in a new session

> "Read `PROJECT_CONTEXT.md` in the project root for full context on what's been
> done. We're working on KisanNetra crop-disease classification. Continue from the
> open TODOs."
