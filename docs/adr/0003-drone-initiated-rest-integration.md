# Drone-initiated REST integration

Drones initiate communication through authenticated REST polling/claim, status, and upload operations. The backend validates and incorporates those reports, rather than requiring server-initiated drone connections.

**Consequences:** Operations must tolerate retries, disconnections, idempotency, and explicit claim/cancellation acknowledgements.
