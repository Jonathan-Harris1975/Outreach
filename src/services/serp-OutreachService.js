// src/services/serp-OutreachService.js

import { serpLookup, enrichDomain } from "./outreachCore.js";

const BAD_DOMAINS = [
  "youtube.com",
  "amazon.com",
  "facebook.com",
  "instagram.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
];

// ------------------------ DOMAIN EXTRACTION ------------------------

function findResultArray(serp) {
  if (!serp) return [];

  if (Array.isArray(serp)) return serp;

  if (Array.isArray(serp.organic_results)) return serp.organic_results;
  if (Array.isArray(serp.results)) return serp.results;

  for (const val of Object.values(serp)) {
    if (Array.isArray(val)) return val;
  }

  return [];
}

export function extractDomainPositions(serp) {
  const candidates = findResultArray(serp);
  const map = new Map();

  candidates.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;

    const urls = [];

    const scan = (val) => {
      if (typeof val === "string" && /^https?:\/\//i.test(val)) {
        urls.push(val);
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        Object.values(val).forEach(scan);
      }
    };

    scan(item);

    const urlStr = urls[0];
    if (!urlStr) return;

    try {
      const u = new URL(urlStr);
      const host = u.hostname.replace(/^www\./, "");
      if (BAD_DOMAINS.includes(host)) return;

      const pos = idx + 1;
      const existing = map.get(host);
      if (!existing || pos < existing) {
        map.set(host, pos);
      }
    } catch {
      // ignore bad URLs
    }
  });

  return Array.from(map.entries()).map(([domain, serpPosition]) => ({
    domain,
    serpPosition,
  }));
}

// ------------------------ LEAD SCORING -----------------------------

/*
  High-depth scoring model:

  - DA component:   0–50
  - SERP component: 0–30 (positions 1–20)
  - Email component:0–20 (best validated email score 0–1)
*/

export function computeLeadScore({ da, serpPosition, bestEmailScore }) {
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // DA → 0–50
  const daScore = (clamp(da ?? 0, 0, 100) / 100) * 50;

  // SERP position 1–20 → 0–30
  let serpScore = 0;
  if (serpPosition >= 1 && serpPosition <= 20) {
    const factor = clamp(21 - serpPosition, 0, 20); // 20 for pos 1, down to 1
    serpScore = (factor / 20) * 30;
  }

  // Email score (0–1) → 0–20
  const emailScore = clamp(bestEmailScore || 0, 0, 1) * 20;

  const total = Math.round((daScore + serpScore + emailScore) * 10) / 10;

  return {
    total,
    breakdown: {
      daScore: Math.round(daScore * 10) / 10,
      serpScore: Math.round(serpScore * 10) / 10,
      emailScore: Math.round(emailScore * 10) / 10,
    },
  };
}

// ------------------------ MAIN OUTREACH ----------------------------

export async function serpOutreach(keyword) {
  console.log(`🔍 SERP for keyword: ${keyword}`);

  const serp = await serpLookup(keyword);

  if (serp && typeof serp === "object") {
    try {
      console.log("SERP top-level keys:", Object.keys(serp));
    } catch {}
  } else if (Array.isArray(serp)) {
    console.log("SERP is an array with length:", serp.length);
  }

  const domainEntries = extractDomainPositions(serp);

  console.log(`Found ${domainEntries.length} unique domains for keyword: ${keyword}`);

  const leads = [];

  for (const entry of domainEntries) {
    const { domain, serpPosition } = entry;

    let enriched;
    try {
      enriched = await enrichDomain(domain);
    } catch (err) {
      console.log(`❌ enrichDomain failed for ${domain}: ${err.message}`);
      continue;
    }

    const emails = Array.isArray(enriched.emails) ? enriched.emails : [];

    const bestEmailScore =
      emails.length > 0
        ? Math.max(...emails.map((e) => (typeof e.score === "number" ? e.score : 0)))
        : 0;

    const score = computeLeadScore({
      da: enriched.da ?? 0,
      serpPosition,
      bestEmailScore,
    });

    leads.push({
      domain,
      serpPosition,
      da: enriched.da ?? 0,
      emails,
      score: score.total,
      scoreBreakdown: score.breakdown,
    });

    // be kind to RapidAPI
    await new Promise((res) => setTimeout(res, 500));
  }

  // best leads first
  leads.sort((a, b) => b.score - a.score);

  return {
    keyword,
    totalDomains: domainEntries.length,
    leads,
  };
}
