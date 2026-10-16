# 0001 · Prototype renderer: WebGLRenderer first

**Status:** accepted for M0/M1 · revisit at the M0 decision gate in [06](../06-technical-architecture.md)

**Context.** The plan prefers three.js `WebGPURenderer` + TSL with a WebGL2 fallback, gated on a performance comparison. The first playable needed to run reliably everywhere, including headless test browsers.

**Decision.** The prototype uses the classic `WebGLRenderer` with built-in materials and two small GLSL shaders (sky dome, particles). Scene code is renderer-agnostic, so switching later only touches renderer setup and those two shaders.

**Consequences.** The WebGPU comparison is still open. Run it before writing many custom shaders; after that, shader rewrites get expensive.
