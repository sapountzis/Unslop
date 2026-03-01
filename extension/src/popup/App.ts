// extension/src/popup/App.ts
import {
	MESSAGE_TYPES,
	type SetProviderSettingsResponse,
} from "../lib/messages";
import { resolveEnabled } from "../lib/enabledState";
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from "../lib/config";
import type { DiagnosticsReport } from "../lib/diagnostics";
import type { HideRenderMode } from "../lib/config";
import { DEV_MODE_STORAGE_KEY, resolveDevMode } from "../lib/devMode";
import {
	HIDE_RENDER_MODE_STORAGE_KEY,
	resolveHideRenderMode,
} from "../lib/hideRenderMode";
import { DiagnosticsClient } from "./diagnosticsClient";
import type { LocalStatsSnapshot, ProviderSettings } from "../types";

const ZERO_LOCAL_STATS: LocalStatsSnapshot = {
	today: { keep: 0, hide: 0, total: 0 },
	last30Days: { keep: 0, hide: 0, total: 0 },
	allTime: { keep: 0, hide: 0, total: 0 },
	dailyBreakdown: [],
};

const PROVIDER_DRAFT_STORAGE_KEY = "providerSettingsDraft";
const BASE_URL_PLACEHOLDER = "openai compatible endpoint";

export class App {
	private container: HTMLElement;
	private readonly logoUrl: string;
	private readonly diagnosticsClient: DiagnosticsClient;
	private diagnosticsReport: DiagnosticsReport | null = null;
	private diagnosticsRunning = false;
	private devModeEnabled = false;

	constructor(
		containerId: string,
		diagnosticsClient: DiagnosticsClient = new DiagnosticsClient(),
	) {
		const container = document.getElementById(containerId);
		if (!container) {
			throw new Error(`Container ${containerId} not found`);
		}
		this.container = container;
		this.logoUrl = chrome.runtime.getURL("icons/logo.svg");
		this.diagnosticsClient = diagnosticsClient;
	}

	async render(): Promise<void> {
		const storage = await chrome.storage.sync.get([
			"apiKey",
			"enabled",
			HIDE_RENDER_MODE_STORAGE_KEY,
			DEV_MODE_STORAGE_KEY,
		]);
		const hideRenderMode = resolveHideRenderMode(
			storage[HIDE_RENDER_MODE_STORAGE_KEY],
		);
		this.devModeEnabled = resolveDevMode(
			storage[DEV_MODE_STORAGE_KEY] as boolean | null | undefined,
		);

		if (!storage.apiKey) {
			await this.renderSettings(this.devModeEnabled);
			return;
		}

		const localStats = await this.loadLocalStats();
		this.renderDashboard(
			resolveEnabled(storage.enabled),
			hideRenderMode,
			this.devModeEnabled,
			localStats,
		);
	}

	// ── Settings form (shown when no API key is set) ──────

