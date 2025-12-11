// src/services/outreachCore.js

import axios from "axios";

const KEY_RAPIDAPI = process.env.RAPIDAPI_KEY;
const KEY_URLSCAN = process.env.API_URLSCAN_KEY;
const KEY_PROSPEO = process.env.API_PROSPEO_KEY;
const KEY_HUNTER = process.env.API_HUNTER_KEY;

const HOST = {
  serp: "google-search116.p.rapidapi.com",
  zeroBounce: "zerobounce1.p.rapidapi.com",
};

const URLSCAN_BASE =
  process.env.API_URLSCAN_BASE_URL || "https://urlscan.io/api/v1";
const PROSPEO_BASE =
  process.env.API_PROSPEO_BASE_URL || "https://api.prospeo.io";
const HUNTER_BASE =
  process.env.API_HUNTER_BASE_URL || "https://api.hunter.io";

const HUNTER_DELAY_MS = Number(process.env.HUNTER_DELAY_MS || "500");

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// ---------------------- RAPIDAPI WRAPPER ----------------------

async function rapidGetRapidApi(host, path, params = {}, retries = 5) {
  if (!KEY_RAPIDAPI) throw new Error("RAPIDAPI_KEY missing");

  const url = `https://${host}${path}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          "x-rapidapi-key": KEY_RAPIDAPI,
          "x-rapidapi-host": host,
        },
        timeout: 15000,
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        const delay = attempt * 2000;
        console.log(`429 from ${host} – retrying in ${delay}ms`);
        await wait(delay);
      } else if (attempt < retries) {
        const delay = attempt * 1200;
        console.log(
          `Error from ${host} (${status}) – retrying in ${delay}ms`
        );
        await wait(delay);
      } else {
        throw err;
      }
    }
  }
}

// ---------------------- URLSCAN ----------------------

async function getUrlscan(path, params = {}, retries = 3) {
  if (!KEY_URLSCAN) throw new Error("API_URLSCAN_KEY missing");

  const url = `${URLSCAN_BASE}${path}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: { "API-Key": KEY_URLSCAN },
        timeout: 15000,
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (attempt < retries) {
        const delay = attempt * 1500;
        console.log(`Urlscan error (${status}) – retrying in ${delay}ms`);
        await wait(delay);
      } else {
        throw err;
      }
    }
  }
}

// ---------------------- PROSPEO ----------------------

async function getProspeo(domain, retries = 3) {
  if (!KEY_PROSPEO) throw new Error("API_PROSPEO_KEY missing");

  const url = `${PROSPEO_BASE}/api/email-finder`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params: { domain },
        headers: {
          "X-Api-Key": KEY_PROSPEO,
        },
        timeout: 15000,
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (attempt < retries) {
        const delay = attempt * 1500;
        console.log(`Prospeo error (${status}) – retrying in ${delay}ms`);
        await wait(delay);
      } else {
        throw err;
      }
    }
  }
}

// ---------------------- HUNTER ----------------------

async function getHunter(domain, retries = 3) {
  if (!KEY_HUNTER) throw new Error("API_HUNTER_KEY missing");

  const url = `${HUNTER_BASE}/v2/domain-search`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params: {
          domain,
          api_key: KEY_HUNTER,
        },
        timeout: 15000,
      });
      // Hunter-specific delay to avoid 429s
      await wait(HUNTER_DELAY_MS);
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (attempt < retries) {
        const delay = attempt * 1500;
        console.log(`Hunter error (${status}) – retrying in ${delay}ms`);
        await wait(delay);
      } else {
        throw err;
      }
    }
  }
}

// ---------------------- HELPERS ----------------------

function mapProspeoEmails(data) {
  const emails = [];

  if (Array.isArray(data?.emails)) {
    data.emails.forEach((e) => {
      if (e && typeof e.email === "string") {
        emails.push({
          email: e.email,
          confidence:
            typeof e.confidence === "number" ? e.confidence : undefined,
          source: e.source,
          type: e.type,
          provider: "prospeo",
        });
      }
    });
  } else if (data && typeof data.email === "string") {
    emails.push({
      email: data.email,
      confidence:
        typeof data.confidence === "number" ? data.confidence : undefined,
      provider: "prospeo",
    });
  }

  return emails;
}

function mapHunterEmails(data) {
  const emails = [];
  const list = data?.data?.emails;

  if (!Array.isArray(list)) return emails;

  list.forEach((e) => {
    const email = e.email || e.value;
    if (!email) return;

    const confRaw =
      typeof e.confidence === "number" ? e.confidence : undefined;
    const confidence =
      typeof confRaw === "number" ? Math.max(0, Math.min(1, confRaw / 100)) : undefined;

    emails.push({
      email,
      confidence,
      type: e.type,
      firstName: e.first_name,
      lastName: e.last_name,
      position: e.position,
      provider: "hunter",
    });
  });

  return emails;
}

