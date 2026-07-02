# AG Checker

**Just a portable .exe where you add your Google accounts and monitor your Antigravity usage limits.**

AG Checker is a lightweight, zero-install portable Windows application designed to monitor usage quotas, limits, and cooldowns for Antigravity models across multiple Google Antigravity accounts.

![Electron](https://img.shields.io/badge/electron-v30.5.1-blueviolet.svg)
![Design](https://img.shields.io/badge/design-OLED%20Black-black.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## Key Features

*   **Zero-Installation Portable Executable**: Runs instantly as a single `AG_Checker-vX.X.X.exe` file.
*   **Multi-Account Monitoring**: Easily link multiple Google Antigravity accounts and see their quota status side-by-side.
*   **Instant Google Import**: Authenticate safely using Google OAuth directly in your browser.
*   **First-Run Auto-Import**: Scans your local directory for credentials automatically on the first launch so you can get started in one click.
*   **Smart Cooldown (KD) Detection**: Automatically marks accounts on cooldown if any limit (5-hour or weekly) falls below 5%.
*   **Dynamic Limit Display**: Automatically reads and displays only the limit buckets returned by the Google API for each model, hiding irrelevant information.
*   **Pixel/OLED Retro Aesthetic**: Designed in a distraction-free OLED black layout with the beautiful *Departure Mono* typeface.

---

## Security & Privacy

*   **100% Local**: All account tokens are stored locally on your machine in `accounts.json` right next to the executable. No third-party servers are used.
*   **Official Credentials**: Uses the standard Google Cloud SDK OAuth Client ID to authenticate. Your credentials never leave your machine.
*   **Offline Portability**: Copy both `AG-Checker.exe` and `accounts.json` to any folder or USB drive, and your accounts travel with you.

---

## How to Run Locally (Development)

### Prerequisites

*   [Node.js](https://nodejs.org/) (Version 18 or later)
*   Python with the `keyring` package (optional, used for local credential vault scanning):
    ```bash
    pip install keyring
    ```

### Development Setup

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run the app in development mode:
    ```bash
    npm start
    ```
4.  Build the portable Windows executable:
    ```bash
    npm run build
    ```

---

## License

This project is licensed under the MIT License.
