# Steps.md — Phased Implementation Roadmap for KisanNetra

> Derived from `ML.md` (the design spec). This breaks the full system into **ordered,
> dependency-aware phases**, each with concrete deliverables, the exact `ML.md`
> sections it implements, and **acceptance criteria** ("done when..."). Follow top to
> bottom; each phase gates the next. The goal state is the **best model that fulfils
> every requirement in ML.md** — a full-accuracy web *teacher* + a distilled offline
> mobile *student*, both calibrated, OOD-guarded, and field-validated.
>
> **Legend:** ✅ done · 🔲 todo · ⏳ in progress · ⚠️ decision/risk
>
> Cross-reference: `ML.md` (spec), `PROJECT_CONTEXT.md` (session state),
> `merge_datasets.py` (Phase 1 tooling already built).

---

## Phase Overview (at a glance)

| # | Phase | ML.md § | Depends on | Status |
|---|---|---|---|---|
| 0 | Foundations & Project Scaffold | 3, 18 | — | 🔲 |
| 1 | Data Collection, Curation & Merge | 4 | 0 | ⏳ (merge ✅, field data 🔲) |
| 2 | Taxonomy Reconciliation & Filtering | 1, 4 | 1 | 🔲 |
| 3 | Leakage-Safe Splitting | 5 | 2 | 🔲 |
| 4 | Preprocessing & Augmentation | 6, 7 | 3 | 🔲 |
| 5 | Class Imbalance Handling | 8 | 4 | 🔲 |
| 6 | Teacher Training (EfficientNetV2-S) | 9, 10, 11, 12 | 5 | 🔲 |
| 7 | Calibration & OOD (Teacher) | 13, 14 | 6 | 🔲 |
| 8 | Knowledge Distillation → Student | 15 | 7 | 🔲 |
| 9 | Calibration & OOD (Student) | 13, 14 | 8 | 🔲 |
| 10 | Experiment Tracking & Checkpointing | 16, 17 | 6 (ongoing) | 🔲 |
| 11 | Model Export (Web INT8 + Mobile INT8) | 19 | 7, 9 | 🔲 |
| 12 | Web Backend (FastAPI) | 20 | 11 | 🔲 |
| 13 | Mobile App (Offline-First) | 21 | 11 | 🔲 |
| 14 | Offline Sync Architecture | 22 | 12, 13 | 🔲 |
| 15 | Monitoring | 23 | 12, 13 | 🔲 |
| 16 | Generalization Verification & Release Gates | 24, 25 | 7, 9, 11 | 🔲 |

---

## Phase 0 — Foundations & Project Scaffold
**Implements:** ML.md §3 (structure), §18 (reproducibility)
**Goal:** A clean, reproducible skeleton so every later phase drops into place.

**Steps**
1. 🔲 Create the directory tree from ML.md §3 (`config/`, `data/`, `src/`, `scripts/`, `serving/`, `web/`, `mobile/`, `models/`, `tests/`, `notebooks/`).
2. 🔲 `config/classes.py` — the 30-class `CLASSES` list, `NUM_CLASSES`, `CLASS_TO_IDX` (verbatim from ML.md §1).
3. 🔲 `config/train_config.yaml`, `distill_config.yaml`, `deploy_config.yaml` (from §10).
4. 🔲 `src/seed.py` — `set_seed(42)` with cudnn deterministic (§18).
5. 🔲 `requirements.txt` — **pinned exact versions** incl. torch, timm, albumentations, onnx, onnxruntime, tensorflow / ai-edge-litert (§18).
6. 🔲 `pyproject.toml`, `README.md`, git initialised, `.gitignore` (exclude `data/`, `models/`, large artifacts).

**Done when:** repo imports cleanly, `set_seed()` runs, `config/classes.py` yields exactly 30 classes.

---

## Phase 1 — Data Collection, Curation & Merge
**Implements:** ML.md §4
**Goal:** One curated image pool with full provenance metadata.

