# Security Policy

## Supported versions

Coexist is pre-1.0. Only the latest published `0.x` release line receives security fixes; there are no long-term support branches yet. Upgrade to the newest release before reporting an issue.

## Reporting a vulnerability

Report suspected vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/coactionjs/coexist/security/advisories/new). Do not open a public issue, pull request, or discussion for an unfixed vulnerability.

Include what you have: affected package and version, a reproduction or proof of concept, the impact you believe it has, and any suggested mitigation.

You should get an acknowledgement within 5 working days and an assessment within 10. Fixed issues are published as a GitHub Security Advisory with credit to the reporter unless anonymity is requested.

## Threat model

Knowing what the packages do and do not defend against saves time on both sides.

### In scope

- Prototype pollution or arbitrary property writes through module state, store updates, or worker state patches.
- Escaping the remote-call allowlist: invoking a host method that is neither a declared action nor listed in `createWorkerApp({ expose })`.
- Bypassing `createPostMessageWorkerTransport`'s `targetOrigin`, `allowedOrigins`, or `expectedSource` filters.
- Malformed protocol messages that crash an endpoint, corrupt its state mirror, or settle an unrelated pending call.
- Unbounded resource growth an endpoint cannot cap — beyond the documented `limits` on `createWorkerApp` / `createWorkerClient`.
- Data crossing a transport that should not: for example a host stack trace reaching a client without `includeErrorStack`.
- Supply-chain integrity of the published packages: tarball contents, `exports` maps, and release provenance.

### Out of scope

- **BroadcastChannel `authToken` treated as authentication.** Any code that can join a same-origin `BroadcastChannel` observes its traffic. The token is a routing capability for trusted same-origin coordination, not a cryptographic boundary. Put the protocol on an authenticated transport when peers are not mutually trusted.
- **Bare and custom transports connected to untrusted peers.** `WorkerTransport` does not authenticate. Schema validation and the action allowlist limit capabilities, but the channel itself must be trusted or authenticated by the code that creates it.
- **Concurrent-write conflict resolution.** Several peers writing the same state are not merged. The client detects that its mirror fell behind and re-syncs a snapshot; it does not reconcile competing writes.
- **Anything a module chooses to expose.** A declared action is remotely callable by design; the application decides what belongs in that surface.
- **Denial of service against a peer you already control**, such as a host deliberately publishing enormous state to its own client.

## Hardening checklist

- Give `createPostMessageWorkerTransport` an explicit `targetOrigin`, `allowedOrigins`, and `expectedSource` for any window or iframe endpoint. Omit them only for a dedicated `Worker` / `MessagePort` you already hold as a trusted capability.
- Keep `includeErrorStack` off — its default — for any transport that leaves the process, or replace the payload with `serializeError`.
- Set `limits` to match your workload instead of relying on the defaults when a peer is only semi-trusted.
- Expose plain methods through `expose` one at a time; never mirror an entire module.
- Observe `onInvalidMessage` and `onDeliveryError` in production. They are how a misbehaving peer becomes visible.
