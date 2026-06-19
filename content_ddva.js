// content_ddva.js - V1.0 (Delta Dental VA Full Portal Auditor)
// Modeled after content_cigna.js structure
// Intercepts XHR to grab auth + IDs, then fetches ALL benefit data via API

// ============================================================
// SECTION 1: UTILITIES
// ============================================================
const clean = (s) => (s || "").trim().replace(/\s+/g, " ");
const BASE_URL = "https://deltadentalva.com";
const API_BASE = "/provider/api/provider-experience";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ============================================================
// SECTION 2: XHR INTERCEPTION (Capture Auth Token + IDs)
// ============================================================

const capturedContext = {
  authToken: null,
  memberHccId: null,
  benefitPlanId: null,
  accountHccId: null,
  bvnId: null,
  transactionId: null,
  networkId: "In Network PPO", // default, updated from API
};

/**
 * Extracts memberHccId from the current page URL.
 * URL pattern: /provider/find-a-patient/{tab}/{memberHccId}
 */
function extractMemberHccIdFromURL() {
  const match = window.location.pathname.match(
    /\/provider\/find-a-patient\/(?:dental-benefits|coverage|limitations|patient-info)\/([^/?#]+)/
  );
  return match ? match[1] : null;
}

/**
 * Monkey-patches XMLHttpRequest to intercept headers and URL params
 * from the SPA's own API calls. This captures:
 *   - Authorization token
 *   - benefitPlanId (from URL params)
 *   - accountHccId (from URL path)
 *   - bvnId (from URL path)
 *   - transactionId (from headers)
 */
function installXHRInterceptor() {
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._ddva_url = url;

    // Extract benefitPlanId from query params
    try {
      const urlObj = new URL(url, window.location.origin);
      const bpId = urlObj.searchParams.get("benefitPlanId");
      if (bpId) capturedContext.benefitPlanId = bpId;

      const bpHccId = urlObj.searchParams.get("benefitPlanHccId");
      if (bpHccId) capturedContext.benefitPlanId = bpHccId;

      // Extract accountHccId from /account/{id}/ path
      const accountMatch = url.match(/\/account\/([^/]+)\//);
      if (accountMatch) capturedContext.accountHccId = accountMatch[1];

      // Extract accountHccId from ?accountHccId= param
      const acctParam = urlObj.searchParams.get("accountHccId");
      if (acctParam) capturedContext.accountHccId = acctParam;

      // Extract bvnId from /bvn/{id}/
      const bvnMatch = url.match(/\/bvn\/(\d+)\//);
      if (bvnMatch) capturedContext.bvnId = bvnMatch[1];
    } catch (e) {
      /* ignore URL parse errors for relative URLs */
    }

    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (name === "Authorization" && value && value.length > 100) {
      capturedContext.authToken = value;
    }
    if (name === "transactionId") {
      capturedContext.transactionId = value;
    }
    return origSetHeader.apply(this, arguments);
  };

  // Also intercept fetch()
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input.url;
      const urlObj = new URL(url, window.location.origin);

      const bpId = urlObj.searchParams.get("benefitPlanId");
      if (bpId) capturedContext.benefitPlanId = bpId;

      const bpHccId = urlObj.searchParams.get("benefitPlanHccId");
      if (bpHccId) capturedContext.benefitPlanId = bpHccId;

      const accountMatch = url.match(/\/account\/([^/]+)\//);
      if (accountMatch) capturedContext.accountHccId = accountMatch[1];

      const acctParam = urlObj.searchParams.get("accountHccId");
      if (acctParam) capturedContext.accountHccId = acctParam;

      const bvnMatch = url.match(/\/bvn\/(\d+)\//);
      if (bvnMatch) capturedContext.bvnId = bvnMatch[1];

      if (init && init.headers) {
        const headers =
          init.headers instanceof Headers
            ? Object.fromEntries(init.headers.entries())
            : init.headers;
        if (headers.Authorization && headers.Authorization.length > 100) {
          capturedContext.authToken = headers.Authorization;
        }
        if (headers.transactionId) {
          capturedContext.transactionId = headers.transactionId;
        }
      }
    } catch (e) {
      /* ignore */
    }
    return origFetch.apply(this, arguments);
  };

  console.log("[DDVA Auditor] XHR/Fetch interceptor installed.");
}

// ============================================================
// SECTION 3: API CALLER
// ============================================================

/**
 * Makes an authenticated API call to the DD VA backend.
 * Uses the intercepted auth token and standard headers.
 */
async function ddvaApiCall(path, options = {}) {
  const { method = "GET", body = null, params = {} } = options;

  let url = `${BASE_URL}${API_BASE}${path}`;

  // Append query params
  const queryParts = Object.entries(params)
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    )
    .join("&");
  if (queryParts) url += `?${queryParts}`;

  const headers = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Authorization: capturedContext.authToken,
    healthCareCompanyId: "1",
    subcompanyId: "1",
    transactionId: capturedContext.transactionId || generateUUID(),
  };

  const fetchOpts = { method, headers, credentials: "include" };
  if (body) fetchOpts.body = JSON.stringify(body);

  try {
    const resp = await fetch(url, fetchOpts);
    if (!resp.ok) {
      console.warn(`[DDVA] API error ${resp.status}: ${path}`);
      return null;
    }
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error(`[DDVA] API call failed: ${path}`, err);
    return null;
  }
}

// ============================================================
// SECTION 4: DATA FETCHERS (Parallel API Calls)
// ============================================================

/**
 * Fetches the master benefit plan document.
 * Contains: plan name, product, funding method, COB, member rules,
 * missing tooth clause, alternate benefits, ortho, late submit, etc.
 */
async function fetchBenefitPlan() {
  return ddvaApiCall("/benefitPlans", {
    params: {
      benefitPlanId: capturedContext.benefitPlanId,
      memberHccId: capturedContext.memberHccId,
    },
  });
}

/**
 * Fetches network tier definitions (PPO, Premier, OON).
 */
async function fetchBenefitPlanNetworks() {
  return ddvaApiCall("/benefitPlans/benefitPlanNetworks", {
    params: { benefitPlanHccId: capturedContext.benefitPlanId },
  });
}

/**
 * Fetches financial accumulators — deductibles and maximums per tier.
 * Each accumulator has: definedAmount, usedAmount, remainingAmount, usedPercentage
 */
async function fetchAccumulators() {
  return ddvaApiCall("/member/accumulators", {
    params: {
      benefitPlanId: capturedContext.benefitPlanId,
      memberHccId: capturedContext.memberHccId,
    },
  });
}

/**
 * Fetches common procedure frequencies (Bitewings, Cleanings, Exams, Panos).
 * Each has: allowed, remaining, nextAvailableDate, ageLimit
 */
async function fetchCommonProcedures() {
  return ddvaApiCall("/member/commonProcedures", {
    params: {
      benefitPlanId: capturedContext.benefitPlanId,
      memberHccId: capturedContext.memberHccId,
      networkId: capturedContext.networkId,
    },
  });
}

/**
 * Fetches full limitation summary — all 16+ procedure type limitations.
 */
async function fetchLimitationSummary() {
  return ddvaApiCall("/member/limitationSummary", {
    params: {
      benefitPlanId: capturedContext.benefitPlanId,
      memberHccId: capturedContext.memberHccId,
      networkId: capturedContext.networkId,
    },
  });
}

/**
 * Fetches carry-over / max rollover benefit status.
 */
async function fetchMaxOver() {
  return ddvaApiCall("/member/maxOver", {
    params: { memberHccId: capturedContext.memberHccId },
  });
}

/**
 * Fetches account restrictions (benefits and treatment plans).
 */
async function fetchRestrictions() {
  if (!capturedContext.accountHccId) return null;
  return ddvaApiCall(`/account/${capturedContext.accountHccId}/restrictions`);
}

/**
 * Fetches enhanced benefits data (Healthy Smile, Healthy You programs).
 */
async function fetchEBD() {
  if (!capturedContext.accountHccId) return null;
  return ddvaApiCall("/account/ebd", {
    params: { accountHccId: capturedContext.accountHccId },
  });
}

/**
 * Fetches the TOA (Transfer of Assignment) flag.
 */
async function fetchHasToa() {
  return ddvaApiCall("/benefitPlans/hasToa", {
    params: { benefitPlanHccId: capturedContext.benefitPlanId },
  });
}

/**
 * Fetches the FULL coverage table — every service code across all networks.
 * WARNING: This response is ~139KB. It's the most comprehensive data source.
 */
async function fetchCoverage() {
  return ddvaApiCall("/member/coverage", {
    params: {
      benefitPlanId: capturedContext.benefitPlanId,
      memberHccId: capturedContext.memberHccId,
    },
  });
}

/**
 * Searches for specific procedure code benefit details across networks.
 */
async function fetchProcedureSearch(procedureCode) {
  return ddvaApiCall("/benefitPlans/procedureSearch", {
    params: {
      procedureCode,
      benefitPlanId: capturedContext.benefitPlanId,
      memberHccId: capturedContext.memberHccId,
    },
  });
}

/**
 * Fetches claim history for a specific procedure code.
 */
async function fetchProcedureHistory(serviceCode) {
  return ddvaApiCall("/member/procedureHistory", {
    params: {
      memberHccId: capturedContext.memberHccId,
      serviceCode,
    },
  });
}

// ============================================================
// SECTION 5: MAIN SCRAPER — AGGREGATE ALL DATA
// ============================================================

/**
 * Processes accumulator data into a cleaner format, separating
 * deductibles and maximums by network tier.
 */
function processAccumulators(accData) {
  if (!accData || !accData.accumulators) return null;

  const result = {
    hasNoAnnualMax: accData.hasNoAnnualMax,
    deductibles: [],
    maximums: [],
  };

  for (const acc of accData.accumulators) {
    const entry = {
      tier: acc.tierName,
      name: acc.displayName || acc.name,
      defined: acc.definedAmount,
      used: acc.usedAmount,
      remaining: acc.remainingAmount,
      usedPct: acc.usedPercentage,
      isFamily: acc.familyAccumulator,
      noMaxLimit: acc.noMaxLimit,
    };

    if (acc.isMaximum) {
      result.maximums.push(entry);
    } else {
      result.deductibles.push(entry);
    }
  }

  return result;
}

/**
 * Processes the coverage response into a simplified per-network map.
 * Extracts: benefit class name, copay, deductible waived, service codes
 */
function processCoverage(coverageData) {
  if (!coverageData || !Array.isArray(coverageData)) return null;

  return coverageData.map((network) => ({
    networkName: network.networkName,
    classes: (network.benefitClassDetails || []).map((cls) => ({
      category: cls.description,
      copay: cls.copay,
      deductibleWaived: cls.deductibleWaived,
      waitingPeriod: cls.waitingPeriod,
      codes: (cls.serviceCodeList || []).map((sc) => ({
        code: sc.code,
        description: sc.description,
        memberCopay: sc.memberCopay,
      })),
    })),
  }));
}

/**
 * Processes the benefit plan into the most important fields.
 */
function processBenefitPlan(plan) {
  if (!plan) return null;

  return {
    planName: plan.benefitPlanName,
    productName: plan.productName,
    planDescription: plan.planDescription,
    fundingMethod: plan.fundingMethod?.name,
    effectiveStartDate: plan.effectiveStartDate,
    effectiveEndDate: plan.effectiveEndDate,
    planYearStart: plan.planYearStartDate,
    planYearEnd: plan.planYearEndDate,
    planProductType: plan.planProductType,
    missingToothClause: plan.missingToothClause,
    alternateBenefitSet: plan.alternateBenefitSet,
    cobCalculation: plan.cobCalculation,
    orthodontia: plan.orthodontia,
    lateSubmit: plan.lateSubmit,
    aob: plan.aob,
    toaFlag: plan.toaFlag,
    lateEntrant: plan.lateEntrant,
    eocBooklet: plan.eocBooklet,
    idCardType: plan.idCardType,
    memberRules: (plan.invalidMemberRules || []).map((r) => ({
      memberType: r.memberType,
      ageLimit: r.ageEligibilityEndDate?.age,
      endOfMonth: r.ageEligibilityEndDate?.extension?.endOfCalendarMonth,
      terminateReason: r.terminateReason,
    })),
  };
}

/**
 * Master scrape function: Waits for context, then fires all API calls in parallel.
 */
async function scrapeDDVAFull() {
  // Step 1: Extract memberHccId from URL
  capturedContext.memberHccId = extractMemberHccIdFromURL();
  if (!capturedContext.memberHccId) {
    console.warn("[DDVA] Not on a patient page. Skipping.");
    return null;
  }

  // Step 2: Wait for XHR interception to capture auth + IDs
  let retries = 0;
  while (
    (!capturedContext.authToken || !capturedContext.benefitPlanId) &&
    retries < 30
  ) {
    await new Promise((r) => setTimeout(r, 500));
    retries++;
  }

  if (!capturedContext.authToken) {
    console.error("[DDVA] Could not capture auth token after 15s.");
    return null;
  }

  if (!capturedContext.benefitPlanId) {
    console.warn("[DDVA] Could not capture benefitPlanId. Some APIs may fail.");
  }

  console.log("[DDVA] Context captured:", {
    memberHccId: capturedContext.memberHccId,
    benefitPlanId: capturedContext.benefitPlanId,
    accountHccId: capturedContext.accountHccId,
    hasAuth: !!capturedContext.authToken,
  });

  // Step 3: Fire all API calls in parallel
  const [
    benefitPlan,
    networks,
    accumulators,
    commonProcs,
    limitations,
    maxOver,
    restrictions,
    ebd,
    hasToa,
    coverage,
  ] = await Promise.all([
    fetchBenefitPlan(),
    fetchBenefitPlanNetworks(),
    fetchAccumulators(),
    fetchCommonProcedures(),
    fetchLimitationSummary(),
    fetchMaxOver(),
    fetchRestrictions(),
    fetchEBD(),
    fetchHasToa(),
    fetchCoverage(),
  ]);

  // Step 4: Fetch procedure history for common eval codes
  const commonServiceCodes = ["D0120", "D0150", "D0180", "D0140"];
  const historyResults = {};
  await Promise.all(
    commonServiceCodes.map(async (code) => {
      historyResults[code] = await fetchProcedureHistory(code);
    })
  );

  // Step 5: Assemble the complete data object
  const data = {
    source: "Delta Dental VA Provider Portal",
    timestamp: new Date().toISOString(),
    memberHccId: capturedContext.memberHccId,
    benefitPlanId: capturedContext.benefitPlanId,
    accountHccId: capturedContext.accountHccId,

    // A. Plan Info
    plan: processBenefitPlan(benefitPlan),

    // A2. Network Tiers
    networks: networks,

    // A3. Restrictions
    restrictions: restrictions,

    // A4. Enhanced Benefits (Healthy Smile, Healthy You)
    enhancedBenefits: ebd,

    // A5. TOA
    toa: hasToa,

    // B. Financials
    financials: processAccumulators(accumulators),

    // B2. Max Carry Over
    maxCarryOver: maxOver,

    // C. Common Procedure Frequencies
    commonProcedures: commonProcs,

    // C2. Full Limitations (16 entries)
    limitations: limitations,

    // D. Full Coverage Table (all service codes)
    coverage: processCoverage(coverage),

    // E. Procedure History
    procedureHistory: historyResults,
  };

  return data;
}

// ============================================================
// SECTION 6: CHROME EXTENSION INTEGRATION
// ============================================================

async function runDDVACrawl() {
  if (!chrome.runtime?.id) return;

  console.log("[DDVA Auditor] Starting comprehensive crawl...");

  const data = await scrapeDDVAFull();
  if (!data) {
    console.warn("[DDVA Auditor] No data collected.");
    return;
  }

  // Store in chrome.storage.local (same pattern as Cigna)
  chrome.storage.local.get("audit_context", (result) => {
    let context = result.audit_context || {};
    context.ddva_data = data;
    chrome.storage.local.set({ audit_context: context });
    console.log("[DDVA Auditor] Full data exported to chrome.storage.");
    console.log("[DDVA Auditor] Data summary:", {
      plan: data.plan?.planName,
      product: data.plan?.productName,
      deductibles: data.financials?.deductibles?.length,
      maximums: data.financials?.maximums?.length,
      commonProcs: data.commonProcedures?.length,
      limitations: data.limitations?.length,
      coverageNetworks: data.coverage?.length,
      enhancedBenefits: data.enhancedBenefits?.hasEbd,
      missingTooth: data.plan?.missingToothClause,
    });
  });
}

// ============================================================
// SECTION 7: INITIALIZATION
// ============================================================

// Only activate on Delta Dental VA provider pages
if (window.location.hostname.includes("deltadentalva.com")) {
  // Install interceptors FIRST (before any SPA API calls fire)
  installXHRInterceptor();

  // Auto-run after the page has loaded and SPA has made its initial API calls
  // 6s delay ensures XHR interception has captured auth + IDs
  setTimeout(runDDVACrawl, 6000);

  // Listener for manual popup trigger (same pattern as Cigna)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "START_CRAWL") {
      runDDVACrawl();
      sendResponse({ status: "DDVA Comprehensive Scrape Started" });
    }
  });

  console.log("[DDVA Auditor] Content script loaded on deltadentalva.com");
}
