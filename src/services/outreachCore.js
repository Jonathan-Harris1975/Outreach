import axios from "axios";

const API_HOST = "google-search116.p.rapidapi.com";
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
async function safeApiCall(url, options = {}, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.request({
        ...options,
        url,
        headers: {
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': API_HOST,
          ...options.headers
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
        data: err.response?.data
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
 * SERP lookup - Google Search Results using Google Search116 API
 * 
 * Based on the API documentation:
 * - Endpoint: POST /api/Search
 * - Required body parameters:
 *   - query: search query string
 *   - limit: number of results (default: 10)
 */
export async function serpLookup(keyword, limit = 10) {
  const baseUrl = `https://${API_HOST}`;
  
  try {
    console.log(`🔍 Searching for: "${keyword}"`);
    
    const result = await safeApiCall(
      `${baseUrl}/api/Search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          query: keyword,
          limit: limit
        }
      },
      3
    );
    
    console.log(`✅ Found ${result?.organic?.length || 0} results for "${keyword}"`);
    return result;
    
  } catch (err) {
    console.error(`❌ SERP lookup failed for "${keyword}":`, err.message);
    throw err;
  }
}

/**
 * Domain scan/outreach lookup
 * 
 * Note: The Google Search116 API is primarily for search results.
 * For domain-specific information, we can search for the domain
 * and extract relevant data from the results.
 * 
 * Alternative: Search for "site:domain.com" to get domain-specific results
 */
export async function outreachScan(domain) {
  try {
    console.log(`🌐 Scanning domain: ${domain}`);
    
    // Search for the domain using site: operator
    const searchQuery = `site:${domain}`;
    const result = await serpLookup(searchQuery, 20);
    
    // Extract domain information from results
    const domainInfo = {
      domain: domain,
      searchResults: result?.organic || [],
      totalResults: result?.searchInformation?.totalResults || 0,
      metadata: {
        searchTime: result?.searchInformation?.searchTime,
        formattedTotalResults: result?.searchInformation?.formattedTotalResults
      }
    };
    
    console.log(`✅ Domain scan complete for ${domain}: ${domainInfo.totalResults} results`);
    return domainInfo;
    
  } catch (err) {
    console.error(`❌ Domain scan failed for ${domain}:`, err.message);
    throw err;
  }
}

/**
 * Advanced search with additional parameters
 * 
 * @param {string} keyword - Search query
 * @param {Object} options - Additional search options
 * @param {number} options.limit - Number of results (default: 10)
 * @param {string} options.dateRestrict - Date restriction (e.g., 'd1' for past day, 'w1' for past week)
 * @param {string} options.siteSearch - Restrict results to a specific site
 */
export async function advancedSearch(keyword, options = {}) {
  const { limit = 10, dateRestrict, siteSearch } = options;
  
  try {
    let query = keyword;
    
    // Add site restriction if specified
    if (siteSearch) {
      query = `site:${siteSearch} ${query}`;
    }
    
    console.log(`🔍 Advanced search: "${query}"`);
    
    const result = await safeApiCall(
      `https://${API_HOST}/api/Search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          query: query,
          limit: limit,
          ...(dateRestrict && { dateRestrict })
        }
      },
      3
    );
    
    console.log(`✅ Advanced search complete: ${result?.organic?.length || 0} results`);
    return result;
    
  } catch (err) {
    console.error(`❌ Advanced search failed:`, err.message);
    throw err;
  }
}

/**
 * Batch search - perform multiple searches
 * 
 * @param {string[]} keywords - Array of keywords to search
 * @param {number} delayMs - Delay between requests in milliseconds (default: 1000)
 */
export async function batchSearch(keywords, delayMs = 1000) {
  const results = [];
  
  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    console.log(`📊 Batch search progress: ${i + 1}/${keywords.length}`);
    
    try {
      const result = await serpLookup(keyword);
      results.push({
        keyword,
        success: true,
        data: result
      });
    } catch (err) {
      results.push({
        keyword,
        success: false,
        error: err.message
      });
    }
    
    // Wait between requests to avoid rate limiting
    if (i < keywords.length - 1) {
      await wait(delayMs);
    }
  }
  
  return results;
}

// Debug function to test API connectivity
export async function testApiConnection() {
  console.log("Testing API connection...");
  console.log("API Host:", API_HOST);
  console.log("API Key:", API_KEY ? "Present (length: " + API_KEY.length + ")" : "Missing");
  
  if (!API_KEY) {
    throw new Error("RAPIDAPI_KEY environment variable is not set");
  }
  
  // Try a simple test call
  try {
    const result = await serpLookup("test", 5);
    console.log("✅ API connection successful");
    console.log("Sample result structure:", {
      hasOrganic: !!result?.organic,
      organicCount: result?.organic?.length || 0,
      hasSearchInfo: !!result?.searchInformation
    });
    return result;
  } catch (err) {
    console.error("❌ API connection failed:", err.message);
    if (err.response?.data) {
      console.error("API Error Details:", err.response.data);
    }
    throw err;
  }
}

// Export utility function to parse search results
export function parseSearchResults(apiResponse) {
  if (!apiResponse || !apiResponse.organic) {
    return [];
  }
  
  return apiResponse.organic.map(result => ({
    title: result.title,
    link: result.link,
    snippet: result.snippet,
    displayLink: result.displayLink,
    position: result.position
  }));
}

export default {
  serpLookup,
  outreachScan,
  advancedSearch,
  batchSearch,
  testApiConnection,
  parseSearchResults
};
    
