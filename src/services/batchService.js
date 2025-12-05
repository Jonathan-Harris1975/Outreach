import fs from "fs";
import path from "path";
import { serpOutreach } from "./serp-outreach.js";
import { extractGoodLeads } from "./filters.js";
import { appendLeadRows } from "./sheet.js";

function loadKeywordsFromFile(filePath = "keywords.txt") {
  const full = path.resolve(process.cwd(), filePath);
  const data = fs.readFileSync(full, "utf8");
  return data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

export async function runSequentialSerpSearches(keywords = []) {
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    console.log(`\n[${i + 1}/${keywords.length}] SERP scan: ${kw}`);

    try {
      const result = await serpOutreach(kw);
      const good = extractGoodLeads(result.data, kw);

      if (good.length) {
        const rows = good.map(r => [
          r.timestamp,
          r.keyword,
          r.domain,
          r.da,
          r.serpPosition,
          r.email,
          r.emailScore,
          r.leadScore
        ]);
        console.log(`Appending ${rows.length} leads to Google Sheets`);
        await appendLeadRows(rows);
      } else {
        console.log("No valid leads.");
      }
    } catch (err) {
      console.log("Error:", err.message);
    }
  }
}

if (process.argv[1].includes("serp-runner.js")) {
  const keywords = loadKeywordsFromFile("keywords.txt");
  runSequentialSerpSearches(keywords).then(() =>
    console.log("All done.")
  );
}