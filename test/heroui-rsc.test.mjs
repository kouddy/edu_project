import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// HeroUI collection items (TableColumn, SelectItem, …) must be *created* in
// Client Components. A Server Component's JSX crosses the RSC boundary as
// client references, which the React Aria collection builder cannot read —
// the page crashes with "Unknown element <[object Object]> in collection."
// See SheetsTable.tsx / PageBreadcrumbs.tsx for the extraction pattern.
const ITEM_ELEMENTS = [
  "TableColumn",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
  "SelectItem",
  "BreadcrumbItem",
  "AccordionItem",
  "Tab",
  "ListboxItem",
  "MenuItem",
  "DropdownItem",
];

function tsxFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function isClientComponent(source) {
  const head = source.split("\n").slice(0, 5).join("\n");
  return head.includes('"use client"') || head.includes("'use client'");
}

describe("HeroUI RSC boundary", () => {
  it("server components do not render HeroUI collection items directly", () => {
    const appDir = join(import.meta.dirname, "..", "src", "app");
    const violations = [];
    for (const file of tsxFiles(appDir)) {
      const source = readFileSync(file, "utf8");
      if (isClientComponent(source)) continue;
      source.split("\n").forEach((line, i) => {
        for (const el of ITEM_ELEMENTS) {
          if (new RegExp(`<${el}[\\s>]`).test(line)) {
            violations.push(`${file}:${i + 1} renders <${el}> in a Server Component`);
          }
        }
      });
    }
    assert.deepEqual(violations, []);
  });
});
