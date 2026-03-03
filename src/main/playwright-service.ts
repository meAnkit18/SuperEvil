import { chromium, Browser, Page, BrowserContext } from 'playwright';

type StatusCallback = (message: string) => void;

export class PlaywrightService {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private onStatus: StatusCallback;

    constructor(onStatus: StatusCallback) {
        this.onStatus = onStatus;
    }

    async launch(): Promise<void> {
        if (this.browser) {
            this.onStatus('⚠️ Browser is already running');
            return;
        }

        this.onStatus('🔄 Launching Playwright Chromium...');

        try {
            this.browser = await chromium.launch({
                headless: false,
                args: [
                    '--start-maximized',
                    '--disable-blink-features=AutomationControlled',
                ],
            });

            this.context = await this.browser.newContext({
                viewport: null,           // use full window size
                ignoreHTTPSErrors: true,
            });

            this.page = await this.context.newPage();
            await this.page.goto('https://www.google.com');

            this.onStatus('✅ Chromium browser launched successfully');
            this.onStatus(`🌐 Navigated to: ${this.page.url()}`);

            // Listen for browser disconnect (user closes the window manually)
            this.browser.on('disconnected', () => {
                this.onStatus('🔌 Browser window was closed');
                this.browser = null;
                this.context = null;
                this.page = null;
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.onStatus(`❌ Failed to launch browser: ${message}`);
            this.browser = null;
            this.context = null;
            this.page = null;
            throw err;
        }
    }

    async close(): Promise<void> {
        if (!this.browser) {
            this.onStatus('⚠️ No browser is running');
            return;
        }

        this.onStatus('🔄 Closing Chromium browser...');

        try {
            await this.browser.close();
            this.onStatus('✅ Browser closed successfully');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.onStatus(`⚠️ Error closing browser: ${message}`);
        } finally {
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }

    isRunning(): boolean {
        return this.browser !== null && this.browser.isConnected();
    }

    getPage(): Page | null {
        return this.page;
    }

    getContext(): BrowserContext | null {
        return this.context;
    }

    getBrowser(): Browser | null {
        return this.browser;
    }
}
