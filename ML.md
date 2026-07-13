# Crop Disease Classification System — Hybrid Online (Web) + Offline (Mobile) Architecture

Production image-classification system that identifies crop diseases from farmer-captured smartphone photos across 7 crops and 30 classes. Two deployment targets from one training pipeline: a **web app** (server-side inference, full-accuracy model) and a **mobile app** (on-device inference, works fully offline, syncs when online).

---

## Table of Contents

1. [Class Taxonomy](#1-class-taxonomy)
2. [Dual-Model Strategy: Teacher (Web) + Student (Mobile)](#2-dual-model-strategy-teacher-web--student-mobile)
3. [Project Structure](#3-project-structure)
4. [Dataset Collection & Curation](#4-dataset-collection--curation)
5. [Train / Validation / Test Splitting](#5-train--validation--test-splitting)
6. [Preprocessing](#6-preprocessing)
7. [Augmentation Strategy](#7-augmentation-strategy)
8. [Class Imbalance Handling](#8-class-imbalance-handling)
9. [Transfer Learning Setup (Teacher)](#9-transfer-learning-setup-teacher)
10. [Hyperparameters & Training Schedule](#10-hyperparameters--training-schedule)
11. [Training Loop (PyTorch)](#11-training-loop-pytorch)
12. [Validation Strategy & Metrics](#12-validation-strategy--metrics)
13. [Confidence Calibration](#13-confidence-calibration)
14. [Out-of-Distribution & Unknown-Class Handling](#14-out-of-distribution--unknown-class-handling)
15. [Knowledge Distillation: Teacher → Mobile Student](#15-knowledge-distillation-teacher--mobile-student)
16. [Checkpointing](#16-checkpointing)
17. [Experiment Tracking](#17-experiment-tracking)
18. [Reproducibility](#18-reproducibility)
19. [Model Export: Web (ONNX/INT8) & Mobile (TFLite/ONNX Mobile)](#19-model-export-web-onnxint8--mobile-tfliteonnx-mobile)
20. [Deployment A: FastAPI (Web Backend)](#20-deployment-a-fastapi-web-backend)
21. [Deployment B: On-Device Mobile Inference (Offline-First)](#21-deployment-b-on-device-mobile-inference-offline-first)
22. [Offline Sync Architecture](#22-offline-sync-architecture)
23. [Monitoring](#23-monitoring)
24. [Verifying Generalization to Farmer-Captured Images](#24-verifying-generalization-to-farmer-captured-images)
25. [Troubleshooting](#25-troubleshooting)

---

## 1. Class Taxonomy

30 classes across 7 crops. Class naming convention: `{Crop}___{Disease}` (matches PlantVillage-style naming for compatibility with public datasets).

| Crop | Classes |
|---|---|
| Tomato | Late_Blight, Early_Blight, Leaf_Mold, Septoria_Leaf_Spot, Spider_Mites, Target_Spot, Mosaic_Virus, Yellow_Leaf_Curl_Virus, Bacterial_Spot, Healthy |
| Potato | Late_Blight, Early_Blight, Healthy |
| Pepper | Bacterial_Spot, Healthy |
| Maize | Gray_Leaf_Spot, Common_Rust, Northern_Blight, Healthy |
| Wheat | Stripe_Rust, Leaf_Rust, Healthy |
| Rice | Blast, Bacterial_Blight, Brown_Spot, Healthy |
| Groundnut | Early_Leaf_Spot, Late_Leaf_Spot, Rosette, Healthy |

```python
# config/classes.py
CLASSES = [
    "Tomato___Late_Blight", "Tomato___Early_Blight", "Tomato___Leaf_Mold",
    "Tomato___Septoria_Leaf_Spot", "Tomato___Spider_Mites", "Tomato___Target_Spot",
    "Tomato___Mosaic_Virus", "Tomato___Yellow_Leaf_Curl_Virus", "Tomato___Bacterial_Spot",
    "Tomato___Healthy",
    "Potato___Late_Blight", "Potato___Early_Blight", "Potato___Healthy",
    "Pepper___Bacterial_Spot", "Pepper___Healthy",
    "Maize___Gray_Leaf_Spot", "Maize___Common_Rust", "Maize___Northern_Blight", "Maize___Healthy",
    "Wheat___Stripe_Rust", "Wheat___Leaf_Rust", "Wheat___Healthy",
    "Rice___Blast", "Rice___Bacterial_Blight", "Rice___Brown_Spot", "Rice___Healthy",
    "Groundnut___Early_Leaf_Spot", "Groundnut___Late_Leaf_Spot", "Groundnut___Rosette", "Groundnut___Healthy",
]
NUM_CLASSES = len(CLASSES)  # 30
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
```

A 31st implicit label, `Unknown`, is handled at inference time via OOD detection (Section 14), not trained as a normal class. Both teacher and student models share this exact taxonomy so predictions are consistent across web and mobile.

---

# 2. Dual-Model Strategy: Teacher (Cloud) + Student (Mobile) Hybrid Intelligence

One training pipeline produces **two exported AI artifacts** that share the same:

- Class taxonomy
- Image preprocessing pipeline
- Confidence calibration methodology
- OOD (Out-of-Distribution) detection strategy

This ensures prediction behavior remains consistent across the **Web Application** and **Mobile Application**.

The system follows a **Hybrid Intelligent Inference Architecture**:

- **When the farmer has internet connectivity:** The mobile application uses the **Teacher Model (EfficientNetV2-S)** through the cloud API for maximum accuracy.
- **When the farmer has no internet connectivity:** The mobile application automatically switches to the **Student Model (MobileNetV3-Large / EfficientNet-Lite)** running completely offline on the device.

This provides the highest possible accuracy while maintaining accessibility in rural areas with unreliable connectivity.

---

## Model Architecture

| | Teacher Model (Cloud AI Engine) | Student Model (Mobile AI Engine) |
|---|---|---|
| Architecture | EfficientNetV2-S (~21M parameters) | MobileNetV3-Large / EfficientNet-Lite0 (~4-5M parameters) |
| Execution Environment | Cloud Server (FastAPI + GPU) | User Device (CPU/NPU) |
| Connectivity | Requires internet | Works fully offline |
| Primary Role | Main prediction engine | Offline fallback engine |
| Export Format | ONNX + INT8 Quantization | TFLite INT8 / ONNX Mobile INT8 |
| Accuracy | Highest accuracy reference model | Slightly lower, distilled from teacher |
| Latency Target | p95 ≤ 150ms (GPU inference) | 300-500ms on budget Android devices |
| Usage | Web app, online mobile requests, difficult cases | Offline mobile inference |

---

## Why Two Models?

A single model cannot efficiently satisfy both cloud accuracy requirements and mobile limitations.

### Using EfficientNetV2-S Everywhere

**Advantages:**

- Higher accuracy
- Better feature extraction
- Stronger performance on complex field images

**Problems:**

- Large model size
- Slow mobile inference
- Higher battery consumption
- Larger application size

### Using MobileNetV3 Everywhere

**Advantages:**

- Lightweight
- Fast inference
- Mobile-friendly

**Problems:**

- Lower accuracy
- Less powerful feature extraction
- More difficult with complex field conditions

Therefore, the system uses:

```
High Accuracy Requirement
+
Mobile Offline Requirement
      ↓
Teacher + Student Architecture
```

---

## Hybrid Inference Workflow

```
                Farmer Mobile App
                       |
                       |
                Capture Leaf Image
                       |
                       ↓
              Check Internet Status
                       |
          ┌────────────┴────────────┐
          ▼                         ▼
   Internet Available          No Internet
          |                         |
          ▼                         ▼
   Upload Image              Local Processing
          |                         |
          ▼                         ▼

┌─────────────────────┐   ┌───────────────────┐
│   Teacher Model      │   │   Student Model    │
│ EfficientNetV2-S      │   │  MobileNetV3       │
│  Cloud GPU Server      │   │   On-device        │
└──────────┬──────────┘   └─────────┬─────────┘
           |                        |
           ▼                        ▼
   Highest Accuracy          Offline Prediction
           |                        |
           └─────────────┬─────────────┘
                          |
                          ▼
              Disease Result + Confidence
                          |
                          ▼
                  Farmer Recommendation
```

---

## Online Mode (Internet Available)

When the farmer has an active internet connection:

```
Mobile Application
       |
       ↓
   Image Upload
       |
       ↓
FastAPI AI Service
       |
       ↓
EfficientNetV2-S Teacher Model
       |
       ↓
Confidence Calibration
       |
       ↓
   OOD Detection
       |
       ↓
Final Disease Prediction
```

The Teacher model acts as the **final authority** because it has:

- Larger architecture
- More parameters
- Better feature extraction
- GPU acceleration
- Latest trained model weights

**Example response:**

```json
{
  "crop": "Tomato",
  "disease": "Late Blight",
  "confidence": 0.968,
  "top_predictions": [
    {
      "label": "Late Blight",
      "score": 0.968
    },
    {
      "label": "Early Blight",
      "score": 0.021
    },
    {
      "label": "Leaf Mold",
      "score": 0.007
    }
  ],
  "model": "EfficientNetV2-S"
}
```

---

## Offline Mode (No Internet)

When connectivity is unavailable:

```
Mobile Camera
       |
       ↓
Image Preprocessing
       |
       ↓
MobileNetV3 Student Model
       |
       ↓
Local Inference
       |
       ↓
Disease Prediction
```

The farmer can still receive:

- Disease classification
- Confidence score
- Top predictions
- Treatment recommendation
- Prevention guidance

No network connection is required.

---

## Confidence-Based Smart Routing

The mobile application performs a confidence check before deciding whether cloud processing is required.

**Example — High Confidence Prediction**

MobileNetV3 Output:

- **Disease:** Tomato Early Blight
- **Confidence:** 91%
- **Action:** Return result locally

**Example — Low Confidence Prediction**

MobileNetV3 Output:

- **Disease:** Unknown
- **Confidence:** 42%
- **Action:** Send image to Teacher Model when internet is available

**Workflow:**

```
              Student Model
                    |
                    |
            Confidence Evaluation
                    |
        ┌───────────┴───────────┐
        ▼                       ▼
 High Confidence          Low Confidence
        |                       |
        ▼                       ▼
 Return Mobile         Send Image to Cloud
 Prediction                   |
                              ▼
                    EfficientNetV2-S Teacher
                              |
                              ▼
                    Final Accurate Prediction
```

---

## Knowledge Distillation

The Student model is not trained independently.

Instead, it learns from the Teacher model using Knowledge Distillation.

**Traditional training:**

```
Image
 |
 ↓
Disease Label
 |
 ↓
Student Model
```

**Knowledge distillation:**

```
Image
 |
 ↓
Teacher Model
 |
 ↓
Prediction Distribution
 |
 ↓
Student Model Learns Teacher Behavior
```

**Example — Teacher output:**

```json
{
  "Late Blight": 0.94,
  "Early Blight": 0.04,
  "Leaf Mold": 0.01,
  "Healthy": 0.01
}
```

Student learns this probability distribution instead of only learning:

```
Tomato → Late Blight
```

This allows the lightweight mobile model to recover most of the accuracy lost due to compression.

---

## Shared Calibration and OOD Detection

Both models use the same methodology:

### Temperature Scaling

Improves confidence reliability.

**Before calibration:**

> Prediction: 99% confidence

**After calibration:**

> Prediction: 87% confidence

This provides more realistic confidence values.

### Energy-Based OOD Detection

Prevents incorrect predictions on unknown images.

**Example:**

User uploads:

- Human image
- Animal image
- Unknown plant
- New disease

Instead of:

> Tomato Early Blight - 99%

The system returns:

> Unknown / Unsupported Image
> Confidence: Low

---

## Continuous Learning Feedback Loop

When internet connectivity is available:

```
Mobile Application
        |
        ↓
Image + Prediction + Confidence
        |
        ↓
Cloud Storage
        |
        ↓
Human Validation
        |
        ↓
New Field Dataset
        |
        ↓
Retrain Teacher Model
        |
        ↓
Knowledge Distillation
        |
        ↓
Update Student Model
        |
        ↓
Release New Mobile Version
```

---

## Deployment Architecture

### Cloud Deployment

```
EfficientNetV2-S
        |
        ↓
   ONNX Export
        |
        ↓
INT8 Quantization
        |
        ↓
FastAPI Service
        |
        ↓
Web Application
```

### Mobile Deployment

```
MobileNetV3
        |
        ↓
TFLite Conversion
        |
        ↓
INT8 Quantization
        |
        ↓
Mobile Application Bundle
        |
        ↓
Offline AI Prediction
```

## 3. Project Structure

```
crop-disease-classifier/
├── config/
│   ├── classes.py
│   ├── train_config.yaml
│   ├── distill_config.yaml
│   └── deploy_config.yaml
├── data/
│   ├── raw/                    # untouched downloads (PlantVillage, field data, etc.)
│   ├── processed/
│   │   ├── train/{class}/*.jpg
│   │   ├── val/{class}/*.jpg
│   │   └── test/{class}/*.jpg
│   ├── ood_holdout/             # non-target-class images for OOD calibration
│   └── splits.json              # manifest with source/location metadata for leakage-safe splits
├── src/
│   ├── datasets.py
│   ├── augmentations.py
│   ├── model.py                 # teacher (EfficientNetV2-S)
│   ├── student_model.py          # student (MobileNetV3/EfficientNet-Lite0)
│   ├── losses.py
│   ├── distillation.py           # KD loss + training loop
│   ├── train.py
│   ├── evaluate.py
│   ├── calibrate.py
│   ├── ood_detector.py
│   └── export.py
├── scripts/
│   ├── prepare_dataset.py
│   ├── build_splits.py
│   ├── benchmark_latency.py
│   └── benchmark_mobile_latency.py
├── serving/                      # WEB BACKEND
│   ├── app.py                    # FastAPI app
│   ├── inference.py
│   ├── schemas.py
│   └── Dockerfile
├── web/                           # WEB FRONTEND
│   ├── src/
│   │   ├── components/
│   │   ├── api/                  # calls FastAPI /predict
│   │   └── pages/
│   ├── package.json
│   └── vite.config.js
├── mobile/                        # MOBILE APP (offline-first)
│   ├── assets/
│   │   └── models/
│   │       ├── model_int8.tflite       # or .onnx for ONNX Runtime Mobile
│   │       └── model_metadata.json     # classes, temperature, thresholds
│   ├── src/
│   │   ├── inference/
│   │   │   ├── onDeviceModel.ts        # loads + runs TFLite/ONNX Mobile
│   │   │   ├── preprocess.ts           # matches src/datasets.py exactly
│   │   │   └── oodGuard.ts             # on-device energy/confidence check
│   │   ├── storage/
│   │   │   ├── localDb.ts              # SQLite/WatermelonDB - predictions, images
│   │   │   └── syncQueue.ts            # queues unsynced records
│   │   ├── sync/
│   │   │   └── syncService.ts          # uploads queue when online
│   │   └── screens/
│   ├── package.json                     # React Native / Flutter
│   └── app.json
├── models/
│   ├── checkpoints/
│   │   ├── teacher/
│   │   └── student/
│   ├── onnx/                       # web (FP32 export)
│   ├── quantized/                  # web (INT8, server GPU/CPU)
│   ├── tflite/                     # mobile (INT8, on-device)
│   └── onnx_mobile/                 # alt. mobile format (INT8, ONNX Runtime Mobile)
├── tests/
│   ├── test_datasets.py
│   ├── test_model.py
│   ├── test_distillation.py
│   ├── test_api.py
│   └── test_mobile_parity.py        # verifies web vs mobile predictions agree
├── notebooks/
│   └── eda.ipynb
├── requirements.txt
├── pyproject.toml
└── README.md
```

---

## 4. Dataset Collection & Curation

### 4.1 Public source datasets (starting point, not final training set)

| Crop(s) | Source | Notes |
|---|---|---|
| Tomato, Potato, Pepper, Maize | PlantVillage (Kaggle: `abdallahalidev/plantvillage-dataset`) | ~54k images, lab/controlled backgrounds. Class names map closely to your taxonomy. |
| Wheat (+ corn/potato/rice overlap) | Kaggle: `shubham2703/five-crop-diseases-dataset` | Wheat Brown Rust → `Leaf_Rust`, Wheat Yellow Rust → `Stripe_Rust`. |
| Rice | Kaggle: `anshulm257/rice-disease-dataset` | Bacterial Leaf Blight, Brown Spot, Leaf Blast, Healthy map directly; drop Leaf Scald/Sheath Blight (out of taxonomy) or bucket as `Unknown`. |
| Groundnut | Mendeley: `x6x5jkk873` (Castillo et al.) | Healthy, Early/Late Leaf Spot, Rosette map directly; drop Alternaria Leaf Spot/Rust or bucket as `Unknown`. |

### 4.2 Critical gap: domain shift

Public datasets are overwhelmingly **lab-condition images** (plain backgrounds, single leaf, controlled lighting). Farmer smartphone photos differ substantially: cluttered field backgrounds, multiple leaves/plants, variable lighting (harsh sun, shade, overcast), motion blur, dust/water droplets, extreme angles, and varying camera quality. Training only on public data and deploying on field images **will underperform** — this is the single most common failure mode in agricultural CV systems, and it affects **both** the web teacher model and the mobile student equally, since the student inherits the teacher's blind spots during distillation.

**Mitigation — mandatory field data collection:**

1. Partner with agricultural extension workers / NGOs to collect geo-tagged smartphone photos per class, across:
   - Multiple regions/climates
   - Multiple growth stages
   - Multiple times of day (morning/midday/evening)
   - Multiple phone models (budget Android to iPhone) — **this matters even more for the mobile student**, since low-end phone cameras/CPUs are the exact target hardware
2. Target minimum **200–500 field images per class** before first production release; more for high-priority/high-confusion classes (Early vs. Late Blight, Stripe vs. Leaf Rust).
3. Use a lightweight internal labeling tool (e.g., Label Studio) with **2 independent annotators + adjudication** for disputed labels; track inter-annotator agreement (Cohen's kappa, target > 0.75).
4. Tag every image with metadata: `source` (public/field), `device`, `location`, `capture_date`, `annotator_id` — required later for leakage-safe splitting and generalization testing.

### 4.3 Curation pipeline

```python
# scripts/prepare_dataset.py
"""
1. Deduplicate near-identical images (perceptual hashing).
2. Reject corrupt/unreadable files.
3. Reject images below minimum resolution (e.g., <224px shorter side).
4. Normalize EXIF orientation.
5. Remap source-dataset class names -> unified taxonomy; drop or bucket unmapped classes.
6. Write manifest CSV: filepath, class, source, device, location, split_group.
"""
import hashlib
from PIL import Image, ImageOps
import imagehash
import pandas as pd

def dedupe(image_paths, threshold=5):
    hashes = {}
    keep = []
    for p in image_paths:
        try:
            h = imagehash.phash(Image.open(p))
        except Exception:
            continue
        if not any(h - existing <= threshold for existing in hashes.values()):
            hashes[p] = h
            keep.append(p)
    return keep

def normalize_orientation(path, out_path):
    img = Image.open(path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.save(out_path, quality=95)
```

---

## 5. Train / Validation / Test Splitting

**Split ratio:** 70% train / 15% val / 15% test, stratified by class.

**Critical rule — split by `location`/`source` group, never randomly at the image level**, to prevent leakage from near-duplicate images (same plant photographed multiple times) landing in both train and test:

```python
# scripts/build_splits.py
from sklearn.model_selection import StratifiedGroupKFold
import pandas as pd

df = pd.read_csv("data/manifest.csv")  # columns: filepath, class, group_id (location/session)

sgkf = StratifiedGroupKFold(n_splits=10, shuffle=True, random_state=42)
splits = list(sgkf.split(df, df["class"], groups=df["group_id"]))

train_val_idx, test_idx = splits[0][0], splits[0][1]   # ~10% test
train_val_df = df.iloc[train_val_idx]

sgkf2 = StratifiedGroupKFold(n_splits=6, shuffle=True, random_state=42)
tv_splits = list(sgkf2.split(train_val_df, train_val_df["class"], groups=train_val_df["group_id"]))
train_idx, val_idx = tv_splits[0]

train_df = train_val_df.iloc[train_idx]
val_df = train_val_df.iloc[val_idx]
test_df = df.iloc[test_idx]

for name, split_df in [("train", train_df), ("val", val_df), ("test", test_df)]:
    split_df.to_csv(f"data/{name}.csv", index=False)
    print(name, split_df["class"].value_counts())
```

**Additionally hold out a small, separately-curated "field-only" test set** (Section 24) — never used in training/val — composed exclusively of farmer-captured images across diverse devices/regions, used as the final gatekeeper before any production release. This same split is used to evaluate **both** the web teacher and the mobile student, so their release gates are directly comparable.

---

## 6. Preprocessing

```python
# src/datasets.py
from torch.utils.data import Dataset
from PIL import Image, ImageOps
import torch

class CropDiseaseDataset(Dataset):
    def __init__(self, df, transform=None, class_to_idx=None):
        self.df = df.reset_index(drop=True)
        self.transform = transform
        self.class_to_idx = class_to_idx

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img = Image.open(row["filepath"])
        img = ImageOps.exif_transpose(img).convert("RGB")  # fix phone rotation metadata
        label = self.class_to_idx[row["class"]]
        if self.transform:
            img = self.transform(image=np_array(img))["image"]
        return img, label

def np_array(pil_img):
    import numpy as np
    return np.array(pil_img)
```

Standard preprocessing (applied identically at train/val/test/inference, minus augmentation):
- EXIF-aware orientation correction (mandatory — phone photos frequently carry rotation metadata that breaks naive loading)
- Resize shorter side to 384px, center-crop to 384×384 for eval; train uses `RandomResizedCrop(384, scale=(0.7, 1.0))`
- Normalize with ImageNet mean/std (since using ImageNet-pretrained backbone): `mean=[0.485,0.456,0.406]`, `std=[0.229,0.224,0.225]`

**⚠️ Mobile parity requirement:** the on-device preprocessing in `mobile/src/inference/preprocess.ts` must replicate this exact resize/crop/normalize logic bit-for-bit (same interpolation method, same mean/std, same EXIF handling). A preprocessing mismatch between training and the mobile runtime is the single most common cause of "works on web, wrong on mobile" bugs. Cover this with `tests/test_mobile_parity.py` (Section 21).

---

## 7. Augmentation Strategy

Augmentations are chosen specifically to simulate the farmer-smartphone domain gap, not generic ImageNet-style augmentation. The **same augmented training set** is used for both teacher training and student distillation, so the student learns robustness to the same real-world noise.

```python
# src/augmentations.py
import albumentations as A
from albumentations.pytorch import ToTensorV2

def get_train_transforms(img_size=384):
    return A.Compose([
        A.RandomResizedCrop(size=(img_size, img_size), scale=(0.65, 1.0), ratio=(0.8, 1.25)),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.2),
        A.Rotate(limit=35, p=0.6, border_mode=0),
        A.Perspective(scale=(0.03, 0.08), p=0.3),                 # off-angle phone shots
        A.OneOf([
            A.RandomBrightnessContrast(brightness_limit=0.35, contrast_limit=0.35),
            A.RandomGamma(gamma_limit=(70, 140)),
            A.CLAHE(clip_limit=3.0),
        ], p=0.7),                                                   # harsh sun / shade variability
        A.OneOf([
            A.MotionBlur(blur_limit=7),
            A.GaussianBlur(blur_limit=(3, 7)),
            A.Defocus(radius=(2, 4)),
        ], p=0.35),                                                   # handheld motion, autofocus miss
        A.OneOf([
            A.ISONoise(),
            A.GaussNoise(var_limit=(10, 60)),
        ], p=0.3),                                                    # low-light phone sensor noise
        A.ImageCompression(quality_lower=35, quality_upper=90, p=0.4), # messaging-app recompression
        A.CoarseDropout(max_holes=6, max_height=int(0.12*img_size),
                         max_width=int(0.12*img_size), p=0.4),         # occlusion (fingers, other leaves)
        A.HueSaturationValue(hue_shift_limit=12, sat_shift_limit=25, val_shift_limit=15, p=0.4),
        A.RandomShadow(p=0.15),                                        # field shadow patterns
        A.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),
        ToTensorV2(),
    ])

def get_eval_transforms(img_size=384):
    return A.Compose([
        A.SmallestMaxSize(max_size=int(img_size*1.14)),
        A.CenterCrop(img_size, img_size),
        A.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),
        ToTensorV2(),
    ])
```

**MixUp / CutMix:** apply with low probability (p=0.2, alpha=0.2) only after epoch 5 — disease lesions are small/localized, so aggressive mixing can destroy the discriminative signal if overused. Monitor validation accuracy; disable if it hurts convergence. Disable MixUp/CutMix entirely during the distillation pass (Section 15) — mixed images produce ambiguous teacher soft-labels that make the KD loss noisier.

---

## 8. Class Imbalance Handling

Given source datasets, Tomato will dominate (10 classes, largest pool) while Pepper/Wheat/Groundnut are comparatively sparse. Combine three techniques:

**1. Weighted random sampler** (oversample minority classes per epoch):

```python
from torch.utils.data import WeightedRandomSampler
import numpy as np

class_counts = train_df["class"].value_counts().to_dict()
sample_weights = train_df["class"].map(lambda c: 1.0 / class_counts[c]).values
sampler = WeightedRandomSampler(weights=sample_weights, num_samples=len(sample_weights), replacement=True)
```

**2. Class-balanced focal loss** (down-weights easy majority-class examples, focuses gradient on hard/minority examples):

```python
# src/losses.py
import torch
import torch.nn as nn
import torch.nn.functional as F

class ClassBalancedFocalLoss(nn.Module):
    def __init__(self, class_counts, beta=0.999, gamma=2.0):
        super().__init__()
        counts = torch.tensor(class_counts, dtype=torch.float32)
        effective_num = 1.0 - torch.pow(beta, counts)
        weights = (1.0 - beta) / effective_num
        self.weights = weights / weights.sum() * len(counts)
        self.gamma = gamma

    def forward(self, logits, targets):
        w = self.weights.to(logits.device)
        ce = F.cross_entropy(logits, targets, weight=w, reduction="none", label_smoothing=0.1)
        pt = torch.exp(-ce)
        focal = ((1 - pt) ** self.gamma) * ce
        return focal.mean()
```

**3. Per-class capped oversampling ceiling** — cap oversampling at 4x original count for any class to avoid overfitting to a handful of duplicated minority images; if a class remains below ~150 images after augmentation, prioritize it in the next field-data collection round rather than over-relying on synthetic oversampling.

---

## 9. Transfer Learning Setup (Teacher)

```python
# src/model.py
import timm
import torch.nn as nn

def build_model(num_classes=30, pretrained=True):
    model = timm.create_model(
        "tf_efficientnetv2_s.in21k_ft_in1k",
        pretrained=pretrained,
        num_classes=num_classes,
        drop_rate=0.3,
        drop_path_rate=0.2,
    )
    return model
```

**Fine-tuning schedule (progressive unfreezing, VRAM-aware):**

| Phase | Epochs | Layers trainable | LR | Image size | Purpose |
|---|---|---|---|---|---|
| 1 — Head warmup | 3 | Classifier head only (backbone frozen) | 1e-3 | 224px | Fast head adaptation, avoid destroying pretrained features |
| 2 — Partial unfreeze | 10 | Last 2 backbone stages + head | 3e-4 (backbone), 1e-3 (head) | 300px | Adapt mid-level features to leaf textures |
| 3 — Full fine-tune | 25–35 | All layers | 1e-4 (backbone), 3e-4 (head) | 384px | Full adaptation, progressive resizing complete |

```python
def set_trainable(model, phase):
    for p in model.parameters():
        p.requires_grad = False
    if phase == 1:
        for p in model.get_classifier().parameters():
            p.requires_grad = True
    elif phase == 2:
        for name, p in model.named_parameters():
            if any(k in name for k in ["blocks.5", "blocks.6", "conv_head", "classifier"]):
                p.requires_grad = True
    elif phase == 3:
        for p in model.parameters():
            p.requires_grad = True
```

---

## 10. Hyperparameters & Training Schedule

VRAM-tuned defaults for RTX 5060 (8GB) — used to train the teacher:

```yaml
# config/train_config.yaml
optimizer: AdamW
weight_decay: 0.05
betas: [0.9, 0.999]

lr_schedule: cosine_with_warmup
warmup_epochs: 3
min_lr_ratio: 0.01

batch_size: 32          # @384px with AMP; drop to 16 if OOM, raise to 48-64 @224px in phase 1
grad_accum_steps: 2      # effective batch size 64

mixed_precision: true    # torch.cuda.amp — essential on 8GB VRAM
gradient_checkpointing: false  # enable only if OOM persists after batch/AMP tuning

epochs_total: 40         # across all 3 phases
early_stopping_patience: 8
early_stopping_metric: val_macro_f1

label_smoothing: 0.1
ema_decay: 0.9998        # exponential moving average of weights — improves eval stability
```

**Student (distillation) training schedule** — see full config in Section 15:

```yaml
# config/distill_config.yaml
student_architecture: mobilenetv3_large_100  # or tf_efficientnet_lite0
optimizer: AdamW
weight_decay: 0.03
lr_schedule: cosine_with_warmup
warmup_epochs: 2
batch_size: 64           # student is much smaller, fits larger batches @224px
epochs_total: 30
early_stopping_patience: 6
early_stopping_metric: val_macro_f1
image_size: 224          # smaller than teacher's 384 — matches mobile inference resolution
kd_temperature: 4.0
kd_alpha: 0.7            # weight on distillation loss vs. hard-label loss
```

---

## 11. Training Loop (PyTorch)

```python
# src/train.py
import torch
from torch.cuda.amp import autocast, GradScaler
from timm.utils import ModelEmaV2

def train_one_epoch(model, loader, optimizer, criterion, scaler, device, ema=None, accum_steps=2):
    model.train()
    optimizer.zero_grad()
    running_loss = 0.0
    for i, (imgs, labels) in enumerate(loader):
        imgs, labels = imgs.to(device, non_blocking=True), labels.to(device, non_blocking=True)
        with autocast():
            logits = model(imgs)
            loss = criterion(logits, labels) / accum_steps
        scaler.scale(loss).backward()
        if (i + 1) % accum_steps == 0:
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad()
            if ema is not None:
                ema.update(model)
        running_loss += loss.item() * accum_steps
    return running_loss / len(loader)

@torch.no_grad()
def validate(model, loader, criterion, device):
    model.eval()
    total_loss, all_preds, all_labels = 0.0, [], []
    for imgs, labels in loader:
        imgs, labels = imgs.to(device), labels.to(device)
        with autocast():
            logits = model(imgs)
            loss = criterion(logits, labels)
        total_loss += loss.item()
        all_preds.append(logits.argmax(1).cpu())
        all_labels.append(labels.cpu())
    return total_loss / len(loader), torch.cat(all_preds), torch.cat(all_labels)
```

---

## 12. Validation Strategy & Metrics

Track **macro-averaged** metrics (not accuracy alone) since classes are imbalanced:

- **Macro F1** — primary model-selection metric (equal weight per class regardless of frequency)
- **Per-class precision/recall/F1** — catch silent failures on rare classes
- **Top-1 and Top-3 accuracy** — Top-3 useful for advisory UX ("likely one of these 3")
- **Confusion matrix** — specifically watch visually-similar pairs: Early vs. Late Blight (Tomato/Potato), Stripe vs. Leaf Rust (Wheat), Bacterial Blight vs. Brown Spot (Rice)
- **Expected Calibration Error (ECE)** — see Section 13

```python
# src/evaluate.py
from sklearn.metrics import classification_report, confusion_matrix, f1_score

def full_eval_report(y_true, y_pred, class_names):
    report = classification_report(y_true, y_pred, target_names=class_names, digits=4, zero_division=0)
    macro_f1 = f1_score(y_true, y_pred, average="macro")
    cm = confusion_matrix(y_true, y_pred)
    return report, macro_f1, cm
```

**5-fold stratified group cross-validation** on the train+val pool is recommended before final training, to estimate variance and confirm the split isn't unusually easy/hard — run once during model selection, not on every training run.

**Evaluate teacher and student side-by-side on identical val/test splits** and report the accuracy delta explicitly (e.g., "teacher macro-F1 0.91 vs. student macro-F1 0.87 — 4pt distillation gap") in every model card, so the gap is always visible before shipping.

---

## 13. Confidence Calibration

Raw softmax confidence is typically overconfident after training with label smoothing and heavy augmentation. Apply **temperature scaling** post-hoc on the validation set:

```python
# src/calibrate.py
import torch
import torch.nn as nn
import torch.optim as optim

class TemperatureScaler(nn.Module):
    def __init__(self):
        super().__init__()
        self.temperature = nn.Parameter(torch.ones(1) * 1.5)

    def forward(self, logits):
        return logits / self.temperature

def fit_temperature(logits, labels, max_iter=50):
    scaler = TemperatureScaler()
    optimizer = optim.LBFGS([scaler.temperature], lr=0.01, max_iter=max_iter)
    criterion = nn.CrossEntropyLoss()

    def closure():
        optimizer.zero_grad()
        loss = criterion(scaler(logits), labels)
        loss.backward()
        return loss

    optimizer.step(closure)
    return scaler.temperature.item()

def expected_calibration_error(probs, labels, n_bins=15):
    confidences, predictions = probs.max(1)
    accuracies = predictions.eq(labels)
    ece = torch.zeros(1)
    bin_boundaries = torch.linspace(0, 1, n_bins + 1)
    for lo, hi in zip(bin_boundaries[:-1], bin_boundaries[1:]):
        mask = (confidences > lo) & (confidences <= hi)
        if mask.any():
            ece += (mask.float().mean()) * (accuracies[mask].float().mean() - confidences[mask].mean()).abs()
    return ece.item()
```

**Fit a separate temperature for the teacher and the student** — they have different logit scales and confidence profiles, so a shared temperature would miscalibrate one of them. Store both alongside their respective model artifacts; apply each to its own model's logits at inference time before thresholding.

---

## 14. Out-of-Distribution & Unknown-Class Handling

Farmers will inevitably photograph things outside the 30 trained classes (other crops, non-plant objects, blurry unusable shots). The model must **decline to answer confidently** rather than force a wrong label — **on both web and mobile**, since a farmer offline deserves the same "please retake photo" safety net as one online.

**Layered approach:**

1. **Softmax entropy + max-confidence thresholding** (fast baseline): if `max(calibrated_softmax) < 0.55` OR entropy exceeds a fitted threshold → return `Unknown / Uncertain, please retake photo`.
2. **Energy-based OOD score** (stronger signal than softmax alone): compute `E(x) = -T * logsumexp(logits / T)`; fit a threshold on a held-out mix of in-distribution val data + an `ood_holdout/` set of unrelated images (random object photos, other crops, blank backgrounds).
3. **Image-quality gate before inference**: reject/warn on images that are extremely blurry (Laplacian variance below threshold), extremely dark/overexposed (mean pixel intensity out of range), or too small — these degrade both accuracy and OOD reliability. This gate is cheap enough to also run on-device (Section 21) before invoking the mobile model at all.

```python
# src/ood_detector.py
import torch
import torch.nn.functional as F
import cv2
import numpy as np

def energy_score(logits, T=1.0):
    return -T * torch.logsumexp(logits / T, dim=1)

def is_blurry(image_bgr, threshold=60.0):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var() < threshold

def classify_with_ood_guard(logits, temperature, energy_threshold, conf_threshold=0.55):
    calibrated = F.softmax(logits / temperature, dim=1)
    conf, pred = calibrated.max(1)
    energy = energy_score(logits, T=temperature)
    is_ood = (conf < conf_threshold) | (energy > energy_threshold)
    return pred, conf, is_ood
```

Calibrate `energy_threshold` and `conf_threshold` **separately for the teacher and the student** on a validation split that includes both in-distribution and OOD samples, optimizing for a target false-accept rate (e.g., <2% of OOD images wrongly classified with high confidence). Store both threshold sets in `model_metadata.json` for the mobile bundle and in the server config for FastAPI.

---

## 15. Knowledge Distillation: Teacher → Mobile Student

This is the step that makes the offline mobile model viable: instead of training the small MobileNetV3/EfficientNet-Lite0 student from scratch (which would underperform), the student learns to match the **soft output distribution** of the already-trained EfficientNetV2-S teacher, in addition to the true labels.

### 15.1 Student architecture

```python
# src/student_model.py
import timm

def build_student_model(num_classes=30, pretrained=True):
    # Two good options depending on final APK/latency budget:
    # - "mobilenetv3_large_100": ~5.4M params, most mature mobile export path
    # - "tf_efficientnet_lite0": ~4.7M params, slightly better accuracy/param ratio,
    #   designed explicitly for TFLite quantization
    model = timm.create_model(
        "tf_efficientnet_lite0",
        pretrained=pretrained,
        num_classes=num_classes,
        drop_rate=0.2,
    )
    return model
```

### 15.2 Distillation loss (soft targets + hard labels)

```python
# src/distillation.py
import torch
import torch.nn as nn
import torch.nn.functional as F

class DistillationLoss(nn.Module):
    """
    Combines:
      - KD loss: KL divergence between softened teacher and student logits
      - Hard loss: standard cross-entropy against true labels
    alpha controls the balance; temperature softens both distributions
    so the student can learn from the teacher's relative confidence
    across *all* classes, not just the top-1 label.
    """
    def __init__(self, alpha=0.7, temperature=4.0, hard_loss_fn=None):
        super().__init__()
        self.alpha = alpha
        self.T = temperature
        self.hard_loss_fn = hard_loss_fn or nn.CrossEntropyLoss(label_smoothing=0.1)

    def forward(self, student_logits, teacher_logits, labels):
        soft_teacher = F.softmax(teacher_logits / self.T, dim=1)
        soft_student = F.log_softmax(student_logits / self.T, dim=1)
        kd_loss = F.kl_div(soft_student, soft_teacher, reduction="batchmean") * (self.T ** 2)

        hard_loss = self.hard_loss_fn(student_logits, labels)
        return self.alpha * kd_loss + (1 - self.alpha) * hard_loss
```

### 15.3 Distillation training loop

```python
# src/distillation.py (continued)
def train_distillation_epoch(student, teacher, loader, optimizer, criterion, device, scaler=None):
    student.train()
    teacher.eval()  # teacher is frozen, inference-only
    running_loss = 0.0
    for imgs, labels in loader:
        imgs, labels = imgs.to(device), labels.to(device)

        with torch.no_grad():
            teacher_logits = teacher(imgs)  # no grad — teacher weights never update

        student_logits = student(imgs)
        loss = criterion(student_logits, teacher_logits, labels)

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(student.parameters(), max_norm=5.0)
        optimizer.step()

        running_loss += loss.item()
    return running_loss / len(loader)
```

### 15.4 Key practical notes

- **Freeze the teacher completely** during distillation — it only produces soft targets, never receives gradients.
- **Use the same train split** as the teacher (not val/test) so the student sees a fully independent evaluation later.
- **Match resolution intentionally**: train the student at 224px (its target mobile inference size), even though the teacher was trained/evaluated at 384px — resize teacher-side inputs to 224px before generating soft targets so the resolution the student learns from matches what it will see on-device.
- **Temperature (T=4.0) and alpha (0.7)** are starting points from `distill_config.yaml` (Section 10) — tune via val macro-F1; higher alpha weights the teacher's guidance more; higher T further softens the distribution, useful when teacher confidence is very peaked.
- **Re-fit calibration and OOD thresholds on the student independently** (Sections 13-14) after distillation completes — do not reuse the teacher's temperature/thresholds.
- **Track the teacher-student agreement rate** (% of validation images where both models predict the same top-1 class) as a distillation health metric — a low agreement rate signals the student needs more epochs, a different alpha/temperature, or a stronger architecture.

---

## 16. Checkpointing

```python
# save (teacher or student — same pattern, separate directories)
torch.save({
    "epoch": epoch,
    "model_state": model.state_dict(),
    "ema_state": ema.module.state_dict() if ema else None,
    "optimizer_state": optimizer.state_dict(),
    "scaler_state": scaler.state_dict(),
    "val_macro_f1": val_macro_f1,
    "temperature": temperature,
    "class_to_idx": CLASS_TO_IDX,
    "config": config,
}, f"models/checkpoints/{'teacher' if is_teacher else 'student'}/epoch{epoch:03d}_f1{val_macro_f1:.4f}.pt")

# always additionally maintain, per model:
# models/checkpoints/teacher/best.pt   (highest val_macro_f1)
# models/checkpoints/teacher/last.pt   (for resuming interrupted runs)
# models/checkpoints/student/best.pt
# models/checkpoints/student/last.pt
```

Keep the top-3 checkpoints by `val_macro_f1` per model and delete older ones automatically to manage disk space; never overwrite `best.pt` without confirming the new score is actually higher.

---

## 17. Experiment Tracking

Use **Weights & Biases** (or self-hosted MLflow if data cannot leave premises):

```python
import wandb

wandb.init(project="crop-disease-classifier", config=config, tags=[config["model_role"]])  # "teacher" or "student"
wandb.log({
    "train_loss": train_loss, "val_loss": val_loss,
    "val_macro_f1": val_macro_f1, "val_top1_acc": val_top1,
    "val_ece": ece, "lr": current_lr, "epoch": epoch,
})
wandb.log({"confusion_matrix": wandb.plot.confusion_matrix(
    preds=preds.numpy(), y_true=labels.numpy(), class_names=CLASSES)})

# distillation-specific
wandb.log({"teacher_student_agreement_rate": agreement_rate})
```

Log every run's: git commit hash, dataset manifest hash, full config, environment (`pip freeze`), model role (teacher/student), and final artifact paths — required for audit and rollback. Tag runs so teacher and student experiments are easy to filter separately in the dashboard.

---

## 18. Reproducibility

```python
# src/seed.py
import random, os
import numpy as np
import torch

def set_seed(seed=42):
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False  # trade some speed for determinism
```

- Pin all dependency versions in `requirements.txt` (exact versions, not ranges) — including mobile export tooling (`tensorflow`, `onnx`, `onnxruntime`, `ai-edge-litert` or equivalent TFLite converter).
- Store the dataset manifest (`data/splits.json`) with a content hash so any training run — teacher or student — can be traced to the exact image set used.
- Log the augmentation pipeline version/config alongside each run.
- Pin the exact teacher checkpoint hash used for every distillation run, so a student model can always be traced back to which teacher produced its soft targets.

---

## 19. Model Export: Web (ONNX/INT8) & Mobile (TFLite/ONNX Mobile)

### 19.1 Web export (teacher → server)

```python
# src/export.py
import torch

def export_onnx(model, path="models/onnx/model.onnx", img_size=384):
    model.eval()
    dummy = torch.randn(1, 3, img_size, img_size)
    torch.onnx.export(
        model, dummy, path,
        input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
    )

# verify numerical parity
import onnxruntime as ort
import numpy as np

def verify_onnx(model, onnx_path, img_size=384, atol=1e-3):
    dummy = torch.randn(1, 3, img_size, img_size)
    with torch.no_grad():
        torch_out = model(dummy).numpy()
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    onnx_out = sess.run(None, {"input": dummy.numpy()})[0]
    assert np.allclose(torch_out, onnx_out, atol=atol), "ONNX output mismatch!"
    print("ONNX export verified.")
```

**INT8 static quantization for the server model** (post-training, calibrated on a representative subset of train data — include diverse lighting/crop examples in the calibration set):

```python
from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantType, QuantFormat
import numpy as np

class CalibReader(CalibrationDataReader):
    def __init__(self, calib_images):  # list of preprocessed np arrays, shape (1,3,384,384)
        self.data = iter(calib_images)

    def get_next(self):
        img = next(self.data, None)
        return {"input": img} if img is not None else None

quantize_static(
    model_input="models/onnx/model.onnx",
    model_output="models/quantized/model_int8.onnx",
    calibration_data_reader=CalibReader(calib_images),
    quant_format=QuantFormat.QDQ,
    activation_type=QuantType.QInt8,
    weight_type=QuantType.QInt8,
    per_channel=True,
)
```

**Validate INT8 accuracy drop is acceptable** (typically <1% macro-F1 loss for EfficientNetV2 architectures) by re-running the full test-set evaluation against the quantized model before deploying it — never deploy quantized weights without this check.

### 19.2 Mobile export (student → on-device)

Two viable paths; pick one based on your mobile framework:

**Option A — TFLite (best for React Native via `react-native-fast-tflite`, or native Android/iOS):**

```python
# src/export.py (continued)
import tensorflow as tf

def export_student_to_tflite(saved_model_dir, output_path="models/tflite/model_int8.tflite",
                               representative_dataset=None):
    converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_dir)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_dataset  # generator yielding preprocessed images
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.int8
    converter.inference_output_type = tf.float32  # keep output float for easier softmax/calibration downstream
    tflite_model = converter.convert()
    with open(output_path, "wb") as f:
        f.write(tflite_model)
```

> Note: converting a PyTorch-trained student to TFLite typically goes PyTorch → ONNX → TensorFlow (via `onnx-tf` or `onnx2tf`) → TFLite. Verify numerical parity at each hop, not just at the end.

**Option B — ONNX Runtime Mobile (best if staying in the ONNX ecosystem, e.g., Flutter via `onnxruntime` plugin):**

```python
# src/export.py (continued)
from onnxruntime.quantization import quantize_dynamic, QuantType

def export_student_onnx_mobile(onnx_fp32_path, output_path="models/onnx_mobile/model_int8.onnx"):
    quantize_dynamic(
        model_input=onnx_fp32_path,
        model_output=output_path,
        weight_type=QuantType.QInt8,
    )
```

**Either way, produce a `model_metadata.json` bundled alongside the mobile model:**

```json
{
  "classes": ["Tomato___Late_Blight", "..."],
  "input_size": 224,
  "mean": [0.485, 0.456, 0.406],
  "std": [0.229, 0.224, 0.225],
  "temperature": 1.68,
  "energy_threshold": -2.7,
  "conf_threshold": 0.55,
  "model_version": "student-v1.3-2026-07-13",
  "distilled_from_teacher": "teacher-v2.1-best.pt"
}
```

**Validate mobile INT8 accuracy drop** the same way as the server model — re-run the full test set (and ideally the field-only test set) against the exported `.tflite`/`.onnx` mobile artifact, on a representative low-end device if possible, before bundling it into the app.

---

## 20. Deployment A: FastAPI (Web Backend)

```python
# serving/schemas.py
from pydantic import BaseModel

class PredictionResponse(BaseModel):
    predicted_class: str
    confidence: float
    top3: list[dict]
    is_uncertain: bool
    latency_ms: float

# serving/inference.py
import onnxruntime as ort
import numpy as np
from PIL import Image, ImageOps
import time

class InferenceEngine:
    def __init__(self, onnx_path, classes, temperature, energy_threshold, conf_threshold=0.55):
        self.session = ort.InferenceSession(
            onnx_path, providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
        )
        self.classes = classes
        self.temperature = temperature
        self.energy_threshold = energy_threshold
        self.conf_threshold = conf_threshold

    def preprocess(self, pil_img, size=384):
        img = ImageOps.exif_transpose(pil_img).convert("RGB")
        img = img.resize((size, size))
        arr = np.array(img).astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406])
        std = np.array([0.229, 0.224, 0.225])
        arr = (arr - mean) / std
        arr = arr.transpose(2, 0, 1)[None].astype(np.float32)
        return arr

    def predict(self, pil_img):
        t0 = time.perf_counter()
        x = self.preprocess(pil_img)
        logits = self.session.run(None, {"input": x})[0][0]
        calibrated = np.exp(logits / self.temperature)
        calibrated /= calibrated.sum()
        energy = -self.temperature * np.log(np.exp(logits / self.temperature).sum())
        top_idx = calibrated.argsort()[::-1][:3]
        is_uncertain = (calibrated.max() < self.conf_threshold) or (energy > self.energy_threshold)
        latency_ms = (time.perf_counter() - t0) * 1000
        return {
            "predicted_class": "Unknown" if is_uncertain else self.classes[top_idx[0]],
            "confidence": float(calibrated.max()),
            "top3": [{"class": self.classes[i], "confidence": float(calibrated[i])} for i in top_idx],
            "is_uncertain": bool(is_uncertain),
            "latency_ms": latency_ms,
        }
```

```python
# serving/app.py
from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image
import io, logging
from serving.inference import InferenceEngine
from serving.schemas import PredictionResponse
from config.classes import CLASSES

app = FastAPI(title="Crop Disease Classifier", version="1.0.0")
logger = logging.getLogger("uvicorn")

engine = InferenceEngine(
    onnx_path="models/quantized/model_int8.onnx",
    classes=CLASSES,
    temperature=1.42,             # teacher's value, fitted in Section 13
    energy_threshold=-3.1,        # teacher's value, fitted in Section 14
)

MAX_FILE_SIZE_MB = 10

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict", response_model=PredictionResponse)
async def predict(file: UploadFile = File(...)):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Unsupported image format")
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, "File too large")
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
        img = Image.open(io.BytesIO(contents))  # reopen after verify()
    except Exception:
        raise HTTPException(400, "Invalid or corrupt image")

    result = engine.predict(img)
    logger.info(f"prediction={result['predicted_class']} conf={result['confidence']:.3f} "
                f"latency={result['latency_ms']:.1f}ms")
    return result
```

```python
# serving/app.py (add — accepts synced offline predictions from mobile, see §22)
from serving.schemas import SyncBatchRequest

@app.post("/sync/upload")
async def sync_upload(batch: SyncBatchRequest):
    """
    Receives queued offline predictions/images from the mobile app once connectivity
    returns. Stores them for the next field-data collection / retraining round
    and for teacher-model re-scoring of anything the on-device student flagged
    as uncertain.
    """
    for record in batch.records:
        # persist record.image, record.student_prediction, record.timestamp,
        # record.device_id, record.was_uncertain, record.farmer_feedback (if any)
        ...
    return {"received": len(batch.records)}
```

```dockerfile
# serving/Dockerfile
FROM nvcr.io/nvidia/tensorrt:24.05-py3-min
WORKDIR /app
COPY requirements-serve.txt .
RUN pip install --no-cache-dir -r requirements-serve.txt
COPY serving/ serving/
COPY config/ config/
COPY models/quantized/ models/quantized/
CMD ["uvicorn", "serving.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

Run with GPU: `docker run --gpus all -p 8000:8000 crop-disease-classifier:latest`

The web frontend (`web/`) calls `POST /predict` with a multipart image upload and renders `predicted_class`, `confidence`, `top3`, and an "Unknown — please retake photo" state when `is_uncertain` is true — same UX contract the mobile app follows offline (Section 21).

---

## 21. Deployment B: On-Device Mobile Inference (Offline-First)

The mobile app must produce a prediction **with zero network calls** using the distilled student model bundled inside the app package.

### 21.1 Framework choice

| Framework | Recommended runtime | Notes |
|---|---|---|
| React Native | `react-native-fast-tflite` (TFLite) or `onnxruntime-react-native` | Fastest path if the web app is already React-based; shares some TypeScript logic |
| Flutter | `tflite_flutter` or `onnxruntime` plugin | Good native performance, single codebase for Android/iOS |
| Native Android/iOS | TFLite (Android: `org.tensorflow:tensorflow-lite`; iOS: TFLite Swift/ObjC pod) or ONNX Runtime Mobile | Best raw performance, more engineering overhead |

The structure below assumes React Native + TFLite; the same logic applies with framework-appropriate API calls for Flutter/native.

### 21.2 On-device inference

```typescript
// mobile/src/inference/onDeviceModel.ts
import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import modelMetadata from '../../assets/models/model_metadata.json';

let model: TensorflowModel | null = null;

export async function loadModel(): Promise<void> {
  model = await loadTensorflowModel(
    require('../../assets/models/model_int8.tflite')
  );
}

export interface PredictionResult {
  predictedClass: string;
  confidence: number;
  top3: { class: string; confidence: number }[];
  isUncertain: boolean;
  latencyMs: number;
}

export async function predict(preprocessedInput: Float32Array): Promise<PredictionResult> {
  if (!model) throw new Error('Model not loaded — call loadModel() first');

  const t0 = performance.now();
  const outputs = model.runSync([preprocessedInput]);
  const logits = outputs[0] as Float32Array;
  const latencyMs = performance.now() - t0;

  const { temperature, energy_threshold, conf_threshold, classes } = modelMetadata;

  const calibrated = softmaxWithTemperature(logits, temperature);
  const energy = energyScore(logits, temperature);
  const top3Idx = argsortDescending(calibrated).slice(0, 3);

  const maxConf = Math.max(...calibrated);
  const isUncertain = maxConf < conf_threshold || energy > energy_threshold;

  return {
    predictedClass: isUncertain ? 'Unknown' : classes[top3Idx[0]],
    confidence: maxConf,
    top3: top3Idx.map(i => ({ class: classes[i], confidence: calibrated[i] })),
    isUncertain,
    latencyMs,
  };
}

function softmaxWithTemperature(logits: Float32Array, T: number): number[] {
  const scaled = Array.from(logits).map(l => l / T);
  const maxVal = Math.max(...scaled);
  const exps = scaled.map(v => Math.exp(v - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

function energyScore(logits: Float32Array, T: number): number {
  const scaled = Array.from(logits).map(l => l / T);
  const maxVal = Math.max(...scaled);
  const logSumExp = maxVal + Math.log(scaled.reduce((s, v) => s + Math.exp(v - maxVal), 0));
  return -T * logSumExp;
}

function argsortDescending(arr: number[]): number[] {
  return arr.map((v, i) => i).sort((a, b) => arr[b] - arr[a]);
}
```

### 21.3 On-device preprocessing (must match training exactly — see §6 warning)

```typescript
// mobile/src/inference/preprocess.ts
import { Image } from 'react-native-vision-camera'; // or equivalent image capture result

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const INPUT_SIZE = 224; // matches student training resolution (§10, §15.4)

export async function preprocessImage(imageUri: string): Promise<Float32Array> {
  // 1. Correct EXIF orientation (mirrors ImageOps.exif_transpose in src/datasets.py)
  const orientedUri = await correctExifOrientation(imageUri);

  // 2. Resize shorter side then center-crop to INPUT_SIZE x INPUT_SIZE
  //    (mirrors A.SmallestMaxSize + A.CenterCrop in get_eval_transforms)
  const resizedBitmap = await resizeAndCenterCrop(orientedUri, INPUT_SIZE);

  // 3. Normalize to [0,1] then apply ImageNet mean/std, HWC -> CHW
  const rgbFloats = await bitmapToNormalizedFloatArray(resizedBitmap, MEAN, STD);

  return rgbFloats; // shape: [1, 3, 224, 224], flattened
}
```

### 21.4 On-device image-quality gate (cheap pre-inference check, mirrors §14.3)

```typescript
// mobile/src/inference/oodGuard.ts
export function isImageUsable(bitmap: RawBitmap): { usable: boolean; reason?: string } {
  const laplacianVariance = computeLaplacianVariance(bitmap); // grayscale + simple 3x3 kernel
  if (laplacianVariance < 60.0) {
    return { usable: false, reason: 'Image too blurry — please retake' };
  }
  const meanBrightness = computeMeanBrightness(bitmap);
  if (meanBrightness < 30 || meanBrightness > 225) {
    return { usable: false, reason: 'Image too dark/bright — please retake in better lighting' };
  }
  return { usable: true };
}
```

Run this **before** calling `predict()` — rejecting unusable images on-device saves battery/CPU and gives the farmer immediate feedback without needing the model at all.

### 21.5 Mobile-web prediction parity test

```python
# tests/test_mobile_parity.py
"""
Loads a fixed set of test images, runs them through:
  1. The server-side quantized ONNX model (as FastAPI would)
  2. The exported mobile TFLite/ONNX model (via a Python TFLite interpreter,
     simulating what the phone will do)
Asserts top-1 predictions agree on >=95% of a curated agreement-check set,
and that confidence values are within a reasonable tolerance.
Run this in CI on every model export to catch preprocessing or export drift
before it reaches either app.
"""
```

---

## 22. Offline Sync Architecture

The mobile app must work with **zero connectivity for the core prediction flow**, then opportunistically sync when a connection is available — for feedback collection, retraining data, and (optionally) re-scoring uncertain predictions against the more accurate server-side teacher.

### 22.1 What gets stored locally, and when it syncs

| Data | Stored locally | Synced when online | Purpose |
|---|---|---|---|
| Every prediction (image + result) | Always | Yes, batched | Retraining data, usage analytics |
| Farmer feedback ("was this right?") | Always | Yes, batched | Label correction, active learning signal |
| Predictions flagged `is_uncertain` | Always | Prioritized/immediate when online | Candidate for re-scoring by the more accurate teacher model |
| App/model version metadata | Always | With every sync batch | Debugging which model version produced which prediction |

### 22.2 Local storage

```typescript
// mobile/src/storage/localDb.ts
import { Database } from '@nozbe/watermelondb'; // or expo-sqlite / react-native-sqlite-storage

export interface PredictionRecord {
  id: string;
  imageUri: string;           // local file path
  predictedClass: string;
  confidence: number;
  isUncertain: boolean;
  modelVersion: string;       // from model_metadata.json
  createdAt: number;
  farmerFeedback?: 'correct' | 'incorrect' | null;
  syncedAt?: number | null;   // null = not yet synced
}

export async function savePredictionLocally(record: PredictionRecord): Promise<void> {
  // insert into local SQLite/WatermelonDB table `predictions`
}

export async function getUnsyncedRecords(limit = 50): Promise<PredictionRecord[]> {
  // SELECT * FROM predictions WHERE syncedAt IS NULL ORDER BY isUncertain DESC, createdAt ASC LIMIT ?
  return [];
}
```

### 22.3 Sync queue and service

```typescript
// mobile/src/storage/syncQueue.ts
export interface SyncQueueItem {
  record: PredictionRecord;
  retryCount: number;
}

// mobile/src/sync/syncService.ts
import NetInfo from '@react-native-community/netinfo';
import { getUnsyncedRecords, markAsSynced } from '../storage/localDb';

const SYNC_ENDPOINT = 'https://api.yourbackend.com/sync/upload';
const MAX_BATCH_SIZE = 20;
const MAX_RETRIES = 5;

export function startSyncListener(): void {
  NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable) {
      runSyncCycle().catch(err => console.warn('Sync cycle failed', err));
    }
  });
}

export async function runSyncCycle(): Promise<void> {
  let batch = await getUnsyncedRecords(MAX_BATCH_SIZE);
  while (batch.length > 0) {
    try {
      const response = await fetch(SYNC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: await Promise.all(batch.map(toSyncPayload)) }),
      });
      if (!response.ok) throw new Error(`Sync failed: ${response.status}`);

      await markAsSynced(batch.map(r => r.id));
      batch = await getUnsyncedRecords(MAX_BATCH_SIZE);
    } catch (err) {
      console.warn('Batch sync failed, will retry on next connectivity event', err);
      break; // stop this cycle; NetInfo listener will trigger another attempt later
    }
  }
}

async function toSyncPayload(record: PredictionRecord) {
  return {
    ...record,
    imageBase64: await readImageAsBase64(record.imageUri), // only encode at send time, not at rest
  };
}
```

### 22.4 Sync design principles

- **Prediction never blocks on network.** The on-device model always produces a result immediately; syncing is a background concern the farmer never has to wait on.
- **Prioritize uncertain predictions in the sync queue** — these are the most valuable for improving the model and the most likely to need a human/teacher-model second opinion.
- **Batch, don't stream** — sync in batches of ~20-50 records to avoid hammering the API on flaky rural connectivity; retry with backoff, don't retry indefinitely without limit.
- **Never delete local images until sync is confirmed** (`syncedAt` set) — treat the phone as the source of truth until the server acknowledges receipt.
- **Respect data caps and metered connections** — check `NetInfo` for connection type and consider deferring large image syncs to Wi-Fi-only if the farmer's plan is limited (expose as a toggle in app settings).
- **Version every synced record** with the on-device model version, so retraining pipelines know exactly which student model produced which prediction.

---

## 23. Monitoring

**Server-side (web):**
- **Latency**: log p50/p95/p99 per request; alert if p95 > 150ms (RTX 5060 serving target).
- **Prediction distribution drift**: track daily class-prediction histogram; alert on sudden shifts (may indicate a client-side bug sending wrong images, or a genuine new outbreak worth flagging to agronomists).
- **Uncertainty rate**: track `% is_uncertain=True` daily; a rising trend often signals distribution shift (new devices, new region, new season/lighting) requiring a retraining cycle.
- **Error rate & exceptions**: standard 4xx/5xx tracking via FastAPI middleware + structured logging (JSON logs → ELK/Loki).
- Recommended stack: Prometheus (metrics) + Grafana (dashboards) + structured JSON logs shipped to Loki/ELK.

```python
# serving/app.py (add)
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
```

**On-device (mobile) — reported via sync batches, since there's no live telemetry offline:**
- **On-device latency**: bundle `latencyMs` with every synced prediction; track distribution across device tiers (a budget Android phone will differ hugely from a mid-range one) — this is the mobile equivalent of server p95 tracking, just delayed until sync.
- **On-device uncertainty rate**: same signal as server-side, but segmented by device model — a rising rate on one device family may indicate a camera/preprocessing quirk specific to that hardware.
- **Sync health**: track `% of predictions still unsynced after 7 days` per device — a rising number may mean a farmer's app has broken connectivity handling or the farmer is in a persistently low-connectivity area, both worth knowing.
- **Teacher-student agreement in the field**: when an uncertain on-device prediction gets re-scored by the teacher after sync, log whether they agreed — this is a live, real-world version of the offline distillation health metric from Section 15.4.
- **Human feedback loop**: allow farmers/extension workers to flag wrong predictions in both apps; route flagged images (with consent) into the next field-data collection round.

---

## 24. Verifying Generalization to Farmer-Captured Images

This is the deployment gatekeeper for **both** apps — **do not ship based on public-dataset test accuracy alone, and do not ship the mobile app based on the teacher's field-test numbers alone.**

1. **Maintain a fully independent field test set** (Section 4.2/5), never touched during training/hyperparameter tuning, composed only of real farmer/extension-worker photos across diverse: devices, regions, lighting, growth stages, and backgrounds.
2. **Report accuracy split by source AND by model**: `lab-image test accuracy` vs. `field-image test accuracy`, for **both the teacher and the student**, side by side, in every model card. A gap greater than ~8-10 percentage points (lab vs. field) signals overfitting to lab conditions; a large gap between teacher and student signals the distillation needs more work before the mobile release ships.
3. **Stress-test buckets**: manually tag a subset of the field test set into difficulty buckets — (a) clean single-leaf shots, (b) cluttered/multi-leaf background, (c) poor lighting, (d) blurry/low-res, (e) unusual angle — and report per-bucket accuracy for both models. This tells you exactly which real-world condition to prioritize in the next data collection round, and whether the mobile student specifically struggles with any bucket more than the teacher does.
4. **Confusion-driven data collection**: after each field-test evaluation, pull the top confusion pairs and specifically source more field images for those classes rather than blindly collecting more of everything.
5. **Shadow deployment before full rollout**: run the model in "log-only" mode alongside human agronomist review for 2–4 weeks on live traffic; compare model predictions to expert labels without acting on model output, then compute live agreement rate before enabling user-facing predictions. Do this for the web app first (easier to instrument), then repeat for the mobile app once sync data starts arriving.
6. **Geographic/device holdout test**: hold out one entire region and one entire device brand from training entirely; test exclusively on that holdout. This estimates how well the model generalizes to a region/device it has never seen — a stronger generalization signal than a random field holdout, and **especially important for the mobile student**, since low-end device/camera variety is exactly what it will face in the wild.
7. **On-device benchmark pass**: before shipping the mobile app, run the exported `.tflite`/`.onnx` student on a small fleet of representative physical devices (not just emulators) — spanning budget Android to mid-range — and confirm both latency and accuracy hold up outside a desktop Python environment.
8. **Periodic re-evaluation cadence**: re-run the full field test set every time either model is retrained, and track field-test macro-F1 over time for both teacher and student as the primary release-readiness metric — not train/val metrics.

**Release gates (recommended minimum bar):**

| Metric | Web (Teacher) | Mobile (Student) |
|---|---|---|
| Field-test macro-F1 | ≥ 0.85 | ≥ 0.80 |
| Uncertain-rate on OOD holdout correctly flagged `Unknown` | ≥ 90% | ≥ 85% |
| p95 latency | ≤ 150ms (server GPU) | ≤ 300-500ms (budget Android CPU) |
| INT8 accuracy drop vs. FP32 | ≤ 1% | ≤ 2% |
| Teacher-student agreement rate (val set) | — | ≥ 90% |

---

## 25. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| CUDA OOM during training | Batch size / image size too high for 8GB VRAM | Reduce batch size, enable AMP, increase `grad_accum_steps`, or enable gradient checkpointing |
| Train accuracy high, val accuracy low | Overfitting to lab-image majority source, or split leakage | Check `group_id` splitting is correct; increase augmentation strength; add field data |
| Val accuracy good, field-test accuracy poor | Domain shift (lab vs. field images) | See Section 24 — collect more field data, increase augmentation realism |
| Model always predicts majority class | Class imbalance not corrected, sampler/loss weights not applied | Verify `WeightedRandomSampler` and focal loss weights are actually wired into the training loop |
| High confidence on garbage/OOD images | No OOD guard, or thresholds miscalibrated | Recalibrate energy/confidence thresholds (Section 14) using a proper OOD holdout set — for the specific model (teacher or student) showing the issue |
| ONNX output doesn't match PyTorch output | Wrong opset version, dynamic axes misconfigured, or eval-mode/BN mismatch | Ensure `model.eval()` before export; verify with `verify_onnx()`; check opset compatibility with `onnxruntime` version |
| INT8 model accuracy drops significantly | Poor/unrepresentative calibration set | Rebuild calibration set with diverse lighting/crop/background samples (200–500 images minimum) |
| FastAPI endpoint slow under load | Single worker, CPU-bound preprocessing, no batching | Increase `--workers`, move preprocessing to be non-blocking/async, consider dynamic batching for burst traffic |
| Confusion between Early/Late Blight or Stripe/Leaf Rust | Genuinely fine-grained visual similarity | Increase resolution for these classes specifically, review label quality with domain expert, consider a two-stage coarse→fine classifier |
| Training loss NaN | LR too high after unfreezing, or AMP instability | Lower LR at unfreeze phase transitions, add gradient clipping (already in training loop), verify no corrupt images with extreme pixel values |
| Student accuracy much lower than teacher after distillation | Alpha/temperature not tuned, or resolution mismatch between teacher soft-targets and student training | Sweep `kd_alpha`/`kd_temperature`; confirm teacher-side inputs were resized to the student's 224px before generating soft targets (§15.4) |
| Mobile predictions differ from web predictions on the same image | Preprocessing mismatch (interpolation method, normalization, EXIF handling) between `src/datasets.py` and `mobile/src/inference/preprocess.ts` | Run `tests/test_mobile_parity.py`; audit resize/crop/normalize step-by-step for exact parity |
| TFLite/ONNX Mobile conversion fails or produces garbage output | Unsupported op during PyTorch → ONNX → TF → TFLite hop, or quantization calibration set too small/unrepresentative | Check converter logs for unsupported-op warnings; verify parity at each conversion hop separately, not just at the end; expand the representative dataset |
| Mobile app slow/laggy on budget devices | Model too large for target hardware, or preprocessing done on the JS thread instead of native | Confirm INT8 (not FP32) model is bundled; move preprocessing to a native module/worker thread; verify with `benchmark_mobile_latency.py` on real low-end hardware |
| Sync queue growing indefinitely, never draining | Connectivity detection false-positive, endpoint auth failure, or unhandled exception silently breaking the sync loop | Add explicit error logging in `runSyncCycle`; verify `NetInfo` accurately reflects real internet reachability, not just Wi-Fi association; check server auth/CORS config |
| Farmer sees a different confidence/uncertainty behavior online vs. offline | Teacher and student calibrated with different temperature/thresholds, as expected, but not communicated in UX | This is expected given two different models — ensure the UI copy ("Unknown, please retake") is consistent even if underlying confidence numbers differ slightly |

---

## Quick Start

```bash
git clone <repo>
cd crop-disease-classifier
pip install -r requirements.txt

# --- Shared data pipeline ---
python scripts/prepare_dataset.py --config config/train_config.yaml
python scripts/build_splits.py

# --- Teacher (web) ---
python src/train.py --config config/train_config.yaml --role teacher
python src/calibrate.py --checkpoint models/checkpoints/teacher/best.pt
python src/export.py --checkpoint models/checkpoints/teacher/best.pt --output models/onnx/model.onnx
python scripts/quantize.py --input models/onnx/model.onnx --output models/quantized/model_int8.onnx

# --- Student (mobile), distilled from the trained teacher ---
python src/train.py --config config/distill_config.yaml --role student \
    --teacher-checkpoint models/checkpoints/teacher/best.pt
python src/calibrate.py --checkpoint models/checkpoints/student/best.pt
python src/export.py --checkpoint models/checkpoints/student/best.pt \
    --output models/tflite/model_int8.tflite --format tflite

# --- Serve web backend ---
uvicorn serving.app:app --host 0.0.0.0 --port 8000

# --- Web frontend ---
cd web && npm install && npm run dev

# --- Mobile app (bundle model + metadata, then run) ---
cp models/tflite/model_int8.tflite mobile/assets/models/
cp models/quantized/model_metadata.json mobile/assets/models/
cd mobile && npm install && npx react-native run-android   # or run-ios
```
