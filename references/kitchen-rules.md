# Kitchen rules

An assistant that only talks can be wrong without much harm. An assistant that acts can't. These
rules come from a month of living with one: every rule below is there because, without it,
something went wrong or nearly did.

## The rules

1. **Nothing is remembered until they confirm it.**
   Dishes call `memory.propose(text)`. That creates a *pending* item. Only *confirmed* items are
   given to the model as context. Things the person types into Memory themselves count as confirmed.
   *Why:* an assistant that quietly remembers wrong things gets worse the more it is used, and the
   person cannot see why.

2. **Steps that cannot be undone are always their click.**
   Sending, submitting, paying, publishing, deleting for good, accepting terms: the dish prepares
   everything (fills the form, writes the draft, renders the file) and stops before the final button.
   The button is in the app's window or on the real site, and the person presses it.
   *Why:* AI agents have deleted live databases and submitted forms nobody asked for. A wrong draft
   costs a minute; a wrong submission can't be taken back.

3. **When unsure, ask.**
   If a dish meets something it was not built for (an unexpected page, a low-confidence result, two
   possible answers), it stops and puts a question in "Waiting for you" (`home()` in the dish). It
   does not guess and carry on.

4. **Their data stays on their computer.**
   Dishes call the local model through `model.chat()`. The app's server listens only on
   `127.0.0.1`. A cloud service is allowed only when the person chose it by name, for one dish, and
   knows what is sent.

5. **Cook with sample data.**
   While you (the coding agent) build and test a dish, use made-up data. You are running in the
   cloud; their résumé, messages, and recordings should not pass through you. Their real data goes
   into the finished app, on their machine, by their hand.

6. **Other people's platforms: read, don't act.**
   On sites where they have an account (job boards, social media, email), a dish may read what the
   person can already see and prepare drafts. It does not act in bulk for them, does not get around
   logins, captchas, or rate limits, and follows the site's terms. If a site asks for a login or a
   check, the dish stops and asks the person.

7. **Say what the AI made.**
   Anything generated in the person's name is labelled. A cloned voice file says "AI-generated" in
   its name and metadata. A draft says it is a draft. Only the person's own voice may be cloned.

## Checklist before a dish is served

Go through this with the dish's code open. Fix what fails; tell the person about anything you chose
to leave.

- [ ] Does the dish write to memory only through `memory.propose()`?
- [ ] List every action the dish can take outside the app (send, submit, upload, delete, buy,
      post). Is each one stopped before the final step, with the person's click doing it?
- [ ] What does the dish do when something unexpected happens? Is there a path that ends in
      "Waiting for you" instead of a guess?
- [ ] Does any data leave the computer? If so, did the person choose that service by name?
- [ ] Was the dish built and tested with sample data only?
- [ ] If it touches someone else's site: read-only by default, no bulk actions, stops at logins
      and checks?
- [ ] Is everything the AI generated labelled as such?
- [ ] Heavy work (the model, speech) goes through `jobs.start()`, one job at a time?
- [ ] Did you run it, and did it work? Say what you saw.
