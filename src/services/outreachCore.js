import axios from "axios";

const KEY_RAPIDAPI = process.env.RAPIDAPI_KEY;
const KEY_URLSCAN = process.env.API_URLSCAN_KEY;
const KEY_PROSPEO = process.env.API_PROSPEO_KEY;

// Hosts / base URLs
const HOST = {
  serp: "google-search116.p.rapidapi.com",
  zeroBounce: "zerobounce1.p.rapidapi.com",
};

const URLSCAN_BASE = process.env.API_URLSCAN_BASE_URL || "https://urlscan.io/api/v1";
const PROSPEO_BASE = process.env.API_PROSPEO_BASE_URL || "https://api.prospeo.io";

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function rapidGetRapidApi(host, path, params = {}, retries = 5) {
  if (!KEY_RAPIDAPI) {
    throw new Error("RAPIDAPI_KEY env var is not set");
  }

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
        continue;
      }
      if (attempt < retries) {
        const delay = attempt * 1200;
        console.log(`Error from ${host} (${status}) – retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }
      throw err;
    }
  }
}

async function getUrlscan(path, params = {}, retries = 3) {
  if (!KEY_URLSCAN) {
    throw new Error("API_URLSCAN_KEY env var is not set");
  }
  const url = `${URLSCAN_BASE}${path}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          "API-Key": KEY_URLSCAN,
        },
        timeout: 15000,
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (attempt < retries) {
        const delay = attempt * 1500;
        console.log(`Urlscan error (${status}) – retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }
      throw err;
    }
  }
}

async function getProspeo(path, params = {}, retries = 3) {
  if (!KEY_PROSPEO) {
    throw new Error("API_PROSPEO_KEY env var is not set");
  }
  const url = `${PROSPEO_BASE}${path}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${KEY_PROSPEO}`,
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
        continue;
      }
      throw err;
    }
  }
}

/* -----------------------------------------------------------
 * 1) SERP LOOKUP (google-search116 via RapidAPI)
 ----------------------------------------------------------- */

export async function serpLookup(keyword) {
  return rapidGetRapidApi(HOST.serp, "/", { query: keyword }, 3);
}

/* -----------------------------------------------------------
 * 2) Domain intelligence via Urlscan.io (/search)
 *    Uses q=domain:example.com
 ----------------------------------------------------------- */

export async function fetchDomainInfo(domain) {
  const data = await getUrlscan("/search/", { q: `domain:${domain}` }, 3);

  // We keep this generic; callers can log & inspect the raw structure if needed.
  return data;
}

/* -----------------------------------------------------------
 * 3) Email discovery via Prospeo.io (domain-search)
 *    Endpoint is configurable, default /v1/domain-search
 ----------------------------------------------------------- */

export async function findEmailsForDomain(domain) {
  const path = process.env.API_PROSPEO_DOMAIN_PATH || "/v1/domain-search";

  const data = await getProspeo(path, { domain }, 3);

  // We keep the mapping conservative: try to project into a simple list
  // If the structure is different, you can adjust this mapping.
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
        });
      }
    });
  } else if (data && typeof data.email === "string") {
    emails.push({
      email: data.email,
      confidence:
        typeof data.confidence === "number" ? data.confidence : undefined,
    });
  }

  return emails;
}

/* -----------------------------------------------------------
 * 4) Email validation via ZeroBounce (RapidAPI)
 *    Endpoint path is configurable: RAPIDAPI_ZB_VALIDATE_PATH
 *    (for example: "/v1/validate" or "/v2/validate")
 ----------------------------------------------------------- */

export async function validateEmailAddress(email) {
  const path =
    process.env.RAPIDAPI_ZB_VALIDATE_PATH || "/v1/validate";

  const data = await rapidGetRapidApi(HOST.zeroBounce, path, { email }, 3);

  const activity = (data?.activity || data?.status || "").toLowerCase();
  const isValid =
    data?.is_valid === true ||
    data?.result === "valid" ||
    data?.status === "valid";

  let score = 0;
  if (activity === "active" || data?.result === "valid") score = 1.0;
  else if (activity === "undetermined" || activity === "inactive") score = 0.5;
  else score = 0;

  return {
    valid: !!isValid,
    score,
    raw: data,
  };
}

/* -----------------------------------------------------------
 * 5) Full enrichment pipeline
 ----------------------------------------------------------- */

export async function enrichDomain(domain) {
  console.log(`🔎 Enriching domain: ${domain}`);

  // Fetch domain info (not yet used in scoring, but available for future logic)
  let domainInfo = null;
  try {
    domainInfo = await fetchDomainInfo(domain);
  } catch (err) {
    console.log(`Urlscan lookup failed for ${domain}: ${err.message}`);
  }

  const found = await findEmailsForDomain(domain);
  const enrichedEmails = [];

  for (const e of found) {
    const v = await validateEmailAddress(e.email);

    enrichedEmails.push({
      email: e.email,
      valid: v.valid,
      score: v.score,
      confidence: e.confidence,
      validation: v.raw,
    });

    await wait(400);
  }

  // Domain authority-style signals are not provided directly by Urlscan.
  // For now we treat DA as derived from presence/age (future: plug in DA API).
  let daApprox = 0;
  try {
    if (domainInfo && Array.isArray(domainInfo.results)) {
      const hits = domainInfo.results.length;
      daApprox = Math.min(100, hits * 2); // cheap heuristic, adjustable
    }
  } catch {
    daApprox = 0;
  }

  return {
    domain,
    da: daApprox,
    pa: undefined,
    spam: undefined,
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
