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

  function dispatchInput(el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function selectCoverageProvider(scope) {
    const currentProvider = safeText('[id^="mat-select-value-"]', scope) || safeText('.mat-mdc-select-value', scope);
    if (currentProvider) return currentProvider;

    const providerSelect = q('mat-select, .mat-mdc-select, [role="combobox"]', scope);
    if (!providerSelect) return null;

    providerSelect.click();
    await sleep(800);

    const option = qa('mat-option, .mat-mdc-option, [role="option"]', document)
      .find(el => !el.hasAttribute('aria-disabled') && text(el.textContent));
    if (!option) return currentProvider || null;

    option.click();
    await sleep(1200);
    return safeText('[id^="mat-select-value-"]', scope) || safeText('.mat-mdc-select-value', scope) || text(option.textContent);
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
    const inputs = qa('input', scope).filter(el => {
      const descriptor = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.id || ''} ${el.name || ''}`.toLowerCase();
      return !el.disabled && el.type !== 'hidden' && !descriptor.includes('date') && !descriptor.includes('provider');
    });

    return inputs.find(el => {
      const descriptor = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.id || ''} ${el.name || ''}`.toLowerCase();
      return descriptor.includes('code') || el.closest('mat-chip-grid, mat-chip-list, .mat-mdc-chip-set, .mat-chip-list');
    }) || inputs[0] || null;
  }

  async function typeCoverageProcedureCodes(scope, codes) {
    const input = findCoverageCodeInput(scope);
    if (!input) return false;

    for (const code of codes) {
      dispatchInput(input, code);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
      await sleep(250);
    }

    return true;
  }

  async function searchCoverageCodes(scope) {
    const searchButton = findButtonByText('Search', scope);
    if (!searchButton) return false;
    searchButton.click();
    await sleep(1800);
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
      await clearCoverageCodeSearch(scope);
      const typed = await typeCoverageProcedureCodes(scope, batch);
      const searched = typed ? await searchCoverageCodes(scope) : false;
      await clickCoverageSubTab('PPO', scope);

      const activePanel = q('.mat-mdc-tab-body-active', scope) || q('mat-tab-body.mat-mdc-tab-body-active', scope) || scope;
      const rows = extractCoverageRows(activePanel, 'PPO');
      const procedureDetails = searched ? await scrapeCoverageProcedureDetails(scope, batch, 'PPO') : [];

      result.procedureSearchBatches.push({
        codes: batch,
        providerSelection: safeText('[id^="mat-select-value-"]', scope) || result.providerSelection,
        typed,
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
