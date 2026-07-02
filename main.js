const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const { exec } = require('child_process');

let mainWindow;
let oauthServer = null;
const OAUTH_PORT = 51121;
const CLIENT_ID = '1071006060591-' + 'tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-' + 'K58FWR486LdLJ1mLB8sXC4z6qDAf';
const SCOPES = 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email';

// Resolve portable/local accounts.json path
const getAccountsFilePath = () => {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'accounts.json');
  }
  return app.isPackaged 
    ? path.join(path.dirname(process.execPath), 'accounts.json')
    : path.join(__dirname, 'accounts.json');
};

const ACCOUNTS_FILE = getAccountsFilePath();
console.log('Using accounts file path:', ACCOUNTS_FILE);

// Initialize accounts file
function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading accounts:', err);
  }
  return [];
}

function saveAccounts(accounts) {
  try {
    const dir = path.dirname(ACCOUNTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving accounts:', err);
  }
}

// Fetch user profile info using an access token
async function fetchUserProfile(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
  }
  return null;
}

// Refresh access token using a refresh token
async function refreshAccessToken(refreshToken) {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      return {
        accessToken: data.access_token,
        expiry: Date.now() + (data.expires_in * 1000)
      };
    } else {
      const errText = await res.text();
      console.error('Token refresh error:', errText);
    }
  } catch (err) {
    console.error('Error refreshing token:', err);
  }
  return null;
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code) {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        redirect_uri: `http://localhost:${OAUTH_PORT}`,
        grant_type: 'authorization_code'
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    } else {
      const errText = await res.text();
      console.error('Exchange error:', errText);
    }
  } catch (err) {
    console.error('Error exchanging code:', err);
  }
  return null;
}

// Start local HTTP server to receive OAuth callback
function startOAuthServer() {
  if (oauthServer) return;

  oauthServer = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    if (reqUrl.pathname === '/') {
      const code = reqUrl.query.code;
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; background: #ffffff; color: #000000; text-align: center; padding-top: 50px;">
              <h1 style="color: #22c55e;">Authorization Successful!</h1>
              <p>You have successfully connected your Antigravity account. You can close this tab now.</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);

        // Handle OAuth exchange in background
        const tokens = await exchangeCodeForTokens(code);
        if (tokens && tokens.refresh_token) {
          const profile = await fetchUserProfile(tokens.access_token);
          const email = profile?.email || `user-${Date.now()}@gmail.com`;
          const picture = profile?.picture || '';

          const accounts = loadAccounts();
          const existingIdx = accounts.findIndex(a => a.email.toLowerCase() === email.toLowerCase());

          const accountData = {
            email: email,
            picture: picture,
            name: profile?.name || email.split('@')[0],
            refreshToken: tokens.refresh_token,
            addedAt: new Date().toISOString()
          };

          if (existingIdx >= 0) {
            accounts[existingIdx] = accountData;
          } else {
            accounts.push(accountData);
          }

          saveAccounts(accounts);
          if (mainWindow) {
            mainWindow.webContents.send('accounts-updated', accounts);
          }
        }
        stopOAuthServer();
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code parameter');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  oauthServer.listen(OAUTH_PORT, () => {
    console.log(`OAuth Callback Server listening on port ${OAUTH_PORT}`);
  });
}

function stopOAuthServer() {
  if (oauthServer) {
    oauthServer.close();
    oauthServer = null;
    console.log('OAuth Callback Server stopped');
  }
}

