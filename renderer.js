// Cache for account quota responses
// Structure: { [email]: { loading: boolean, error: string, data: quotaResponse } }
const quotasCache = {};
let accountsList = [];
const expandedCards = new Set(); // Track expanded card emails
let currentSort = 'status'; // Default sort option

// DOM Elements
const accountsGrid = document.getElementById('accounts-grid');
const btnLogin = document.getElementById('btn-login');
const btnRefreshAll = document.getElementById('btn-refresh-all');
const searchInput = document.getElementById('search-input');
const statTotal = document.getElementById('stat-total');
const statCooldown = document.getElementById('stat-cooldown');
const statReady = document.getElementById('stat-ready');

// Custom Dropdown Elements
const sortDropdown = document.getElementById('sort-dropdown');
const sortTrigger = document.getElementById('sort-trigger');
const sortMenu = document.getElementById('sort-menu');
const dropdownItems = document.querySelectorAll('.dropdown-item');

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Format reset time into readable countdown
function getCountdownText(resetTimeString) {
  if (!resetTimeString) return 'N/A';
  const resetTime = new Date(resetTimeString);
  const now = new Date();
  const diffMs = resetTime - now;

  if (diffMs <= 0) {
    return 'Ready';
  }

  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    const hoursPart = diffHours % 24;
    return `in ${diffDays}d ${hoursPart}h`;
  }
  if (diffHours > 0) {
    const minsPart = diffMins % 60;
    return `in ${diffHours}h ${minsPart}m`;
  }
  if (diffMins > 0) {
    const secsPart = diffSecs % 60;
    return `in ${diffMins}m ${secsPart}s`;
  }
  return `in ${diffSecs}s`;
}

// Calculate cooldown status for a specific model group
function checkGroupCooldown(buckets) {
  if (!buckets || buckets.length === 0) return { cooldown: false, reason: '' };

  const weeklyBucket = buckets.find(b => b.window === 'weekly');
  const fiveHourBucket = buckets.find(b => b.window === '5h');

  const weeklyPct = weeklyBucket ? (weeklyBucket.remainingFraction * 100) : 100;
  const fiveHourPct = fiveHourBucket ? (fiveHourBucket.remainingFraction * 100) : 100;

  if (weeklyPct < 5 && fiveHourPct < 5) {
    return { 
      cooldown: true, 
      reason: 'Quota Exhausted', 
      weeklyPct, 
      fiveHourPct,
      resetsAt: fiveHourBucket?.resetTime || weeklyBucket?.resetTime 
    };
  }
  if (weeklyPct < 5) {
    return { 
      cooldown: true, 
      reason: 'Weekly limit < 5%', 
      weeklyPct, 
      fiveHourPct,
      resetsAt: weeklyBucket?.resetTime 
    };
  }
  if (fiveHourPct < 5) {
    return { 
      cooldown: true, 
      reason: '5h limit < 5%', 
      weeklyPct, 
      fiveHourPct,
      resetsAt: fiveHourBucket?.resetTime 
    };
  }

  return { cooldown: false, reason: 'Ready', weeklyPct, fiveHourPct };
}

// Fetch quota for a single account
async function refreshAccountQuota(account) {
  const email = account.email;
  quotasCache[email] = { loading: true, error: null, data: null };
  renderAccountsGrid();
  updateStats();

  try {
    const data = await window.api.fetchQuota(account.refreshToken);
    quotasCache[email] = { loading: false, error: null, data };
  } catch (err) {
    console.error('Error fetching quota for:', email, err);
    quotasCache[email] = { loading: false, error: err.message || 'Refresh failed', data: null };
  }

  renderAccountsGrid();
  updateStats();
}

// Refresh all accounts
async function refreshAllQuotas() {
  showToast('Refreshing all quotas...', 'info');
  const promises = accountsList.map(account => refreshAccountQuota(account));
  await Promise.all(promises);
  showToast('All quotas refreshed!', 'success');
}

// Delete an account
async function deleteAccount(email) {
  if (confirm(`Are you sure you want to delete the account ${email}?`)) {
    try {
      accountsList = await window.api.deleteAccount(email);
      delete quotasCache[email];
      expandedCards.delete(email);
      renderAccountsGrid();
      updateStats();
      showToast('Account deleted', 'success');
    } catch (err) {
      showToast('Failed to delete account', 'error');
    }
  }
}

// Helper to get progress bar class based on percentage
function getBarClass(pct) {
  if (pct < 10) return 'low';
  if (pct < 40) return 'medium';
  return 'high';
}

