# Worked examples

| Example          | Topology              | Kinds        | Techniques                                                                        |
| ---------------- | --------------------- | ------------ | --------------------------------------------------------------------------------- |
| `hello-tool/`    | Single-node           | tool         | Smallest possible — one tool writes a greeting. Walk through this first.          |
| `review-branch/` | Fan-out + conditional | tool + agent | Three dimensions → reviewers (fan-out) → verifier per finding → conditional score |

Each example is a complete, runnable directory. Copy to a new path, modify `name:` in `experience.yaml`, then `oe run <path>`.
