---
title: YARAikiba
slug: yaraikiba
oneLiner: A hosted web agent for YARA rule work that routes each analyst request onto 38 tools from the lab's detection framework.
years: "2026"
statusLabel: Hosted showcase
areas: [agents, security]
metrics:
  - { value: "38", label: "tools exposed to the agent" }
  - { value: "17", label: "fixed workflows (WF1–WF17)" }
links:
  - { label: "Try YARAikiba", href: "https://wifi-deflate-boneless.ngrok-free.dev" }
  - { label: "Study results dashboard", href: "https://tabby-reuse-grandma.ngrok-free.dev" }
sponsors: []
stop: phd
order: 3
featured: true
cover: { glyphs: "> _", tone: storm }
---

## Problem

Detection work moves between threat reports, malware samples, indicator lists and rule files, and each step usually needs a separate tool. YARAikiba puts the YaraGen framework behind one conversational workspace, so an analyst can ask for a result in plain language and get a rule, a table or an explanation back. It is a co-analyst for YARA rule work.

## Approach

The browser workspace has three panes: workflows on the left, the routed conversation with its tool steps in the center, and artifacts with a rule editor on the right.

A tool-calling model sits behind it. A layered router maps each request onto framework components exposed as tools, and the model writes its answer from the tools' structured output. In agent mode, the model chains dependent calls in a ReAct loop. For example, a dropped PDF report becomes a list of extracted IOCs and then a rule, or a dropped sample is classified and then gets a rule. Every generated rule is checked for IOC fidelity. The agent runs on the lab's own models.

## Results

YARAikiba exposes 38 tools and 17 workflows from a fixed catalog. It can:

- generate rules from a free-text description, an IOC list or a threat report (one rule, or one per sample the report covers);
- generate rules from a binary, as byte patterns with AutoPYara or as readable rules with YaraGen's Intelligent Selection Block, which picks named strings and PE-module conditions checked against goodware;
- extract IOCs from a threat report into an editable table;
- fix, edit and merge two rules or a whole rule set (AND/OR);
- describe a rule in plain language, assess its complexity and false-positive risk, and test two rules for equivalence with YaraDiff;
- cluster samples by similarity (sdhash), train AutoPYara Bloom filters and look up malware families.

## Links

- [Try YARAikiba](https://wifi-deflate-boneless.ngrok-free.dev). Guest access: sign in with Google, answer **No** to both setup questions (admin, study participant), then create an account.
- [Study results dashboard](https://tabby-reuse-grandma.ngrok-free.dev).
- Both run on a lab server and are reachable only while it is up. The hosted addresses may change.
- Built on [YaraGen](/projects/yaragen/) and [AutoPYara](/projects/autopyara/).