**Steps**
1. ✅ Merge the two Kaggle datasets → `Final_Plant_Dataset/{train,valid}/` (`merge_datasets.py`; 96,782 imgs, MD5-dedup, crop-hint normalization).
2. 🔲 Extend curation per §4.3: perceptual-hash dedup (`imagehash.phash`), reject corrupt/tiny (<224px) images, EXIF-orientation normalize.
3. 🔲 Write **manifest CSV** — `filepath, class, source, device, location, capture_date, annotator_id, group_id` (§4.2 step 4). Public images: `source=public`; field images: `source=field`.
4. ⚠️ 🔲 **Mandatory field-data collection** (§4.2) — 200–500 farmer-captured images per class, diverse device/region/lighting. *This is called out in ML.md as the single biggest failure mode.* Blocks a production release, not experimentation.
5. 🔲 Label-quality: 2 annotators + adjudication, track Cohen's kappa > 0.75 (§4.2 step 3).

**Done when:** manifest CSV exists with provenance for every image; curation pipeline is reproducible; field-data collection plan is underway.

**⚠️ Risk:** Current merged data is 100% public/lab images → domain shift. Field data is required before shipping (see Phase 16).

---

## Phase 2 — Taxonomy Reconciliation & Filtering
**Implements:** ML.md §1 (taxonomy), bridges the current data → spec.
**Goal:** Get the dataset onto the exact 30-class ML.md taxonomy.

**Steps**
1. 🔲 Filter `Final_Plant_Dataset` to only the 7 target crops (Tomato, Potato, Pepper, Maize, Wheat, Rice, Groundnut).
2. 🔲 **Remap divergent names** to ML.md §1:
   - `Wheat___Yellow_Rust` → `Wheat___Stripe_Rust`
   - `Wheat___Brown_Rust` → `Wheat___Leaf_Rust`
   - `Corn___*` → `Maize___*` (ML.md uses "Maize")
   - Reconcile Rice (`Leaf_Blast`/`Neck_Blast` → `Blast`?), Tomato variants, etc.
3. ⚠️ 🔲 **Gap analysis vs. the 30 classes** — identify classes with NO current data:
   - **Groundnut** (Early/Late Leaf Spot, Rosette) — appears absent from merged data.
   - Maize `Common_Rust`, `Northern_Blight`, `Gray_Leaf_Spot` — present.
   - Flag every missing/under-populated class → feeds Phase 1 field collection.
4. 🔲 Produce final class-count report per the 30 taxonomy classes.

**Done when:** dataset folders map 1:1 onto ML.md's 30 classes; a documented list of missing/sparse classes exists.

**⚠️ Decision:** Groundnut source (Mendeley `x6x5jkk873` per ML.md §4.1) still needs downloading + merging.

---

## Phase 3 — Leakage-Safe Splitting
**Implements:** ML.md §5
**Goal:** 70/15/15 train/val/test, split by group — never random at image level.

**Steps**
1. 🔲 `scripts/build_splits.py` — `StratifiedGroupKFold` on `group_id` (location/session) so near-duplicates can't span train/test.
2. 🔲 Emit `data/{train,val,test}.csv` + `data/splits.json` with a **content hash** (§18).
3. 🔲 Carve out a **separate field-only test set** (§5, §24) — never used in train/val — for the final release gate.
4. 🔲 (Optional but recommended) hold out one entire region + one device brand for generalization testing (§24 step 6).

**Done when:** three split CSVs exist, no `group_id` spans splits, field-only holdout is reserved.

---

## Phase 4 — Preprocessing & Augmentation
**Implements:** ML.md §6, §7
**Goal:** Train/eval transforms + the smartphone-domain augmentation pipeline.

**Steps**
1. 🔲 `src/datasets.py` — `CropDiseaseDataset` with **EXIF-aware** loading, 384px resize/center-crop, ImageNet mean/std (§6).
2. 🔲 `src/augmentations.py` — `get_train_transforms` (perspective, blur, noise, compression, shadow, coarse-dropout — all tuned to simulate field photos) + `get_eval_transforms` (§7).
3. 🔲 MixUp/CutMix at p=0.2, alpha=0.2, **only after epoch 5**; disabled entirely during distillation (§7 note).
4. 🔲 **Document exact resize/crop/normalize/interpolation** — this is the contract the mobile side (Phase 13) must match bit-for-bit (§6 ⚠️).

**Done when:** a batch loads and visualizes correctly; eval transform is deterministic; the preprocessing spec is written down for mobile parity.

---

## Phase 5 — Class Imbalance Handling
**Implements:** ML.md §8
**Goal:** Stop majority classes (Tomato) from dominating.

