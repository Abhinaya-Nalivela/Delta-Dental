(function () {

  const ALLOWED_HOSTS = ['deltadentalco.com', 'deltadental.com', 'deltadentalins.com'];

  if (!ALLOWED_HOSTS.some(h => window.location.hostname.includes(h))) return;
 
  const WAIT_MS = 20000;
 
  const PROCEDURE_TARGETS = {

    D0120: 'Periodic Exam',

    D0180: 'Perio Consult',

    D0140: 'Limited Exam',

    D0150: 'Comprehensive Exam',

    D0274: 'Bitewings',

    D0210: 'Full Mouth X-Ray',

    D0330: 'Panoramic X-Ray',

    D0220: 'PA X-Ray',

    D0364: 'Cone Beam',

    D0431: 'Oral Cancer Screening',

    D1110: 'Prophylaxis Adult',

    D1120: 'Prophylaxis Child',

    D1206: 'Fluoride',

    D1351: 'Sealants',

    D1510: 'Space Maintainer',

    D2391: 'Composite Filling',

    D2740: 'Porcelain Crown',

    D2950: 'Build-Up',

    D2962: 'Veneers',

    D6750: 'Bridge',

    D5110: 'Dentures',

    D9110: 'Palliative Treatment',

    D9222: 'General Anesthesia',

    D9230: 'Nitrous Oxide',

    D9243: 'General Sedation / IV Sedation',

    D9310: 'Consultation',

    D9944: 'Occlusal Guard',

    D4341: 'Scaling & Root Planing',

    D4355: 'Full Mouth Debridement',

    D4346: 'Gingivitis Treatment',

    D4910: 'Periodontal Maintenance',

    D4381: 'Arestin',

    D4260: 'Osseous Surgery',

    D4249: 'Crown Lengthening',

    D3310: 'Root Canal Anterior',

    D3330: 'Root Canal Molar',

    D7140: 'Simple Extraction',

    D7210: 'Surgical Extraction',

    D7240: 'Impacted Extraction',

    D7953: 'Bone Graft with Extraction',

    D6010: 'Implant',

    D6056: 'Implant Abutment'

  };
 
  const GENERAL_BENEFIT_CATEGORY_HINTS = {

    preventiveBenefits: ['diagnostic', 'preventive'],

    basicBenefits: ['basic', 'restorative', 'endo', 'perio'],

    majorBenefits: ['major', 'crown', 'prosthodontic', 'bridge', 'denture']

  };
 
  function sleep(ms) {

    return new Promise(resolve => setTimeout(resolve, ms));

  }
 
  function text(v) {

    return (v || '').replace(/\s+/g, ' ').trim();

  }
 
  function q(selector, root = document) {

    try {

      return root?.querySelector?.(selector) || null;

    } catch {

      return null;

    }

  }
 
  function qa(selector, root = document) {

    try {

      return Array.from(root?.querySelectorAll?.(selector) || []);

    } catch {

      return [];

    }

  }
 
  function safeText(selector, root = document) {

    return text(q(selector, root)?.textContent || '');

  }
 
  function chunkArray(items, size) {

    const chunks = [];

    for (let i = 0; i < items.length; i += size) {

      chunks.push(items.slice(i, i + size));

    }

    return chunks;

  }
 
  async function waitUntil(predicate, timeout = WAIT_MS, interval = 150) {

    const started = Date.now();

    while (Date.now() - started < timeout) {

      const value = predicate();

      if (value) return value;

      await sleep(interval);

    }

    return null;

  }
 
  function normalizeKey(key) {

    return text(key)

      .replace(/[:]/g, '')

      .toLowerCase()

      .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());

  }
 
  function parseMoneySummary(raw) {

    const s = text(raw);

    return {

      used: s.match(/Used:\s*\$?([\d,]+(?:\.\d{2})?)/i)?.[1] || null,

      remaining: s.match(/Remaining:\s*\$?([\d,]+(?:\.\d{2})?)/i)?.[1] || null,

      totalAvailable: s.match(/Total Available:\s*\$?([\d,]+(?:\.\d{2})?)/i)?.[1] || null

    };

  }
 
  function getCurrentPathTab() {

    const href = window.location.href;

    if (href.includes('/dental-benefits/')) return 'Dental Benefits';

    if (href.includes('/limitations/')) return 'Limitations';

    if (href.includes('/coverage/')) return 'Coverage';

    return null;

  }
 
  async function waitForContent(selector, timeout = WAIT_MS, root = document) {

    if (q(selector, root)) return true;
 
    return new Promise((resolve, reject) => {

      const observer = new MutationObserver(() => {

        if (q(selector, root)) {

          observer.disconnect();

          resolve(true);

        }

      });
 
      const observeRoot = root === document ? (document.body || document.documentElement) : root;

      if (!observeRoot) {

        reject(new Error(`No root available while waiting for ${selector}`));

        return;

      }
 
      observer.observe(observeRoot, { childList: true, subtree: true });
 
      setTimeout(() => {

        observer.disconnect();

        reject(new Error(`Timeout waiting for ${selector}`));

      }, timeout);

    });

  }
 
  function scrapePatientInfo(root = document) {

    const name = safeText('mat-card-content .header h1', root) || safeText('.header h1', root);

    const urlMatch = window.location.pathname.match(

      /(?:dental-benefits|limitations|coverage)\/([^/]+)/

    );
 
    return {

      patientName: name || null,

      subscriberIdFromUrl: urlMatch?.[1] || null,

      pageTitle: document.title || null

    };

  }
 
  function getPatientRoot() {

    const patientInfo = scrapePatientInfo(document);

    const patientName = patientInfo?.patientName;

    const candidates = qa('mat-card, .mat-mdc-card, .patient-card, .member-card, .content-container, section, div');
 
    const scored = candidates

      .map(el => {

        const t = text(el.textContent || '');

        let score = 0;

        if (patientName && t.includes(patientName)) score += 5;

        if (t.includes('Dental Benefits')) score += 2;

        if (t.includes('Limitations')) score += 2;

        if (t.includes('Coverage')) score += 2;

        if (q('ks-patient-dental-benefits, ks-patient-limitations, ks-patient-coverage', el)) score += 4;

        return { el, score };

      })

      .filter(x => x.score >= 6)

      .sort((a, b) => b.score - a.score);
 
    return scored[0]?.el || document;

  }
 
  async function clickMainTab(tabName, root = document) {

    const candidates = qa('a, button, [role="tab"], .mdc-tab', root);

    const target = candidates.find(el => text(el.textContent).toLowerCase() === tabName.toLowerCase());

    if (!target) return false;

    target.click();

    await sleep(1500);

    return true;

  }
 
  async function clickCoverageSubTab(tabName, root) {

    const candidates = qa('[role="tab"], .mdc-tab', root);

    const target = candidates.find(el => text(el.textContent).toLowerCase() === tabName.toLowerCase());

    if (!target) return false;

    target.click();

    await sleep(1200);

    return true;

  }
 
  function findButtonByText(label, root = document) {

    const needle = label.toLowerCase();

    return qa('button, input[type="button"], input[type="submit"]', root).find(el => {

      const buttonText = text(el.textContent || el.value || '');

      return buttonText.toLowerCase() === needle;

    }) || null;

  }
 
  function clickElement(el) {

    if (!el) return false;

    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));

    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));

    el.click();

    return true;

  }
 
  function setNativeInputValue(el, value) {

    const proto = Object.getPrototypeOf(el);

    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (setter) {

      setter.call(el, value);

    } else {

      el.value = value;

    }

  }
 
  function dispatchInput(el, value) {

    el.focus();

    setNativeInputValue(el, value);

    el.dispatchEvent(new Event('input', { bubbles: true }));

    el.dispatchEvent(new Event('change', { bubbles: true }));

  }
 
  function isProviderPlaceholder(value) {

    return !value || /^select\s+provider$/i.test(text(value));

  }
 
  function hasLoadingSpinner(scope) {

    return !!(

      q('mat-spinner, mat-progress-spinner, .mat-spinner, .mat-progress-spinner, [role="progressbar"]', scope || document) ||

      q('.loading, .spinner, .progress', scope || document)

    );

  }
 
  function findProviderCombobox(scope) {

    // Locate the label element whose text starts with "PROVIDER" (case-insensitive),

    // then find the nearest Material combobox relative to it.

    const allEls = Array.from(scope.querySelectorAll('*'));
 
    const providerLabel = allEls.find(el => {

      // Only consider leaf-ish nodes to avoid matching giant containers

      if (el.children.length > 3) return false;

      return /provider/i.test(text(el.textContent));

    });
 
    if (providerLabel) {

      // Walk up to find a container that holds a combobox

      let node = providerLabel;

      for (let i = 0; i < 5; i++) {

        if (!node) break;

        const combo =

          q('[role="combobox"]', node) ||

          q('mat-select', node) ||

          q('.mat-mdc-select', node);

        if (combo) return combo;

        node = node.parentElement;

      }

    }
 
    // Fallback: first combobox / mat-select in scope that is not date/name-related

    const combos = qa('[role="combobox"], mat-select, .mat-mdc-select', scope);

    return combos.find(el => {

      const t = text(el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();

      return !t.includes('date') && !t.includes('name');

    }) || combos[0] || null;

  }
 
  async function doSelectCoverageProvider(scope) {

    const combobox = findProviderCombobox(scope);

    if (!combobox) {

      console.log('[provider] No provider combobox found in scope');

      return null;

    }
 
    console.log('[provider] Opening provider dropdown');

    clickElement(q('.mat-mdc-select-trigger', combobox) || combobox);
 
    // Wait for options to appear

    const option = await waitUntil(() => {

      const options = qa('mat-option, .mat-mdc-option, [role="option"]', document);

      return options.find(opt => {

        const t = text(opt.textContent);

        return t && !isProviderPlaceholder(t) && !opt.hasAttribute('aria-disabled');

      });

    }, 5000);
 
    if (!option) {

      console.log('[provider] No selectable options appeared');

      return null;

    }
 
    option.scrollIntoView({ block: 'center' });

    clickElement(option);
 
    // Wait until: dropdown closes + options gone + value updates + no spinner

    const verified = await waitUntil(() => {

      const optionsStillOpen = qa('mat-option, .mat-mdc-option, [role="option"]', document).length > 0;

      if (optionsStillOpen) return false;

      const value = safeText('[id^="mat-select-value-"]', scope) || safeText('.mat-mdc-select-value', scope);

      if (isProviderPlaceholder(value)) return false;

      if (hasLoadingSpinner(scope)) return false;

      return value;

    }, 10000);
 
    if (!verified) {

      console.log('[provider] Provider value did not update after selection');

      return null;

    }
 
    const selectedProvider = safeText('[id^="mat-select-value-"]', scope) || safeText('.mat-mdc-select-value', scope);

    console.log('[provider] Provider selected:', selectedProvider);

    return selectedProvider;

  }
 
  async function selectCoverageProvider(scope) {

    const currentProvider = safeText('[id^="mat-select-value-"]', scope) || safeText('.mat-mdc-select-value', scope);

    if (!isProviderPlaceholder(currentProvider)) {

      console.log('[provider] Already selected:', currentProvider);

      return currentProvider;

    }
 
    console.log('[provider] Attempting provider selection (attempt 1)');

    let result = await doSelectCoverageProvider(scope);
 
    if (!result || isProviderPlaceholder(result)) {

      console.log('[provider] First attempt failed, retrying');

      await sleep(1000);

      result = await doSelectCoverageProvider(scope);

    }
 
    if (!result || isProviderPlaceholder(result)) {

      console.log('[provider] Provider selection failed after retry');

      return null;

    }
 
    console.log('[provider] Provider verified:', result);

    return result;

  }
 
  async function clearCoverageCodeSearch(scope) {

    const clearButton = findButtonByText('Clear', scope);

    if (clearButton) {

      clearButton.click();

      await sleep(800);

      return true;

    }
 
    qa('mat-chip button, mat-chip .mat-mdc-chip-remove, .mat-mdc-chip button', scope).forEach(button => button.click());

    const input = findCoverageCodeInput(scope);

    if (input) dispatchInput(input, '');

    await sleep(500);

    return false;

  }
 
  function findCoverageCodeInput(scope) {

    // 1. Exact known selectors

    const exact = q('#mat-mdc-chip-list-input-1, .cust-chips input.mat-mdc-chip-input, .cust-chips input.mat-chip-input', scope);

    if (exact && !exact.disabled) return exact;
 
    // 2. Find an element whose text contains "code" (case-insensitive) and grab input inside/near it

    const allEls = Array.from(scope.querySelectorAll('*'));

    const codeLabel = allEls.find(el => {

      if (el.children.length > 5) return false;

      return /code/i.test(text(el.textContent));

    });
 
    if (codeLabel) {

      let node = codeLabel;

      for (let i = 0; i < 5; i++) {

        if (!node) break;

        const inp = q('input', node);

        if (inp && !inp.disabled && inp.type !== 'hidden') return inp;

        node = node.parentElement;

      }

    }
 
    // 3. Input inside a chip container

    const chipContainer = q('mat-chip-grid, mat-chip-list, .mat-mdc-chip-set, .mat-chip-list', scope);

    if (chipContainer) {

      const inp = q('input', chipContainer);

      if (inp && !inp.disabled) return inp;

    }
 
    // 4. Any non-hidden, non-disabled input that is not date/provider

    const inputs = qa('input', scope).filter(el => {

      const descriptor = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.id || ''} ${el.name || ''}`.toLowerCase();

      return !el.disabled && el.type !== 'hidden' && !descriptor.includes('date') && !descriptor.includes('provider');

    });
 
    const byDescriptor = inputs.find(el => {

      const descriptor = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.id || ''} ${el.name || ''}`.toLowerCase();

      return descriptor.includes('code');

    });

    if (byDescriptor) return byDescriptor;
 
    // 5. Input inside a chip-related ancestor

    const byChipAncestor = inputs.find(el =>

      el.closest('mat-chip-grid, mat-chip-list, .mat-mdc-chip-set, .mat-chip-list')

    );

    if (byChipAncestor) return byChipAncestor;
 
    return null;

  }
 
  function getVisibleCoverageCodes(scope) {

    return qa('.cust-chips mat-chip, .cust-chips .mat-mdc-chip, .cust-chips .mat-chip, mat-chip, .mat-mdc-chip, .mat-chip', scope)

      .map(el => text(el.textContent).match(/\bD\d{4}\b/i)?.[0]?.toUpperCase())

      .filter(Boolean);

  }
 
  function dispatchKeyboard(el, type, key, code, keyCode) {

    el.dispatchEvent(new KeyboardEvent(type, {

      key,

      code,

      keyCode,

      which: keyCode,

      bubbles: true,

      cancelable: true

    }));

  }
 
  function dispatchSeparatorKey(input, key, code, keyCode) {

    dispatchKeyboard(input, 'keydown', key, code, keyCode);

    dispatchKeyboard(input, 'keypress', key, code, keyCode);

    dispatchKeyboard(input, 'keyup', key, code, keyCode);

    input.dispatchEvent(new Event('change', { bubbles: true }));

  }
 
  async function commitCoverageCode(input, code, scope) {

    // Type the code value

    input.focus();

    dispatchInput(input, code);

    await sleep(100);
 
    // Try Enter

    dispatchSeparatorKey(input, 'Enter', 'Enter', 13);

    await sleep(300);

    if (getVisibleCoverageCodes(scope).includes(code)) return true;
 
    // Try Space

    dispatchInput(input, code);

    await sleep(100);

    dispatchSeparatorKey(input, ' ', 'Space', 32);

    await sleep(300);

    if (getVisibleCoverageCodes(scope).includes(code)) return true;
 
    // Try Comma

    dispatchInput(input, code);

    await sleep(100);

    dispatchSeparatorKey(input, ',', 'Comma', 188);

    await sleep(300);

    if (getVisibleCoverageCodes(scope).includes(code)) return true;
 
    // Try blur

    dispatchInput(input, code);

    await sleep(100);

    input.blur();

    await sleep(400);

    if (getVisibleCoverageCodes(scope).includes(code)) return true;
 
    return false;

  }
 
  async function typeCoverageProcedureCodes(scope, codes) {

    const input = findCoverageCodeInput(scope);

    if (!input) {

      console.log('[chips] No code input found');

      return false;

    }
 
    for (const code of codes) {

      console.log('[chips] Typing', code);
 
      let created = await commitCoverageCode(input, code, scope);
 
      if (!created) {

        // Retry once

        console.log('[chips] Chip not created for', code, '— retrying');

        await sleep(300);

        created = await commitCoverageCode(input, code, scope);

      }
 
      if (!created) {

        // Final wait in case Angular is slow

        const waited = await waitUntil(() => getVisibleCoverageCodes(scope).includes(code), 2000);

        created = !!waited;

      }
 
      if (created) {

        console.log('[chips] Chip added:', code);

      } else {

        console.log('[chips] Chip failed:', code);

        return false;

      }

    }
 
    const visibleCodes = getVisibleCoverageCodes(scope);

    return codes.every(code => visibleCodes.includes(code));

  }
 
  async function searchCoverageCodes(scope) {

    const searchButton = await waitUntil(() => {

      const button = findButtonByText('Search', scope);

      return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' ? button : null;

    }, 8000);
 
    if (!searchButton) {

      console.log('[search] Search button not found or disabled');

      return false;

    }
 
    // Record current row count so we can detect a change

    const rowsBefore = qa('table tbody tr', scope).length;
 
    await sleep(300);

    console.log('[search] Search clicked (rows before:', rowsBefore, ')');

    clickElement(searchButton);
 
    // Wait for: spinner gone AND (row count changed OR rows exist)

    const settled = await waitUntil(() => {

      if (hasLoadingSpinner(scope)) return false;

      const rowsNow = qa('table tbody tr', scope).length;

      return rowsNow !== rowsBefore || rowsNow > 0 ? true : false;

    }, 12000);
 
    if (!settled) {

      console.log('[search] Timed out waiting for results after Search');

    }
 
    await sleep(500);

    const rowsAfter = qa('table tbody tr', scope).length;

    console.log('[search] Waiting for results — rows after:', rowsAfter);

    return true;

  }
 
  function scrapePolicyInfo(root = document) {

    const info = {};

    qa('.policy-info .table-info--row', root).forEach(row => {

      const label = text(row.querySelector('.table-info--label')?.textContent || '');

      const value = text(row.querySelector('.table-info--value')?.textContent || '');

      if (label) info[normalizeKey(label)] = value || null;

    });

    return info;

  }
 
  function scrapeCleanings(root = document) {

    const c = q('.cleanings-container', root);

    if (!c) return null;
 
    const topText = qa(':scope > span, :scope > div', c)

      .map(el => text(el.textContent))

      .filter(Boolean);
 
    return {

      label: topText[0] || null,

      remaining: text(c.querySelector('.circle')?.textContent || '') || null,

      nextAvailable: text(c.querySelector('.date')?.textContent || '') || null

    };

  }
 
  function scrapeBenefits(root = document) {

    return qa('.benefits-indicator', root).map(el => {

      const title = text(el.querySelector('span:first-child')?.textContent || '');

      const left = text(el.querySelector('.benefits-info.left')?.textContent || '');

      const right = text(el.querySelector('.benefits-info.right')?.textContent || '');

      const parsed = parseMoneySummary(`${left} ${right}`);
 
      return {

        title: title || null,

        used: parsed.used,

        remaining: parsed.remaining,

        totalAvailable: parsed.totalAvailable,

        leftText: left || null,

        rightText: right || null

      };

    }).filter(Boolean);

  }
 
  function scrapeProceduresTable(root = document) {

    const scope = q('ks-common-procedures', root) || root;

    return qa('table tbody tr', scope).map(row => {

      const cols = row.querySelectorAll('td');

      if (!cols.length) return null;

      return {

        additionalLimits: !!cols[1]?.querySelector('.addition-limit-req'),

        type: text(cols[2]?.textContent || '') || null,

        howMany: text(cols[3]?.textContent || '') || null,

        ageLimit: text(cols[4]?.textContent || '') || null,

        nextAvailable: text(cols[5]?.textContent || '') || null,

        remaining: text(cols[6]?.textContent || '') || null

      };

    }).filter(r => r && r.type);

  }
 
  function scrapeDentalBenefitsTab(root = document) {

    const scope = q('ks-patient-dental-benefits', root);

    if (!scope) return { error: 'Dental Benefits tab not found' };
 
    return {

      benefitPeriod: safeText('.dental-benefits > div h3', scope) || null,

      policyInfo: scrapePolicyInfo(scope),

      cleanings: scrapeCleanings(scope),

      benefits: scrapeBenefits(scope),

      commonProcedures: scrapeProceduresTable(scope),

      maximumsApplyText: safeText('.max-apply-text', scope) || null,

      fullBenefitsLinkText: safeText('.tooltip-text a', scope) || null,

      frequenciesAndLimitsLinkText: safeText('.procedures ks-link-with-icon .link-copy', scope) || null

    };

  }
 
  function scrapeLimitationsTab(root = document) {

    const scope = q('ks-patient-limitations', root);

    if (!scope) return { error: 'Limitations tab not found' };
 
    return {

      note: safeText('.additional-info', scope) || null,

      procedures: scrapeProceduresTable(scope)

    };

  }
 
  function extractCoverageRows(scope, networkName) {

    return qa('table tbody tr', scope).map(row => {

      const cols = row.querySelectorAll('td');

      if (cols.length < 6) return null;

      return {

        network: networkName,

        benefitClass: text(cols[1]?.textContent || '') || null,

        coveragePercentage: text(cols[2]?.textContent || '') || null,

        deductibleWaived: text(cols[3]?.textContent || '') || null,

        waitingPeriod: text(cols[4]?.textContent || '') || null,

        eligibleForBenefitClass: text(cols[5]?.textContent || '') || null

      };

    }).filter(Boolean);

  }
 
  function extractCoverageDetailValue(raw, label, labels) {

    const normalized = text(raw).replace(/[’]/g, "'");

    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");

    const otherLabels = labels

      .filter(item => item !== label)

      .map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]"))

      .join('|');

    const regex = new RegExp(`${escapedLabel}\\s*([\\s\\S]*?)(?=${otherLabels ? `\\s+(?:${otherLabels})\\s+` : '$'}|$)`, 'i');

    return text(normalized.match(regex)?.[1] || '') || null;

  }
 
  function parseCoverageProcedureDetail(raw, code, networkName) {

    const labels = [

      'Benefit Class',

      'Age Limit',

      'Member Frequency Limitation',

      'Copay',

      "Member's Copay",

      'Deductible Waived',

      'Eligibility Class',

      'Benefit Note',

      'History'

    ];

    const title = text(raw.match(new RegExp(`${code}\\s*-\\s*([^\\n]+?)(?=\\s+Benefit Class|$)`, 'i'))?.[0] || '');
 
    return {

      code,

      network: networkName,

      title: title || null,

      benefitClass: extractCoverageDetailValue(raw, 'Benefit Class', labels),

      ageLimit: extractCoverageDetailValue(raw, 'Age Limit', labels),

      memberFrequencyLimitation: extractCoverageDetailValue(raw, 'Member Frequency Limitation', labels),

      copay: extractCoverageDetailValue(raw, 'Copay', labels),

      memberCopay: extractCoverageDetailValue(raw, "Member's Copay", labels),

      deductibleWaived: extractCoverageDetailValue(raw, 'Deductible Waived', labels),

      eligibilityClass: extractCoverageDetailValue(raw, 'Eligibility Class', labels),

      benefitNote: extractCoverageDetailValue(raw, 'Benefit Note', labels)

    };

  }
 
  function getCoverageDetailContainer(scope, code) {

    const header = qa('mat-expansion-panel-header, .mat-expansion-panel-header, button, [role="button"]', scope)

      .find(el => text(el.textContent || '').includes(code));

    const panel = header?.closest?.('mat-expansion-panel, .mat-expansion-panel');

    if (panel && /Benefit Class|Copay|Deductible Waived|Eligibility Class/i.test(text(panel.textContent || ''))) {

      return panel;

    }
 
    return qa('mat-expansion-panel, .mat-expansion-panel, mat-accordion > *, .mat-accordion > *, [role="region"], tr, div', scope)

      .filter(el => {

        const t = text(el.textContent || '');

        return t.includes(code) && /Benefit Class|Copay|Deductible Waived|Eligibility Class/i.test(t);

      })

      .sort((a, b) => text(a.textContent || '').length - text(b.textContent || '').length)[0] || null;

  }
 
  async function expandCoverageProcedureDetails(scope, codes) {

    const triggers = qa('mat-expansion-panel-header, .mat-expansion-panel-header, button, [role="button"]', scope)

      .filter(el => {

        const t = text(el.textContent || '');

        return codes.some(code => t.includes(code));

      });
 
    for (const trigger of triggers) {

      const expanded = trigger.getAttribute('aria-expanded');

      if (expanded !== 'true') {

        trigger.click();

        await sleep(250);

      }

    }

  }
 
  async function scrapeCoverageProcedureDetails(scope, codes, networkName) {

    await expandCoverageProcedureDetails(scope, codes);
 
    return codes.map(code => {

      const container = getCoverageDetailContainer(scope, code);

      if (!container) {

        return {

          code,

          network: networkName,

          error: 'Procedure detail not found'

        };

      }
 
      return parseCoverageProcedureDetail(container.textContent || '', code, networkName);

    });

  }
 
  async function scrapeCoverageTab(root = document) {

    const scope = q('ks-patient-coverage', root);

    if (!scope) return { error: 'Coverage tab not found' };
 
    const result = {

      providerSelection: null,

      helpText: safeText('.info-block .message', scope) || null,

      alertText: safeText('.copy-container', scope) || null,

      networks: [],

      procedureSearchBatches: [],

      procedureDetails: []

    };
 
    result.providerSelection = await selectCoverageProvider(scope);
 
    const clicked = await clickCoverageSubTab('PPO', scope);

    if (clicked) {

      const activePanel = q('.mat-mdc-tab-body-active', scope) || q('mat-tab-body.mat-mdc-tab-body-active', scope) || scope;

      const rows = extractCoverageRows(activePanel, 'PPO');

      result.networks.push({ network: 'PPO', rows });

    }
 
    if (!result.networks.length) {

      const fallbackRows = extractCoverageRows(scope, 'PPO');

      result.networks.push({ network: 'PPO', rows: fallbackRows });

    }
 
    const procedureCodes = Object.keys(PROCEDURE_TARGETS);

    const batches = chunkArray(procedureCodes, 5);

    for (const batch of batches) {

      console.log('--------------------------------');

      console.log('[batch] Searching batch:', batch);
 
      await clearCoverageCodeSearch(scope);
 
      // Type codes — retry once if chip creation fails

      let typed = await typeCoverageProcedureCodes(scope, batch);

      if (!typed) {

        console.log('[batch] Chip entry failed, retrying after clear');

        await clearCoverageCodeSearch(scope);

        await sleep(500);

        typed = await typeCoverageProcedureCodes(scope, batch);

      }

      console.log('[batch] Typed:', typed);
 
      const visibleCodes = getVisibleCoverageCodes(scope);

      const hasProvider = !isProviderPlaceholder(safeText('[id^="mat-select-value-"]', scope) || result.providerSelection);
 
      let searched = false;

      if (typed && hasProvider) {

        searched = await searchCoverageCodes(scope);

        // Retry search if rows came back empty

        if (searched) {

          await clickCoverageSubTab('PPO', scope);

          const checkPanel = q('.mat-mdc-tab-body-active', scope) || q('mat-tab-body.mat-mdc-tab-body-active', scope) || scope;

          const checkRows = extractCoverageRows(checkPanel, 'PPO');

          if (checkRows.length === 0) {

            console.log('[batch] Search returned zero rows, retrying search');

            await sleep(500);

            searched = await searchCoverageCodes(scope);

          }

        }

      } else {

        if (!typed) console.log('[batch] Skipping search — chip entry failed');

        if (!hasProvider) console.log('[batch] Skipping search — no provider selected');

      }

      console.log('[batch] Searched:', searched);
 
      await clickCoverageSubTab('PPO', scope);
 
      const activePanel = q('.mat-mdc-tab-body-active', scope) || q('mat-tab-body.mat-mdc-tab-body-active', scope) || scope;

      const rows = extractCoverageRows(activePanel, 'PPO');

      console.log('[batch] Rows found:', rows.length);

      console.log('[batch] Visible codes:', getVisibleCoverageCodes(scope));
 
      const procedureDetails = searched ? await scrapeCoverageProcedureDetails(scope, batch, 'PPO') : [];

      console.log('[batch] Procedure details:', procedureDetails.length);

      console.log('[batch] Batch completed:', batch);
 
      result.procedureSearchBatches.push({

        codes: batch,

        providerSelection: safeText('[id^="mat-select-value-"]', scope) || result.providerSelection,

        typed,

        visibleCodes,

        hasProvider,

        searched,

        network: 'PPO',

        rows,

        procedureDetails

      });

      result.procedureDetails.push(...procedureDetails);

    }
 
    return result;

  }
 
  function deriveCoverageAndMaximums(dentalBenefits, coverage) {

    const indicators = dentalBenefits?.benefits || [];

    const findIndicator = parts => indicators.find(item => parts.every(p => (item.title || '').toLowerCase().includes(p.toLowerCase())));

    const individualAnnualDed = findIndicator(['individual', 'annual', 'deductible']);

    const familyAnnualDed = findIndicator(['family', 'annual', 'deductible']);

    const ortho = findIndicator(['orthodontic']);
 
    const generalBenefitCategories = { preventiveBenefits: null, basicBenefits: null, majorBenefits: null };

    (coverage?.networks || []).forEach(net => {

      (net.rows || []).forEach(row => {

        const t = (row.benefitClass || '').toLowerCase();

        Object.entries(GENERAL_BENEFIT_CATEGORY_HINTS).forEach(([key, hints]) => {

          if (!generalBenefitCategories[key] && hints.some(h => t.includes(h))) {

            generalBenefitCategories[key] = {

              network: net.network,

              benefitClass: row.benefitClass,

              coveragePercentage: row.coveragePercentage

            };

          }

        });

      });

    });
 
    return {

      yearlyMaximum: null,

      yearlyMaximumRemaining: null,

      individualDeductiblePaidToDate: individualAnnualDed?.used || null,

      individualDeductibleRemaining: individualAnnualDed?.remaining || null,

      familyDeductible: familyAnnualDed?.totalAvailable || null,

      familyDeductiblePaidToDate: familyAnnualDed?.used || null,

      familyDeductibleRemaining: familyAnnualDed?.remaining || null,

      deductibleAppliesToPreventive: null,

      deductibleAppliesToDiagnostic: null,

      orthodonticDeductible: null,

      orthodonticDeductiblePaidToDate: null,

      orthodonticMaximum: ortho?.totalAvailable || null,

      orthodonticMaximumPaidToDate: ortho?.used || null,

      generalBenefitCategories

    };

  }
 
  function buildProcedureMap(limitations, coverage) {

    const out = {};

    Object.entries(PROCEDURE_TARGETS).forEach(([code, label]) => {

      const limitation = (limitations?.procedures || []).find(row =>

        (row.type || '').toLowerCase().includes(label.toLowerCase()) ||

        (row.type || '').toLowerCase().includes(code.toLowerCase())

      );
 
      const coverageMatches = [];

      (coverage?.procedureDetails || []).forEach(detail => {

        if (detail.code === code && !detail.error) {

          coverageMatches.push({

            network: detail.network,

            benefitClass: detail.benefitClass,

            coveragePercentage: detail.copay,

            deductible: detail.deductibleWaived,

            coverageDetails: detail.eligibilityClass,

            waitingPeriod: detail.eligibilityClass,

            ageLimit: detail.ageLimit,

            memberFrequencyLimitation: detail.memberFrequencyLimitation,

            memberCopay: detail.memberCopay,

            benefitNote: detail.benefitNote,

            title: detail.title

          });

        }

      });
      (coverage?.networks || []).forEach(net => {

        (net.rows || []).forEach(row => {

          const hay = `${row.benefitClass || ''}`.toLowerCase();

          if (hay.includes(code.toLowerCase()) || hay.includes(label.toLowerCase())) {

            coverageMatches.push({

              network: net.network,

              benefitClass: row.benefitClass,

              coveragePercentage: row.coveragePercentage,

              deductible: row.deductibleWaived,

              coverageDetails: row.eligibleForBenefitClass,

              waitingPeriod: row.waitingPeriod

            });

          }

        });

      });
 
      out[code] = {

        label,

        frequency: coverageMatches[0]?.memberFrequencyLimitation || limitation?.howMany || null,

        coveragePercentage: coverageMatches[0]?.coveragePercentage || null,

        deductible: coverageMatches[0]?.deductible || null,

        coverageDetails: coverageMatches,

        ageLimit: coverageMatches[0]?.ageLimit || limitation?.ageLimit || null,

        nextAvailable: limitation?.nextAvailable || null,

        remaining: limitation?.remaining || null,

        history: []

      };

    });

    return out;

  }
 
  async function scrapeAllTabs() {

    const warnings = [];

    await waitForContent('body', WAIT_MS);
 
    const patientRoot = getPatientRoot();

    if (!patientRoot) {

      throw new Error('Patient container not found');

    }
 
    const patientInfo = scrapePatientInfo(patientRoot);

    const result = {

      pageUrl: window.location.href,

      scrapedAt: new Date().toISOString(),

      startedFromTab: getCurrentPathTab(),

      patientInfo,

      dentalBenefits: null,

      limitations: null,

      coverage: null,

      coverageAndMaximums: null,

      orthodontics: null,

      completePlanProvisionsInfo: null,

      procedures: {},

      extractionMeta: {

        warnings,

        hostname: window.location.hostname,

        title: document.title

      }

    };
 
    const tabs = [

      { name: 'Dental Benefits', key: 'dentalBenefits', selector: 'ks-patient-dental-benefits', scrape: scrapeDentalBenefitsTab },

      { name: 'Limitations', key: 'limitations', selector: 'ks-patient-limitations', scrape: scrapeLimitationsTab },

      { name: 'Coverage', key: 'coverage', selector: 'ks-patient-coverage', scrape: scrapeCoverageTab }

    ];
 
    for (const tab of tabs) {

      const clicked = await clickMainTab(tab.name, patientRoot);

      if (!clicked) {

        warnings.push(`Could not click patient tab: ${tab.name}`);

        result[tab.key] = { error: `${tab.name} tab not clickable in patient panel` };

        continue;

      }
 
      try {

        await waitForContent(tab.selector, WAIT_MS, patientRoot);

      } catch (err) {

        warnings.push(`Timed out waiting for ${tab.name}: ${err.message}`);

      }
 
      try {

        result[tab.key] = await tab.scrape(patientRoot);

      } catch (err) {

        result[tab.key] = { error: err.message };

        warnings.push(`Failed scraping ${tab.name}: ${err.message}`);

      }

    }
 
    result.coverageAndMaximums = deriveCoverageAndMaximums(result.dentalBenefits, result.coverage);

    result.orthodontics = {

      orthodonticDeductible: result.coverageAndMaximums.orthodonticDeductible,

      orthodonticDeductiblePaidToDate: result.coverageAndMaximums.orthodonticDeductiblePaidToDate,

      orthodonticMaximum: result.coverageAndMaximums.orthodonticMaximum,

      orthodonticMaximumPaidToDate: result.coverageAndMaximums.orthodonticMaximumPaidToDate

    };

    result.completePlanProvisionsInfo = result.dentalBenefits?.fullBenefitsLinkText || null;

    result.procedures = buildProcedureMap(result.limitations, result.coverage);

    return result;

  }
 
  async function scrapeVisibleOnly() {

    const patientRoot = getPatientRoot();

    return {

      pageUrl: window.location.href,

      scrapedAt: new Date().toISOString(),

      activeTab: getCurrentPathTab(),

      patientInfo: scrapePatientInfo(patientRoot),

      dentalBenefits: scrapeDentalBenefitsTab(patientRoot),

      limitations: scrapeLimitationsTab(patientRoot),

      coverage: await scrapeCoverageTab(patientRoot)

    };

  }
 
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === 'scrape_deltaco' || request.action === 'SCRAPE_DELTA_DENTAL_ALL') {

      scrapeAllTabs()

        .then(data => sendResponse({ success: true, data }))

        .catch(err => sendResponse({ success: false, error: err.message }));

      return true;

    }
 
    if (request.action === 'SCRAPE_DELTA_DENTAL_VISIBLE') {

      Promise.resolve(scrapeVisibleOnly())

        .then(data => sendResponse({ success: true, data }))

        .catch(err => sendResponse({ success: false, error: err.message }));

      return true;

    }
 
    if (request.action === 'GET_DELTA_CONTEXT') {

      const patientRoot = getPatientRoot();

      sendResponse({

        success: true,

        data: {

          url: window.location.href,

          title: document.title,

          hostname: window.location.hostname,

          currentTab: getCurrentPathTab(),

          hasDentalBenefits: !!q('ks-patient-dental-benefits', patientRoot),

          hasLimitations: !!q('ks-patient-limitations', patientRoot),

          hasCoverage: !!q('ks-patient-coverage', patientRoot)

        }

      });

      return false;

    }

  });
 
  window.__deltaDentalScraper = {

    getPatientRoot,

    scrapeAllTabs,

    scrapeVisibleOnly,

    scrapeDentalBenefitsTab,

    scrapeLimitationsTab,

    scrapeCoverageTab

  };

})();
 