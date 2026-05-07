# Dashboard Specifications - Taleemabad AI Agent

**Document Version:** 1.0  
**Date:** 2026-04-14  
**Purpose:** Stakeholder-specific dashboard designs for education monitoring system

---

## Overview

This document defines four dashboard types, each tailored for specific stakeholders:
- **FDE Dashboard** — Field Development Executives (system-wide view)
- **AEO Dashboard** — Area Education Officers (sector-level view)
- **Principal Dashboard** — School Principals (school-level view)
- **Viewer/Supervisor Page** — Internal visibility and monitoring

All dashboards include filtering capabilities and downloadable reports.

---

## 1. FDE Dashboard (Field Development Executive)

### Purpose
System-wide visibility across all schools, sectors, and teachers.

### Dashboard Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    FDE DASHBOARD                             │
├─────────────────────────────────────────────────────────────┤
│  FILTERS: Weeks | Sectors | Regions | Date Range | Schools  │
├─────────────────────────────────────────────────────────────┤
│                    HOME / GENERAL DATA                        │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Total        │  │ Primary      │  │ Middle & High│       │
│  │ Schools: 500 │  │ Schools: 250 │  │ Schools: 250 │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Total        │  │ Primary      │  │ Middle & High│       │
│  │ Teachers: 5K │  │ Teachers: 2K │  │ Teachers: 3K │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ [Home] [LP Engagement] [Trainings] [Observations] [Indicators]
└─────────────────────────────────────────────────────────────┘
```

### Page 1: General Data (Home)

**Key Metrics Cards:**
| Metric | Count | Chart Type |
|--------|-------|-----------|
| Total Schools | System total | Card with sparkline |
| Primary Schools | Breakdown | Card |
| Middle & High Schools | Breakdown | Card |
| Total Teachers | System total | Card with sparkline |
| Primary Teachers | Breakdown | Card |
| Middle & High Teachers | Breakdown | Card |

---

### Page 2: LP Engagement

**Sections:**

#### A. Primary LP Engagement
| Data Point | Display Type | Granularity |
|-----------|--------------|-------------|
| LP Rating Distribution | Histogram/Gauge | By Week, By Sector |
| Teachers Engaged (%) | Progress bar | Sector-wise |
| Average LP Score | Line chart | Trend over time |
| Sector-wise Comparison | Horizontal bar chart | Week vs Week |

#### B. Middle & High LP Engagement
| Data Point | Display Type | Granularity |
|-----------|--------------|-------------|
| LP Rating Distribution | Histogram/Gauge | By Week, By Sector |
| Teachers Engaged (%) | Progress bar | Sector-wise |
| Average LP Score | Line chart | Trend over time |
| Sector-wise Comparison | Horizontal bar chart | Week vs Week |

**Available Filters:**
- Week (Dropdown: Current, Last 4, Last 8, Custom date range)
- Sector (Multi-select)
- School Type (Primary / Middle & High)
- Teacher Status (Active / All)

**Export:** Download as PDF/Excel with graphs

---

### Page 3: Trainings Data

**Layout:**
```
┌──────────────────────────────────────────┐
│ TRAININGS DATA                           │
├──────────────────────────────────────────┤
│ Level of Completion: [=====>  ] 68%      │
│ All Sectors View                         │
│                                          │
│ Sector | Not Started | In Progress | Completed
├──────────────────────────────────────────┤
│ North |      45     |     120      |  250
│ South |      60     |      95      |  200
│ East  |      30     |     110      |  260
│ West  |      50     |     100      |  180
└──────────────────────────────────────────┘
```

**Data Table:**
| Sector | Total Teachers | Not Started | In Progress | Completed | % Completion |
|--------|---|---|---|---|---|
| North | 415 | 45 | 120 | 250 | 60% |
| South | 355 | 60 | 95 | 200 | 56% |
| East | 400 | 30 | 110 | 260 | 65% |
| West | 330 | 50 | 100 | 180 | 55% |

**Filters:**
- Level (Multi-select)
- Sector (Multi-select)
- Training Type

---

### Page 4: Observations Data

**Overview Cards:**
| Card | Metric |
|------|--------|
| Total Observations | Sum of all observations |
| Total Teachers Observed | Unique count |
| Observation Rate | % of total teachers |
| Avg Score | Average observation score |

**Data Visualization:**
```
Observations by Sector (Stacked Bar)
North:  [████████░░] 450 observations
South:  [██████░░░░] 320 observations
East:   [█████████░] 420 observations
West:   [████░░░░░░] 280 observations