// Auto-import accounts from local sources
async function runAutoImport() {
  const imported = [];
  const accounts = loadAccounts();

  const addAccount = (email, refreshToken, name = '') => {
    if (!refreshToken) return;
    const existingIdx = accounts.findIndex(a => a.email.toLowerCase() === email.toLowerCase());
    const accountData = {
      email: email,
      picture: '',
      name: name || email.split('@')[0],
      refreshToken: refreshToken,
      addedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      accounts[existingIdx] = accountData;
    } else {
      accounts.push(accountData);
    }
    imported.push(email);
  };

  // 1. Scan Local config files
  const homedir = osHomedir();
  if (homedir) {
    const paths = [
      path.join(homedir, '.antigravity', 'oauth_creds.json')
    ];
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8');
          const json = JSON.parse(content);
          if (json.email && json.refresh_token) {
            addAccount(json.email, json.refresh_token, json.name || '');
          }
        }
      } catch (err) {
        console.error(`Failed reading config: ${p}`, err);
      }
    }
  }

  // 2. Scan Windows Credential Manager via Python keyring
  try {
    const pythonCmd = `python -c "import keyring; print(keyring.get_password('gemini', 'antigravity') or '')"`;
    const token = await new Promise((resolve) => {
      exec(pythonCmd, (err, stdout) => {
        if (err) resolve('');
        else resolve(stdout.trim());
      });
    });
    if (token) {
      const email = 'imported-keyring@gmail.com';
      addAccount(email, token, 'Keyring Session');
    }
  } catch (err) {
    console.error('Keyring auto-import failed:', err);
  }

  if (imported.length > 0) {
    saveAccounts(accounts);
  }
  return imported;
}

function osHomedir() {
  return process.env.USERPROFILE || process.env.HOME || '';
}

// Window creation
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'Antigravity Limit Checker',
    backgroundColor: '#0d0f12',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopOAuthServer();
  });
}

// IPC Handlers
ipcMain.handle('get-accounts', async () => {
  return loadAccounts();
});

ipcMain.handle('delete-account', async (event, email) => {
  const accounts = loadAccounts();
  const filtered = accounts.filter(a => a.email.toLowerCase() !== email.toLowerCase());
  saveAccounts(filtered);
  return filtered;
});

ipcMain.handle('start-google-login', async () => {
  startOAuthServer();
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=http://localhost:${OAUTH_PORT}&response_type=code&scope=${encodeURIComponent(SCOPES)}&prompt=consent&access_type=offline`;
  shell.openExternal(authUrl);
});

ipcMain.handle('add-account-manual', async (event, { email, refreshToken, name }) => {
  if (!refreshToken) throw new Error('Refresh token is required');
  
  const tokens = await refreshAccessToken(refreshToken);
  let resolvedEmail = email || `user-${Date.now()}@gmail.com`;
  let picture = '';
  let resolvedName = name || resolvedEmail.split('@')[0];

  if (tokens) {
    const profile = await fetchUserProfile(tokens.accessToken);
    if (profile) {
      if (profile.email) resolvedEmail = profile.email;
      if (profile.picture) picture = profile.picture;
      if (profile.name) resolvedName = profile.name;
    }
  }

  const accounts = loadAccounts();
  const existingIdx = accounts.findIndex(a => a.email.toLowerCase() === resolvedEmail.toLowerCase());

  const accountData = {
    email: resolvedEmail,
    picture: picture,
    name: resolvedName,
    refreshToken: refreshToken,
    addedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    accounts[existingIdx] = accountData;
  } else {
    accounts.push(accountData);
  }

  saveAccounts(accounts);
  return accounts;
});

ipcMain.handle('auto-import-accounts', async () => {
  await runAutoImport();
  return loadAccounts();
});

ipcMain.handle('fetch-quota', async (event, refreshToken) => {
  const tokens = await refreshAccessToken(refreshToken);
  if (!tokens) {
    throw new Error('Failed to refresh access token. The refresh token might be invalid or expired.');
  }

  try {
    const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'User-Agent': 'antigravity/cli/1.22.2',
        'Content-Type': 'application/json'
      },
      body: '{}',
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      return await res.json();
    } else {
      const errText = await res.text();
      throw new Error(`API Error (${res.status}): ${errText}`);
    }
  } catch (err) {
    console.error('Fetch quota error:', err);
    throw err;
  }
});

// App events
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
