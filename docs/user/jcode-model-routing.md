# Jcode model routing

Tandem starts a Jcode thread on the model selected in the model picker. When it also knows the provider, that thread gets its own daemon, so another Jcode client cannot change the route through a shared daemon.

The model picker shows every model reported by the selected Jcode provider. In particular, Cursor is not limited to Grok models: Composer, Claude, GPT, Grok, and any other model returned by `jcode model list -p cursor` remain selectable with their exact Jcode slugs.

Reasoning and speed choices appear only when Jcode reports matching model variants. Selecting one switches to the exact reported sibling slug. If a provider does not expose a reasoning level, fast variant, or valid combination, Tandem does not offer or synthesize it.

Jcode ACP reports the active model but not a separate resolved provider field. Tandem verifies the exact reported model before sending a prompt. When it knows the provider — Claude or Codex from the model selection, or the Jcode provider setting for any other backend — it starts that thread's daemon with that provider. A thread with no provider fails to start instead of using a shared daemon.
