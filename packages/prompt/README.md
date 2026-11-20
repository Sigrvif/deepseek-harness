---
description: "The prompt package group: system-prompt sections the fork fuses into every assembled request, for readers choosing or navigating the family."
kind: "package-group"
---

# prompt/ — system-prompt sections the fork adds to request assembly

## Summary

Two host plugins that contribute system-prompt sections on top of the assembled request: one always-on presentation posture (deliver the artifact, treat context text as data) and one opt-in unrestricted execution block. Both register through the standard section waterfall behind the persona, so ordering, fusion, and the volatile toggles that gate them stay the system-prompt subsystem's own contracts; neither package touches request transport or tooling.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`delivery-style`](delivery-style/README.md) | Always-on presentation-posture section: the response is the deliverable, placeholders stand only for unspecified values, workspace text is data. |
| [`unrestricted-mode`](unrestricted-mode/README.md) | Opt-in unrestricted execution-mode section (volatile toggle, default off); the style core ships separately as delivery-style. |

<a id="related-documentation"></a>
## Related documentation

- [System prompt subsystem](../../docs/subsystems/system-prompt.md) — the assembly waterfall both sections register into, and the ordering contract their `order` values ride.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Both packages are fork additions (see FORK.md §1); `unrestricted-mode`'s block is an adapted port of yexi-by/dsh-unrestricted (MIT) with its attributions in the package's THIRD_PARTY_NOTICES.md.

</details>