	private async renderSettings(devModeEnabled: boolean): Promise<void> {
		const draft = await this.loadProviderSettingsDraft();
		const apiKey = draft?.apiKey ?? "";
		const baseUrl = draft?.baseUrl ?? DEFAULT_BASE_URL;
		const model = draft?.model ?? DEFAULT_MODEL;

		this.container.innerHTML = `
      <div>
        ${this.renderBrand()}
        <p class="status">Enter your OpenAI-compatible API key to get started.</p>
        <form id="settings-form">
          <div class="card mb-8">
            <label for="api-key-input" class="setting-label">API Key</label>
            <input
              type="password"
              id="api-key-input"
              placeholder="sk-..."
              autocomplete="off"
              value="${this.escapeHtml(apiKey)}"
              required
            />
            <label for="base-url-input" class="setting-label" style="margin-top:8px;">Base URL</label>
            <input
              type="text"
              id="base-url-input"
              placeholder="${BASE_URL_PLACEHOLDER}"
              value="${this.escapeHtml(baseUrl)}"
            />
            <label for="model-input" class="setting-label" style="margin-top:8px;">Model</label>
            <input
              type="text"
              id="model-input"
              placeholder="${DEFAULT_MODEL}"
              value="${this.escapeHtml(model)}"
            />
          </div>
          <button type="submit" class="primary mb-8">Save & Enable</button>
          <p id="settings-status" class="status"></p>
        </form>
        ${this.renderDevModeCard(devModeEnabled)}
        ${devModeEnabled ? this.renderDiagnosticsCard() : ""}
      </div>
    `;

		const form = this.container.querySelector("#settings-form");
		const statusEl = this.container.querySelector(
			"#settings-status",
		) as HTMLElement;
		const apiKeyInput = this.container.querySelector(
			"#api-key-input",
		) as HTMLInputElement;
		const baseUrlInput = this.container.querySelector(
			"#base-url-input",
		) as HTMLInputElement;
		const modelInput = this.container.querySelector(
			"#model-input",
		) as HTMLInputElement;

		this.bindProviderDraftPersistence(apiKeyInput, baseUrlInput, modelInput);

		form?.addEventListener("submit", async (e) => {
			e.preventDefault();
			const apiKey = apiKeyInput.value.trim();
			const baseUrl = baseUrlInput.value.trim() || DEFAULT_BASE_URL;
			const model = modelInput.value.trim() || DEFAULT_MODEL;

			if (!apiKey) {
				statusEl.textContent = "API key is required.";
				return;
			}

			statusEl.textContent = "Saving...";
			const saveResult = (await chrome.runtime.sendMessage({
				type: MESSAGE_TYPES.SET_PROVIDER_SETTINGS,
				settings: { apiKey, baseUrl, model } satisfies ProviderSettings,
			})) as SetProviderSettingsResponse | null;
			if (saveResult?.status === "ok") {
				await this.clearProviderSettingsDraft();
				await this.render();
				return;
			}

			statusEl.textContent = this.describeProviderSettingsError(saveResult);
		});

		this.bindDevModeControl();
		this.bindDiagnosticsControls();
	}

	// ── Dashboard (shown when API key is configured) ──────

	private renderDashboard(
		enabled: boolean,
		hideRenderMode: HideRenderMode,
		devModeEnabled: boolean,
		localStats: LocalStatsSnapshot,
	): void {
		this.container.innerHTML = `
      <div>
        ${this.renderBrand()}

        <div class="mb-8">
          <label class="toggle-label">
            <input type="checkbox" id="enabled-toggle" ${enabled ? "checked" : ""} />
            <div class="toggle"></div>
            <span class="toggle-text">Enable filtering</span>
          </label>
        </div>

        <div class="card mb-8">
          <label for="hide-render-mode" class="setting-label">Hide render mode</label>
          <select id="hide-render-mode" class="setting-select">
            <option value="collapse" ${hideRenderMode === "collapse" ? "selected" : ""}>Collapse (no placeholder)</option>
            <option value="label" ${hideRenderMode === "label" ? "selected" : ""}>Label (keep post visible)</option>
          </select>
        </div>

        ${this.renderLocalStatsCard(localStats)}

        <div class="card mb-8">
          <strong>API settings</strong>
          <button id="edit-settings-btn" class="ghost" style="margin-top:4px;">Edit API key &amp; model</button>
        </div>

        ${this.renderDevModeCard(devModeEnabled)}
        ${devModeEnabled ? this.renderDiagnosticsCard() : ""}
      </div>
    `;

		const enabledToggle = this.container.querySelector(
			"#enabled-toggle",
		) as HTMLInputElement;
		enabledToggle?.addEventListener("change", async () => {
			const response = await chrome.runtime.sendMessage({
				type: MESSAGE_TYPES.TOGGLE_ENABLED,
			});
			enabledToggle.checked = response.enabled;
		});

		const hideRenderModeSelect = this.container.querySelector(
			"#hide-render-mode",
		) as HTMLSelectElement;
		hideRenderModeSelect?.addEventListener("change", async () => {
			const nextMode = resolveHideRenderMode(hideRenderModeSelect.value);
			await chrome.storage.sync.set({
				[HIDE_RENDER_MODE_STORAGE_KEY]: nextMode,
			});
			hideRenderModeSelect.value = nextMode;
		});

		const editBtn = this.container.querySelector("#edit-settings-btn");
		editBtn?.addEventListener("click", () => {
			void this.renderSettingsEdit();
		});

		this.bindDevModeControl();
		this.bindDiagnosticsControls();
	}

	// ── Settings edit view (from dashboard) ──────────────

