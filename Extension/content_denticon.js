// content_denticon.js - V20 (The Deep Audit Engine)

// --- 1. GLOBAL HELPERS & CONSTANTS ---
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const clean = (s) => (s || "").trim().replace(/\s+/g, ' ');

const getById = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    return (el.value || el.innerText || "").trim();
};

function findElementByText(text) {
    const tags = ['a', 'span', 'li', 'td', 'div', 'b', 'button'];
    for (let tag of tags) {
        const elements = Array.from(document.querySelectorAll(tag));
        const found = elements.find(el => clean(el.innerText) === text || clean(el.innerText).includes(text));
        if (found) return found;
    }
    return null;
}

// --- UPDATED HELPER: The Main World Injector ---
function forceClick(el) {
    if (!el) return;

    console.log("Executing force click on:", el.innerText || el);

    // 1. Standard Extension Click (Catches basic elements)
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        el.dispatchEvent(new MouseEvent(eventType, {
            view: window, bubbles: true, cancelable: true, buttons: 1
        }));
    });

    // 2. The "Main World" Bypass
    // If Denticon uses a javascript href (e.g., href="javascript:openPlan(123)"), 
    // the extension can't click it safely. We must inject it directly into the page.
    if (el.tagName && el.tagName.toLowerCase() === 'a' && el.href && el.href.includes('javascript:')) {
        console.log("Detected javascript href. Injecting into main world...");
        const script = document.createElement('script');
        script.textContent = el.href.replace('javascript:', '');
        document.documentElement.appendChild(script);
        script.remove(); // Clean up immediately
    } else {
        // 3. Fallback: Native click
        el.click();
    }
}

const extractBetween = (text, start, end) => {
    const regex = new RegExp(`${start}\\s*(.*?)\\s*${end}`, "i");
    const match = text.match(regex);
    return match ? clean(match[1]) : "N/A";
};

// --- 2. SPECIFIC TAB SCRAPERS ---

function scrapeHeader(text) {
    return {
        patient_name: text.split('\n')[0].trim(),
        dob: text.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] || "N/A",
        cell: text.match(/\(C\)\s*([\d-]+)/)?.[1] || "N/A",
        email: text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || "N/A",
        financials: {
            responsible: extractBetween(text, "Responsible", "Balance"),
            balance: extractBetween(text, "Balance", "RP BD"),
            rp_dob: extractBetween(text, "RP BD", "Est Ins"),
            est_ins: extractBetween(text, "Est Ins", "Est Pat"),
            est_pat: text.match(/Est Pat\s+([\d.]+)/i)?.[1] || "0.00"
        },
        insurance_summary: {
            provider: text.match(/Prim\. Ins\s+(.*?)\s+\d{3}-\d{3}-\d{4}/)?.[1] || "N/A",
            phone: text.match(/8[0-9]{2}-[0-9]{3}-[0-9]{4}/)?.[0] || "N/A",
            header_sub_id: text.match(/SubID\s*(\d+)/)?.[1] || "N/A"
        }
    };
}

function scrapePlanTab() {
    const data = {};
    const rows = Array.from(document.querySelectorAll('.insurance-details-modal tr, .row'));
    rows.forEach(r => {
        const cells = r.querySelectorAll('td, div');
        if (cells.length >= 2) {
            const label = clean(cells[0].innerText);
            const val = clean(cells[1].innerText);
            if (label && val && label.length < 50) data[label] = val;
        }
    });
    return data;
}

function scrapeBenTab() {
    const notesEl = document.querySelector('.plan-notes') || findElementByText("Plan Notes")?.parentElement;
    return {
        notes: notesEl ? clean(notesEl.innerText) : "N/A",
        full_text: clean(document.body.innerText).substring(0, 3000)
    };
}

