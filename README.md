

### Gemini screenshot analysis
The screenshot analyzer uses Gemini 3.6 Flash with `thinkingLevel: "minimal"`. Each screenshot is sent separately. The request timeout is 120 seconds and transient Gemini HTTP errors are retried once. This is intentional because multimodal requests can take longer than ordinary text requests.

## Recent defender-planner updates

- Additional Possible Defenders now contains every available alliance-roster champion, not only the curated medium tier. Automatic selection still uses only the curated Priority/Medium pool.
- Added search/filtering to Additional Possible Defenders.
- Additional defenders remain officer-clickable for manual assignment.
- Assigned defenders can be removed from the plan; removed champions remain available below for manual reassignment.
- Automatic defender allocation now considers every owner of each champion. It maximizes filled defender slots first, then prioritizes Priority defenders and higher PI, allowing lower-PI copies when needed to fill otherwise-unused member capacity.
- Added the current alliance-used defender set to the curated defender pool.
- Fixed the Admin hydration error caused by an interactive champion card containing a nested remove button. Champion cards now use an accessible clickable `<div>` root, allowing embedded controls without invalid nested `<button>` markup.
- Added a persisted Current Defender Diversity snapshot for each Battlegroup.
- Added Suggested / Current tabs on the Battlegroups page.
- Added an officer-only “Replace current with suggested” action that overwrites the current snapshot with the exact suggested defender plan for that Battlegroup.
- Added “Print / Save as PDF” on the Current tab. It opens the browser print dialog with a clean A4-friendly defender list, so officers can choose “Save as PDF”.
- Older databases with no current snapshot are automatically seeded once from the existing suggested plan.