// Render the grid of accounts
function renderAccountsGrid() {
  const searchVal = searchInput.value.toLowerCase().trim();

  // Filter accounts by search query
  const filteredAccounts = accountsList.filter(a => {
    const name = (a.name || '').toLowerCase();
    const email = (a.email || '').toLowerCase();
    return name.includes(searchVal) || email.includes(searchVal);
  });

  if (filteredAccounts.length === 0) {
    accountsGrid.innerHTML = `
      <div class="no-accounts">
        <h3>NO ACCOUNTS FOUND</h3>
        <p>${accountsList.length === 0 ? 'Click Google Import to add accounts.' : 'Try adjusting your search query.'}</p>
      </div>
    `;
    return;
  }

  // Sort filtered accounts
  const sortedAccounts = [...filteredAccounts];

  sortedAccounts.sort((a, b) => {
    const cacheA = quotasCache[a.email]?.data;
    const cacheB = quotasCache[b.email]?.data;

    // Helper to get remaining fraction safely
    const getFraction = (cache, groupIdx, bucketWindow) => {
      const group = cache?.groups?.[groupIdx];
      const bucket = group?.buckets?.find(b => b.window === bucketWindow);
      return bucket ? bucket.remainingFraction : 1.0;
    };

    if (currentSort === 'name') {
      const nameA = a.name || a.email;
      const nameB = b.name || b.email;
      return nameA.localeCompare(nameB);
    }

    if (currentSort === 'status') {
      const kdA = checkAccountCooldown(a.email).cooldown ? 1 : 0;
      const kdB = checkAccountCooldown(b.email).cooldown ? 1 : 0;
      return kdA - kdB; // Ready first, then Cooldown
    }

    if (currentSort === 'gemini-5h') {
      return getFraction(cacheB, 0, '5h') - getFraction(cacheA, 0, '5h');
    }
    if (currentSort === 'gemini-weekly') {
      return getFraction(cacheB, 0, 'weekly') - getFraction(cacheA, 0, 'weekly');
    }
    if (currentSort === 'claude-5h') {
      return getFraction(cacheB, 1, '5h') - getFraction(cacheA, 1, '5h');
    }
    if (currentSort === 'claude-weekly') {
      return getFraction(cacheB, 1, 'weekly') - getFraction(cacheA, 1, 'weekly');
    }

    return 0;
  });

  accountsGrid.innerHTML = '';

  sortedAccounts.forEach(account => {
    const email = account.email;
    const cache = quotasCache[email] || { loading: false, error: null, data: null };
    const initial = account.name ? account.name[0].toUpperCase() : email[0].toUpperCase();
    const isExpanded = expandedCards.has(email);

    // Create Card Element
    const card = document.createElement('div');
    card.className = `account-card ${cache.loading ? 'card-loading' : ''}`;

    const cooldownInfo = checkAccountCooldown(email);
    const statusClass = cooldownInfo.cooldown ? 'cooldown' : 'ready';
    const statusText = cooldownInfo.cooldown ? 'COOLDOWN' : 'READY';

    let bodyHtml = '';

    if (cache.error) {
      bodyHtml = `
        <div class="card-error-container">
          <strong>ERROR:</strong> ${cache.error}
        </div>
      `;
    } else if (!cache.data && !cache.loading) {
      bodyHtml = `
        <div class="card-unloaded-container">
          <button class="btn btn-secondary btn-load-quota" data-email="${email}">
            [Load Quota]
          </button>
        </div>
      `;
    } else if (cache.data) {
      const groups = cache.data.groups || [];

      // Render summarized statuses (checks / crosses)
      const groupSummaries = groups.map((group, groupIdx) => {
        const buckets = group.buckets || [];
        const groupKd = checkGroupCooldown(buckets);
        const iconClass = groupKd.cooldown ? 'status-no' : 'status-yes';
        const iconChar = groupKd.cooldown ? '✘' : '✔';
        return `
          <div class="model-summary-row">
            <span>${group.displayName.split(' ')[0]}:</span>
            <span class="${iconClass}">${iconChar} ${groupKd.cooldown ? 'Cooldown' : 'Ready'}</span>
          </div>
        `;
      }).join('');

      bodyHtml = `<div class="model-summaries">${groupSummaries}</div>`;

      // Detailed progress bars (Weekly first, 5h second)
      if (isExpanded) {
        const detailsHtml = groups.map((group, groupIdx) => {
          const buckets = group.buckets || [];
          const order = { 'weekly': 1, '5h': 2 };
          const sortedBuckets = [...buckets].sort((a, b) => (order[a.window] || 99) - (order[b.window] || 99));

          const bucketRows = sortedBuckets.map(bucket => {
            const pct = Math.round(bucket.remainingFraction * 100);
            const name = bucket.window === 'weekly' ? 'Weekly Limit' : 
                         bucket.window === '5h' ? '5-Hour Limit' : 
                         `${bucket.window.toUpperCase()} Limit`;
            return `
              <div class="quota-row">
                <div class="quota-header">
                  <span class="quota-name">${name}</span>
                  <span class="quota-value">${pct}%</span>
                </div>
                <div class="quota-bar-container">
                  <div class="quota-bar ${getBarClass(pct)}" style="width: ${pct}%;"></div>
                </div>
                <div class="quota-reset">
                  <span class="countdown-timer" data-reset="${bucket.resetTime || ''}">
                    ${getCountdownText(bucket.resetTime)}
                  </span>
                </div>
              </div>
            `;
          }).join('');

          return `
            <div class="model-details-group">
              <div class="group-detail-title">${group.displayName.toUpperCase()}</div>
              ${bucketRows}
            </div>
          `;
        }).join('');

        bodyHtml += `<div class="expanded-details">${detailsHtml}</div>`;
      }
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="user-profile">
          <div class="avatar">
            ${account.picture ? `<img src="${account.picture}" alt="avatar">` : initial}
          </div>
          <div class="user-details">
            <span class="user-name" title="${account.name}">${account.name.toUpperCase()}</span>
            <span class="user-email" title="${email}">${email}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="status-badge ${statusClass}">${statusText}</span>
          ${cache.data ? `<button class="btn-card-toggle" data-email="${email}">[${isExpanded ? 'Less info' : 'More info'}]</button>` : ''}
        </div>
      </div>
      <div class="card-body">
        ${bodyHtml}
      </div>
      <div class="card-footer">
        <button class="btn btn-secondary btn-card-refresh" data-email="${email}">
          [Refresh]
        </button>
        <button class="btn-card-delete" data-email="${email}" title="Delete Account">
          [Delete]
        </button>
      </div>
    `;

    accountsGrid.appendChild(card);
  });

  // Attach event listeners
  document.querySelectorAll('.btn-card-refresh').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-email');
      const account = accountsList.find(a => a.email === email);
      if (account) refreshAccountQuota(account);
    });
  });

  document.querySelectorAll('.btn-load-quota').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-email');
      const account = accountsList.find(a => a.email === email);
      if (account) refreshAccountQuota(account);
    });
  });

  document.querySelectorAll('.btn-card-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-email');
      deleteAccount(email);
    });
  });

  document.querySelectorAll('.btn-card-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-email');
      if (expandedCards.has(email)) {
        expandedCards.delete(email);
      } else {
        expandedCards.add(email);
      }
      renderAccountsGrid();
    });
  });
}

// Calculate the cooldown state of a given account (checks all groups)
function checkAccountCooldown(email) {
  const cache = quotasCache[email];
  if (!cache || !cache.data) return { cooldown: false };

  const groups = cache.data.groups || [];
  for (let group of groups) {
    const buckets = group.buckets || [];
    const groupKd = checkGroupCooldown(buckets);
    if (groupKd.cooldown) {
      return { cooldown: true, reason: `${group.displayName}: ${groupKd.reason}` };
    }
  }

  return { cooldown: false };
}

// Update top statistics panel
function updateStats() {
  const total = accountsList.length;
  let cooldownCount = 0;
  let readyCount = 0;

  accountsList.forEach(a => {
    const check = checkAccountCooldown(a.email);
    if (check.cooldown) {
      cooldownCount++;
    } else {
      readyCount++;
    }
  });

  statTotal.innerText = total;
  statCooldown.innerText = cooldownCount;
  statReady.innerText = readyCount;
}

// Load accounts list from backend storage on start
async function init() {
  try {
    let currentAccounts = await window.api.getAccounts();
    // Only auto-import on very first run if we have 0 accounts
    if (currentAccounts.length === 0) {
      accountsList = await window.api.autoImportAccounts();
    } else {
      accountsList = currentAccounts;
    }
    renderAccountsGrid();
    updateStats();

    // Auto-fetch quotas for accounts
    accountsList.forEach(account => {
      refreshAccountQuota(account);
    });
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Failed to load accounts', 'error');
  }
}

// Event Listeners for actions
btnLogin.addEventListener('click', async () => {
  showToast('Opening browser for authorization...', 'info');
  try {
    await window.api.startGoogleLogin();
  } catch (err) {
    showToast('Failed to start OAuth login', 'error');
  }
});

btnRefreshAll.addEventListener('click', refreshAllQuotas);
searchInput.addEventListener('input', renderAccountsGrid);

// Custom Dropdown triggers
sortTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  sortMenu.classList.toggle('show');
});

// Dropdown item selection
dropdownItems.forEach(item => {
  item.addEventListener('click', () => {
    dropdownItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentSort = item.getAttribute('data-sort');
    sortTrigger.innerText = item.innerText;
    sortMenu.classList.remove('show');
    renderAccountsGrid();
  });
});

// Close dropdown if clicked outside
document.addEventListener('click', () => {
  sortMenu.classList.remove('show');
});

// Listen for OAuth callbacks in real-time
window.api.onAccountsUpdated((updatedAccounts) => {
  accountsList = updatedAccounts;
  showToast('Account successfully authorized via Google!', 'success');
  renderAccountsGrid();
  updateStats();

  accountsList.forEach(account => {
    if (!quotasCache[account.email]) {
      refreshAccountQuota(account);
    }
  });
});

// Update countdown timers dynamically every second
setInterval(() => {
  document.querySelectorAll('.countdown-timer').forEach(el => {
    const reset = el.getAttribute('data-reset');
    if (reset) {
      el.innerText = getCountdownText(reset);
    }
  });
}, 1000);

// Initialize App
init();
