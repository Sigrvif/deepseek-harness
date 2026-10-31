# @deepseek-ai/dsh-superpowers-bootstrap

fork(superpowers): automatic bootstrap — once per session, the bundled
`using-superpowers` skill is injected as a native `skill-invocation`
context message on the first prompt that shows no visible invocation.
Re-asserts once if compaction drops it from the visible surface; Context
Editor exclusions are respected. The volatile `autoUsingSuperpowers`
toggle (default on) is surfaced on the General settings page.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- Providers that embed no request clock and run without a configured `quotaResetTimezone` are unrelated here; see the skill packages. This plugin only decides whether the bootstrap fires.
- The bootstrap stays silent when the skill is missing, unreadable, or not user-invocable.
