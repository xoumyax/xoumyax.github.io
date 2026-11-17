---
title: Fashion-MNIST
slug: fashion-mnist
oneLiner: A team project that classifies Fashion-MNIST clothing images, from tree-based baselines up to an Xception CNN.
years: "2023"
statusLabel: Course project · ECEN 758
areas: [other]
metrics:
  - { value: "91.2%", label: "test accuracy (Xception)" }
  - { value: "91.8%", label: "precision" }
  - { value: "90.5%", label: "recall" }
links:
  - { label: GitHub, href: "https://github.com/xoumyax/Fashion-MNIST" }
sponsors: []
stop: ms
order: 3
featured: false
cover: { glyphs: "[#]", tone: storm }
---

## Problem

Fashion-MNIST is an image-classification benchmark of clothing items in ten classes. Team "Confusion Matrix" used it to compare classical and deep models, for ECEN 758 (Data Mining and Analysis) at Texas A&M.

## Approach

The work runs in four steps:

1. A statistical exploration of the dataset.
2. A Random Forest classifier as the baseline.
3. An XGBoost classifier, which improves on the baseline.
4. An Xception CNN, used for the final submission.

## Results

The Xception model reaches 91.2% accuracy, 91.8% precision and 90.5% recall on the test set. The per-class report shows that the shirt class is the hardest to classify.

## Links

- [Code on GitHub](https://github.com/xoumyax/Fashion-MNIST).
