const clean = (s) => (s || "").trim().replace(/\s+/g, ' ');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForElement(selector, timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const el = document.querySelector(selector);
        if (el) return el;
        await sleep(400);
    }
    return null;
}

function findByText(text, root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
        if (node.textContent.trim() === text) return node.parentElement;
    }
    return null;
}

function setReactInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── 14 codes split into two batches of 7 (site allows max 10) ──
// BATCH 1: original 9 standard codes
// BATCH 2: 5 new plan-comparison codes
const BATCH_1 = ["D1110", "D4910", "D4355", "D1206", "D1208", "D0274", "D0210", "D0120", "D0150"];
const BATCH_2 = ["D2331", "D2140", "D2740", "D1351", "D1510", "D8080"];

// kept for backwards compat
const STANDARD_CODES = BATCH_1;


// ══════════════════════════════════════════════════════════════════════════
// PATIENT INFO
// ══════════════════════════════════════════════════════════════════════════

function scrapePatientInfo() {
    const name = document.querySelector(".patient-name")?.innerText?.trim() ||
        document.querySelector("[class*='patient'] [class*='name']")?.innerText?.trim() || "N/A";
    const cardText = document.querySelector(".card-details, [class*='card-detail'], [class*='member-info']")?.innerText || "";
    return {
        name,
        dob: cardText.match(/DOB:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] || "N/A",
        relationship: cardText.match(/^([^\|]+)/)?.[1]?.trim() || "N/A",
        gender: cardText.match(/\|\s*(Male|Female)\s*/i)?.[1]?.trim() || "N/A"
    };
}


// ══════════════════════════════════════════════════════════════════════════
// PLAN DETAILS
// ══════════════════════════════════════════════════════════════════════════

function scrapePlanDetails() {
    function getLabelValue(labelText) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (node.textContent.trim() !== labelText) continue;
            const labelEl = node.parentElement;
            const sib = labelEl.nextElementSibling;
            if (sib?.innerText?.trim()) return clean(sib.innerText);
            const parentSib = labelEl.parentElement?.nextElementSibling;
            if (parentSib?.innerText?.trim()) return clean(parentSib.innerText);
        }
        return "N/A";
    }
    return {
        start_date: getLabelValue("Start Date"),
        end_date: getLabelValue("End Date"),
        subscriber_id: getLabelValue("Subscriber SSN or ID"),
        employer_group: getLabelValue("Employer / Group #"),
        network: getLabelValue("Network"),
        address: getLabelValue("Address")
    };
}


// ══════════════════════════════════════════════════════════════════════════
// FINANCIALS
// ══════════════════════════════════════════════════════════════════════════

function findCardByLabel(labelText) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
        if (node.textContent.trim() !== labelText) continue;
        let el = node.parentElement;
        for (let i = 0; i < 8; i++) {
            if (!el) break;
            if (((el.innerText || "").match(/\$\s*[\d,]+/g) || []).length >= 2) return el;
            el = el.parentElement;
        }
    }
    return null;
}

function parseCardAmounts(container) {
    if (!container) return { remaining: "N/A", used: "N/A", total: "N/A" };
    const text = container.innerText || "";
    return {
        remaining: text.match(/\$\s*[\d,]+\.?\d*\s*remaining/i)?.[0]?.replace(/\s+/g, ' ').trim() || "N/A",
        used: text.match(/\$\s*[\d,]+\.?\d*\s*(?:used|paid)\s*to\s*date/i)?.[0]?.replace(/\s+/g, ' ').trim() || "N/A",
        total: text.match(/\$\s*[\d,]+\.?\d*\s*total/i)?.[0]?.replace(/\s+/g, ' ').trim() || "N/A"
    };
}

function scrapeFinancials() {
    return {
        annual_max: parseCardAmounts(findCardByLabel("Annual")),
        ortho_lifetime: parseCardAmounts(findCardByLabel("Lifetime")),
        deductible_ind: parseCardAmounts(findCardByLabel("Individual"))
    };
}


// ══════════════════════════════════════════════════════════════════════════
// COVERED SERVICES
// ══════════════════════════════════════════════════════════════════════════

