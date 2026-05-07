# Skill: Markdown Report Generation (with charts)

## Purpose
Generate a durable Markdown report (and chart outputs) from analysis results.

## Prerequisites
- You have analysis results (tables/series) ready.
- You have (or will generate) figures using your preferred stack (e.g., Python + matplotlib).
- Output directory exists: `output/`

## Instructions
1. Choose a filename and save the report under `output/` (or an agreed subfolder).
2. Create a Markdown structure:
   - Title + date range
   - Executive summary (3-6 bullets)
   - Method (queries/transformations at a high level)
   - Results (tables)
   - Visualizations (embedded or referenced images)
   - Limitations / assumptions
   - Next questions to analyze
3. For charts:
   - ensure titles and axis labels are readable
   - include a legend when multiple series are plotted
4. After the report is generated:
   - update `memory.md` with durable learnings (what worked / what failed)
   - update `CLAUDE.md` if you changed any preferences or standards

## Common Mistakes
- [Mistake]: producing a report without stating the cohort/date filters.
  - Fix: include them in the header and method section.

