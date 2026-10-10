# HydroInspect 2.2

This upgrade adds plant and date filters, inspection-period comparisons, a latest-visit overview, accessible mobile styling, section navigation, save feedback, and self-contained downloadable HTML reports alongside the existing PDF reports.

Accuracy fixes preserve valid zero readings, reject malformed numeric input, exclude decreasing CEB counters from energy charts, compare records only within the same plant, preserve text statuses in PDF reports, and wait for IndexedDB transactions to commit before confirming a save.

Energy charts represent intervals between inspections, not calendar-month totals. Missing values remain gaps. Counter decreases require review; configured panel meter replacements keep their existing adjustment behavior.

## Validation

Run `npm test` for calculation regression checks. Browser QA exercised desktop/mobile views, separate plant histories, PDF and HTML downloads, and verified no JavaScript errors or mobile horizontal overflow. Generated PDF pages were rendered and visually reviewed. QA used synthetic records in an isolated browser profile; existing inspection data was not modified.

## Preview and deployment

Run `python -m http.server 8765` in the repository and visit http://localhost:8765. Both the repository root and the clean HTML distribution contain the upgrade. GitHub Pages must serve these updated files for the public site to change. The service-worker cache version was increased so installed clients receive the new assets after deployment.
