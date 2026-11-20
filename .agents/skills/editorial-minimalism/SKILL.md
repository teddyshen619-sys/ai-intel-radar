---
name: editorial-minimalism
description: >-
  Anti-AI-slop editorial frontend design skill distilled from anthropics/skills (frontend-design),
  pbakaus/impeccable, nextlevelbuilder/ui-ux-pro-max-skill, Apple Newsroom, and Google DeepMind
  editorial standards. Enforce strict typographic hierarchy, hairline rules, zero emojis, and zero
  rounded-box/pill clutter across web UIs and Canvas posters.
---

# Editorial Minimalism & Anti-AI-Slop Skill

## Grounding & Reference Standards
- **GitHub References**:
  - `anthropics/skills` (`skills/frontend-design/SKILL.md`) — purge generic AI templates, enforce explicit aesthetic direction and subject grounding before coding.
  - `pbakaus/impeccable` — anti-pattern audit against repetitive card boxes, decorative gradients, and SaaS metric tile bloat.
  - `nextlevelbuilder/ui-ux-pro-max-skill` — disciplined palette, scale, and layout pairing.
- **Visual Benchmarks**: `apple.com/newsroom`, `deepmind.google`, `blog.google`.

## Non-Negotiable Anti-Slop Rules
1. **Zero Emojis**: Never place emoji characters in navigation, headings, tabs, buttons, status labels, or empty states.
2. **Eliminate Rounded-Box & Pill Clutter**:
   - Do NOT wrap every article in rounded bordered cards with drop shadows.
   - Do NOT stack rounded pill badges (no 3-4 colored capsule tags per card, no pills nested inside navigation capsules, no rounded counter bubbles inside every tab).
   - Do NOT put 3-column SaaS KPI metric dashboard boxes above editorial content.
   - Do NOT wrap search/filter bars inside separate rounded white boxes.
3. **Editorial Structure (Apple Newsroom / Google DeepMind)**:
   - Use **pure gallery white (`#FFFFFF`)** as the primary light canvas (`#0B0C0E` for dark mode), with `#F5F5F7` (`#151618` dark) reserved strictly for flat recessed spotlight bands — sharp corners (`0px–4px` max architectural radius on inputs/modals).
   - Separate content using **1px hairline dividers** (`rgba(0, 0, 0, 0.09)` / `rgba(255, 255, 255, 0.12)`) and generous negative space instead of box borders.
   - Express status and metadata through **clean inline typography + a single 6px status dot** (e.g., `紧急 · 新模型 · OpenAI`) rather than colored capsules.
   - Keep color restraint strict: primary ink (`#1D1D1F`), secondary slate (`#6E6E73`), hairline dividers, one primary interactive accent (`#0066CC` / `#2997FF`), and minimal semantic dots (`#D93025` urgent, `#188038` active).
   - Use **progressive disclosure** with plain understated text links (`展开详情` / `原文 ↗`) and crisp left-accented inline detail panels.
   - Place global actions (poster generator, theme toggle) cleanly in the top sticky navigation bar rather than floating over mobile content.

## Verification Checklist Before Shipping
1. Scan HTML/CSS/JS for zero emoji characters.
2. Audit DOM visually at `1440x900` and `375x812`: confirm zero horizontal overflow, clean hairline rhythm, zero pill-on-pill nesting, and sharp editorial legibility.
3. Verify zero console errors and all interactive flows (tabs, vendor filter, search, expand, copy, Canvas 2D PNG export).