**Steps**
1. 🔲 `WeightedRandomSampler` with inverse-frequency weights (§8.1).
2. 🔲 `src/losses.py` — `ClassBalancedFocalLoss` (beta=0.999, gamma=2.0, label_smoothing=0.1) (§8.2).
3. 🔲 Cap oversampling at 4× original; flag any class still <150 imgs for field collection (§8.3).

**Done when:** sampler + loss are wired into the training loop and verified (per-class batch counts roughly balanced).

---

## Phase 6 — Teacher Training (EfficientNetV2-S)
**Implements:** ML.md §9, §10, §11, §12 — **the best/reference model.**
**Goal:** Train the highest-accuracy teacher.

**Steps**
1. 🔲 `src/model.py` — `timm` `tf_efficientnetv2_s.in21k_ft_in1k`, 30 classes, drop_rate=0.3, drop_path=0.2 (§9).
2. 🔲 **Progressive unfreezing** 3-phase schedule (head warmup 224px → partial unfreeze 300px → full fine-tune 384px) (§9).
3. 🔲 `src/train.py` — AdamW, cosine+warmup, AMP, grad-accum (eff. batch 64), grad-clip 5.0, EMA decay 0.9998 (§10, §11). VRAM-tuned for RTX 5060 8GB.
4. 🔲 `src/evaluate.py` — **macro-F1 primary**, per-class P/R/F1, top-1/top-3, confusion matrix (watch Early/Late Blight, Stripe/Leaf Rust, Bacterial Blight/Brown Spot) (§12).
5. 🔲 Early stopping on `val_macro_f1`, patience 8.
6. 🔲 (Model selection) 5-fold stratified-group CV once to estimate variance (§12).

**Done when:** teacher trains to convergence; **val macro-F1 recorded**; confusion matrix reviewed; `best.pt` saved.

**Target:** field-test macro-F1 ≥ 0.85 (release gate, verified in Phase 16).

---

## Phase 7 — Calibration & OOD (Teacher)
**Implements:** ML.md §13, §14
**Goal:** Teacher says "Unknown, retake" instead of guessing.

**Steps**
1. 🔲 `src/calibrate.py` — temperature scaling on val set (LBFGS); record ECE before/after (§13).
2. 🔲 `src/ood_detector.py` — energy score `E(x) = -T·logsumexp(logits/T)`, softmax-entropy + max-conf threshold, blur/brightness image-quality gate (§14).
3. 🔲 Fit `energy_threshold` + `conf_threshold` on val-ID + `data/ood_holdout/` for target **false-accept rate < 2%** (§14).
4. 🔲 Store teacher's temperature + thresholds in server config.

**Done when:** teacher temperature + thresholds fitted and stored; OOD holdout correctly flagged ≥ 90% (release gate).

---

## Phase 8 — Knowledge Distillation → Student
**Implements:** ML.md §15 — **makes the offline mobile model viable.**
**Goal:** Small student mimics teacher's soft distribution.

**Steps**
1. 🔲 `src/student_model.py` — `tf_efficient_lite0` (~4.7M) or `mobilenetv3_large_100` (~5.4M) (§15.1).
2. 🔲 `src/distillation.py` — `DistillationLoss` = α·KL(soft-teacher‖soft-student)·T² + (1−α)·CE; **α=0.7, T=4.0** (§15.2).
3. 🔲 Distillation loop: **teacher frozen/eval**, student trains at **224px**; resize teacher inputs to 224px before generating soft targets (§15.3, §15.4).
4. 🔲 Use the **same train split** as the teacher (independent val/test later) (§15.4).
5. 🔲 Track **teacher-student agreement rate** as a distillation-health metric (§15.4).
6. 🔲 Tune α / T via val macro-F1; report the **teacher-vs-student macro-F1 gap** in the model card (§12).

**Done when:** student trained; agreement rate ≥ 90% (val); macro-F1 gap documented.

**Target:** student field-test macro-F1 ≥ 0.80.

---

## Phase 9 — Calibration & OOD (Student)
**Implements:** ML.md §13, §14 — **fitted separately from the teacher.**
**Goal:** Same "Unknown/retake" UX offline as online.