	private async renderSettingsEdit(): Promise<void> {
		const settings = (await chrome.runtime.sendMessage({
			type: MESSAGE_TYPES.GET_PROVIDER_SETTINGS,
		})) as ProviderSettings | null;
		const draft = await this.loadProviderSettingsDraft();
		const apiKey = draft?.apiKey ?? settings?.apiKey ?? "";
		const baseUrl = draft?.baseUrl ?? settings?.baseUrl ?? DEFAULT_BASE_URL;
		const model = draft?.model ?? settings?.model ?? DEFAULT_MODEL;

		this.container.innerHTML = `
          <div>
            ${this.renderBrand()}
            <form id="edit-settings-form">
              <div class="card mb-8">
                <label for="api-key-edit" class="setting-label">API Key</label>
                <input type="password" id="api-key-edit" placeholder="sk-..." autocomplete="off" value="${this.escapeHtml(apiKey)}" />
                <label for="base-url-edit" class="setting-label" style="margin-top:8px;">Base URL</label>
                <input type="text" id="base-url-edit" placeholder="${BASE_URL_PLACEHOLDER}" value="${this.escapeHtml(baseUrl)}" />
                <label for="model-edit" class="setting-label" style="margin-top:8px;">Model</label>
                <input type="text" id="model-edit" value="${this.escapeHtml(model)}" />
              </div>
              <button type="submit" class="primary mb-8">Save</button>
              <button type="button" id="cancel-edit-btn" class="ghost mb-8">Cancel</button>
              <button type="button" id="clear-key-btn" class="ghost" style="color:var(--warning)">Remove API key</button>
              <p id="edit-status" class="status"></p>
            </form>
          </div>
        `;

		const form = this.container.querySelector("#edit-settings-form");
		const statusEl = this.container.querySelector("#edit-status") as HTMLElement;
		const apiKeyInput = this.container.querySelector(
			"#api-key-edit",
		) as HTMLInputElement;
		const baseUrlInput = this.container.querySelector(
			"#base-url-edit",
		) as HTMLInputElement;
		const modelInput = this.container.querySelector(
			"#model-edit",
		) as HTMLInputElement;

		this.bindProviderDraftPersistence(apiKeyInput, baseUrlInput, modelInput);

		form?.addEventListener("submit", async (e) => {
			e.preventDefault();
			const newKey = apiKeyInput.value.trim();
			const newUrl = baseUrlInput.value.trim() || DEFAULT_BASE_URL;
			const newModel = modelInput.value.trim() || DEFAULT_MODEL;
			statusEl.textContent = "Saving...";
			const saveResult = (await chrome.runtime.sendMessage({
				type: MESSAGE_TYPES.SET_PROVIDER_SETTINGS,
				settings: { apiKey: newKey, baseUrl: newUrl, model: newModel },
			})) as SetProviderSettingsResponse | null;
			if (saveResult?.status === "ok") {
				await this.clearProviderSettingsDraft();
				await this.render();
				return;
			}
			statusEl.textContent = this.describeProviderSettingsError(saveResult);
		});

		this.container
			.querySelector("#cancel-edit-btn")
			?.addEventListener("click", async () => {
				await this.clearProviderSettingsDraft();
				await this.render();
			});

		this.container
			.querySelector("#clear-key-btn")
			?.addEventListener("click", async () => {
				await chrome.storage.sync.remove(["apiKey", "baseUrl", "model"]);
				await this.clearProviderSettingsDraft();
				await this.render();
			});
	}

	private bindProviderDraftPersistence(
		apiKeyInput: HTMLInputElement,
		baseUrlInput: HTMLInputElement,
		modelInput: HTMLInputElement,
	): void {
		const persistDraft = () => {
			void this.saveProviderSettingsDraft({
				apiKey: apiKeyInput.value,
				baseUrl: baseUrlInput.value,
				model: modelInput.value,
			});
		};

		apiKeyInput.addEventListener("input", persistDraft);
		baseUrlInput.addEventListener("input", persistDraft);
		modelInput.addEventListener("input", persistDraft);
	}

	private async loadProviderSettingsDraft(): Promise<ProviderSettings | null> {
		const storage = await chrome.storage.local.get(PROVIDER_DRAFT_STORAGE_KEY);
		const raw = storage[PROVIDER_DRAFT_STORAGE_KEY];
		if (!raw || typeof raw !== "object") {
			return null;
		}

		const draft = raw as Partial<ProviderSettings>;
		return {
			apiKey: typeof draft.apiKey === "string" ? draft.apiKey : "",
			baseUrl: typeof draft.baseUrl === "string" ? draft.baseUrl : "",
			model: typeof draft.model === "string" ? draft.model : "",
		};
	}