Teachers Observed by Week (Line Graph)
Week 1: 150 → Week 2: 175 → Week 3: 190 → Week 4: 210
```

**Detailed Table:**
| Sector | Total Observations | Teachers Observed | Pending | Avg Score |
|--------|---|---|---|---|
| North | 450 | 180 | 45 | 3.8 |
| South | 320 | 125 | 35 | 3.6 |
| East | 420 | 160 | 40 | 3.9 |
| West | 280 | 95 | 30 | 3.5 |

**Filters:**
- Week (Date range picker)
- Sector (Multi-select)
- Observation Status (Completed / Pending)
- Teacher Type (Primary / Middle & High)

---

### Page 5: Indicators Aggregated Data

**Decision Needed:** Confirm which indicators to track
- Subject-wise performance
- Lesson quality indicators
- Student engagement indicators
- Teacher competency areas

*Format:* Radar chart (Sector comparison) + Heatmap (Indicator x Sector)

---

## 2. AEO Dashboard (Area Education Officer)

### Purpose
Sector-specific visibility and individual school monitoring.

### Dashboard Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    AEO DASHBOARD                             │
│                    (Sector: North)                            │
├─────────────────────────────────────────────────────────────┤
│  FILTERS: Weeks | Schools | Date Range | Teacher Type       │
├─────────────────────────────────────────────────────────────┤
│                    HOME / GENERAL DATA                        │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Schools      │  │ Primary      │  │ Middle & High│       │
│  │ in Sector: X │  │ Schools: Y   │  │ Schools: Z   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Total        │  │ Primary      │  │ Middle & High│       │
│  │ Teachers: X  │  │ Teachers: Y  │  │ Teachers: Z  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ [Home] [LP Engagement] [Trainings] [Observations] [Indicators]
└─────────────────────────────────────────────────────────────┘
```

### Page 1: General Data (Home)

**Sector-Level Metrics:**
| Metric | Display | Details |
|--------|---------|---------|
| Schools in Sector | Card | Primary + Middle & High breakdown |
| Total Teachers | Card | Primary + Middle & High breakdown |
| Sector Code/Name | Header | Fixed |

---

### Page 2: LP Engagement

**Two Sections:**

#### A. Sector Overview (Like FDE but sector-filtered)
- Primary LP Engagement summary
- Middle & High LP Engagement summary

#### B. School-by-School Detail View

**Table Format:**
| School Name | School Type | Primary LP % | Middle & High LP % | Avg LP Score | Status |
|---|---|---|---|---|---|
| School A | Mixed | 85% | 78% | 3.8 | Good |
| School B | Primary | 70% | - | 3.2 | Fair |
| School C | High | - | 82% | 3.9 | Excellent |
| School D | Mixed | 75% | 68% | 3.4 | Fair |

**Drill-down:** Click school name → Individual teacher LP engagement
```
School A - LP Engagement Detail
┌─────────────────────────────────┐
│ Teachers: 45 (Primary) / 30 (Middle & High)
│
│ Primary Teachers:
│ Teacher 1: LP Score 4.2 [████████░░]
│ Teacher 2: LP Score 3.5 [███████░░░]
│ Teacher 3: LP Score 3.8 [████████░░]
│ ...
│
│ Middle & High Teachers:
│ Teacher 1: LP Score 3.9 [████████░░]
│ Teacher 2: LP Score 4.1 [████████░░]
│ ...
└─────────────────────────────────┘
```

**Filters:**
- Week (Date range)
- School (Multi-select)
- School Type (Primary / Middle & High)

---

### Page 3: Trainings Data

**Sector Overview:**
```
Sector Training Completion: [========> ] 62%
```

**By School Table:**
| School | Primary Teachers | Middle & High Teachers | Overall Completion % | Status |
|--------|---|---|---|---|
| School A | 80% | 75% | 78% | On Track |
| School B | 60% | - | 60% | Behind |
| School C | - | 85% | 85% | Ahead |
| School D | 70% | 65% | 68% | On Track |