function scrapeCoveredServices() {
    const heading = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
        .find(h => h.textContent.trim() === "Covered Services") || findByText("Covered Services");
    let table = null;
    if (heading) {
        const section = heading.closest("section,[class*='section']") || heading.parentElement;
        table = section?.querySelector("table") || heading.parentElement?.nextElementSibling?.querySelector("table");
    }
    if (!table) table = Array.from(document.querySelectorAll("table")).find(t => t.innerText.includes("Procedure Category"));
    if (!table) return [];

    return Array.from(table.querySelectorAll("tr")).slice(1).map(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 2) return null;
        const categoryName = cells[0].querySelector("strong,b")?.innerText?.trim() || cells[0].innerText.split('\n')[0].trim();
        return {
            category: categoryName,
            services: clean(cells[0].innerText).replace(categoryName, "").trim() || "N/A",
            in_network: clean(cells[1]?.innerText) || "N/A",
            out_of_network: clean(cells[2]?.innerText) || "N/A"
        };
    }).filter(r => r && r.category);
}


// ══════════════════════════════════════════════════════════════════════════
// PLAN PROVISIONS
// ══════════════════════════════════════════════════════════════════════════

function scrapeProvisions() {
    const heading = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
        .find(h => h.textContent.trim().includes("Plan Provisions")) || findByText("Plan Provisions");
    let section = null;
    if (heading) {
        let el = heading.nextElementSibling;
        while (el) {
            if ((el.innerText || "").trim().length > 50) { section = el; break; }
            el = el.nextElementSibling;
        }
        if (!section) section = heading.closest("[class*='provision'],section") || heading.parentElement;
    }
    if (!section) section = document.querySelector("[class*='provision'],[class*='Provision']");
    if (!section) return [];

    const tableRows = section.querySelectorAll("table tr, tbody tr");
    if (tableRows.length) return Array.from(tableRows).map(tr => {
        const c = tr.querySelectorAll("td");
        return { rule: clean(c[0]?.innerText), value: clean(c[1]?.innerText) };
    }).filter(r => r.rule);

    const dts = section.querySelectorAll("dt");
    if (dts.length) return Array.from(dts).map(dt => ({
        rule: clean(dt.innerText), value: clean(dt.nextElementSibling?.innerText)
    })).filter(r => r.rule);

    const rowLike = Array.from(section.querySelectorAll("*")).filter(el => {
        const kids = Array.from(el.children).filter(c => (c.innerText || "").trim());
        return kids.length === 2 && (el.innerText || "").trim().length > 5;
    });
    if (rowLike.length >= 3) {
        const seen = new Set();
        const pairs = rowLike.map(el => {
            const kids = Array.from(el.children).filter(c => (c.innerText || "").trim());
            return { rule: clean(kids[0]?.innerText), value: clean(kids[1]?.innerText) };
        }).filter(p => {
            const key = p.rule + p.value;
            if (seen.has(key) || !p.rule || !p.value || p.rule === p.value) return false;
            seen.add(key); return true;
        });
        if (pairs.length >= 3) return pairs;
    }

    const boldEls = section.querySelectorAll("strong,b,[class*='label'],[class*='key']");
    if (boldEls.length >= 3) {
        const results = Array.from(boldEls).map(el => ({
            rule: clean(el.innerText),
            value: clean((el.parentElement?.innerText || "").replace(el.innerText, "").trim()) ||
                clean(el.nextElementSibling?.innerText) || "N/A"
        })).filter(r => r.rule && r.value && r.rule !== r.value);
        if (results.length >= 3) return results;
    }

    const children = Array.from(section.children).filter(c => (c.innerText || "").trim());
    if (children.length >= 4) {
        const pairs = [];
        for (let i = 0; i + 1 < children.length; i += 2) {
            const rule = clean(children[i].innerText), value = clean(children[i + 1].innerText);
            if (rule && value && rule.length < 120) pairs.push({ rule, value });
        }
        if (pairs.length >= 3) return pairs;
    }

    return (section.innerText || "").split("\n").map(l => l.trim()).filter(Boolean)
        .reduce((acc, line, i, arr) => { if (i % 2 === 0 && arr[i + 1]) acc.push({ rule: line, value: arr[i + 1] }); return acc; }, []);
}


