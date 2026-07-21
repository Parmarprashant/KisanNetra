
# Optimized KisanNetra Dataset

## Overview
This directory contains the optimized version of the KisanNetra crop disease dataset, ready for model training.

## Key Improvements
1. **Full Test Coverage**: All 66 classes now have test samples (minimum 5 per class)
2. **Balanced Classes**: Training samples capped at 2000 per class to prevent extreme imbalance
3. **Proper Splits**:
   - Train: ~98k images
   - Valid: ~5.3k images
   - Test: ~5.3k images
4. **Reproducibility**: Random seed set to 42 for consistent splits

## Files
- `optimized_dataset_manifest.csv`: CSV manifest with file paths, classes, and split assignments
- `optimized_dataset_metadata.json`: Metadata with statistics and configuration
- `dataset_loader.py`: PyTorch Dataset class to load the dataset using the manifest
- `analyze_dataset_splits.py`: Script to analyze the original dataset splits
- `create_optimized_manifest.py`: Script to create the optimized manifest
- `optimize_dataset.py`: (Alternative) Script to copy files into a new directory structure (slower)

## Usage with PyTorch
```python
from dataset_loader import OptimizedKisanNetraDataset, DataLoader

train_dataset = OptimizedKisanNetraDataset("optimized_dataset_manifest.csv", split="train")
valid_dataset = OptimizedKisanNetraDataset("optimized_dataset_manifest.csv", split="valid")
test_dataset = OptimizedKisanNetraDataset("optimized_dataset_manifest.csv", split="test")

train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
valid_loader = DataLoader(valid_dataset, batch_size=32)
test_loader = DataLoader(test_dataset, batch_size=32)
```

## Statistics
- Total classes: 66
- Total images: 108,663
- Train/Valid/Test ratio: ~90/5/5
