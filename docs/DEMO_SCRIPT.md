# Demo script (about 6 minutes)

Start the app (`npm run build && npm start`), open http://localhost:4000. Every password is `Aicte@2026`.

1. **Sign in as Chairman** (click the card on the login screen).
   *Dashboard*: point at the red banner, **"Potential Overlapping Cases – Coordination Required"**, then the KPI tiles (pending, transferred, escalated, beyond timeline). Click **Beyond prescribed timeline** to land on the filtered case list.

2. **Turn on the live feed**: *Administration → Live demo feed → Start feed (every 8 seconds)*. Go back to the Dashboard. New complaints appear as toasts (some with overlap warnings), and the *Live activity* list and KPIs update without reloading.

3. **Overlaps & duplicates**: open the first group. Show the Bureau/Cell columns side by side and the reasons: same institution, RB + PGRC both acting, "x% similar in content (₹ amount, refund…)", "linked by name matching even though no AICTE ID was quoted". Click **Designate lead → Regulation Bureau** and add a note. The group becomes *Coordinated*, its alert clears, and every case gets a coordination entry.

4. **Register a messy complaint** (*Register complaint*):
   - Institution: type a misspelt or abbreviated version of a busy institution, e.g. `Malaygiri Clg of Engg & Research, Mangaluru` (any name from the Overlaps page works).
   - Subject/description: mention a fee refund with an amount, withheld certificates and unpaid salaries.
   - Show the institution resolved at about 100% with its reasons, the suggested category/priority/Bureau with the keywords, the RB + PGRC hint, the overlap warning, and possible duplicates citing the same rupee amount. Register.

5. **Case page**: overlap banner, case details, timeline bar, movement path, full action history with PDFs. Take an action, e.g. *Show-cause notice issued* with a remark and an attachment. Show *Possible duplicates → Link as duplicate*.

6. **Institution profile** (click the institution): the cross-Bureau timeline, where overlapping coloured bars in different lanes mean parallel handling; consolidated history; Bureau involvement.

7. **Permissions**: sign out and sign in as `pgrc.officer1`. Open an RB case. The officer can only add a coordination note, not act on it. Sign in as `ro.sro`: only Southern-region data is visible.

8. **Reports**: Bureau-wise, Ageing, Monthly/Quarterly performance. **Export CSV** opens in Excel; **Print / PDF** gives a clean printout.
