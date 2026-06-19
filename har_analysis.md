# Delta Dental VA - HAR File Deep-Dive Analysis

**Source HAR**: `dd va comp`  
**Portal**: `https://deltadentalva.com` (Provider Portal)  
**Page Captured**: `/provider/find-a-patient/dental-benefits/51000001523700-01`  

---

## 1. Authentication and Session Mechanism

### JWT Token (AWS Cognito)
The portal uses **AWS Cognito** for authentication via SAML federation (`ddpa` provider).

| Field | Value |
|---|---|
| **Issuer** | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TSwWkb4QO` |
| **Token Type** | `id` token (JWT RS256) |
| **Header Name** | `Authorization` (raw JWT, no `Bearer` prefix) |
| **Expiry** | ~1 hour from `auth_time` |

### Custom Headers Required
| Header | Value | Used By |
|---|---|---|
| `Authorization` | JWT token (no Bearer prefix) | **All APIs** |
| `Content-Type` | `application/json` | All APIs |
| `healthCareCompanyId` | `1` | Most APIs |
| `subcompanyId` | `1` | Most APIs |
| `transactionId` | UUID v4 (generated per session) | Most APIs |

---

## 2. Key IDs

| ID | Example Value | Source |
|---|---|---|
| `memberHccId` | `51000001523700-01` | From page URL path |
| `benefitPlanId` | `700065001` | From SPA state - XHR interception |
| `accountHccId` | `00000700065-0000000001-0000000003` | From SPA state - XHR interception |
| `networkId` | `In Network PPO` | From benefitPlanNetworks API |

---

## 3. API Endpoint Catalog (25 Unique Endpoints)

### Category A: Plan and Member Info
- GET benefitPlans (12KB) - Master plan document
- GET benefitPlanNetworks - Network tiers (PPO/Premier/OON)
- GET account/{id}/restrictions - Benefit restrictions
- GET account/ebd - Enhanced benefits (HSHY programs)
- GET benefitPlans/hasToa - TOA flag

### Category B: Financial Accumulators
- GET member/accumulators (5.7KB) - Deductibles and maximums per tier
- GET member/maxOver - Carry over benefits

### Category C: Procedure Limitations
- GET member/commonProcedures - 4 common procedure frequencies
- GET member/limitationSummary (3.4KB) - 16 detailed limitations

### Category D: Coverage
- GET member/coverage (139KB) - ALL service codes across all networks

### Category E: Procedure Search
- GET benefitPlans/procedureSearch - Per-code benefit details
- POST benefitPlans/serviceCodes/{code} - Code validation
- GET member/procedureHistory - Claim history per procedure

### Category F: Provider
- POST claimProviders (40KB) - All practitioners
- GET providerLocations (28KB) - All 36 locations

### Category G: Tracking
- POST benefitVerification/bvn/{id}/action - Tab tracking
- GET cms/content/dentists/{id} - CMS content blocks