function mergeEmails(listA, listB) {
  const map = new Map();

  const addAll = (list) => {
    list.forEach((e) => {
      if (!e.email) return;
      const key = e.email.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...e });
      } else {
        const currentConf = existing.confidence ?? 0;
        const nextConf = e.confidence ?? 0;
        if (nextConf > currentConf) {
          map.set(key, { ...existing, ...e, confidence: nextConf });
        }
      }
    });
  };

  addAll(listA);
  addAll(listB);

  return Array.from(map.values());
}

function isLowValueGenericEmail(email) {
  if (!email || typeof email !== "string") return false;
  const local = email.split("@")[0].toLowerCase();

  const badPrefixes = [
    "info",
    "support",
    "help",
    "contact",
    "admin",
    "webmaster",
    "sales",
    "billing",
    "noreply",
    "no-reply",
  ];

  return badPrefixes.some((p) => local === p || local.startsWith(`${p}+`));
}

// Decide if Prospeo is worth trying based on Urlscan domain info
function shouldUseProspeo(domainInfo) {
  if (!domainInfo || !Array.isArray(domainInfo.results)) return false;

  const results = domainInfo.results;
  if (results.length >= 5) return true;

  let text = "";
  results.forEach((r) => {
    if (r.page) {
      if (r.page.title) text += " " + r.page.title.toLowerCase();
      if (r.page.url) text += " " + r.page.url.toLowerCase();
    }
  });

  const contentHints = ["blog", "article", "news", "magazine", "post"];
  return contentHints.some((k) => text.includes(k));
}

// ---------------------- PUBLIC FUNCTIONS ----------------------

export async function serpLookup(keyword) {
  return rapidGetRapidApi(HOST.serp, "/", { query: keyword }, 3);
}

export async function fetchDomainInfo(domain) {
  return getUrlscan("/search/", { q: `domain:${domain}` }, 3);
}

export async function findEmailsForDomain(domain, domainInfo = null) {
  const prospeoEmails = [];
  const hunterEmails = [];

  const canUseProspeo =
    !!KEY_PROSPEO && domainInfo && shouldUseProspeo(domainInfo);

  if (canUseProspeo) {
    try {
      const data = await getProspeo(domain);
      const mapped = mapProspeoEmails(data);
      if (mapped.length) {
        console.log(
          `Prospeo found ${mapped.length} emails for ${domain}`
        );
        prospeoEmails.push(...mapped);
      } else {
        console.log(`Prospeo returned no emails for ${domain}`);
      }
    } catch (err) {
      console.log(
        `Prospeo failed for ${domain}: ${err.message || "unknown error"}`
      );
    }
  }

  if (!KEY_HUNTER) {
    return prospeoEmails;
  }

  // Hunter as fallback (or main if Prospeo not used / failed)
  try {
    const data = await getHunter(domain);
    const mapped = mapHunterEmails(data);
    if (mapped.length) {
      console.log(`Hunter found ${mapped.length} emails for ${domain}`);
      hunterEmails.push(...mapped);
    } else {
      console.log(`Hunter returned no emails for ${domain}`);
    }
  } catch (err) {
    console.log(
      `Hunter failed for ${domain}: ${err.message || "unknown error"}`
    );
  }

  const merged = mergeEmails(prospeoEmails, hunterEmails);

  // Filter low-value generics (Option B)
  const filtered = merged.filter((e) => !isLowValueGenericEmail(e.email));

  return filtered;
}

export async function validateEmailAddress(email) {
  const path = process.env.RAPIDAPI_ZB_VALIDATE_PATH || "/v1/validate";

  const data = await rapidGetRapidApi(
    HOST.zeroBounce,
    path,
    { email },
    3
  );

  const status = (data?.status || "").toLowerCase();
  const isValid = status === "valid";
  let score = isValid ? 1 : status === "unknown" ? 0.5 : 0;

  return {
    valid: isValid,
    score,
    raw: data,
  };
}

export async function enrichDomain(domain) {
  console.log(`🔎 Enriching domain: ${domain}`);

  let domainInfo = null;
  try {
    domainInfo = await fetchDomainInfo(domain);
  } catch (err) {
    console.log(
      `Urlscan lookup failed for ${domain}: ${err.message || "unknown error"}`
    );
  }

  const found = await findEmailsForDomain(domain, domainInfo);
  const enrichedEmails = [];

  for (const e of found) {
    const v = await validateEmailAddress(e.email);

    enrichedEmails.push({
      email: e.email,
      valid: v.valid,
      score: v.score,
      confidence: e.confidence,
      provider: e.provider,
      type: e.type,
      validation: v.raw,
    });

    await wait(400);
  }

  let daApprox = 0;
  try {
    if (domainInfo && Array.isArray(domainInfo.results)) {
      const hits = domainInfo.results.length;
      daApprox = Math.min(100, hits * 2); // simple heuristic
    }
  } catch {
    daApprox = 0;
  }

  return {
    domain,
    da: daApprox,
    emails: enrichedEmails,
    domainInfo,
  };
}

export default {
  serpLookup,
  fetchDomainInfo,
  findEmailsForDomain,
  validateEmailAddress,
  enrichDomain,
};
