# Kurt

Kurt's active drawing and animation source of truth is this repository.
Change artwork in `source/`, platform logic in `runtime/`, exports in
`tools/export.py`. Never fix generated copies in consumers.

Keep the approved casting A and neutral body proportions. Do not regenerate or
redesign Kurt as part of a code change. Preserve the hand-drawn cels, paw
contact, independent pupils, mirroring, timing and event markers.

Use direct implementation and focused validation. No subagents or separate
review workflow unless explicitly requested. Do not publish product builds or
deploy websites just because Kurt was updated. Preserve all existing licenses.

`npm test` checks exports and existing Web/Mutti behaviors plus safe sync.
After native changes, run the affected Hauser Kurt tests. A drawing change
also requires checking the changed animation visually against `references/`.

Consumers use a pinned, hash-checked snapshot in `kurt.lock.json`. Commit a
validated Kurt revision before syncing. The sync refuses local modifications;
bring those changes back into this repository, never bypass the guard.
