import axios from "axios";
import { batchValidateEmails } from "./zeroBounceBatch.js";

/* ===========================
   ENV
=========================== */
const KEY_RAPIDAPI = process.env.RAPIDAPI_KEY;
const KEY_URLSCAN  = process.env.API_URLSCAN_KEY;
const KEY_PROSPEO  = process.env.API_PROSPEO_KEY;
const KEY_HUNTER   = process.env.API_HUNTER_KEY;

const URLSCAN_BASE = "https://urlscan.io/api/v1";
const PROSPEO_BASE = "https://api.prospeo.io";
const HUNTER_BASE  = "https://api.hunter.io";

const SERP_HOST = "google-search116.p.rapidapi.com";
const HUNTER_DELAY_MS = Number(process.env.HUNTER_DELAY_MS || "500");

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/* ===========================
   SERP LOOKUP  ✅ (FIXED)
=========================== */
export async function serpLookup(keyword) {
  if (!KEY_RAPIDAPI) {
    throw new Error("RAPIDAPI_KEY missing");
  }

  const res = await axios.get(`https://${SERP_HOST}/`, {
    params: { query: keyword },
    headers: {
      "x-rapidapi-key": KEY_RAPIDAPI,
      "x-rapidapi-host": SERP_HOST,
    },
    timeout: 15000,
  });

  return res.data;
}

/* ===========================
   URLSCAN
=========================== */
async function getUrlscan(domain) {
  const res = await axios.get(`${URLSCAN_BASE}/search/`, {
    params: { q: `domain:${domain}` },
    headers: { "API-Key": KEY_URLSCAN },
    timeout: 15000,
  });
  return res.data;
}

/* ===========================
   PROSPEO
=========================== */
async function getProspeo(domain) {
  const res = await axios.get(`${PROSPEO_BASE}/api/email-finder`, {
    params: { domain },
    headers: { "X-Api-Key": KEY_PROSPEO },
    timeout: 15000,
  });
  return res.data;
}

/* ===========================
   HUNTER
=========================== */
async function getHunter(domain) {
  const res = await axios.get(`${HUNTER_BASE}/v2/domain-search`, {
    params: { domain, api_key: KEY_HUNTER },
    timeout: 15000,
  });

  await wait(HUNTER_DELAY_MS);
  return res.data;
}

/* ===========================
   HEURISTICS
=========================== */
function shouldUseProspeo(domainInfo) {
  if (!domainInfo?.results) return false;
  if (domainInfo.results.length >= 5) return true;

  const text = domainInfo.results
    .map(r => `${r.page?.title || ""} ${r.page?.url || ""}`.toLowerCase())
    .join(" ");

  return ["blog", "article", "news", "post"].some(k => text.includes(k));
}

function isLowValueGeneric(email) {
  const bad = [
    "info","support","help","contact","admin",
    "sales","billing","noreply","no-reply","webmaster"
  ];
  const local = email.split("@")[0].toLowerCase();
  return bad.includes(local);
}

/* ===========================
   ENRICH DOMAIN  ✅
=========================== */
export async function enrichDomain(domain) {
  const domainInfo = await getUrlscan(domain);

  let collected = [];

  // Prospeo (selective)
  if (KEY_PROSPEO && shouldUseProspeo(domainInfo)) {
    try {
      const p = await getProspeo(domain);
      if (Array.isArray(p?.emails)) {
        collected.push(...p.emails.map(e => e.email));
      }
    } catch {}
  }

  // Hunter (always fallback)
  if (KEY_HUNTER) {
    try {
      const h = await getHunter(domain);
      if (Array.isArray(h?.data?.emails)) {
        collected.push(...h.data.emails.map(e => e.email));
      }
    } catch {}
  }

  // Deduplicate + filter
  collected = [...new Set(collected)].filter(e => !isLowValueGeneric(e));

  // ZeroBounce native batch validation
  const validationMap = await batchValidateEmails(collected);

  const emails = collected.map(email => {
    const v = validationMap.get(email) || { status: "unknown" };

    let score = 0;
    if (v.status === "valid") score = 1;
    else if (v.status === "catch-all") score = 0.5;
    else if (v.status === "unknown") score = 0.3;

    return {
      email,
      validation: v,
      score,
    };
  });

  return {
    domain,
    emails,
    domainInfo,
  };
}
