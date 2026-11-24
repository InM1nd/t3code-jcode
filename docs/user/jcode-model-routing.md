# Jcode model routing

Tandem starts a Jcode thread on the model selected in the model picker. When it also knows the provider, the thread runs on a Jcode daemon Tandem starts for that provider and model. Threads on the same model share one daemon, which keeps memory low; another Jcode client cannot change their route.

The model picker stays the provider's own list. **Jcode** next to it runs that same model through the harness. Claude, Codex, Cursor, Grok, OpenCode, and Antigravity each keep their icon; the Jcode mark shows the harness is on. Cursor is not limited to Grok models: Composer, Claude, GPT, Grok, and any other model returned by `jcode model list -p cursor` remain selectable with their exact slugs.

Reasoning and speed choices appear only when Jcode reports matching model variants. Selecting one switches to the exact reported sibling slug. If a provider does not expose a reasoning level, fast variant, or valid combination, Tandem does not offer or synthesize it.

Jcode ACP reports the active model but not a separate resolved provider field. Tandem verifies the exact reported model before sending a prompt. When it knows the provider — the harness toggle stored on the model, a slug it can recognize, or the Jcode provider setting — it runs that thread on Tandem's daemon for that provider and model. A thread with no provider fails to start instead of using a daemon Tandem did not start.
