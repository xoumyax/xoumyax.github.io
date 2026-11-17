---
title: AutoPYara
slug: autopyara
oneLiner: Generates YARA rules directly from raw malware binaries by clustering samples into families. Open source on PyPI.
years: "2024–26"
statusLabel: Published · open source on PyPI
venue: IEEE ACSAC 2026
areas: [security]
metrics:
  - { value: "+14 pp", label: "rule coverage vs. AutoYara" }
  - { value: "7.1 pp", label: "lower performance variance vs. AutoYara" }
  - { value: "+10%", label: "threat-hunting accuracy vs. AutoYara" }
  - { value: "≈71K", label: "Windows PE samples, collected over 8 years" }
links:
  - { label: "PyPI", href: "https://pypi.org/project/autopyara/" }
  - { label: "arXiv:2611.08608", href: "https://arxiv.org/abs/2611.08608" }
  - { label: "LASER 2026 accepted presentations", href: "https://www.acsac.org/2026/workshops/laser/LASER2026-AcceptedPresentations.pdf" }
  - { label: "Zenodo dataset (DOI 10.5281/zenodo.22665898)", href: "https://zenodo.org/records/22665898" }
  - { label: "GitHub", href: "https://github.com/Botacin-s-Lab/AutoPYara" }
sponsors: []
stop: phd
order: 1
featured: true
cover: { glyphs: "MZ ::", tone: rust }
---

## Problem

Analysts group malware samples into families and write a YARA rule that matches each family. AutoYara, the prior state of the art, generates such rules from binaries with biclustering. AutoPYara aims to cover more of each family with lower variance.

## Approach

AutoPYara re-implements and extends biclustering-based rule generation and works directly on raw Windows PE binaries. It adds two mechanisms:

1. precise selection of cluster centroids with similarity hashing;
2. an improved heuristic that estimates the number of subclusters within a family from historical VirusTotal data.

The study benchmarks several clustering algorithms and heuristics for choosing the optimal number of clusters (K). Results tables report the mean and standard deviation for each configuration.

## Results

On ≈71,000 Windows PE samples collected over 8 years, AutoPYara improves on AutoYara by 14 percentage points in rule coverage and lowers performance variance by 7.1 percentage points. Threat-hunting accuracy rises by 10%.

The tool is open source on PyPI, and the generated rules are published on Zenodo as the dataset "AutoPYara Generated YARA Rules" under CC BY 4.0. AutoPYara also runs as a tool inside [YARAikiba](/projects/yaraikiba/), for byte-pattern rules and Bloom-filter training.

## Links

*AutoPYara: Next-Gen YARA Rule Generator for Malware Family Clustering.* M. Ninan\*, N. Nguyen\*, S. Dutta, S. Anil, M. Botacin (\*equal contribution). IEEE ACSAC 2026; LASER 2026 talk.

- [PyPI: autopyara](https://pypi.org/project/autopyara/)
- [arXiv:2611.08608](https://arxiv.org/abs/2611.08608)
- [LASER 2026 accepted presentations](https://www.acsac.org/2026/workshops/laser/LASER2026-AcceptedPresentations.pdf)
- [Zenodo: AutoPYara Generated YARA Rules](https://zenodo.org/records/22665898) (DOI 10.5281/zenodo.22665898, CC BY 4.0)
- [GitHub: Botacin-s-Lab/AutoPYara](https://github.com/Botacin-s-Lab/AutoPYara)
