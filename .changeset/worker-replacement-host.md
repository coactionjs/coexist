---
"@coexist/core": patch
---

A worker client now follows a replacement host. Each host instance names itself on its `ready` handshake and on every frame that carries the full state, so a client that mirrored a host that went away, such as a shared-tab host whose tab closed, re-syncs from the replacement's snapshot instead of judging that host's fresh version sequence stale and keeping the old state forever. Results the replaced host already sent settle instead of waiting for state it will never publish. Frames from the same host, and from hosts on releases before hosts were named, are judged by version as before. The replacement starts from its own state; nothing carries over from the host it replaced.
