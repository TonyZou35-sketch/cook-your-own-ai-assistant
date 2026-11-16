# Stage 6 · Taste again

A dish is only finished once it has been used for real. The first version of every dish in the
kitchen this skill comes from changed after a few days of use: a voice that sounded flat, a pause
that ended answers too early, a search that returned the wrong pages.

## When

When they come back to you after using a dish for a few days, or when `kitchen.json` shows a dish
served more than a week ago with no follow-up.

## What to look at first

Before asking, read what the kitchen recorded:

- `<kitchen>/data/<dish>/`: what was made, how often, what failed.
- `<kitchen>/data/server.log`: errors.
- `<kitchen>/data/memory.json`: suggestions they dropped often point to a dish that guesses wrong.
- Job history on the home page: anything slow or failing?

## What to ask

One at a time:

1. Did you use it? When? (If not: why not? Too slow, too many steps, forgot it existed?)
2. What was the last thing it got wrong or made you fix by hand?
3. Was anything slower than you expected?
4. Is there a step it does that you would rather do yourself, or one you do that it could take?

## Then

- Propose the smallest change that fixes the biggest annoyance. Measure before speeding anything
  up: time each step, then fix the slowest one.
- Re-run the kitchen-rules checklist if the change touches what the dish does on its own.
- Write what changed and why in `kitchen.json` → `log`.
- If a need turned out not to need AI after all, say so and simplify.