**Drill-down:** Click school → Individual teacher training status

**Filters:**
- Week (Date range)
- School (Multi-select)
- Level (Multi-select)

---

### Page 4: Observations Data

**Sector Overview Cards:**
| Card | Metric |
|------|--------|
| Total Observations (Sector) | Count |
| Teachers Observed | Count |
| Observation Rate | % |

**By School:**
| School | Observations | Teachers Observed | Pending | Avg Score | Last Observation |
|---|---|---|---|---|---|
| School A | 45 | 30 | 5 | 3.8 | 2 days ago |
| School B | 32 | 20 | 8 | 3.5 | 1 week ago |
| School C | 38 | 25 | 3 | 3.9 | 3 days ago |
| School D | 28 | 18 | 7 | 3.4 | 1 week ago |

**Drill-down:** Click school → Teacher-wise observations in that school

**Filters:**
- Week (Date range)
- School (Multi-select)
- Observation Status

---

### Page 5: Indicators Aggregated Data

**Sector-level** + **School-level breakdown**

Display as heatmap:
```
School      │ Indicator1 │ Indicator2 │ Indicator3 │ Indicator4
────────────┼────────────┼────────────┼────────────┼────────────
School A    │    ████    │    ███░    │    █████   │    ███░
School B    │    ██░░    │    ███░    │    ████░   │    ██░░
School C    │    █████   │    ████░   │    █████   │    █████
School D    │    ███░    │    ██░░    │    ████░   │    ███░
```

---

## 3. Principal Dashboard (School-Level)

### Purpose
Individual school's performance and teacher-specific data.

### Dashboard Structure

```
┌─────────────────────────────────────────────────────────────┐
│                  PRINCIPAL DASHBOARD                         │
│                  School: Government Primary School, North    │
├─────────────────────────────────────────────────────────────┤
│  FILTERS: Weeks | Date Range | Teacher Type (Primary/H.Sec) │
├─────────────────────────────────────────────────────────────┤
│                    HOME / GENERAL DATA                        │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Total        │  │ Primary      │  │ Middle & High│       │
│  │ Teachers: X  │  │ Teachers: Y  │  │ Teachers: Z  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ [Home] [LP Engagement] [Trainings] [Observations] [Indicators]
└─────────────────────────────────────────────────────────────┘
```

### Page 1: General Data (Home)

**School Overview:**
| Metric | Count |
|--------|-------|
| School Name | Government Primary School, North |
| School Type | Primary / Middle & High (or Mixed) |
| Total Teachers | 75 |
| Primary Teachers | 50 |
| Middle & High Teachers | 25 |

---

### Page 2: LP Engagement

**Two Tabs:**

#### Tab A: Primary Teachers LP Engagement
```
Primary LP Engagement: [========> ] 78%

Teacher Name        │ LP Score │ Last Checked │ Status
────────────────────┼──────────┼──────────────┼─────────
Teacher 1 (Eng)     │   4.2    │  2 days ago  │ ✓ Good
Teacher 2 (Math)    │   3.8    │  5 days ago  │ ✓ Good
Teacher 3 (Science) │   3.2    │  1 week ago  │ ⚠ Fair
Teacher 4 (Urdu)    │   4.0    │  3 days ago  │ ✓ Good
Teacher 5 (Social)  │   3.5    │  4 days ago  │ ⚠ Fair
...                 │   ...    │      ...     │ ...
```

#### Tab B: Middle & High Teachers LP Engagement
```
Middle & High LP Engagement: [=======> ] 73%

Teacher Name        │ LP Score │ Last Checked │ Status
────────────────────┼──────────┼──────────────┼─────────
Teacher 1 (Eng)     │   3.9    │  3 days ago  │ ✓ Good
Teacher 2 (Math)    │   4.1    │  1 day ago   │ ✓ Good
Teacher 3 (Science) │   3.6    │  2 days ago  │ ⚠ Fair
...                 │   ...    │      ...     │ ...
```

**Filters:**
- Week (Date range)
- Teacher Type (Primary / Middle & High)
- Status Filter (Good / Fair / Needs Improvement)

---

### Page 3: Trainings Data

**All Teachers Training Status:**
```
Training Completion: [=========> ] 75%
```

