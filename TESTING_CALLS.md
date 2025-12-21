Cross-role & device test checklist for Calling feature

Purpose
- Verify audio/video/call/screen-share behavior across user roles and devices.

Environments
- Desktop Chrome (latest)
- Desktop Firefox (latest)
- Mobile Safari (iOS)
- Mobile Chrome (Android)
- Two users: `caller` and `receiver` (different accounts)

Preparation
- Ensure both users are logged in with distinct `currentUser.id`.
- Open DevTools Console on both browsers.
- Look for debug log prefixes: `[SIGNAL]`, `[WEBRTC]`, `[CALLS]`.

Tests

1) Basic 1:1 Audio Call
- Steps:
  - Caller: Start audio call (click phone icon).
  - Receiver: Observe DevTools for `[SIGNAL] OFFER` and WebRTC logs.
  - Receiver: Accept call.
- Expected:
  - Receiver console shows `[SIGNAL] received` for OFFER and then `[WEBRTC] acceptIncomingCall` logs.
  - Audio flows both ways (microphone prompts accepted).

2) Basic 1:1 Video Call
- Steps:
  - Caller: Start video call.
  - Receiver: Observe offer, accept with camera permission.
- Expected:
  - Video appears on both sides; `[WEBRTC] ontrack` fires.

3) Accepting with Audio-only (No Camera)
- Steps:
  - On receiver device without camera (or deny camera), accept call.
- Expected:
  - Call connects with audio only; no errors when camera not available.

4) Screen Sharing (Desktop)
- Steps:
  - Caller: Start video call, then toggle screen share.
  - Receiver: See screen stream (or new offer/renegotiation logs).
- Expected:
  - `[WEBRTC]` logs show replaceTrack or negotiation; receiver sees screen video.

5) Screen Sharing (Mobile)
- Steps:
  - Try to start screen share on mobile.
- Expected:
  - App shows alert: "Screen sharing is not supported on mobile devices in this app." and does not attempt getDisplayMedia.

6) Multiple Roles
- Roles: `ADMIN`, `MEMBER`.
- Steps:
  - Test calls initiated by ADMIN -> MEMBER and MEMBER -> ADMIN.
- Expected:
  - Calls should work both ways (unless you want role restrictions). If you need role limits, let me implement them.

7) Network Loss / ICE Candidate Exchange
- Steps:
  - During call, observe `[WEBRTC] onicecandidate` logs and verify candidates are exchanged.
- Expected:
  - Both sides report candidates; connection state moves to `connected` or `completed`.

8) Missed Call Notifications
- Steps:
  - Caller starts call; receiver does not accept and caller hangs up.
- Expected:
  - Missed-call message appears in chat; notification inserted into `notifications` table.

What to collect in failures
- Copy DevTools Console lines that include `[SIGNAL]` and `[WEBRTC]` from both caller and receiver.
- Note device, browser, user role, time.

If you want, I can:
- Add role-based call permission enforcement (e.g., only `ADMIN` can call certain users).
- Implement in-app UI indicators for pending signals or queued messages.
- Provide SQL migration to switch `calls` table to multi-recipient arrays.

Next step: Run these tests and paste the console logs for any failing case; I will analyze and patch further.