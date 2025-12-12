import { serpLookup, enrichDomain } from "./outreachCore.js";
import { batchValidateEmails } from "./zeroBounceBatch.js";

export async function serpOutreach(keyword) {
  console.log(`🔍 SERP for keyword: ${keyword}`);
  const serp = await serpLookup(keyword);

  const results = Array.isArray(serp?.results) ? serp.results : [];
  const domains = [];

  for (const r of results) {
    try {
      const url = new URL(r.link || r.url);
      domains.push(url.hostname.replace(/^www\./, ""));
    } catch {}
  }

  const uniqueDomains = [...new Set(domains)].slice(0, 10);
  console.log(`Found ${uniqueDomains.length} unique domains`);

  const enriched = [];
  for (const d of uniqueDomains) {
    try {
      enriched.push(await enrichDomain(d));
    } catch (err) {
      console.log(`❌ enrichDomain failed for ${d}: ${err.message}`);
    }
  }

  // 🔥 Batch ZeroBounce ONCE per keyword
  const allEmails = enriched.flatMap(e => e.emails);
  const validationMap = await batchValidateEmails(allEmails);

  for (const e of enriched) {
    e.emails = e.emails.map(email => {
      const v = validationMap.get(email) || { status: "unknown" };
      let score = 0;
      if (v.status === "valid") score = 1;
      else if (v.status === "catch-all") score = 0.5;
      else score = 0.3;

      return { email, validation: v, score };
    });
  }

  return {
    keyword,
    domains: enriched,
  };
}