**Table:**
| Teacher Name | Subject | Level 1 | Level 2 | Level 3 | Overall % |
|---|---|---|---|---|---|
| Teacher 1 | English | ✓ | ✓ | ✓ | 100% |
| Teacher 2 | Math | ✓ | ✓ | ○ | 67% |
| Teacher 3 | Science | ✓ | ○ | ○ | 33% |
| Teacher 4 | Urdu | ✓ | ✓ | ✓ | 100% |
| Teacher 5 | Social | ○ | ○ | ○ | 0% |

**Filters:**
- Week (Date range)
- Level (Multi-select)
- Subject (Multi-select)

---

### Page 4: Observations Data

**Overview:**
| Card | Metric |
|------|--------|
| Total Observations (School) | Count |
| Teachers Observed | Count |
| Observation Rate | % |

**Date-wise Observations:**
```
Week 1: [███░░░] 15 observations
Week 2: [████░░] 18 observations
Week 3: [█████░] 22 observations
Week 4: [██████] 25 observations
```

**By Teacher (Sortable):**
| Teacher Name | Subject | Observations | Avg Score | Last Observation |
|---|---|---|---|---|
| Teacher 1 | English | 8 | 4.1 | Yesterday |
| Teacher 2 | Math | 6 | 3.7 | 2 days ago |
| Teacher 3 | Science | 4 | 3.2 | 1 week ago |
| Teacher 4 | Urdu | 7 | 3.9 | 3 days ago |
| Teacher 5 | Social | 2 | 3.0 | 2 weeks ago |

**Filters:**
- Week (Date range)
- Teacher Type (Primary / Middle & High)

---

### Page 5: Indicators Aggregated Data

**School Overall Performance:**
```
School Overall Indicators (Not Individual Teachers)

Indicator           │ Score │ Target │ Status
────────────────────┼───────┼────────┼─────────
Teaching Quality    │  3.8  │  4.0   │ ⚠ Close
Student Engagement  │  3.6  │  3.8   │ ⚠ Close
Classroom Mgmt      │  3.9  │  4.0   │ ✓ Good
Resource Util.      │  4.1  │  4.0   │ ✓ Exceeds
```

**Radar Chart:**
```
        Teaching Quality
              ╱╲
             ╱  ╲
            ╱    ╲
    Classroom───Student
       Mgmt    Engagement
```

**Filters:**
- Week (Date range)

---

## 4. Viewer/Supervisor Page (Internal Visibility)

### Purpose
System-wide monitoring and supervision for internal stakeholders.

### Dashboard Structure

```
┌─────────────────────────────────────────────────────────────┐
│               VIEWER/SUPERVISOR DASHBOARD                    │
├─────────────────────────────────────────────────────────────┤
│  FILTERS: Weeks | Sectors | Schools | Regions | All Types   │
├─────────────────────────────────────────────────────────────┤
│  [System Health] [FDE Activity] [Sector Health] [Alerts]     │
└─────────────────────────────────────────────────────────────┘
```

### Page 1: System Health

**Real-time Metrics:**
| Metric | Status | Trend |
|--------|--------|-------|
| Total Active Schools | 485 / 500 | ↑ 3% |
| Teachers Engaged | 4,250 / 5,000 | ↑ 5% |
| LP Engagement Avg | 76% | → Stable |
| Training Completion Avg | 68% | ↑ 4% |
| Observations Rate | 42/100 teachers/week | ↓ 2% |

**Map View (Optional):**
```
Geographic distribution of schools by performance
North: 120 schools (Green/Yellow/Red indicators)
South: 95 schools
East: 110 schools
West: 160 schools
```

---

### Page 2: FDE Activity Log

**Activity Table:**
| FDE Name | Sector | Last Activity | Schools Visited | Obs. This Week | Status |
|---|---|---|---|---|---|
| FDE 1 | North | 2 hrs ago | 12 | 15 | Active |
| FDE 2 | South | 1 day ago | 8 | 10 | Active |
| FDE 3 | East | 3 days ago | 5 | 6 | Inactive |
| FDE 4 | West | 6 hrs ago | 14 | 18 | Active |

**Filters:**
- Sector (Multi-select)
- Status (Active / Inactive / All)

---

### Page 3: Sector Health (Comparative)

