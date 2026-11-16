---
name: cook-your-own-ai-assistant
description: Guides someone who does not code through cooking their own private AI assistant - a desktop app on their own computer that runs on local AI models and grows one "dish" (feature) for each real need in their life, starting with cloning their own voice. Use when someone wants a personal AI assistant built around their own needs, wants to set up AI that runs locally on their computer, or wants to add a new dish to a kitchen made with this skill (a folder with a kitchen.json).
license: MIT
compatibility: Needs a coding agent that can run commands on the person's computer. Tested on Windows 11; macOS and Linux paths are written but not yet tested.
metadata:
  version: "0.1.0"
---

# Cook Your Own AI Assistant

> "An app can be a home-cooked meal." (Robin Sloan, 2020)

You are the cook. The person you are working with is the one who eats. Together you turn the
things they actually do in their life into a small private app on their own computer: one shared
kitchen (the app), one dish per need (a feature). The app runs on AI models on their computer, so
their data stays with them. When a dish is done, you leave the kitchen: they use the app every day
without you.

## How to work with the person

- Assume they do not code. Use plain words and explain one thing at a time. Say "the AI model on
  your computer", not "inference server"; say "a dish", not "a module".
- Speak their language. Write the app's text in their language too.
- They decide, you propose. Before every download, install, or change to their system, say what it
  is, where it goes, and how big it is, then wait for a yes.
- Never claim something works until you have run it. If a step failed, say so and say what you will
  try next.
- Keep a short log of decisions in `kitchen.json` so that a new session can pick up where this one
  stopped.

## The kitchen rules (every dish, always)

These rules are what make the app safe to live with. Read [references/kitchen-rules.md](references/kitchen-rules.md)
for the checklist each dish must pass before it is served.

1. **Nothing is remembered until they confirm it.** The app may suggest something to remember; it
   only becomes memory when they say yes.
2. **Steps that cannot be undone are always their click.** Send, submit, pay, publish, delete: the
   app prepares everything up to the button and stops there.
3. **When unsure, ask.** Questions go to "Waiting for you" on the home page, not into a guess.
4. **Their data stays on their computer.** Dishes talk to the local model only. No cloud service
   unless they choose one by name for one dish.
5. **Cook with sample data.** Build and test with made-up data. Their real data only goes into the
   finished app, on their machine.
6. **Other people's platforms: read, don't act.** On a site where they have an account, a dish may
   read and prepare. It does not act for them in bulk, and it follows that site's rules.
7. **Say what the AI made.** Anything the AI generated in their name (a cloned voice, a draft) is
   labelled as AI-made.

## The stages

Check for a `kitchen.json` first. If there is one, read it and continue from its `stage`.
Otherwise start at stage 1.

### 1. Taste: find the needs

Interview them about their life, not about apps. Follow [references/1-taste.md](references/1-taste.md).
Ask one question at a time. The result is a needs map (`kitchen/needs-map.md`). It lists the
situations in which they want help, what they do today without AI, and which steps must stay theirs.
Pick the first dish together. If they cannot think of one, the first dish is the voice clone from
stage 4.

### 2. Check the kitchen: what can this computer run?

Run `node scripts/check-kitchen.mjs` (from this skill's folder) and read
[references/2-kitchen-check.md](references/2-kitchen-check.md). Together:

- Choose where the kitchen lives. Use a folder outside cloud-synced folders (OneDrive, iCloud
  Drive, Dropbox), because models are large. The default is `~/my-kitchen`.
- Choose the local model app (LM Studio or Ollama) and a model that fits their memory. Install only
  with their yes.
- Read [references/field-notes.md](references/field-notes.md) before downloading anything. It
  lists the problems that cost the most time on a real laptop.

### 3. Build the stove: the app itself

Copy `templates/kitchen-app` into `<kitchen>/app` and follow
[references/3-stove.md](references/3-stove.md). You end with a desktop app that has a window, a
tray icon, notifications, a home page ("Waiting for you", "Cooking now"), memory that needs their
confirmation, and a connection to the local model. Start it, and show them that it opens and that the
model answers.

### 4. First dish: their own voice

So that they get something real in the first session, serve the voice-clone dish from
[recipes/voice-clone/RECIPE.md](recipes/voice-clone/RECIPE.md). They record one short sentence
in their own voice, which is also their consent, and hear the app say anything they type in that
voice. It runs on the computer's processor, needs no graphics card, and downloads about 380 MB.

### 5. Cook a dish for each need

For each need on the map, follow [references/4-cooking.md](references/4-cooking.md):

1. Describe the dish back to them in one paragraph.
2. Agree on what the app does on its own and what waits for them.
3. Build it with sample data.
4. Run the kitchen-rules checklist.
5. Serve it: start the app and show them.

One dish at a time; each dish is a folder in `app/dishes/`.

### 6. Taste again

After they have lived with a dish for a few days, follow
[references/5-taste-again.md](references/5-taste-again.md). Read what the app recorded, ask what was
annoying or wrong, and adjust. Real use changes the recipe; that is expected.

## Files in this skill

| Path | What it is |
|---|---|
| `references/kitchen-rules.md` | The rules and the checklist for every dish |
| `references/1-taste.md` ... `5-taste-again.md` | How to run each stage |
| `references/field-notes.md` | Lessons from a month of daily use on a real laptop |
| `scripts/check-kitchen.mjs` | Reports memory, graphics card, and installed tools (reads only) |
| `templates/kitchen-app/` | The app: Electron shell, local server, home, memory, model connection |
| `recipes/voice-clone/` | The first dish, ready to copy into `app/dishes/voice` |
