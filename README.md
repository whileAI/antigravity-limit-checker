# AR Checker (Antigravity Quota Monitor)

**AR Checker** is a portable, sleek desktop application built with Electron to manage and monitor usage limits and quotas (5-hour and weekly) for Gemini and Claude models across multiple Google Antigravity accounts.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/electron-v30.0.9-blueviolet.svg)

---

## 🌟 Features

* **Multi-Account Dashboard**: Connect multiple Google Antigravity accounts and see their current quota status in real-time.
* **Auto-Import Local Sessions**: Scan your system automatically for credentials (such as `~/.gemini/oauth_creds.json`, `~/.qwen/oauth_creds.json`, and tokens stored securely inside the Windows Vault/Credential Manager via Python `keyring`).
* **One-Click Google Login**: Authenticate new accounts directly in your default browser. The app runs a temporary OAuth callback listener on port `51121` to capture refresh tokens automatically.
* **Smart Cooldown (KD) Logic**: If either the 5-hour or the weekly limit of a model group drops below **5%**, the account is marked as **On Cooldown (KD)** with a clear visual badge and countdown timers showing when the quota will refresh.
* **Responsive Layout & Sorting**: Sort accounts dynamically by:
  * Cooldown Status (Ready accounts first)
  * Account Nickname / Email
  * Gemini 5-Hour or Weekly limit (highest remaining first)
  * Claude 5-Hour or Weekly limit (highest remaining first)
* **Real-time Countdown Timers**: Automatically displays live countdowns for the next quota resets.

---

## 🚀 How to Run (Local Setup)

### Prerequisites

* [Node.js](https://nodejs.org/) (Version 18 or later)
* [Python](https://www.python.org/) with `keyring` package installed (used to securely query the Windows Vault for auto-import):
  ```bash
  pip install keyring
  ```

### Windows (Quick Start)

Double-click the **`start.bat`** file. It will automatically check for and install dependencies (Electron) on the first run, and then launch the application.

### Manual Start (All Platforms)

1. Open your terminal in this directory.
2. Install packages:
   ```bash
   npm install
   ```
3. Run the app:
   ```bash
   npm start
   ```

---

## 🔒 Security & Token Storage

* Stored accounts are saved locally on your computer inside the Electron app data folder:
  `%APPDATA%\ar-checker\accounts.json`
* The app uses Google's official Antigravity OAuth Client ID (`1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com`) to request authorization code. Credentials are never sent to third-party servers.

---

## 🚀 Uploading to GitHub

To upload this project to your own GitHub repository:

1. Create a new repository on [GitHub](https://github.com/new) (e.g., named `ar-checker`). Do not add a README, license, or gitignore initially.
2. Open terminal in the project directory:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of AR Checker"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/ar-checker.git
   git push -u origin main
   ```
