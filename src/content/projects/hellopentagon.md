---
title: HelloPentagon
slug: hellopentagon
oneLiner: An explainable malware-defense chatbot that pairs an ML classifier with an LLM for triage and interpretation.
years: "2024"
statusLabel: Deployed as an analyst tool
areas: [security, agents]
metrics: []
links:
  - { label: "Team repository", href: "https://github.com/jwonnyleaf/HelloPentagon" }
sponsors: []
stop: phd
order: 5
featured: false
cover: { glyphs: "( o )", tone: sand }
---

## Problem

A malware classifier returns a verdict. An analyst also needs to know why the sample was flagged and what to do next. HelloPentagon, a team project, adds that explanation to the verdict.

## Approach

An ML classifier labels the sample. An LLM then handles triage and interpretation, and explains the classifier's result to the analyst in conversation.

## Results

HelloPentagon is deployed as an interactive analyst tool. No quantitative results are recorded for it.

## Links

- [Team repository on GitHub](https://github.com/jwonnyleaf/HelloPentagon).
