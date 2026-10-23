# Requirements map — SIH26264

How each item in the problem statement is met, and where to see it in the app.

## Objectives

| Objective | Implementation | See it |
|---|---|---|
| View all institution-related complaints in one place | Single case register across all Bureaus/Cells and Regional Offices | Cases |
| Identify the Bureau/Cell currently handling each case | `bureau_code` ("Presently with") separate from `origin_bureau` ("Received by"); movement path on each case | Cases (With column), case page |
| Track complete status and movement | Chronological action log with status and Bureau transitions | Case page → Workflow & action history |
| Identify RB/PGRC overlap or multiple Bureaus on one institution | Overlap engine over resolved institutions; RB + PGRC rated critical | Overlaps; dashboard banner; case banner |
| Avoid duplication, ensure coordination | Duplicate detection; coordination notes across Bureaus; lead-Bureau designation; case linking | Overlaps → Designate lead; case page → Possible duplicates / Linked cases |
| Monitor pending, disposed, under-process, transferred, escalated | Five statuses with KPI tiles, each linked to a filtered list | Dashboard |
| Institution-, region-, Bureau- and status-wise reports | 10 reports with filters, CSV export, print | Reports |
| Alerts for pending cases and approaching timelines | Alert engine (every minute plus on every change) | Alerts; header bell |

## Key features

### 1. Centralised institution profile
- AICTE Permanent ID, name, former/alternate names, type, ownership, address, district, state, PIN, region and Regional Office, year established, approved intake, approval status, head, contacts.
- Consolidated history: every complaint, Bureau/Cell involvement, category mix, recent actions across Bureaus, and a **cross-Bureau timeline** (one lane per Bureau/Cell).
- Risk score for ranking: volume + pendency + overdue + serious categories + recency.

### 2. Complaint/case tracking
Case ID (`AICTE/<Bureau>/<Year>/<Seq>`), date of receipt, source and external reference (CPGRAMS/Ministry), category, priority, current status, current Bureau/Cell, assigned officer, last action and its date, next action and its due date, expected disposal date (from the category's prescribed timeline), disposal date, type and remarks.

### 3. Cross-Bureau/Cell overlap detection
- Automatic: on every registration, transfer and institution confirmation, and in the periodic sweep.
- Works without an AICTE ID, using fuzzy, acronym, alias and location matching.
- Alert text: *"Potential Overlapping Cases – Coordination Required"*, with plain-language reasons and severity.
- Linking/mapping: manual links (related/overlap/duplicate), plus automatic links when an overlap is marked coordinated.

### 4. Real-time dashboard
Total received, pending (with "yet to be acted upon"), under process, transferred (with "awaiting acceptance"), escalated, disposed (disposal rate, on-time %), beyond prescribed timeline (plus due within 7 days), overlapping institutions; 12-month trend; status split; Bureau/Cell workload (chart + table); region-wise pending; institution-wise status; ageing; overlap watch; live activity feed. Pushed live via Server-Sent Events.

### 5. Workflow and action history
Each entry records action, officer and designation, Bureau, timestamp, status change, remarks, next action and due date, and attached documents (PDF, images, Word, Excel). Transfers show *from → to* Bureau; escalations and Competent Authority directions are highlighted.

Supported actions: forward to institution, reminder, reply received, show-cause notice, personal hearing, expert visit/inspection, coordination note, note, transfer, accept transfer, escalate, direction (Competent Authority / Head), dispose (typed outcome), reopen.

### 6. Search and filters
Institution name, AICTE Permanent ID, Case ID, Bureau/Cell, region, category, status, date range (presets + custom), plus priority, source, timeline state, overlap-only, assigned-to-me, institution-not-identified. Filters live in the URL, so views can be bookmarked and shared. The header search box does fuzzy institution search (misspellings work).

### 7. Alerts and notifications
| Alert | Trigger | Severity |
|---|---|---|
| Overlapping cases | Institution has active cases in ≥ 2 Bureaus/Cells, not yet coordinated | critical / serious |
| Possible duplicate | Same institution, similar text (TF-IDF) or same complainant, different Bureaus | warning |
| Timeline approaching | ≤ 7 days to expected disposal | warning |
| Timeline crossed | Past expected disposal | serious |
| Escalation recommended | 30+ days overdue and not escalated | critical |
| Escalated | Case escalated to Competent Authority | critical |
| Pending reminder | No action for 15 days; or transfer not accepted in 3 days | warning |
| Transferred in | Case transferred to your Bureau/Cell | info |
| Institution to identify | Complaint's institution not confidently matched | info |

Alerts are scoped to the user's Bureau/Cell or region, have read/unread state per user, and resolve automatically when the condition clears.

### 8. Reports and analytics
Bureau/Cell-wise · Region-wise · Status-wise · Category-wise · Institution-wise complaint history · Pending ageing (0–15/16–30/31–60/61–90/90+ days) · Disposal rate and outcomes · Overlapping/duplicate cases · Monthly/quarterly performance (opening and closing pendency, clearance rate, within-timeline %, average disposal days) · Officer workload. All are filterable by Bureau, region and date, exportable to CSV and printable.

## Innovation expected
Data matching + rule-based logic + statistical text analytics (see README → *The innovation*). The example in the problem statement (*Institution A → PGRC under process; Institution A → RB action initiated*) is detected and shown with the exact wording **"Potential Overlapping Cases – Coordination Required"**, on the dashboard, on each affected case, in the alert list and at intake.

## Target users
Role-based access for RB, PGRC and other Bureaus/Cells (Head and Officer), Regional Offices (region-scoped), and senior management / Competent Authority (all data, directions, audit trail).