	private async saveProviderSettingsDraft(
		settings: ProviderSettings,
	): Promise<void> {
		await chrome.storage.local.set({
			[PROVIDER_DRAFT_STORAGE_KEY]: settings,
		});
	}

	private async clearProviderSettingsDraft(): Promise<void> {
		await chrome.storage.local.remove(PROVIDER_DRAFT_STORAGE_KEY);
	}

	private describeProviderSettingsError(
		result: SetProviderSettingsResponse | null,
	): string {
		if (!result) return "Unable to save settings. Try again.";
		if (result.status === "invalid_base_url") {
			return result.reason;
		}
		if (result.status === "permission_denied") {
			return `Permission denied for ${result.origin}`;
		}
		return "Unable to save settings. Try again.";
	}

	private async loadLocalStats(): Promise<LocalStatsSnapshot> {
		try {
			const response = (await chrome.runtime.sendMessage({
				type: MESSAGE_TYPES.GET_LOCAL_STATS,
			})) as LocalStatsSnapshot | null;
			if (!response || typeof response !== "object") {
				return ZERO_LOCAL_STATS;
			}
			return {
				today: response.today ?? ZERO_LOCAL_STATS.today,
				last30Days: response.last30Days ?? ZERO_LOCAL_STATS.last30Days,
				allTime: response.allTime ?? ZERO_LOCAL_STATS.allTime,
				dailyBreakdown: Array.isArray(response.dailyBreakdown)
					? response.dailyBreakdown
					: ZERO_LOCAL_STATS.dailyBreakdown,
			};
		} catch {
			return ZERO_LOCAL_STATS;
		}
	}

	private renderLocalStatsCard(localStats: LocalStatsSnapshot): string {
		return `
      <div class="card mb-8">
        <strong>Local stats</strong>
        <div class="local-stats-row"><span>Today</span><span>${localStats.today.hide} hidden / ${localStats.today.total} total</span></div>
        <div class="local-stats-row"><span>Last 30 days</span><span>${localStats.last30Days.hide} hidden / ${localStats.last30Days.total} total</span></div>
        <div class="local-stats-row"><span>All time</span><span>${localStats.allTime.hide} hidden / ${localStats.allTime.total} total</span></div>
      </div>
    `;
	}

	// ── Diagnostics ───────────────────────────────────────

