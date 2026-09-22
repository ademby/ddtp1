# Whole platform boundary with separated contexts

The product boundary is the whole drone-drive-test platform, not only the browser application. Frontend, backend orchestration, and drone integration remain explicit contexts so the NestJS deployment can serve the frontend without coupling browser workflows directly to drone behavior.

**Consequences:** The browser consumes backend contracts, the backend is authoritative for platform state, and drone communication remains an integration concern.
