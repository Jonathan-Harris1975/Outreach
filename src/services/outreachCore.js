import axios from "axios";

const API_HOST = "serp-data-scraper.p.rapidapi.com";
const API_KEY = process.env.RAPIDAPI_KEY;

// Small helper for delays
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Unified, fault-tolerant API caller with:
 * - retry logic
 * - backoff handling
 * - 401 recovery
 * - 429 rate-limit handling
 */
async function safeApiCall(url, params = {}, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          "X-RapidAPI-Key": API_KEY,
          "X-RapidAPI-Host": API_HOST
        },
        timeout: 20000
      });

      return res.data;

    } catch (err) {
      const status = err.response?.status;

      // Unauthorized
      if (status === 401) {
        console.log("⚠️ 401 Unauthorized – check API key or quota");
        await wait(3000);
      }

      // Rate limit hit
      if (status === 429) {
        const delay = attempt * 2500;
        console.log(`⏳ 429 Rate limit – Retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }

      // Other errors: retry with backoff
      if (attempt < retries) {
        const delay = attempt * 1500;
        console.log(`⚠️ API error (${status}) – retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }

      // Final failure → throw
      throw err;
    }
  }
}

/**
 * SERP lookup (correct RapidAPI provider format)
 * Endpoint:
 *   GET https://serp-data-scraper.p.rapidapi.com/google/search
 *
 * Params:
 *   - q: query keyword
 *   - gl: geo location (use "us" for global consistency)
 *   - hl: language ("en")
 */
export async function serpLookup(keyword) {
  return safeApiCall(
    "https://serp-data-scraper.p.rapidapi.com/google/search",
    {
      q: keyword,
      gl: "us",
      hl: "en"
    }
  );
}

/**
 * Domain scan (correct RapidAPI provider endpoint)
 * Endpoint:
 *   GET https://serp-data-scraper.p.rapidapi.com/google/scan
 */
export async function outreachScan(domain) {
  return safeApiCall(
    "https://serp-data-scraper.p.rapidapi.com/google/scan",
    { domain }
  );
    }
