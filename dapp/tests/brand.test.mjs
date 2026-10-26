import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("official Psy assets are unchanged and used instead of a generic glyph", () => {
  const provenance = JSON.parse(
    read("design/2026-10-26/BRAND-PROVENANCE-v2.json"),
  );
  for (const asset of provenance.assets) {
    const bytes = readFileSync(
      new URL("../" + asset.destination, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.sha256,
    );
  }
  assert.match(read("src/markets/Shell.tsx"), /src="\/brand\/PsyLogo.svg"/);
  assert.doesNotMatch(read("src/markets/Shell.tsx"), /Ψ|psy-mark|PSY testnet/);
  assert.match(read("src/markets/Shell.tsx"), /Psy testnet/);
  assert.match(read("index.html"), /lang="en" class="psy-editorial"/);
  assert.match(read("index.html"), /\/brand\/PsyIconSq.svg/);
  assert.match(
    read("src/markets/psy-product-theme.css"),
    /--psy-blue: #1b55f5/,
  );
  assert.match(read("src/markets/workbench.css"), /Geist-Regular.ttf/);
});
test("active market UI, validation and metadata are English", () => {
  const marketFiles = readdirSync(
    new URL("../src/markets/", import.meta.url),
  ).filter((f) => /\.(tsx|mjs)$/.test(f));
  for (const file of [
    ...marketFiles.map((f) => "src/markets/" + f),
    "src/App.tsx",
    "src/hooks/usePsy.ts",
    "src/lib/psy.ts",
    "index.html",
  ]) {
    assert.doesNotMatch(
      read(file),
      /\p{Script=Han}/u,
      file + " must not contain Chinese UI copy",
    );
    assert.doesNotMatch(read(file), /zh-CN/);
  }
});