function scrapeCoverageTab() {
    const rows = Array.from(document.querySelectorAll('table tr')).filter(r => r.innerText.includes('%') || r.innerText.match(/\d+/));
    return rows.map(r => {
        const cells = Array.from(r.querySelectorAll('td')).map(c => clean(c.innerText));
        return {
            category: cells[0] || "N/A",
            ded_waived: cells[1] || "N/A",
            coverage_pct: cells[2] || "N/A",
            limitation: cells[3] || "N/A"
        };
    });
}

// --- UPDATED HELPER: The Robust Link Finder ---
function getPlanLinks() {
    const links = [];
    // Target the specific modal table body first
    const tbody = document.getElementById('insurance-plan-table-modal-body');

    if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(r => {
            const firstCell = r.querySelector('td');
            if (firstCell) {
                // Hunt for the <a> tag first. If it doesn't exist, grab the cell.
                const link = firstCell.querySelector('a') || firstCell;
                const text = clean(link.innerText || link.textContent);

                // Regex: Matches 5 to 8 digit numbers (e.g., 288635)
                if (text.match(/^\d{5,8}$/)) {
                    links.push(link);
                }
            }
        });
    }
    return links;
}

// --- 3. THE DEEP CRAWL SEQUENCER (V20.5 - Row Cell Targeter) ---

// Helper function to grab the actual rows instead of fake "links"
function getPlanRows() {
    const tbody = document.getElementById('insurance-plan-table-modal-body');
    if (!tbody) return [];

    // Grab all rows and filter out empty ones
    return Array.from(tbody.querySelectorAll('tr')).filter(row => {
        const firstCell = row.querySelector('td');
        // If the first cell has a number in it, it's a valid plan row
        return firstCell && clean(firstCell.innerText).match(/^\d{5,8}$/);
    });
}

// --- 3. THE DEEP CRAWL SEQUENCER (V20.6 Precision Strike) ---

// Helper to find the exact links based on your HTML structure
function getPlanLinks() {
    // Using the exact ID you found in the HTML
    const tbody = document.getElementById('searchInsurancePlanTableBody');
    if (!tbody) return [];

    // Look for the specific class Denticon uses for the click trigger
    return Array.from(tbody.querySelectorAll('a.show-ins-plan-details'));
}

