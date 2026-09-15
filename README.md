# La Vista Scanner — foreground transport development candidate

Use `dev-la-vista-2026-09-12` together with the matching La Vista App branch. Nothing in this change is deployed. Keep live Pages settings, main and the frozen App checkpoint unchanged.

## Root cause and design

The prior scanner initialized with LV_READY, then sent every LV_SCAN/LV_PHOTO through window.opener to the background Apps Script iframe. The app silently rejected absent launch state or mismatched source/origin/launch ID, and could not relay a message if that context was frozen/discarded. Initial handshake success did not guarantee later delivery. The staging observations establish a pre-backend transport failure; the exact Chrome discard event or rejected check was not observed remotely.

There is now **no window.opener, postMessage or cross-origin fetch in the scanner**. While the app is foreground, it creates a server-side scanner session and displays Continue to scanner. The camera receives an opaque 20-minute capability in its URL fragment, plus the specific Apps Script /exec endpoint and non-secret labels. QR scans and ID photos submit normal foreground HTML forms directly to Apps Script doPost. The scanner tab navigates to the server-rendered result; the old app tab may be closed entirely.

The server stores and enforces user/station/direction, current request ID, QR association, photo scan ID, expiry and next-request progression. The scanner never receives the full guard/resident session token or Drive identifiers. Every request revalidates the original account/session and current station. New handoffs replace old ones for that user. Logout invalidates authorization.

The URL fragment is removed after initialization. Only the short-lived capability, request ID, routing/display metadata and pending QR are retained in tab-scoped sessionStorage for discard/reload recovery. ID photos remain in memory only. Do not share scanner URLs or sessionStorage contents: the scoped handoff is a temporary bearer capability.

## Guard flow

1. In La Vista, tap Entry/Exit Scanner, then Continue to scanner.
2. Tap Start camera. QR scanning is camera-only. After decode the scanner submits the stable server-issued request ID by POST and navigates to the foreground result.
3. For Event admission, tap Take Photo of Driver’s ID on the result page, capture/review a synthetic ID in the camera tab, and save. The server associates it with its pending scan; callers cannot choose another scan ID.
4. After a completed admission, tap Next guest / QR. Its server-issued successor request is accepted only after the repeat interval. The Event pass remains reusable and every guest needs its own photo.
5. If navigation/network fails, use browser Back/reload and Retry same request, or Check current request. Never manually start a new admission while the outcome is unknown. If a photo page is discarded, retake the photo for the same pending admission.
6. Result links/forms open new foreground tabs to respect bound Apps Script HtmlService sandbox restrictions. Older tabs can be closed; they are not relays. A stale page cannot submit a different QR or advance an admission.

## Staging preparation after deployment approval

- Host this exact development scanner at its separate HTTPS staging URL.
- Load the matching App code including `ScannerTransport.js` and the new `WebApp.js` doPost handler into the separate staging project.
- In the test workbook set `SCANNER_V3_URL` to this scanner URL and **`SCANNER_APP_URL`** to that test project's versioned `https://script.google.com/macros/s/TEST_DEPLOYMENT_ID/exec` URL. Neither URL accepts query parameters or fragments in CONFIG. Never point either value at production.
- Use the existing staging admission schemas and private Event photo folder. The transport adds no worksheet columns or trigger. It uses short-lived server Script Properties automatically on launch.
- Close old staging app/scanner tabs. Reopen the updated app before testing.

## Tests

```sh
node tests/scanner.cjs
```

The offline test deliberately makes access to window.opener throw. It checks camera QR submission by foreground POST, stable timeout/reload retries, photo POST/recovery, no photo persistence, endpoint/expiry validation and DOM bindings. Camera APIs and form navigation are simulated; real phone acceptance is still required.

In the App repository also run `node tests/scanner-transport.cjs`, `node tests/admissions.cjs`, `node tests/client.cjs` and `node tests/staging-fixes.cjs`.

On Android Chrome, close or discard the original La Vista tab after opening the camera. Scan a fresh Individual QR; expect a foreground result, one gate-journal row and a **doPost** execution (scannerProcessQr is called internally). Repeat with lost network before sending and after server commit; retry must retain the same ID and create no second admission. Exercise Event photo interruption/retake, reusable Event guests, Logistics ENTRY/EXIT, expiration/revocation, stale tabs, and iPhone Safari navigation. Inspect scanner URL/storage/POST fields to ensure no full app session token or photo is persisted. Device tests have not been run as part of this source-only commit.
