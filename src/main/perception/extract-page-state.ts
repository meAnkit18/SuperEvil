// ─── DOM Extraction Layer ───────────────────────────────────
// Extracts a structured PageState from a Playwright Page.
// All $$eval calls run INSIDE the browser and return only
// serializable data — raw DOM never reaches the LLM.
// ─────────────────────────────────────────────────────────────

import { Page } from 'playwright';
import {
    PageState,
    ButtonInfo,
    InputInfo,
    LinkInfo,
    AccessibilityNode,
} from './types';

// ── Constants ───────────────────────────────────────────────

const MAX_TEXT_LENGTH = 2000;
const MAX_ACCESSIBILITY_DEPTH = 2;

// ── Button Extraction ───────────────────────────────────────

async function extractButtons(page: Page): Promise<ButtonInfo[]> {
    try {
        return await page.$$eval(
            'button, [role="button"], input[type="button"], input[type="submit"]',
            (elements) => {
                function buildSelector(el: Element): string {
                    if (el.id) return '#' + CSS.escape(el.id);
                    if (el === document.body) return 'body';
                    const parent = el.parentElement;
                    if (!parent) return el.tagName.toLowerCase();
                    const siblings = Array.from(parent.children).filter(
                        (c) => c.tagName === el.tagName,
                    );
                    const tag = el.tagName.toLowerCase();
                    if (siblings.length === 1) {
                        return buildSelector(parent) + ' > ' + tag;
                    }
                    const idx = siblings.indexOf(el) + 1;
                    return buildSelector(parent) + ' > ' + tag + ':nth-of-type(' + idx + ')';
                }

                return elements
                    .filter((el) => {
                        const style = window.getComputedStyle(el);
                        return (
                            style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            (el as HTMLElement).offsetParent !== null
                        );
                    })
                    .map((el) => {
                        const htmlEl = el as HTMLElement;
                        const text =
                            htmlEl.textContent?.trim() ||
                            htmlEl.getAttribute('aria-label') ||
                            htmlEl.getAttribute('title') ||
                            (htmlEl as HTMLInputElement).value ||
                            '';
                        return {
                            text: text.slice(0, 100),
                            selector: buildSelector(htmlEl),
                            disabled:
                                (htmlEl as HTMLButtonElement).disabled ||
                                htmlEl.getAttribute('aria-disabled') === 'true',
                            type:
                                htmlEl.getAttribute('type') ||
                                htmlEl.getAttribute('role') ||
                                'button',
                        };
                    })
                    .slice(0, 50);
            },
        );
    } catch {
        return [];
    }
}

// ── Input Extraction ────────────────────────────────────────

async function extractInputs(page: Page): Promise<InputInfo[]> {
    try {
        return await page.$$eval(
            'input, textarea, select',
            (elements) => {
                function buildSelector(el: Element): string {
                    if (el.id) return '#' + CSS.escape(el.id);
                    if (el === document.body) return 'body';
                    const parent = el.parentElement;
                    if (!parent) return el.tagName.toLowerCase();
                    const siblings = Array.from(parent.children).filter(
                        (c) => c.tagName === el.tagName,
                    );
                    const tag = el.tagName.toLowerCase();
                    if (siblings.length === 1) {
                        return buildSelector(parent) + ' > ' + tag;
                    }
                    const idx = siblings.indexOf(el) + 1;
                    return buildSelector(parent) + ' > ' + tag + ':nth-of-type(' + idx + ')';
                }

                return elements
                    .filter((el) => {
                        const htmlEl = el as HTMLElement;
                        const style = window.getComputedStyle(htmlEl);
                        const type = htmlEl.getAttribute('type') || '';
                        return (
                            style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            type !== 'hidden'
                        );
                    })
                    .map((el) => {
                        const htmlEl = el as HTMLInputElement;
                        return {
                            selector: buildSelector(htmlEl),
                            type: htmlEl.type || htmlEl.tagName.toLowerCase(),
                            placeholder:
                                htmlEl.placeholder ||
                                htmlEl.getAttribute('aria-label') ||
                                '',
                            value:
                                htmlEl.type === 'password'
                                    ? '••••'
                                    : (htmlEl.value || '').slice(0, 100),
                            name: htmlEl.name || htmlEl.id || '',
                        };
                    })
                    .slice(0, 50);
            },
        );
    } catch {
        return [];
    }
}

