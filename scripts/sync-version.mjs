import { readFile, writeFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const manifestPaths = [
  "../manifest.json",
  "../manifest.firefox.json",
  "../manifest.chrome.json"
];

for (const relativePath of manifestPaths) {
  const url = new URL(relativePath, import.meta.url);
  const source = await readFile(url, "utf8");
  const manifest = JSON.parse(source);
  if (manifest.version === packageJson.version) continue;

  const updated = source.replace(
    /^(\s*"version"\s*:\s*)"[^"]+"(\s*,)/m,
    `$1"${packageJson.version}"$2`
  );
  if (updated === source) throw new Error(`Could not update version in ${relativePath}`);
  await writeFile(url, updated);
}

console.log(`Synced extension manifests to version ${packageJson.version}.`);
