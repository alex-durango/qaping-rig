# Record and replay a session

The rig records controller state, not the meaning of an action. A replay needs
the same starting save, checkpoint, camera, and controller mapping. A changed
enemy position, loading delay, or menu can change the outcome.

1. Run `npx @qaping/rig doctor` on Windows and resolve the reported requirements.
2. Open your game normally and put it at the starting point you want to record.
3. Run `npx @qaping/rig record --out session.padscript.json`, return focus to the
   game, and play. Press Ctrl+C in the terminal when finished.
4. Restore the game's starting state and close the game. Disconnect the physical
   controller before replay so the virtual controller can take its slot.
5. Run `npx @qaping/rig play "<game-directory>" --exe "<game.exe>" --script session.padscript.json`.

The default replay delay is eight seconds after launch. Edit
`start.wait_for.ms` in the script to match your starting point. Time spent
switching from the recording terminal to the game is part of the trace.

For a game that produces an appropriate log, recording with `--start-log "ready"`
sets a log-based replay start. Supply `--game-log "<log-file>"` on replay and
configure the game to write that file. The rig does not add logging to the game.

## Steam games

Keep Steam running and signed in. Use the installed game directory and choose
the actual game executable with `--exe`. Some games relaunch through Steam or
another launcher; the rig currently follows the executable it launches, so check
that input and telemetry reach the game before relying on a recording. Check
Steam Input mapping and controller slots if the game ignores replayed input.

A comparison of two sessions on the same installed version is a same-build
comparison. A difference by itself does not establish a regression. Save the
version and starting conditions alongside your trace.

The example script in `examples/` is a short authored input sequence for learning
the format. It was not recorded from a person and is not a test of any particular
game.

## What the run tells you

`overlay` draws the input trace over the captured video; `report` summarizes
recorded telemetry, crashes, and warnings. A receipt's `pass` describes the
observed run and does not certify the game. Missing coverage and ambiguous
results still need a person to investigate.

[Get a human playtest through Qaping](https://qaping.dev/?utm_source=github&utm_medium=docs&utm_campaign=rig-launch).
