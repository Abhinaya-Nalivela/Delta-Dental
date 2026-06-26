document.addEventListener('DOMContentLoaded', async () => {
  const status = document.getElementById('status');
  const btnCrawl = document.getElementById('btnCrawl');
  const btnDownload = document.getElementById('btnDownload');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  const isMetLife = url.includes('metlife.com');
  const isCigna = url.includes('cignaforhcp.cigna.com');
  const isDelta =
    url.includes('deltadental.com') ||
    url.includes('deltadentalins.com') ||
    url.includes('deltadentalco.com');
  const isDenticon = url.includes('denticon.com') || url.includes('planetdds.com');

  const result = await chrome.storage.local.get('audit_context');
  let context = result.audit_context || {};

  if (isMetLife && context.metlife_data) {
    status.innerText = 'MetLife Data: Ready';
  } else if (isCigna && context.cigna_data) {
    status.innerText = 'Cigna Data: Ready';
  } else if (isDelta && context.delta_dental_data) {
    status.innerText = 'Delta Dental Data: Ready';
  } else if (isDenticon && context.denticon_data) {
    status.innerText = `Denticon Ready: ${context.denticon_data.header?.patient_name || 'Active'}`;
  } else {
    status.innerText = 'Waiting for page data...';
  }

  function getActionForCurrentPortal() {
    if (isDelta) return 'SCRAPE_DELTA_DENTAL_ALL';
    if (isMetLife) return 'START_CRAWL';
    if (isCigna) return 'START_CRAWL';
    if (isDenticon) return 'START_CRAWL';
    return null;
  }

  function getStorageKeyForCurrentPortal() {
    if (isDelta) return 'delta_dental_data';
    if (isMetLife) return 'metlife_data';
    if (isCigna) return 'cigna_data';
    if (isDenticon) return 'denticon_data';
    return null;
  }

  btnCrawl.onclick = () => {
    const action = getActionForCurrentPortal();

    if (!action) {
      status.innerText = 'Unsupported page.';
      return;
    }

    status.innerText = 'Scraping in progress...';

    chrome.tabs.sendMessage(tab.id, { action }, async (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Could not connect to content script.', chrome.runtime.lastError.message);
        status.innerText = 'Error: Refresh page and try again.';
        return;
      }

      if (!response?.success) {
        status.innerText = `Error: ${response?.error || 'Scrape failed.'}`;
        return;
      }

      const storageKey = getStorageKeyForCurrentPortal();
      if (!storageKey) {
        status.innerText = 'Error: No storage key found.';
        return;
      }

      context[storageKey] = response.data;
      await chrome.storage.local.set({ audit_context: context });

      if (isDelta) {
        status.innerText = 'Delta Dental Data: Captured';
      } else if (isMetLife) {
        status.innerText = 'MetLife Data: Captured';
      } else if (isCigna) {
        status.innerText = 'Cigna Data: Captured';
      } else if (isDenticon) {
        status.innerText = 'Denticon Data: Captured';
      }

      setTimeout(() => window.close(), 700);
    });
  };

  btnDownload.onclick = () => {
    if (Object.keys(context).length === 0) {
      alert('No data captured yet.');
      return;
    }

    const blob = new Blob([JSON.stringify(context, null, 2)], {
      type: 'application/json'
    });
    const downloadUrl = URL.createObjectURL(blob);

    let patient = 'Patient';
    if (context.metlife_data?.patient?.name) {
      patient = context.metlife_data.patient.name;
    } else if (context.cigna_data?.summary?.patient_name) {
      patient = context.cigna_data.summary.patient_name;
    } else if (context.delta_dental_data?.memberEligibility?.patientName) {
      patient = context.delta_dental_data.memberEligibility.patientName;
    } else if (context.denticon_data?.header?.patient_name) {
      patient = context.denticon_data.header.patient_name;
    }

    const cleanName = patient.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    chrome.downloads.download(
      {
        url: downloadUrl,
        filename: `${cleanName}_audit_${Date.now()}.json`
      },
      (downloadId) => {
        if (downloadId) {
          chrome.storage.local.remove('audit_context', () => {
            status.innerText = 'Success: Data Exported & Cleared';
            setTimeout(() => window.close(), 1000);
          });
        }
      }
    );
  };
});