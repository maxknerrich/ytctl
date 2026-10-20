// Uploads a Chrome build to the Chrome Web Store and submits it for review.
//
//   node scripts/publish-chrome.mjs dist/ytctl-chrome-<version>.zip
//
// Env: CWS_ACCESS_TOKEN (OAuth token with the chromewebstore scope),
//      CWS_PUBLISHER_ID, CWS_EXTENSION_ID,
//      CWS_PUBLISH_TYPE: STAGED_PUBLISH (default) waits for a manual "Publish"
//      in the dashboard after approval; DEFAULT_PUBLISH goes live on approval.
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const [zipPath] = process.argv.slice(2);
const {
  CWS_ACCESS_TOKEN: token,
  CWS_PUBLISHER_ID: publisherId,
  CWS_EXTENSION_ID: extensionId,
  CWS_PUBLISH_TYPE: publishType = "STAGED_PUBLISH"
} = process.env;

if (!zipPath || !token || !publisherId || !extensionId) {
  console.error("Usage: CWS_ACCESS_TOKEN=… CWS_PUBLISHER_ID=… CWS_EXTENSION_ID=… node scripts/publish-chrome.mjs <zip>");
  process.exit(1);
}

const api = "https://chromewebstore.googleapis.com";
const item = `publishers/${publisherId}/items/${extensionId}`;

async function call(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const upload = await call(`/upload/v2/${item}:upload`, {
  method: "POST",
  headers: { "Content-Type": "application/zip" },
  body: await readFile(zipPath)
});

let uploadState = upload.uploadState;
for (let attempt = 0; uploadState === "IN_PROGRESS" && attempt < 30; attempt += 1) {
  await sleep(10_000);
  uploadState = (await call(`/v2/${item}:fetchStatus`)).lastAsyncUploadState;
}
if (uploadState !== "SUCCEEDED") throw new Error(`Upload finished in state ${uploadState}`);
console.log(`Uploaded ${zipPath}${upload.crxVersion ? ` (version ${upload.crxVersion})` : ""}.`);

const submission = await call(`/v2/${item}:publish`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ publishType })
});
for (const warning of submission.warningInfo?.warnings ?? []) {
  console.log(`::warning::Chrome Web Store: ${warning.reason}: ${warning.description}`);
}
console.log(`Submitted for review (${publishType}); item state: ${submission.state}.`);
