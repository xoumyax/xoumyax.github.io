---
title: "IOCScooper++"
slug: iocscooper-plus-plus
oneLiner: Extracts indicators of compromise from real threat reports and turns them into valid YARA rules; ATT&CK technique extraction is next.
years: "2024–26"
statusLabel: In preparation
venue: "Targeting USENIX Security '27"
areas: [security]
metrics:
  - { value: "0.894 / 0.925", label: "micro / macro span-exact F1 over 36 IOC types" }
  - { value: "0.950", label: "F1 on explicit MITRE ATT&CK technique IDs" }
  - { value: "100%", label: "valid rules among 344 generated end to end" }
  - { value: "0.97", label: "IOC coverage of those rules" }
links: []
sponsors: []
stop: phd
order: 4
featured: true
cover: { glyphs: "[ioc]", tone: sage }
---

## Problem

Vendor and government threat reports describe attacks in prose. Defenders need two things from them in structured form: the indicators of compromise (IOCs), such as hashes, domains, addresses and file paths, and the attacker techniques (TTPs) mapped to MITRE ATT&CK. IOCScooper++ builds that extraction and checks the rules generated from its output for validity and IOC coverage. It began inside YaraGen and became a separate project in September 2026.

## Approach

Phase 1 trained ScooperNER-M, a 50.6M-parameter extractor for 36 IOC types, with masked-language-model pretraining followed by fine-tuning. Its corpus is 413 reports with gold and silver labels (audited parsers, 98.6% hash recall). The extracted IOCs feed a frozen YaraGen model, which turns them into rules.

Phase 2, in design, grounds technique extraction in the extracted IOCs, the entities that own them, and the actions applied to them. It lifts these (entity, action, IOC) tuples into ATT&CK by similarity to procedure-example anchors with supervised contrastive retrieval, instead of closed-set classification. This makes it open-set over all 637 techniques. Evaluation will follow the exact protocol of a 2025 systematization of knowledge (SoK) on automated TTP extraction, against its released baselines. A detection axis will report true positives and false positives per 1,000 benign files for rules built from the extracted IOCs.

## Results

Phase 1 results are frozen. On 47 held-out vendor and government reports, ScooperNER-M reaches 0.894 micro and 0.925 macro span-exact F1. It scores 0.950 F1 on explicit ATT&CK technique IDs and recovers 15 of 15 embedded YARA rules. It beats fine-tuned encoder baselines at 3–7× its size, and transfers zero-shot to APTNER at the level of APTNER's own fine-tuned BERT-base.

End to end on the same 47 reports, extraction feeding the frozen YaraGen model runs at 0.86 precision and 0.88 recall. All 344 generated rules are valid, with 0.97 IOC coverage. The extractor is the reliable component of the pipeline.

Phase 2 has no results yet.

## Links

No public paper or code yet. The work was presented at the Texas Security Workshop 2026 (26 September 2026).
