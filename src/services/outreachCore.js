import axios from "axios";

const KEY_RAPIDAPI = process.env.RAPIDAPI_KEY;
const KEY_URLSCAN  = process.env.API_URLSCAN_KEY;
const KEY_PROSPEO  = process.env.API_PROSPEO_KEY;
const KEY_HUNTER   = process.env.API_HUNTER_KEY;
const KEY_APOLLO   = process.env.API_APOLLO_KEY;

const URLSCAN_BASE = "https://urlscan.io/api/v1";
const PROSPEO_BASE = "https://api.prospeo.io";
const HUNTER_BASE  = "https://api.hunter.io";
const APOLLO_BASE  = "https://api.apollo.io";
const SERP_HOST    = "google-search116.p.rapidapi.com";

const HUNTER_DELAY_MS  = Number(process.env.HUNTER_DELAY_MS || "500");
const APOLLO_DELAY_MS  = Number(process.env.APOLLO_DELAY_MS || "800");
const URLSCAN_DELAY_MS = Number(process.env.URLSCAN_DELAY_MS || "2000");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= SERP ================= */
export async function serpLookup(keyword) {
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

/* ================= URLSCAN (NON-FATAL) ================= */
async function getUrlscan(domain) {
  try {
    const res = await axios.get(`${URLSCAN_BASE}/search/`, {
      params: { q: `domain:${domain}` },
      headers: { "API-Key": KEY_URLSCAN },
      timeout: 15000,
    });
    await wait(URLSCAN_DELAY_MS);
    return res.data;
  } catch (err) {
    if (err?.response?.status === 429) {
      console.log(`⚠️ Urlscan rate-limited for ${domain}`);
    } else {
      console.log(`⚠️ Urlscan failed for ${domain}`);
    }
    return null;
  }
}

/* ================= PROSPEO ================= */
async function getProspeo(domain) {
  const res = await axios.get(`${PROSPEO_BASE}/api/email-finder`, {
    params: { domain },
    headers: { "X-Api-Key": KEY_PROSPEO },
    timeout: 15000,
  });
  return res.data;
}

/* ================= HUNTER ================= */
async function getHunter(domain) {
  const res = await axios.get(`${HUNTER_BASE}/v2/domain-search`, {
    params: { domain, api_key: KEY_HUNTER },
    timeout: 15000,
  });
  await wait(HUNTER_DELAY_MS);
  return res.data;
}

function isHunterQuotaError(err) {
  const s = err?.response?.status;
  const msg = String(err?.response?.data?.message || "").toLowerCase();
  return s === 401 || s === 402 || msg.includes("quota") || msg.includes("exceeded");
}

/* ================= APOLLO ================= */
async function getApollo(domain) {
  const res = await axios.post(
    `${APOLLO_BASE}/v1/mixed_people/search`,
    {
      api_key: KEY_APOLLO,
      q_organization_domains: [domain],
      page: 1,
      per_page: 10,
    },
    { timeout: 20000 }
  );
  await wait(APOLLO_DELAY_MS);
  return res.data;
}

/* ================= HELPERS ================= */
function shouldUseProspeo(domainInfo) {
  if (!domainInfo || !domainInfo.results) return true;
  if (domainInfo.results.length >= 5) return true;

  const text = domainInfo.results
    .map(r => `${r.page?.title || ""} ${r.page?.url || ""}`.toLowerCase())
    .join(" ");

  return ["blog","article","news","post"].some(k => text.includes(k));
}

function isLowValue(email) {
  if (typeof email !== "string" || !email.includes("@")) return true;
  return [
    "info","support","help","contact","admin",
    "sales","billing","noreply","no-reply","webmaster"
  ].includes(email.split("@")[0].toLowerCase());
}

/* ================= ENRICH DOMAIN ================= */
export async function enrichDomain(domain) {
  try {
    const domainInfo = KEY_URLSCAN ? await getUrlscan(domain) : null;
    const emails = new Set();

    // Prospeo
    if (KEY_PROSPEO && shouldUseProspeo(domainInfo)) {
      try {
        const p = await getProspeo(domain);
        p?.emails?.forEach(e => {
          if (e?.email?.includes("@")) emails.add(e.email.toLowerCase());
        });
      } catch {}
    }

    // Hunter
    let hunterOk = true;
    if (KEY_HUNTER) {
      try {
        const h = await getHunter(domain);
        h?.data?.emails?.forEach(e => {
          const email = e.email || e.value;
          if (email?.includes("@")) emails.add(email.toLowerCase());
        });
      } catch (err) {
        if (isHunterQuotaError(err)) {
          console.log("⚠️ Hunter quota exhausted — switching to Apollo");
          hunterOk = false;
        }
      }
    }

    // Apollo fallback
    if ((!hunterOk || emails.size < 2) && KEY_APOLLO) {
      try {
        const a = await getApollo(domain);
        a?.people?.forEach(p => {
          if (p?.email?.includes("@")) emails.add(p.email.toLowerCase());
        });
      } catch {}
    }

    return {
      domain,
      emails: [...emails].filter(e => !isLowValue(e)),
      domainInfo,
    };
  } catch (err) {
    console.log(`❌ enrichDomain hard-failed for ${domain}: ${err.message}`);
    return { domain, emails: [], domainInfo: null };
  }
            }
