# @qaping/rig

**Record a playtest. Replay it against the next build.**

A person plays your game once, on a real controller. The rig records the exact
inputs. From then on it can replay that session against every new build through a
virtual XInput gamepad — recording the screen, measuring frame times, watching for
crashes — and write a receipt of what happened.

The rig sends controller input to a packaged Windows game through a virtual Xbox
controller. It runs locally, with no Qaping account required.

[Source](https://github.com/alex-durango/qaping-rig) ·
[Recording guide](https://github.com/alex-durango/qaping-rig/blob/main/docs/recording.md) ·
[Report a problem](https://github.com/alex-durango/qaping-rig/issues)

**Release status:** this source tree is the 0.1.1 development snapshot; npm
currently serves 0.1.0. The new `--game-log` option is in the source snapshot.
To try the current source, clone this repo and use `node bin/rig.js` in place of
`npx @qaping/rig` below. The Windows prerequisites still apply.

```
npx @qaping/rig doctor
```

## What it is

- **`record`** — a human plays with a physical Xbox-compatible pad; the session
  becomes a `pingfusi-padscript/v1` file: sparse full-state keyframes on a
  drift-corrected tick.
- **`play`** — that file replays through a virtual pad (a kernel-level ViGEmBus
  device; the game sees a real Xbox 360 controller in `joy.cpl`) against a build
  you point at — a `.zip`, an unzipped directory, or a URL. While it plays, the rig
  records the screen with ffmpeg, samples frame times with PresentMon, notices if
  the game dies, sweeps up the Windows crash dump it left, and stops on its own
  time budget if the build hangs.
- **`overlay`** — burns the recorded input trace onto the capture, so you can watch
  the footage and the stick/button state together. The graphic is drawn from the
  run's own `inputs.jsonl`, not from a live widget: what you see is what was sent.
- **`report`** — turns a receipt into readable findings, each stamped with the
  timestamp to seek to in the recording: every 2–10 s gap with no frame presented
  (a load screen, or a hitch the player experiences as waiting), every frame that
  ran 4× the median and at least 50 ms (a stutter), the crash if there was one, and
  every warning the run raised. Alongside them: average fps, p95, p99, 1% low.
- Every run writes a **`pingfusi-rig-run/v1` receipt** — the build source (and a
  sha256 for zip builds), the
  script's sha256, every input event, the frame-time summary, the exit reason. A
  receipt identifies the run; keep the original build and input script to replay it.

Replay promises **input determinism**: the same bytes go to the pad at the same
offsets on every run. `inputs.jsonl` is a pure function of the script and comes out
byte-identical run after run — that is the property the whole thing rests on.

## Limits

- **It repeats recorded inputs.** It does not learn, explore new paths, or
  adapt to a moved enemy, a new menu, or a changed loading time.
- **Reports need interpretation.** The rig does not fail your build. A receipt
  marked `pass` describes the observed run, not complete game coverage. Replay
  does not promise *outcome* determinism — game RNG and load variance are real — so anything
  it flags, including a run that diverges from the last one, is a **warning for a
  person to adjudicate, never a verdict**.
- **It covers the recorded route.** New paths, confusing interactions, and
  whether the boss fight feels fair still need a person to investigate.
- **It needs your Windows machine.** See [Requirements](#requirements) and
  [Privacy](#privacy).

## Requirements

| | |
|---|---|
| **Windows 10 or 11**, x64 | the virtual pad is a Windows driver; there is no macOS or Linux path |
| **Node.js 20+** | |
| **ViGEmBus driver** | the virtual gamepad's kernel device — installed for you by `vgamepad` below |
| **Python 3 + `vgamepad`** | the pad feeder: `python -m pip install "vgamepad==0.*"` (accept the driver prompt the first time) |
| a physical Xbox-compatible controller | for `record` only |
| **ffmpeg** *(optional)* | screen capture and `overlay`. Without it, `play --no-capture` still runs and still measures |
| **PresentMon** *(optional)* | frame times. Without it you get a run and a recording, but no fps numbers |

Two things about the session, both learned the hard way:

- **Run the terminal elevated** for `play` — PresentMon's ETW session needs it.
- **Do not RDP into the machine mid-run.** RDP takes over the console session and
  breaks screen capture. Use a remote-desktop tool that leaves the physical session
  alone.

`doctor` checks all of it and tells you what is missing:

```
npx @qaping/rig doctor
```

There is also a one-shot provisioner, shipped with the package. Install it first
(`npm i @qaping/rig`, or `npm i -g @qaping/rig` for a `qaping-rig` on your PATH),
then run the script **elevated**, once: it installs Python, `vgamepad`, ffmpeg and
PresentMon, pins each download's sha256 on first run, and enables Windows crash
dumps.

```powershell
powershell -ExecutionPolicy Bypass -File .\node_modules\@qaping\rig\scripts\provision.ps1 -Trust
```

Already have the tools somewhere else? Point at them: `RIG_FFMPEG`,
`RIG_PRESENTMON`.

## Quick start

```bash
# 1. one human session, on the physical controller
npx @qaping/rig record --out first-pass.padscript.json
#    play; Ctrl+C stops the recording and writes the file

# 2. replay it against a build (elevated terminal)
#    UNPLUG the physical pad first — the virtual one wants the first slot
npx @qaping/rig play ./build-1042.zip --script first-pass.padscript.json --label 1042

# 3. watch the inputs on the footage
npx @qaping/rig overlay rig-runs/run-20260904-1132-a1b2c3

# 4. read what came back
npx @qaping/rig report rig-runs/run-20260904-1132-a1b2c3
```

Then, for every build after that, step 2 again. The script is a plain JSON file:
commit it next to the build it was recorded against and it stays replayable.

Games that write their own logs can use `--game-log "<path>"` for a script
with a log-based start or `wait_log` barriers. Configure the game to write that
file; the rig does not instrument the game. For Steam games, keep Steam running
and follow the [recording guide](https://github.com/alex-durango/qaping-rig/blob/main/docs/recording.md).

Useful flags on `play`: `--exe <relative-path>` when the zip holds more than one
executable, `--exe-args "…"`, `--max-minutes <n>` (default 35), `--no-capture` (no
ffmpeg — worth it on a thin GPU, where capture itself costs frames), `--no-telemetry`,
`--expect-sha256 <hex>` to refuse a build whose bytes are not the ones you meant (it
needs a `.zip` or a URL — an already-unzipped directory has no digest, and the run is
refused rather than quietly unchecked).

Replay starts a fixed delay after launch — 8 seconds, recorded into the script as
`start.wait_for.ms`. If your game takes longer to reach a playable state, edit that
one number in the JSON, or your first inputs land on a loading screen.

## Where files land

Everything is written under the directory you ran the command from:

```
rig-runs/<run-id>/
  receipt.json            the run's durable record (pingfusi-rig-run/v1)
  inputs.jsonl            every pad state sent — a pure function of the script
  inputs-timing.jsonl     when each one actually went out (wall clock)
  presentmon.csv          raw frame times, if PresentMon was there
  recording.mp4           the capture, if ffmpeg was there
  recording-overlay.mp4   written by `overlay`
  annotations.json        written by `report`
  <name>.dmp              the crash dump, if it crashed
```

`record` writes its padscript to `--out` (default: `session-<timestamp>.padscript.json`
in the current directory). Set `RIG_RUNS_DIR` to put runs somewhere else.

## Privacy

**Everything stays on your machine.** No account, no sign-in, no key: none of the
rig's commands authenticate against anything. Your build, your recording, your
frame times and your receipts are files on your disk, and nothing uploads them.

The rig makes exactly two kinds of network request, both of them ones you asked
for: downloading a build when you hand `play` a URL, and downloading the pinned
tools when you run `provision.ps1`.

## Get a human playtest

When you need someone to explore the parts your replay misses, Qaping connects
your coding agent to real playtesters. They play the build, report what they
found, and can check claimed fixes in later rounds. Your agent can turn checks
that can be reliably automated into code tests with your agreement.

**[Get your build playtested](https://qaping.dev/?utm_source=github&utm_medium=readme&utm_campaign=rig-launch#pricing)** —
see the paid plans and credit options before starting a round. The local rig
remains free and needs no account.

We are also developing an AI playtester that learns from human sessions and can
adapt when the game changes. That player is in development; this package is the
record-and-replay tool described above.

## Develop from source

```sh
git clone https://github.com/alex-durango/qaping-rig.git
cd qaping-rig
npm test
node bin/rig.js version
```

The portable tests use Node's built-in test runner and require no installed game
or controller. Recording, playback, and telemetry need the Windows requirements
above. See [Contributing](https://github.com/alex-durango/qaping-rig/blob/main/CONTRIBUTING.md).

MIT licensed.