// ══════════════════════════════════════════════════════════════════════════
// BUILD PLAN OVERVIEW PAYLOAD
// ══════════════════════════════════════════════════════════════════════════

function buildPlanOverviewPayload() {
    return {
        source: "MetLife Portal - Plan Overview",
        timestamp: new Date().toISOString(),
        patient: scrapePatientInfo(),
        plan_details: scrapePlanDetails(),
        financials: scrapeFinancials(),
        covered_services: scrapeCoveredServices(),
        provisions: scrapeProvisions()
    };
}


// ══════════════════════════════════════════════════════════════════════════
// CRAWL — PLAN OVERVIEW
// ══════════════════════════════════════════════════════════════════════════

async function crawlPlanOverview() {
    const tabEl = findByText("Plan Overview");
    if (tabEl) { tabEl.click(); await sleep(2500); }

    const data = buildPlanOverviewPayload();

    return new Promise((resolve) => {
        chrome.storage.local.set({ audit_context: { metlife_data: data } }, () => {
            const got = Object.values(data.financials).some(f => Object.values(f).some(v => v !== "N/A"));
            resolve({ status: got ? `[+] Plan Overview saved (${data.provisions.length} provisions).` : `[!] Saved but financials N/A — stay on Plan Overview and retry.` });
        });
    });
}


// ══════════════════════════════════════════════════════════════════════════
// LOW-LEVEL: run one batch of codes, click Search, scrape table
// ══════════════════════════════════════════════════════════════════════════

async function runOneBatch(codes) {
    // find the input
    let codeInput = document.querySelector("input[placeholder*='rocedure']") ||
        document.querySelector("input[placeholder*='ode']") ||
        document.querySelector("input[aria-label*='rocedure']") ||
        findInputNearSearchButton();
    if (!codeInput) codeInput = await waitForElement("input[type='text']:not([readonly])", 6000);
    if (!codeInput) return [];

    // click Reset first to clear any previous results
    const resetBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Reset");
    if (resetBtn) { resetBtn.click(); await sleep(800); }

    codeInput.focus();
    setReactInputValue(codeInput, "");
    await sleep(200);
    setReactInputValue(codeInput, codes.join(","));
    await sleep(400);

    const searchBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Search" && !b.disabled);
    if (!searchBtn) return [];

    searchBtn.click();

    // wait longer for MetLife to fully refresh table
    await sleep(2500);

    // wait until at least one of the requested codes appears
    const deadline = Date.now() + 10000;

    while (Date.now() < deadline) {
        const text = document.body.innerText || "";

        const found = codes.some(code => text.includes(code));

        if (found) break;

        await sleep(500);
    }

    await sleep(1200);

    return scrapeProcedureTable();
}


// ══════════════════════════════════════════════════════════════════════════
// CRAWL — BENEFIT & COVERAGE  (two batches, merged results)
// ══════════════════════════════════════════════════════════════════════════

async function crawlBenefitCoverage(extraCodes = "") {
    const tabEl = findByText("Benefit & Coverage Details");
    if (tabEl) { tabEl.click(); await sleep(2500); }

    // Build final code list: BATCH_1 + BATCH_2 + any caller-supplied extras
    const extraList = extraCodes
        ? extraCodes.split(",").map(c => c.trim().toUpperCase()).filter(Boolean)
        : [];

    const allCodes = [...new Set([...BATCH_1, ...BATCH_2, ...extraList])];

    // Split into chunks of 10 (site hard limit)
    const CHUNK_SIZE = 10;
    const chunks = [];
    for (let i = 0; i < allCodes.length; i += CHUNK_SIZE) {
        chunks.push(allCodes.slice(i, i + CHUNK_SIZE));
    }

    // Run each chunk and merge results (deduplicate by procedure_code)
    const seen = new Set();
    const allProcedures = [];

    for (let i = 0; i < chunks.length; i++) {
        console.log(`[Audit] Batch ${i + 1}/${chunks.length}: ${chunks[i].join(",")}`);
        const batchResults = await runOneBatch(chunks[i]);
        for (const proc of batchResults) {
            if (!seen.has(proc.procedure_code)) {
                seen.add(proc.procedure_code);
                allProcedures.push(proc);
            }
        }
        // Small pause between batches so the page can reset
        if (i < chunks.length - 1) await sleep(1000);
    }

    return new Promise((resolve) => {
        chrome.storage.local.get("audit_context", (res) => {
            const ctx = res.audit_context || {};
            ctx.benefit_coverage = {
                source: "MetLife Portal - Benefit & Coverage Details",
                timestamp: new Date().toISOString(),
                codes_searched: allCodes,
                extra_codes: extraList,
                procedure_count: allProcedures.length,
                procedures: allProcedures
            };
            chrome.storage.local.set({ audit_context: ctx }, () => {
                resolve({ status: `[+] Scraped ${allProcedures.length} procedures across ${chunks.length} batch(es).` });
            });
        });
    });
}


