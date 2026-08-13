# Jcode model routing

T3 Code starts each Jcode thread with the exact provider and model selected in the model picker. Jcode sessions use an isolated daemon, so another Jcode client or thread cannot change that route through a shared daemon.

The model picker shows every model reported by the selected Jcode provider. In particular, Cursor is not limited to Grok models: Composer, Claude, GPT, Grok, and any other model returned by `jcode model list -p cursor` remain selectable with their exact Jcode slugs.

Reasoning and speed choices appear only when Jcode reports matching model variants. Selecting one switches to the exact reported sibling slug. If a provider does not expose a reasoning level, fast variant, or valid combination, T3 Code does not offer or synthesize it.

Jcode ACP reports the active model but not a separate resolved provider field. T3 Code verifies the exact reported model before sending a prompt; provider isolation is enforced by starting the thread daemon with the selected provider.