	private escapeHtml(value: string): string {
		return value
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	private async runDiagnostics(): Promise<void> {
		if (this.diagnosticsRunning) return;
		this.diagnosticsRunning = true;
		this.updateDiagnosticsUi();

		try {
			this.diagnosticsReport = await this.diagnosticsClient.run();
		} catch (error) {
			console.error("[Unslop] diagnostics run failed", error);
		}
		this.diagnosticsRunning = false;
		this.updateDiagnosticsUi();
	}

	private renderDiagnosticsCard(): string {
		return `
      <div class="card mb-8 diagnostics-card">
        <div class="diagnostics-head">
          <strong>Run Diagnostics</strong>
          <span class="diagnostics-subtitle">Checks content runtime, selectors, storage, and LLM endpoint.</span>
        </div>
        <button id="run-diagnostics-btn" type="button" class="secondary diagnostics-run-btn">Run Diagnostics</button>
        <button id="copy-diagnostics-btn" type="button" class="ghost diagnostics-run-btn">Copy Diagnostics JSON</button>
        <div id="diagnostics-results" class="diagnostics-results">${this.renderDiagnosticsResults()}</div>
      </div>
    `;
	}

	private renderDiagnosticsResults(): string {
		if (this.diagnosticsRunning && !this.diagnosticsReport) {
			return `<p class="status diagnostics-inline-status">Running diagnostics...</p>`;
		}

		if (!this.diagnosticsReport) {
			return `<p class="status diagnostics-inline-status">Open a supported feed (LinkedIn, X, Reddit), then click Run Diagnostics.</p>`;
		}

		const report = this.diagnosticsReport;
		const generatedAt = new Date(report.generatedAtIso).toLocaleTimeString(
			"en-US",
			{ hour: "2-digit", minute: "2-digit", second: "2-digit" },
		);
		const summary = `${report.summary.pass} passed · ${report.summary.warn} warnings · ${report.summary.fail} failed`;
		const checksMarkup = report.checks
			.map((check) => {
				const label = this.escapeHtml(check.label);
				const evidence = this.escapeHtml(check.evidence);
				const nextAction = this.escapeHtml(check.nextAction);
				return `
          <div class="diagnostics-row diagnostics-row--${check.status}">
            <div class="diagnostics-row-head">
              <span class="diagnostics-status-pill">${check.status.toUpperCase()}</span>
              <span class="diagnostics-row-label">${label}</span>
            </div>
            <div class="diagnostics-row-evidence">${evidence}</div>
            <div class="diagnostics-row-next">${nextAction}</div>
          </div>
        `;
			})
			.join("");

		return `
      <div class="diagnostics-summary diagnostics-summary--${report.overallStatus}">
        <span>${this.escapeHtml(summary)}</span>
        <span class="diagnostics-timestamp">${this.escapeHtml(generatedAt)}</span>
      </div>
      <div class="diagnostics-list">${checksMarkup}</div>
    `;
	}

	private updateDiagnosticsUi(): void {
		const runButton = this.container.querySelector(
			"#run-diagnostics-btn",
		) as HTMLButtonElement | null;
		if (runButton) {
			runButton.disabled = this.diagnosticsRunning;
			runButton.textContent = this.diagnosticsRunning
				? "Running Diagnostics..."
				: "Run Diagnostics";
		}
		const copyButton = this.container.querySelector(
			"#copy-diagnostics-btn",
		) as HTMLButtonElement | null;
		if (copyButton) {
			copyButton.disabled = this.diagnosticsRunning || !this.diagnosticsReport;
		}

		const resultsContainer = this.container.querySelector("#diagnostics-results");
		if (resultsContainer) {
			resultsContainer.innerHTML = this.renderDiagnosticsResults();
		}
	}

	private bindDiagnosticsControls(): void {
		if (!this.devModeEnabled) return;
		const runButton = this.container.querySelector(
			"#run-diagnostics-btn",
		) as HTMLButtonElement | null;
		const copyButton = this.container.querySelector(
			"#copy-diagnostics-btn",
		) as HTMLButtonElement | null;

		runButton?.addEventListener("click", () => {
			void this.runDiagnostics();
		});
		copyButton?.addEventListener("click", () => {
			void this.copyDiagnosticsReport();
		});

		this.updateDiagnosticsUi();
	}

	private async copyDiagnosticsReport(): Promise<void> {
		if (!this.diagnosticsReport) return;
		const serialized = JSON.stringify(this.diagnosticsReport, null, 2);

		try {
			if (typeof navigator !== "undefined" && navigator.clipboard) {
				await navigator.clipboard.writeText(serialized);
				return;
			}
		} catch (error) {
			console.error("[Unslop] failed to write diagnostics to clipboard", error);
		}

		// Fallback
		const textarea = document.createElement("textarea");
		textarea.value = serialized;
		textarea.setAttribute("readonly", "true");
		textarea.style.position = "fixed";
		textarea.style.left = "-9999px";
		document.body.appendChild(textarea);
		textarea.select();
		try {
			document.execCommand("copy");
		} finally {
			textarea.remove();
		}
	}

	private renderDevModeCard(devModeEnabled: boolean): string {
		return `
      <div class="card mb-8">
        <label class="toggle-label">
          <input type="checkbox" id="dev-mode-toggle" ${devModeEnabled ? "checked" : ""} />
          <div class="toggle"></div>
          <span class="toggle-text">Developer mode</span>
        </label>
      </div>
    `;
	}

	private bindDevModeControl(): void {
		const devModeToggle = this.container.querySelector(
			"#dev-mode-toggle",
		) as HTMLInputElement | null;
		if (!devModeToggle) return;

		devModeToggle.addEventListener("change", async () => {
			await chrome.storage.sync.set({
				[DEV_MODE_STORAGE_KEY]: devModeToggle.checked,
			});
			this.devModeEnabled = devModeToggle.checked;
			if (!this.devModeEnabled) {
				this.diagnosticsReport = null;
				this.diagnosticsRunning = false;
			}
			await this.render();
		});
	}

	private renderBrand(): string {
		return `
      <div class="brand brand--center mb-8" aria-label="Unslop">
        <img class="brand__mark" src="${this.logoUrl}" alt="" aria-hidden="true" />
        <span class="brand__name">Unslop</span>
      </div>
    `;
	}
}