// ══════════════════════════════════════════════════════════════════════════
// TABLE & INPUT HELPERS
// ══════════════════════════════════════════════════════════════════════════

async function waitForResultsTable(timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (document.querySelectorAll("table tbody tr td").length > 0) return true;
        if (/showing\s+\d+\s+of\s+\d+\s+results/i.test(document.body.innerText)) return true;
        await sleep(500);
    }
    return false;
}

function scrapeProcedureTable() {
    const rows = document.querySelectorAll("table tbody tr");
    if (!rows.length) return [];
    return Array.from(rows).map(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) return null;
        return {
            procedure_code: clean(cells[0]?.innerText),
            description: clean(cells[1]?.innerText),
            frequency_limit: clean(cells[2]?.innerText),
            age_limit: clean(cells[3]?.innerText),
            late_date_of_service: clean(cells[4]?.innerText) || "—",
            deductible: clean(cells[5]?.innerText) || "N/A",
            network_fee: clean(cells[6]?.innerText) || "N/A",
            benefit_level: clean(cells[7]?.innerText) || "N/A",
            patient_responsibility: clean(cells[8]?.innerText) || "N/A"
        };
    }).filter(r => r && r.procedure_code);
}

function findInputNearSearchButton() {
    const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Search");
    if (!btn) return null;
    let parent = btn.parentElement;
    for (let i = 0; i < 5; i++) {
        if (!parent) break;
        const input = parent.querySelector("input[type='text'],input:not([type])");
        if (input) return input;
        parent = parent.parentElement;
    }
    return null;
}


// ══════════════════════════════════════════════════════════════════════════
// PASSIVE BACKGROUND SYNC
// ══════════════════════════════════════════════════════════════════════════

setInterval(() => {
    if (!chrome.runtime?.id) return;
    if (!(document.body?.innerText || "").includes("Benefit Maximums")) return;
    const data = buildPlanOverviewPayload();
    chrome.storage.local.get("audit_context", (res) => {
        const ctx = res.audit_context || {};
        ctx.metlife_data = data;
        chrome.storage.local.set({ audit_context: ctx });
    });
}, 5000);


// ══════════════════════════════════════════════════════════════════════════
// MESSAGE LISTENER
// ══════════════════════════════════════════════════════════════════════════
function downloadAuditJSON() {
    chrome.storage.local.get("audit_context", (res) => {

        const data = res.audit_context || {};

        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;

        const patient =
            data?.metlife_data?.patient?.name
                ?.replace(/[^a-z0-9]/gi, "_")
                ?.toLowerCase() || "patient";

        a.download = `${patient}_metlife_audit.json`;

        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(url);
    });
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.command === "START_CRAWL") {

        (async () => {

            await crawlPlanOverview();

            // ask only inside MetLife crawler flow
            const extraCodes = prompt(
                "Enter extra procedure codes (optional)\n\nExample:\nD9999,D1234"
            ) || "";

            const res = await crawlBenefitCoverage(extraCodes);

            downloadAuditJSON();

            sendResponse({
                status: res.status + " JSON downloaded."
            });

        })();

        return true;
    }

    if (request.command === "CRAWL_PLAN_OVERVIEW") {
        crawlPlanOverview().then(sendResponse).catch(() => sendResponse({ status: "[!] Error." }));
        return true;
    }

    if (request.command === "CRAWL_BENEFIT_COVERAGE") {
        crawlBenefitCoverage(request.extraCodes || "").then(sendResponse).catch(() => sendResponse({ status: "[!] Error." }));
        return true;
    }
});