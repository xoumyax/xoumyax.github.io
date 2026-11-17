---
title: Breast Cancer Classification
slug: breast-cancer-classification
oneLiner: Classifies mammograms as benign or malignant on CBIS-DDSM, comparing texture-feature SVMs with deep convolutional networks.
years: "2024"
statusLabel: Reproduction study
areas: [other]
metrics:
  - { value: "0.91", label: "validation accuracy, residual CNN (Xception)" }
  - { value: "0.52–0.57", label: "held-out accuracy, GLCM + SVM across four angles" }
  - { value: "0.50", label: "accuracy when reproducing the published GLCM + SVM setup" }
links:
  - { label: GitHub, href: "https://github.com/xoumyax/Breast-Cancer-Classification" }
sponsors: []
stop: phd
order: 8
featured: false
cover: { glyphs: "(+)", tone: sage }
---

## Problem

Mammography is the main screening tool for breast cancer, and automated classification can help tell benign findings from malignant ones. This project reproduces three approaches from the literature on the same public dataset, CBIS-DDSM, and asks how far published results hold up. Soumyajyoti built the models: the GLCM + SVM reproduction and the residual CNN.

## Approach

The study uses the calcification training set of CBIS-DDSM: 528 benign and 544 malignant cases, split 70/30 into training and test sets. It compares three approaches:

1. **GLCM + SVM.** Hand-crafted texture features from gray-level co-occurrence matrices at four angles feed an RBF-kernel SVM, with Random Forest and XGBoost as extra baselines. The study compares no normalization, standard scaling and a Yeo-Johnson power transform.
2. **Two-view EfficientNet.** A network that reads both standard mammogram views of a breast together. It proved too compute-intensive to train fully on the available hardware.
3. **Residual CNN.** An Xception-style network, with hyperparameters tuned using Optuna.

## Results

Reproducing the published GLCM + SVM setup gave only 0.50 accuracy, with almost every benign case predicted as malignant. The likely cause is a different case selection from the original paper. Yeo-Johnson normalization made the SVM the most stable, but held-out accuracy stayed between 0.52 and 0.57, so texture statistics alone separate the two classes poorly. Best-fold cross-validation scores reached 0.79 and overstate performance.

The residual CNN reached 0.91 validation accuracy, clearly ahead of every classical model.

## Links

- [Code on GitHub](https://github.com/xoumyax/Breast-Cancer-Classification). The project report in the repository was written by another author.
