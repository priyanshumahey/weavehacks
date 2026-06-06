---
tags: [project, vision]
aliases: [A Game of Agents]
---
# Vision & Thesis

## The pitch (2–3 sentences)
**A Game of Agents** is a canon-seeded generative-agent simulation of Westeros: each great lord is an LLM agent with episodic memory, political drives, and a Theory of Mind, set loose in a world of councils, ravens, and secret pacts. Seed a crisis (the king dies) and watch alliances form, oaths break, and wars start — emergently, not scripted. Every decision is traced, scored, and replayable in **W&B Weave**, turning the simulation into a **research instrument for emergent deception, alliance, and betrayal** in multi-agent LLMs.

## Why Westeros (and why it is more research-focused than the Office)
The [[DMI Overview|reference Office sim]] is a brilliant architecture aimed at low-stakes drama — *belonging and esteem* in a static room. Westeros keeps the exact same cognitive machinery but moves it to the regime where the interesting science lives:

| Axis | The Office (DMI) | Westeros (us) |
|---|---|---|
| Dominant needs | belonging, esteem | **power, legitimacy, survival** |
| Stakes | embarrassment | **death** ("you win or you die") |
| Information | everyone sees everything | **secrets, spies, raven latency** |
| Multi-agent shape | proximity chats | **councils + hidden pacts + war** |
| Phenomenon studied | gossip | **deception, alliance, betrayal** |

Deception and betrayal are *only* measurable when there is hidden information and real stakes. Westeros gives us both for free, which is why the same harness becomes a genuine [[Social Simulation & Deception Benchmarks|benchmark]] rather than a toy.

## The core thesis
> Canon is the seed, not the objective. We do not reenact the War of the Five Kings — we recreate the *conditions* that produced it (claims, oaths, grudges, asymmetric information) and ask whether intrigue and betrayal **re-emerge**, and under what parameters.

## What makes it win the hackathon
- **Harness sophistication** (heavily weighted): councils, async ravens, private A2A pacts, war state, information asymmetry — real structure, not turn-taking. [[Architecture]]
- **Utility / research framing:** a reusable sandbox + metrics (betrayal rate, ToM accuracy, honor cost). [[Research Questions]]
- **Creativity:** honor-vs-pragmatism as a measurable axis; **counterfactual history** replays. [[Perturbation Seeds]]
- **Sponsor depth:** Weave (research), Redis (memory/bus), CopilotKit/AG-UI (generative UI), OpenAI + W&B Inference (cognition), MCP + A2A (orchestration). [[Tech Stack & Sponsor Mapping]]
- **Weave as the story, not a checkbox:** [[Weave Research Instrumentation]].

## The one demo image
A living map of Westeros. Robert dies. Within minutes, two houses forge a secret pact in a private channel, a raven arrives late and a third house misreads the board, and a betrayal fires. Click the betrayer → see its drives, the memory it retrieved, its (wrong) model of the victim, and the Weave trace of the exact decision. See [[Demo & Pitch Strategy]].

Next: [[Research Questions]] · [[Theming - Westeros]] · [[MVP Plan & Roadmap]]