**Steps**
1. 🔲 Re-fit temperature for the student (different logit scale — do NOT reuse teacher's) (§13).
2. 🔲 Re-fit energy + conf thresholds for the student on ID+OOD split (§14).
3. 🔲 Write these into `model_metadata.json` for the mobile bundle (§19).

**Done when:** student has its own temperature + thresholds stored in metadata.

---

## Phase 10 — Experiment Tracking & Checkpointing
**Implements:** ML.md §16, §17 (runs alongside Phases 6–9)
**Goal:** Every run is auditable and rollback-able.

**Steps**
1. 🔲 Checkpoint pattern from §16 — save state+ema+optimizer+scaler+temperature+config; maintain `best.pt`/`last.pt` per model; keep top-3 by macro-F1.
2. 🔲 W&B (or self-hosted MLflow) logging: losses, macro-F1, ECE, LR, confusion matrix, teacher-student agreement; tag `teacher`/`student` (§17).
3. 🔲 Log per run: git commit, manifest hash, config, `pip freeze`, teacher-checkpoint hash for distillation (§17, §18).

**Done when:** every training run auto-logs metrics + provenance; checkpoints rotate correctly.

---

## Phase 11 — Model Export (Web INT8 + Mobile INT8)
**Implements:** ML.md §19
**Goal:** Two deployable artifacts from the trained models.

**Steps**
1. 🔲 `src/export.py` — teacher → ONNX (opset 17, dynamic batch); `verify_onnx()` numerical parity (§19.1).
2. 🔲 Teacher **INT8 static quantization** (QDQ, per-channel) on a diverse calibration set; **re-run full test eval, require ≤1% macro-F1 drop** (§19.1).
3. 🔲 Student → mobile: **TFLite INT8** (PyTorch→ONNX→TF→TFLite, verify parity at each hop) or **ONNX Runtime Mobile INT8** (§19.2).
4. 🔲 Emit `model_metadata.json` (classes, input_size 224, mean/std, temperature, thresholds, model_version, distilled_from) (§19.2).
5. 🔲 Validate mobile INT8 on test + field set; **require ≤2% macro-F1 drop** (§19.2).

**Done when:** `models/quantized/model_int8.onnx` (web) + `models/tflite/model_int8.tflite` (mobile) + metadata exist and pass accuracy-drop gates.

---

## Phase 12 — Web Backend (FastAPI)
**Implements:** ML.md §20
**Goal:** Server-side inference for the web app.

**Steps**
1. 🔲 `serving/inference.py` — `InferenceEngine` (ONNX Runtime, CUDA→CPU providers), preprocess matching §6, calibrated softmax + energy OOD, top-3 (§20).
2. 🔲 `serving/schemas.py` + `serving/app.py` — `/health`, `/predict` (multipart, size/type guards), `/sync/upload` (accepts mobile batches) (§20, §22).
3. 🔲 `serving/Dockerfile` (TensorRT base) + GPU run; 2 workers.
4. 🔲 `web/` frontend calls `POST /predict`, renders class/confidence/top-3 + "Unknown—retake" state (§20).

**Done when:** `/predict` returns a valid response for a test image; p95 latency ≤ 150ms on GPU (§23 target).

---

## Phase 13 — Mobile App (Offline-First)
**Implements:** ML.md §21 — **zero network calls for prediction.**
**Goal:** On-device inference with the bundled student.

**Steps**
1. 🔲 Choose framework (RN + `react-native-fast-tflite`, or Flutter). Bundle `model_int8.tflite` + `model_metadata.json` in `mobile/assets/models/`.
2. 🔲 `onDeviceModel.ts` — load model, run, softmax-with-temperature, energy score, top-3, `isUncertain` (§21.2).
3. 🔲 ⚠️ `preprocess.ts` — **must match `src/datasets.py` bit-for-bit** (resize/crop/normalize/EXIF/interpolation). #1 "works on web, wrong on mobile" bug (§6, §21.3).
4. 🔲 `oodGuard.ts` — on-device blur/brightness gate BEFORE inference (§21.4).
5. 🔲 `tests/test_mobile_parity.py` — web vs mobile top-1 agree ≥95% on a fixed set; run in CI on every export (§21.5).

**Done when:** app predicts offline in ≤300–500ms on budget Android; parity test passes ≥95%.

---

## Phase 14 — Offline Sync Architecture
**Implements:** ML.md §22
**Goal:** Prediction never blocks on network; sync opportunistically.

**Steps**
1. 🔲 `localDb.ts` — SQLite/WatermelonDB `predictions` table (image, result, isUncertain, modelVersion, farmerFeedback, syncedAt) (§22.2).
2. 🔲 `syncQueue.ts` + `syncService.ts` — NetInfo-triggered batched upload (20–50/batch), backoff, **prioritize `is_uncertain`**, never delete local image until `syncedAt` confirmed (§22.3, §22.4).
3. 🔲 Respect metered connections (Wi-Fi-only toggle) (§22.4).
4. 🔲 Server `/sync/upload` persists records for retraining + teacher re-scoring of uncertain cases (§20, §22.1).

**Done when:** offline predictions queue locally and drain to server on reconnect; uncertain items sync first.

---

## Phase 15 — Monitoring
**Implements:** ML.md §23
**Goal:** Catch drift and regressions in production.

**Steps**
1. 🔲 Server: Prometheus + Grafana; p50/p95/p99 latency (alert p95>150ms), prediction-distribution drift, uncertainty rate, 4xx/5xx (§23).
2. 🔲 `prometheus_fastapi_instrumentator` on the FastAPI app.
3. 🔲 Mobile (via sync batches): on-device latency by device tier, uncertainty rate by device, sync health (% unsynced >7d), field teacher-student agreement (§23).
4. 🔲 Human-feedback loop → flagged images routed into next field-collection round (§23).

**Done when:** dashboards live; alerts configured; mobile telemetry arrives via sync.

---

## Phase 16 — Generalization Verification & Release Gates
**Implements:** ML.md §24, §25 — **the deployment gatekeeper. Do NOT ship on lab accuracy alone.**
**Goal:** Prove both models work on real farmer photos.

**Steps**
1. 🔲 Evaluate teacher AND student on the **field-only test set** (Phase 3) — report lab-vs-field accuracy side by side (§24.2).
2. 🔲 Stress-test buckets: clean / cluttered / poor-light / blurry / odd-angle — per-bucket accuracy for both models (§24.3).
3. 🔲 Confusion-driven data collection loop (§24.4). Geographic/device holdout test (§24.6).
4. 🔲 On-device benchmark on real budget→mid Android fleet — latency + accuracy (§24.7, `benchmark_mobile_latency.py`).
5. 🔲 Shadow deployment (log-only) 2–4 weeks vs. agronomist review before user-facing (§24.5).
6. 🔲 Keep `tests/` green (`test_datasets`, `test_model`, `test_distillation`, `test_api`, `test_mobile_parity`).

**Release gates — MUST pass before shipping (§24):**

| Metric | Web (Teacher) | Mobile (Student) |
|---|---|---|
| Field-test macro-F1 | ≥ 0.85 | ≥ 0.80 |
| OOD holdout flagged `Unknown` | ≥ 90% | ≥ 85% |
| p95 latency | ≤ 150ms (GPU) | ≤ 300–500ms (budget Android) |
| INT8 accuracy drop vs FP32 | ≤ 1% | ≤ 2% |
| Teacher-student agreement (val) | — | ≥ 90% |

**Done when:** all gates green for both models; shadow deployment agreement acceptable → ship.

---

## Critical Cross-Cutting Requirements (apply in EVERY relevant phase)

1. **Preprocessing parity** (§6, §21) — training ⇄ mobile must be bit-identical. The #1 field bug.
2. **Domain shift / field data** (§4, §24) — never trust lab accuracy; field data is mandatory before release.
3. **Consistent Unknown/OOD UX** (§14) — same "retake photo" safety net online and offline.
4. **Separate calibration/OOD per model** (§13, §14) — never share teacher's temperature/thresholds with the student.
5. **Reproducibility** (§18) — pinned deps, seeded, manifest+checkpoint hashes logged per run.
6. **Macro-F1 (not accuracy)** as the primary metric everywhere (§12) — classes are imbalanced.

---

## Immediate Next Actions (from current state)

1. **Phase 2** — filter/remap `Final_Plant_Dataset` to the ML.md 30-class taxonomy; produce the gap report (esp. Groundnut).
2. **Phase 0** — scaffold `config/classes.py` + repo structure so training code has a home.
3. **Phase 1 (field data)** — start the field-image collection plan; it's the long pole.

> Update `PROJECT_CONTEXT.md` Session Log as each phase advances.