**Sector Performance Scorecard:**
| Sector | Schools | Teachers | LP Eng. | Trainings | Obs. Rate | Overall |
|--------|---------|----------|---------|-----------|-----------|---------|
| North | 120 | 1,200 | 78% | 65% | 45/100 | ✓ Good |
| South | 95 | 950 | 72% | 62% | 38/100 | ⚠ Fair |
| East | 110 | 1,100 | 80% | 70% | 48/100 | ✓ Excellent |
| West | 160 | 1,750 | 70% | 68% | 35/100 | ⚠ Fair |

**Comparative Charts:**
```
LP Engagement by Sector (Horizontal Bar)
North:  [████████░░] 78%
South:  [███████░░░] 72%
East:   [████████░░] 80%
West:   [███████░░░] 70%

Training Completion by Sector (Line Trend)
Week 1: North 55%, South 50%, East 60%, West 58%
Week 2: North 60%, South 55%, East 65%, West 62%
Week 3: North 65%, South 60%, East 68%, West 65%
Week 4: North 65%, South 62%, East 70%, West 68%
```

---

### Page 4: Alerts & Escalations

**Critical Issues:**
```
🔴 CRITICAL (Requires Immediate Action):
  - School X: 0 observations in 3 weeks
  - Sector Y: LP engagement dropped 15% this week
  - FDE Z: No activity for 10 days

⚠️  WARNING (Attention Needed):
  - 25 teachers not engaged in LP this week
  - 3 schools below 50% training completion
  - 5 FDEs have below-average observation rates

ℹ️  INFO (For Reference):
  - New school onboarded in North sector
  - 2 FDEs exceed weekly targets
```

**Alerts Table:**
| Alert Level | Category | Details | Date | Action |
|---|---|---|---|---|
| 🔴 Critical | Observations | School X inactive | 2 days ago | Review |
| ⚠️ Warning | LP Engagement | Sector Y decline | Today | Monitor |
| 🔴 Critical | FDE Activity | FDE Z offline | 10 days ago | Contact |

---

## Global Features (All Dashboards)

### Filter Bar (Sticky Top)
- **Week Selector:** Current, Last 4 weeks, Last 8 weeks, Custom date range
- **Sector/School Selector:** Multi-select dropdowns (context-aware per dashboard)
- **Teacher Type:** Primary, Middle & High, All
- **School Type:** Primary, Middle & High, Mixed (if applicable)
- **Status Filter:** Active, Inactive, All
- **Apply / Reset buttons**

### Export & Download Options
```
┌─────────────────────────────────────┐
│ EXPORT OPTIONS                      │
├─────────────────────────────────────┤
│ ☑ PDF Report (with charts)          │
│ ☑ Excel (data + formatting)         │
│ ☑ CSV (data only)                   │
│ ☑ Print-Friendly View               │
│ ☑ Schedule Email Report             │
└─────────────────────────────────────┘
```

### Common Elements
- **Breadcrumb Navigation** (Home > Section > Details)
- **Date Range Display** (filters applied at top)
- **Last Updated Timestamp** (bottom of each page)
- **Responsive Design** (Mobile, Tablet, Desktop views)

---

## Data Refresh & Performance

| Dashboard | Refresh Rate | Data Latency | Use Case |
|-----------|---|---|---|
| FDE | Every 4 hours | Up to 4 hrs | Strategic planning |
| AEO | Every 2 hours | Up to 2 hrs | Operational decisions |
| Principal | Real-time | < 30 min | Daily school management |
| Viewer/Supervisor | Real-time | < 30 min | Active monitoring |

---

## Next Steps

1. **Confirm Indicators:** Define specific indicators for "Indicators Aggregated Data" section
2. **Data Mapping:** Map database schema to dashboard metrics
3. **UI/UX Design:** Create wireframes for each dashboard layout
4. **API Development:** Build endpoints to serve dashboard data
5. **Testing & Rollout:** Pilot with FDE group first, then scale to others

---

## Notes

- All dashboards must be **mobile-responsive**
- All filters must **persist** on page reload
- All exports must include **metadata** (generated date, filters applied, data source)
- Performance: Load dashboards in **< 3 seconds**
- Accessibility: WCAG 2.1 AA compliance required

---

*Document prepared for: Taleemabad AI Agent | Generated: 2026-04-14*
