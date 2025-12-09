// routes/services/outreachCore.js (or src/services/outreachCore.js)
import axios from "axios";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Known RapidAPI hosts used in this project
const HOSTS = {
  serp: "google-search116.p.rapidapi.com",
  daPa: "domain-da-pa-check2.p.rapidapi.com",
  emailFinder: "email-address-finder1.p.rapidapi.com",
  emailValidator: "easy-email-validation.p.rapidapi.com",
};

// Small helper for delays
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generic RapidAPI GET helper with:
 * - host-specific headers
 * - retry logic
 * - 401 / 429 handling
 */
async function rapidGet({ host, path, params = {}, retries = 5 }) {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY environment variable is not set");
  }

  const url = `https://${host}${path}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": host,
        },
        timeout: 20000,
      });

      return res.data;
    } catch (err) {
      const status = err.response?.status;

      console.error(`Attempt ${attempt}/${retries} failed:`, {
        host,
        url,
        status,
        statusText: err.response?.statusText,
        params,
      });

      if (status === 401) {
        console.log("⚠️  401 Unauthorized – check RapidAPI key / quota");
        await wait(3000);
      } else if (status === 429) {
        const delay = attempt * 2500;
        console.log(`⏳ 429 Rate limit from ${host} – retrying in ${delay}ms`);
        await wait(delay);
        continue;
      } else if (status === 404) {
        console.error("❌ 404 Not Found – check endpoint path for host:", host);
        throw new Error(`Endpoint not found: ${url}`);
      } else if (attempt < retries) {
        const delay = attempt * 1500;
        console.log(`⚠️ API error (${status}) from ${host} – retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }

      // Final failure
      throw err;
    }
  }
}

/* -----------------------------------------------------------
 * 1) SERP LOOKUP (google-search116)
 * --------------------------------------------------------- */

/**
 * SERP lookup - Google Search Results using Google Search116 API
 * 
 * According to the current setup, this API expects:
 *   GET https://google-search116.p.rapidapi.com/?query=KEYWORD
 */
export async function serpLookup(keyword) {
  console.log(`🔍 SERP search for: "${keyword}"`);

  const result = await rapidGet({
    host: HOSTS.serp,
    path: "/",
    params: { query: keyword },
    retries: 3,
  });

  console.log(`✅ SERP search complete for: "${keyword}"`);
  return result;
}

/**
 * Domain scan / outreach lookup based on SERP (site:domain)
 * NOTE:
 *   This currently only uses SERP – it does NOT yet include DA or emails.
 *   DA / email enrichment is added via separate helpers below.
 */
export async function outreachScan(domain) {
  console.log(`🌐 SERP-based scan for domain: ${domain}`);

  const searchQuery = `site:${domain}`;
  const result = await serpLookup(searchQuery);

  const domainInfo = {
    domain,
    searchResults: result?.organic_results || result?.results || [],
    totalResults: result?.search_information?.total_results || 0,
    metadata: result?.search_information || {},
  };

  console.log(`✅ SERP domain scan complete for: ${domain}`);
  return domainInfo;
}

/* -----------------------------------------------------------
 * 2) DOMAIN DA / PA / SPAM SCORE
 *    API: https://domain-da-pa-check2.p.rapidapi.com/check?domain=
 * --------------------------------------------------------- */

/**
 * Fetch Moz-style DA/PA and related metrics for a domain.
 *
 * This uses the endpoint you provided:
 *   GET https://domain-da-pa-check2.p.rapidapi.com/check?domain=example.com
 *
 * NOTE:
 *   This function returns the raw JSON from the API.
 *   You should log the response once and then map the actual DA field
 *   into whatever structure `serp-OutreachService` / `filters.js` expect.
 */
export async function fetchDomainAuthority(domain) {
  console.log(`📈 Fetching DA/PA for: ${domain}`);

  const data = await rapidGet({
    host: HOSTS.daPa,
    path: "/check",
    params: { domain },
    retries: 3,
  });

  console.log(`✅ DA/PA fetch complete for: ${domain}`);
  return data; // raw – no assumptions about field names
}

/* -----------------------------------------------------------
 * 3) EMAIL DISCOVERY
 *    API: https://email-address-finder1.p.rapidapi.com/emailjob?website=
 * --------------------------------------------------------- */

/**
 * Discover emails & social links from a website.
 *
 * Endpoint (from your original setup):
 *   GET https://email-address-finder1.p.rapidapi.com/emailjob?website=example.com
 *
 * Again, this returns raw JSON. Inspect & then map to your lead model.
 */
export async function findEmailsForDomain(domain) {
  console.log(`📬 Discovering emails for: ${domain}`);

  const data = await rapidGet({
    host: HOSTS.emailFinder,
    path: "/emailjob",
    params: { website: domain },
    retries: 3,
  });

  console.log(`✅ Email discovery complete for: ${domain}`);
  return data; // raw
}

/* -----------------------------------------------------------
 * 4) EMAIL VALIDATION
 *    API: https://easy-email-validation.p.rapidapi.com/validate-v2?email=
 * --------------------------------------------------------- */

/**
 * Validate a single email using Easy Email Validation.
 *
 * Endpoint (from your note):
 *   GET https://easy-email-validation.p.rapidapi.com/validate-v2?email=foo@bar.com
 *
 * Returns raw JSON; you can later map whatever "score" / "valid" fields
 * exist into the shape your filters expect.
 */
export async function validateEmailAddress(email) {
  console.log(`✅ Validating email: ${email}`);

  const data = await rapidGet({
    host: HOSTS.emailValidator,
    path: "/validate-v2",
    params: { email },
    retries: 3,
  });

  console.log(`✅ Email validation complete: ${email}`);
  return data; // raw
}

/* -----------------------------------------------------------
 * 5) Optional helpers for debugging & batch use
 * --------------------------------------------------------- */

export async function testApiConnection() {
  console.log("Testing RapidAPI connectivity…");
  console.log(
    "RAPIDAPI_KEY:",
    RAPIDAPI_KEY ? `Present (length: ${RAPIDAPI_KEY.length})` : "MISSING"
  );

  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY environment variable is not set");
  }

  const result = await serpLookup("test");
  console.log("✅ SERP API connection OK, top-level keys:", Object.keys(result));
  return result;
}

/**
 * Convenience: normalise basic SERP results into a simple array.
 * (Used by other parts of the app – leaving this as-is.)
 */
export function parseSearchResults(apiResponse) {
  const results = apiResponse?.organic_results || apiResponse?.results || [];
  if (!Array.isArray(results)) return [];

  return results.map((r, idx) => ({
    title: r.title,
    link: r.link || r.url,
    snippet: r.snippet || r.description,
    displayLink: r.displayed_link || r.display_link,
    position: r.position || idx + 1,
  }));
}

export default {
  serpLookup,
  outreachScan,
  fetchDomainAuthority,
  findEmailsForDomain,
  validateEmailAddress,
  testApiConnection,
  parseSearchResults,
};