async function deepCrawlInsurance() {
    // --- 3. THE DEEP CRAWL SEQUENCER (V20.8 - Exact ID Matcher) ---


    console.log("Deep Scraper V20.8: Starting Audit...");

    // 1. Identify the Search Input
    const searchInput = document.getElementById('inpSearchText');
    if (!searchInput) return alert("Error: Search input 'inpSearchText' not found.");

    // 2. Extract the Group ID securely
    let groupNum = "";

    // Target 1: The actual input box
    const groupInput = document.getElementById('inputCarrierGroup');
    if (groupInput && groupInput.value && groupInput.value.trim() !== "") {
        groupNum = clean(groupInput.value);
    }
    // Target 2: The static text span (if the input is hidden/read-only)
    else {
        const groupSpan = document.getElementById('showCarrierGroup');
        if (groupSpan && groupSpan.innerText && groupSpan.innerText.trim() !== "") {
            groupNum = clean(groupSpan.innerText);
        }
    }

    // FINAL CHECK: Prompt the user if Denticon completely failed to load it
    if (!groupNum || groupNum === "" || groupNum === "N/A") {
        groupNum = prompt("Group ID not detected. Please manually enter the Group # to search:");
    }

    // If the user hits "Cancel" on the prompt
    if (!groupNum) {
        console.warn("Audit cancelled: No Group ID provided.");
        return;
    }

    console.log(`Successfully acquired Group ID: ${groupNum}`);

    // 3. Inject and Trigger Search
    searchInput.value = groupNum;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));



    // 2. Click the Search Button
    let searchClicked = false;
    const potentialButtons = Array.from(document.querySelectorAll('button, a, input[type="button"], div.button'));

    for (let btn of potentialButtons) {
        const text = clean(btn.innerText || btn.value || "").toUpperCase();
        if ((text === "SEARCH" || text.includes("SEARCH")) && !text.includes("BEGINNING")) {
            btn.click();
            searchClicked = true;
            break;
        }
    }

    if (!searchClicked) {
        searchInput.focus();
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, keyCode: 13, key: 'Enter' }));
    }

    // 3. SMART WAIT: Wait for the exact table body to populate
    console.log("Waiting for the 'searchInsurancePlanTableBody' to populate...");
    let retries = 0;
    let planLinks = [];

    while (retries < 6) {
        await sleep(1500);
        planLinks = getPlanLinks();

        if (planLinks.length > 0) {
            console.log(`Success! Found ${planLinks.length} plans to audit.`);
            break;
        }
        retries++;
        console.log(`Scanning table for links... (Attempt ${retries}/6)`);
    }

    if (planLinks.length === 0) {
        alert("Table didn't load automatically.\n\nWORKAROUND: Click SEARCH manually, wait for the table to appear, then click Crawl in the extension.");
        return;
    }

    // 4. THE LOOP: Iterate through every plan found
    const allPlanAudits = [];

    for (let i = 0; i < planLinks.length; i++) {
        console.log(`Auditing Plan ${i + 1} of ${planLinks.length}...`);

        // Re-query the links to avoid Stale Element errors
        const currentLinks = getPlanLinks();
        if (!currentLinks[i]) continue;

        const planId = clean(currentLinks[i].innerText);
        console.log(`Executing precision click on Plan ID: ${planId}`);

        // Native click on the exact anchor tag Denticon is listening to
        currentLinks[i].click();

        await sleep(3500); // Wait for Details Modal to open

        // Scrape Tab 1: PLAN
        const plan = scrapePlanTab();

        // Scrape Tab 2: BEN
        const benTab = findElementByText("BEN");
        if (benTab) {
            benTab.click();
            await sleep(2000);
        }
        const ben = scrapeBenTab();

        // Scrape Tab 3: COVERAGE
        const covTab = findElementByText("COVERAGE AND LIMITATIONS");
        if (covTab) {
            covTab.click();
            await sleep(2000);
        }
        const cov = scrapeCoverageTab();

        allPlanAudits.push({
            ins_plan_id: planId,
            plan_details: plan,
            benefits: ben,
            coverage: cov
        });

        // Close the Details modal to return to the list
        const cancelBtn = document.getElementById('btnCancel') || findElementByText("CANCEL") || findElementByText("CLOSE");
        if (cancelBtn) {
            cancelBtn.click();
            await sleep(2000); // Give the modal time to fully close
        }
    }

    // 5. PACKAGE AND EXPORT
    chrome.storage.local.get("audit_context", (result) => {
        const store = result.audit_context || {};
        store.denticon_data = {
            header: store.denticon_data?.header || {},
            plans: allPlanAudits,
            total_captured: allPlanAudits.length,
            crawled_at: new Date().toISOString()
        };

        chrome.storage.local.set({ "audit_context": store }, () => {
            triggerDownload(store);
            alert(`Deep Scrape Complete! Captured ${allPlanAudits.length} plans.`);
        });
    });
}

// --- 4. BACKGROUND & UTILITY ---

function runBackgroundScrape() {
    if (!chrome.runtime?.id) return;
    const text = document.body.innerText;
    const isHeader = text.includes("Responsible") && text.includes("Balance");
    if (isHeader) {
        chrome.storage.local.get("audit_context", (result) => {
            let store = result.audit_context || {};
            if (!store.denticon_data) store.denticon_data = {};
            store.denticon_data.header = scrapeHeader(text);
            chrome.storage.local.set({ "audit_context": store });
        });
    }
}

// Run atmospheric check every 3 seconds
setInterval(runBackgroundScrape, 3000);

// Listen for popup trigger
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "START_CRAWL") {
        deepCrawlInsurance();
        sendResponse({ status: "Deep Crawl Started" });
    }
});

function triggerDownload(data) {
    const filename = `Denticon_DeepAudit_${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    // AUTO-PURGE: Clear storage after download is triggered
    chrome.storage.local.remove("audit_context", () => {
        console.log("Storage purged for next audit.");
    });
}