# Skill: Schema-first Data Analysis

## Purpose
Turn raw query results into correct, explainable analysis outputs while preventing schema hallucinations.

## Prerequisites
- Database schema available at `docs/schema.md` (or the agent has read it from the DB)
- Access to run queries through the connected MCP tool

## Instructions
1. Read `docs/schema.md` (or re-fetch schema from the database) before writing any analysis logic.
2. Restate the analysis goal in plain language and list assumptions.
3. Decide the date range / cohorts / filters. Explicitly confirm them if ambiguous.
4. Write minimal queries first:
   - validate row counts
   - validate key columns exist with the expected types
5. Only then proceed to complex transformations and aggregations.
6. For each chart/table:
   - label axes clearly
   - include the exact SQL logic or transformation summary that produced it
7. When something looks wrong:
   - check schema types first
   - check joins/filters next
   - then inspect outliers
8. Output as Markdown with:
   - short executive summary
   - methods (what you queried)
   - results (tables/charts)
   - limitations / next steps

## Common Mistakes
- [Mistake]: assuming a column meaning (e.g., treating an id as a timestamp).
  - Fix: schema-first, then validate with a tiny query.
- [Mistake]: skipping cohort definitions and date filters.
  - Fix: define cohorts before analysis.

## Notes
KEY INSIGHT (repeatable rule): ALWAYS read the database schema first. Never assume column meanings.