// ── Link Extraction ─────────────────────────────────────────

async function extractLinks(page: Page): Promise<LinkInfo[]> {
    try {
        return await page.$$eval(
            'a[href]',
            (elements) => {
                function buildSelector(el: Element): string {
                    if (el.id) return '#' + CSS.escape(el.id);
                    if (el === document.body) return 'body';
                    const parent = el.parentElement;
                    if (!parent) return el.tagName.toLowerCase();
                    const siblings = Array.from(parent.children).filter(
                        (c) => c.tagName === el.tagName,
                    );
                    const tag = el.tagName.toLowerCase();
                    if (siblings.length === 1) {
                        return buildSelector(parent) + ' > ' + tag;
                    }
                    const idx = siblings.indexOf(el) + 1;
                    return buildSelector(parent) + ' > ' + tag + ':nth-of-type(' + idx + ')';
                }

                return elements
                    .filter((el) => {
                        const style = window.getComputedStyle(el);
                        return (
                            style.display !== 'none' &&
                            style.visibility !== 'hidden'
                        );
                    })
                    .map((el) => {
                        const anchor = el as HTMLAnchorElement;
                        return {
                            text: (
                                anchor.textContent?.trim() ||
                                anchor.getAttribute('aria-label') ||
                                ''
                            ).slice(0, 100),
                            href: anchor.href,
                            selector: buildSelector(anchor),
                        };
                    })
                    .filter((l) => l.text.length > 0)
                    .slice(0, 80);
            },
        );
    } catch {
        return [];
    }
}

// ── Visible Text Summary ────────────────────────────────────

async function extractVisibleText(page: Page): Promise<string> {
    try {
        const text = await page.$$eval(
            'body *',
            (elements, maxLen) => {
                const seen = new Set<string>();
                const parts: string[] = [];
                let totalLen = 0;

                for (const el of elements) {
                    const htmlEl = el as HTMLElement;
                    const style = window.getComputedStyle(htmlEl);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;

                    for (const node of Array.from(htmlEl.childNodes)) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const t = (node.textContent || '').trim();
                            if (t.length > 0 && !seen.has(t)) {
                                seen.add(t);
                                parts.push(t);
                                totalLen += t.length;
                                if (totalLen >= maxLen) break;
                            }
                        }
                    }
                    if (totalLen >= maxLen) break;
                }

                return parts.join(' ');
            },
            MAX_TEXT_LENGTH,
        );
        return text.slice(0, MAX_TEXT_LENGTH);
    } catch {
        return '';
    }
}

// ── Accessibility Tree ──────────────────────────────────────

function pruneAccessibilityTree(
    node: any,
    depth: number = 0,
): AccessibilityNode | null {
    if (!node) return null;
    if (depth > MAX_ACCESSIBILITY_DEPTH) return null;

    const result: AccessibilityNode = {
        role: node.role || '',
        name: (node.name || '').slice(0, 100),
    };

    if (node.value) result.value = String(node.value).slice(0, 100);
    if (node.description) result.description = String(node.description).slice(0, 100);

    if (node.children && node.children.length > 0 && depth < MAX_ACCESSIBILITY_DEPTH) {
        result.children = node.children
            .map((child: any) => pruneAccessibilityTree(child, depth + 1))
            .filter(Boolean) as AccessibilityNode[];
    }

    return result;
}

// ─── Main Extraction Function ───────────────────────────────

export async function extractPageState(page: Page): Promise<PageState> {
    // Run extractions in parallel for speed
    const [url, title, buttons, inputs, links, visibleTextSummary, accessibilitySnapshot] =
        await Promise.all([
            Promise.resolve(page.url()),
            page.title(),
            extractButtons(page),
            extractInputs(page),
            extractLinks(page),
            extractVisibleText(page),
            // page.accessibility is deprecated in TS types but still works at runtime
            ((page as any).accessibility?.snapshot() as Promise<any>).catch(() => null),
        ]);

    const accessibilityTree = pruneAccessibilityTree(accessibilitySnapshot);

    return {
        url,
        title,
        buttons,
        inputs,
        links,
        visibleTextSummary,
        accessibilityTree,
        timestamp: Date.now(),
    };
}
