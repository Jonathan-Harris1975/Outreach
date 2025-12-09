// src/services/batchService.js

import fs from "fs";
import path from "path";
import { serpOutreach } from "./serp-OutreachService.js";
import { extractGoodLeads } from "../utils/filters.js";
import { appendLeadRows } from "./sheetService.js";

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const RATE_DELAY = 1500;

function loadKeywordsFromFile(file = "keywords.txt") {
  const p = path.resolve(process.cwd(), file);
  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// persistent batch index
const INDEX_FILE = path.resolve(process.cwd(), "batch.index.json");

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE));
  } catch {
    return { index: 0 };
  }
}

function saveIndex(i) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify({ index: i }, null, 2));
}

export async function runSequentialSerpSearches(file = "keywords.txt") {
  const keywords = loadKeywordsFromFile(file);
  const { index } = loadIndex();

  const start = index;
  const end = Math.min(start + 50, keywords.length);
  const slice = keywords.slice(start, end);

  console.log(`📦 Processing batch ${start} → ${end} (${slice.length} items)`);

  let totalLeads = 0;

  for (let i = 0; i < slice.length; i++) {
    const kw = slice[i];
    console.log(`🔎 [${start + i + 1}] SERP scan: ${kw}`);

    try {
      const result = await serpOutreach(kw);
      const good = extractGoodLeads(result, kw);

      if (good.length) {
        const rows = good.map((r) => [
          r.timestamp,
          r.keyword,
          r.domain,
          r.da,
          r.serpPosition,
          r.email,
          r.emailScore,
          r.leadScore,
        ]);
        await appendLeadRows(rows);
        totalLeads += good.length;
        console.log(`✔ Saved ${good.length} leads`);
      } else {
        console.log("No good leads for this keyword.");
      }
    } catch (e) {
      console.log("❌ Error:", e.message);
    }

    await wait(RATE_DELAY);
  }

  // rotate index
  const newIndex = end >= keywords.length ? 0 : end;
  saveIndex(newIndex);

  console.log(`⏭ Next batch will start from index: ${newIndex}`);

  return {
    batchStart: start,
    batchEnd: end,
    processed: slice.length,
    nextIndex: newIndex,
    totalLeads,
  };
}
