import axios from "axios";

const KEY_RAPIDAPI = process.env.RAPIDAPI_KEY;
const KEY_URLSCAN = process.env.API_URLSCAN_KEY;
const KEY_PROSPEO = process.env.API_PROSPEO_KEY;

// Hosts
const HOST = {
  serp: "google-search116.p.rapidapi.com",
  zeroBounce: "zerobounce1.p.rapidapi.com",
};

const URLSCAN_BASE = "https://urlscan.io/api/v1";
const PROSPEO_BASE = "https://api.prospeo.io";

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
        await wait(attempt * 2000);
      } else if (attempt < retries) {
        await wait(attempt * 1200);
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
      if (attempt < retries) {
        await wait(attempt * 1500);
      } else {
        throw err;
      }
    }
  }
}

// ---------------------- PROSPEO (FIXED) ----------------------

async function getProspeo(params = {}, retries = 3) {
  if (!KEY_PROSPEO) throw new Error("API_PROSPEO_KEY missing");

  const url = `${PROSPEO_BASE}/api/email-finder`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          "X-Api-Key": KEY_PROSPEO,   // FIXED AUTH HEADER
        },
        timeout: 15000,
      });
      return res.data;

    } catch (err) {
      if (attempt < retries) {
        await wait(attempt * 1500);
      } else {
        throw err;
      }
    }
  }
}

// ---------------------- PUBLIC FUNCTIONS ----------------------

export async function serpLookup(keyword) {
  return rapidGetRapidApi(HOST.serp, "/", { query: keyword }, 3);
}

export async function fetchDomainInfo(domain) {
  return getUrlscan("/search/", { q: `domain:${domain}` }, 3);
}

export async function findEmailsForDomain(domain) {
  const data = await getProspeo({ domain }, 3);

  const emails = [];

  if (Array.isArray(data?.emails)) {
    data.emails.forEach((e) => {
      if (e.email) {
        emails.push({
          email: e.email,
          confidence: e.confidence ?? 0,
          source: e.source,
          type: e.type,
        });
      }
    });
  }

  return emails;
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
  const score = isValid ? 1 : status === "unknown" ? 0.5 : 0;

  return {
    valid: isValid,
    score,
    raw: data,
  };
}

export async function enrichDomain(domain) {
  let domainInfo = null;

  try {
    domainInfo = await fetchDomainInfo(domain);
  } catch {}

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

  let daApprox = 0;
  if (domainInfo?.results) {
    daApprox = Math.min(100, domainInfo.results.length * 2);
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
