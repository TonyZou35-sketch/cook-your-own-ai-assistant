# Field notes

These come from one person living with a home-cooked assistant every day for a month (Oct–Nov
2026): an AMD Ryzen AI Max+ 395 laptop with 128 GB of shared memory on Windows 11, running models
up to 27B parameters in LM Studio, with seven dishes (video subtitles, a job-search helper,
interview review, a mock interviewer, memory, a "where was I" recap, and a cloned-voice narrator).
Each note says what happened and what to do about it. Machines differ; treat these as things to
check, not laws.

## Power and sleep

- **When the screen turned off, the graphics card got about 4× slower.** Windows "Modern Standby"
  throttles the machine even while a job runs, so jobs left running overnight took about four
  times as long. *Do:* while a job runs, the app asks the system to keep the display on (the kitchen
  app does this for every job through `jobs.start()`). Don't change power settings; the app's
  request ends when the job ends.
- **Windows Update restarts the computer right after "active hours" end,** sometimes three times in
  a row while installing. Long overnight jobs were cut off. *Do:* jobs should save progress as they
  go and continue when the app starts again. Tell the person they can move active hours in
  Settings → Windows Update → Advanced options.
- **System-level tricks get flagged.** A small PowerShell script that called the Windows API to
  stay awake was blocked by antivirus as malicious. *Do:* use the app's own, documented way
  (Electron's `powerSaveBlocker`), never scripts that look like malware.

## The graphics card

- **Two heavy jobs on the GPU at once crashed the whole machine** (a blue screen: the AMD driver
  timed out) when speech generation with PyTorch ran while a 27B language model was loaded.
  *Do:* run one heavy job at a time. The kitchen app's job queue runs jobs one after another.
  Before a GPU speech job, unload the language model (with the person's OK).
- **Speech on the processor can run beside the language model on the GPU.** ONNX speech models
  (sherpa-onnx) on the CPU never conflicted with the model on the GPU. That is why the voice dish
  uses them.

## Talking to the local model

- **"Thinking" made answers about 6× slower for the same quality** on everyday tasks (translation,
  sorting, short drafts). *Do:* turn thinking off for dishes that need a quick answer.
- **Ask for short line formats, not JSON,** when the model is slow. "One line per item:
  `title | reason`" is much less to generate than a JSON object and easy for code to check.
- **Long requests died at five minutes** and the error looked like "the model app is not running".
  Node's built-in fetch gives up on a response that doesn't start in time. *Do:* always stream the
  answer, retry once, and say "the model took too long" rather than "the model is off".
- **Batches can slip.** Translating many subtitle lines at once, the model sometimes shifted a
  whole batch, so answers no longer matched their lines. *Do:* ask the model to start each answer with the first few words of its source line,
  and check that in code.
- **When the answer is cut off at the length limit, keep what is complete.** Throwing it all away
  wasted the best pages: the ones with the most to say.
- **After a restart, the model app's server may be off** even if the model app opens. *Do:* when
  the app can't reach the model, say so plainly and tell them how to start the server (LM Studio:
  Developer → Start Server). The kitchen app's home page shows this.

## Speech and voice

- **The reference clip decides the voice.** A cloned voice came out about two semitones lower than
  the person, because the reference recording was low. *Do:* record the reference in a normal
  speaking voice, in a quiet room, 5–10 seconds.
- **Make speech sentence by sentence, then listen back.** Whole paragraphs at once ran sentences
  together and sometimes dropped the ending. *Do:* generate one sentence at a time, transcribe each
  result, and redo any sentence whose words don't match.
- **Silence between sentences sounded cut.** Generated speech has a faint room noise; pure digital
  silence between sentences made it obvious. *Do:* pad pauses with quiet noise taken from the clip.
- **A few minutes of recordings: fine-tuning was no better than cloning from one clip.** The person
  could not hear a difference. Start with zero-shot cloning; fine-tune only if it clearly fails.
- **The ZipVoice model in sherpa-onnx skips English words it has no pronunciation for,** silently.
  *Do:* give it a full English lexicon (the voice recipe ships one) and spell acronyms as letters.

## Reading the web

- **One search engine answered Chinese searches using only the first word** in a fresh browser
  profile: every search for "<company> <role> interview questions" returned the company homepage.
  *Do:* check that results contain the words searched for, and keep a second engine as a fallback.
- **Pages that ask to log in or prove you're human are skipped,** never worked around (kitchen rule 6).

## Building the app

- **A running app can't be replaced.** Installing a new build while the old one ran failed. *Do:*
  ask the person to quit it (tray icon → Quit) and check that the port is free before installing.
- **Keep the background work in its own process.** When a job hangs, the window must still respond.
  The kitchen app runs its server as a child process of the window for this reason.
- **Measure before optimizing.** The mock interviewer felt slow; timing each step showed where the
  seconds went (speech-to-text, the model's first words, the first sentence of speech). Fixing the
  slowest step cut the wait from about 5.3 to 4 seconds.
