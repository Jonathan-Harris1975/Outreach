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
          "x-rapidapi-key": API_KEY,  // Changed to lowercase
          "x-rapidapi-host": API_HOST  // Changed to lowercase
        },
        timeout: 20000
      });

      return res.data;

    } catch (err) {
      const status = err.response?.status;

      // Log the full error for debugging
      console.error(`Attempt ${attempt}/${retries} failed:`, {
        status,
        statusText: err.response?.statusText,
        url: err.config?.url,
        params: err.config?.params
      });

      // Unauthorized
      if (status === 401) {
        console.log("⚠️ 401 Unauthorized – check API key or quota");
        await wait(3000);
      }

      // Not Found - likely wrong endpoint
      if (status === 404) {
        console.error("❌ 404 Not Found – endpoint does not exist");
        console.error("Check API documentation for correct endpoint path");
        throw new Error(`Endpoint not found: ${err.config?.url}`);
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
 * SERP lookup - Google Search Results
 * 
 * Common RapidAPI SERP endpoint patterns:
 * Option 1: /search
 * Option 2: /google/search  
 * Option 3: /serp
 * 
 * Parameters typically include:
 * - q or query: search query
 * - gl or country: country code (us, uk, etc.)
 * - hl or language: language code (en, es, etc.)
 * - location: specific location
 */
export async function serpLookup(keyword) {
  // Try the most common endpoint pattern first
  const baseUrl = `https://${API_HOST}`;
  
  try {
    // Primary attempt: /search endpoint
    return await safeApiCall(
      `${baseUrl}/search`,
      {
        q: keyword,
        gl: "us",
        hl: "en"
      },
      3
    );
  } catch (err) {
    if (err.response?.status === 404) {
      console.log("Trying alternate endpoint: /google/search");
      
      // Fallback: /google/search endpoint
      try {
        return await safeApiCall(
          `${baseUrl}/google/search`,
          {
            q: keyword,
            gl: "us",
            hl: "en"
          },
          3
        );
      } catch (err2) {
        if (err2.response?.status === 404) {
          console.log("Trying alternate endpoint: /serp");
          
          // Second fallback: /serp endpoint
          return await safeApiCall(
            `${baseUrl}/serp`,
            {
              query: keyword,
              country: "us",
              language: "en"
            },
            3
          );
        }
        throw err2;
      }
    }
    throw err;
  }
}

/**
 * Domain scan/outreach lookup
 * 
 * Common patterns for domain analysis:
 * Option 1: /domain
 * Option 2: /scan
 * Option 3: /domain/info
 */
export async function outreachScan(domain) {
  const baseUrl = `https://${API_HOST}`;
  
  try {
    // Primary attempt: /domain endpoint
    return await safeApiCall(
      `${baseUrl}/domain`,
      { domain },
      3
    );
  } catch (err) {
    if (err.response?.status === 404) {
      console.log("Trying alternate endpoint: /scan");
      
      // Fallback: /scan endpoint
      try {
        return await safeApiCall(
          `${baseUrl}/scan`,
          { domain },
          3
        );
      } catch (err2) {
        if (err2.response?.status === 404) {
          console.log("Trying alternate endpoint: /domain/info");
          
          // Second fallback: /domain/info endpoint
          return await safeApiCall(
            `${baseUrl}/domain/info`,
            { domain },
            3
          );
        }
        throw err2;
      }
    }
    throw err;
  }
}

// Debug function to test API connectivity
export async function testApiConnection() {
  console.log("Testing API connection...");
  console.log("API Host:", API_HOST);
  console.log("API Key:", API_KEY ? "Present" : "Missing");
  
  if (!API_KEY) {
    throw new Error("RAPIDAPI_KEY environment variable is not set");
  }
  
  // Try a simple test call
  try {
    const result = await serpLookup("test");
    console.log("✅ API connection successful");
    return result;
  } catch (err) {
    console.error("❌ API connection failed:", err.message);
    throw err;
  }
}
