# Intake Questionnaire

Use this with the `question` tool before writing a Tier 2 or Tier 3 brief.

## Rules

- Ask every independent question in one round.
- Run at most two rounds. The second round resolves contradictions and derived
  choices only.
- Offer concrete options and tradeoffs; do not assume.
- Record every answer in the brief decision log.
- Open questions must be empty before the user confirms the brief.
- Subagents may draft questions, but the lead relays them; subagents cannot talk
  to the user directly.

## Decision order

1. **Scope** — full replacement, additional mode, or visual-only change?
2. **View and physics** — side-view/top-down, gravity/zero-g, existing controls
   or new controls?
3. **World** — finite/endless, bounded/infinite, ground/ceiling, camera bounds?
4. **Course and hazards** — static/moving, tunnel/open field, walls/gates,
   difficulty ramp?
5. **Failure** — instant crash, health/damage, bounce, respawn, checkpoints?
6. **Goal** — finish gate, endless distance, survival, score, time trial?
7. **Controls** — Q/W, rotation, analog/digital, responsiveness target?
8. **Camera** — fixed, follow, look-ahead, zoom?
9. **Ship** — existing hull, new hull, size, mass, engines?
10. **HUD** — hull, speed, progress, score, time, seed, thruster state?
11. **Seed** — new each run, same course, selector, URL?
12. **Branding** — keep Moonlander or rename?

## Contradiction checks

- Full replacement vs keep the old mode.
- Static walls vs moving/deforming walls.
- Tunnel/corridor vs open arena.
- No extra hazards vs gates/obstacles.
- Health/damage vs instant crash.
- Endless course vs finish gate.
- Free 2D movement vs auto-scroll.
- Infinite field vs bounded arena.
- No fuel vs fuel-like boost meter.

## Handoff

After the answers are complete:

1. Write the brief from `docs/changes/TEMPLATE.md`.
2. Complete the decision log.
3. Fill the test matrix from `docs/templates/test-matrix.md`.
4. Run the contract freeze from `docs/templates/contract-freeze.md`.
5. Read the brief back and ask for explicit confirmation.
