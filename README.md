# La Vista Scanner — development candidate

Branch: `dev-la-vista-2026-09-12`, based on `main` at `927cbf5cc8b39b6ff58862290f799b59eb364d31`. This source has not been deployed; do not change the current GitHub Pages publishing branch during review.

Use only with the corresponding [La Vista App development branch](https://github.com/bocvillamor/La-Vista-App/tree/dev-la-vista-2026-09-12). See its README for the required test workbook schema and complete acceptance steps.

## Architecture and changes

`index.html` is a top-level HTTPS camera page opened by the authenticated La Vista app. The app constructs a random launch ID and supplies its exact origin in the URL fragment. The scanner removes the fragment from visible history and sends messages only to that opener/origin. The app accepts messages only from its exact scanner window, configured origin and launch ID.

The scanner decodes QR text and captures JPEG ID photos. It has no session token or direct Apps Script/Sheets/Drive credentials. The app calls the authenticated server, supplying its own trusted direction/station context, and returns only a minimal result. Private Drive identifiers and full resident records stay in the app/backend.

Protocol: `LV_READY` → `LV_INIT`; `LV_SCAN` → `LV_RESPONSE`; Event `LV_PHOTO` → `LV_RESPONSE`; `LV_NEXT` → `LV_NEXT_READY`. `LV_CANCEL` invalidates the opened scanner. Transport errors offer retries with the same request/scan ID, never a fresh admission. The server resumes a pending Event photo after reopening the scanner.

A valid Event scan shows **Take Photo of Driver’s ID**. The guard must capture/review/save the photo before the next guest. Retrying a failed upload keeps the photo in memory and uses the same scan ID. Closing the page loses an unsaved local photo, but the pending admission can be reopened and a photo retaken. No photo is persisted to browser storage. QR image import is supported; ID photos require the camera.

The page also handles the server's 10-second repeat countdown, shows Super Admin LIVE status, clears photos/cameras when finished or cancelled, and refuses standalone use without the app opener. html5-qrcode remains pinned at 2.3.8.

## Files changed

- `index.html`: secure protocol, state/retry handling, Event ID camera UI, duplicate countdown.
- `tests/scanner.cjs` (new): offline protocol, camera/file-result, photo/retry and DOM-binding checks.
- `README.md`: coordination and test instructions.

## Offline test

Node.js 20 or later; no packages or credentials:

```sh
node tests/scanner.cjs
```

Expected: the scanner protocol/state check passes. The camera/library are stubbed, so real device acceptance is still required.

## Staging test prerequisites — requires approval

1. After staging approval, host this development `index.html` at a separate HTTPS test URL without replacing the live scanner or changing its Pages source. Do not deploy as part of the source review.
2. Configure only the TEST App workbook's `SCANNER_V3_URL` with that complete HTTPS URL (no query/fragment). Load the matching development App version with the appended journal/Event headers and a private test ID folder.
3. From Android Chrome and iPhone Safari, open the test app and launch each gate/direction. Confirm popup permissions, retained `window.opener`, camera permission, live QR scan, saved-image QR scan and return-to-app behavior.
4. Run the App README acceptance cases: one-use Individual at both gates; Logistics entry/exit and formatted plates; Bagobo Event photo per guest; 10-second repeat, upload retry/reopen recovery; logout/view-change cancellation; exact origin/source binding; no session token in messages or URLs.
5. A severed opener, wrong origin or blocked camera must fail visibly. Do not add a URL containing session tokens or a wildcard postMessage fallback. Report device failures before release.

No merge, PR or deployment is authorized by these instructions. Complete and review staging acceptance before a separately approved production rollout of both components.
