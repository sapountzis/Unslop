// extension/src/popup/App.ts
import { UserInfoWithUsage } from '../types';
import { MESSAGE_TYPES } from '../lib/messages';
import { resolveEnabled } from '../lib/enabled-state';
import type { HideRenderMode } from '../lib/config';
import { HIDE_RENDER_MODE_STORAGE_KEY, resolveHideRenderMode } from '../lib/hide-render-mode';

export class App {
  private container: HTMLElement;
  private readonly logoUrl: string;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
    this.logoUrl = chrome.runtime.getURL('icons/logo.svg');
  }

  async render(): Promise<void> {
    const storage = await chrome.storage.sync.get(['jwt', 'enabled', HIDE_RENDER_MODE_STORAGE_KEY]);
    const hideRenderMode = resolveHideRenderMode(storage[HIDE_RENDER_MODE_STORAGE_KEY]);

    if (!storage.jwt) {
      this.renderSignIn();
      return;
    }

    const userInfo = await this.getUserInfo();
    if (userInfo) {
      this.renderDashboard(userInfo, resolveEnabled(storage.enabled), hideRenderMode);
    } else {
      this.renderSignIn();
    }
  }

  private async getUserInfo(): Promise<UserInfoWithUsage | null> {
    try {
      const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_USER_INFO });
      if (!response || !response.email) {
        return null;
      }
      return response;
    } catch (err) {
      console.error('GetUserInfo error:', err);
      return null;
    }
  }

  private renderSignIn(): void {
    this.container.innerHTML = `
      <div class="text-center">
        ${this.renderBrand()}
        <p>Sign in to filter your LinkedIn feed</p>
        <form id="signin-form">
          <input
            type="email"
            id="email-input"
            placeholder="your@email.com"
            required
          />
          <button type="submit" class="primary">Send Sign In Link</button>
        </form>
        <p id="status" class="status"></p>
      </div>
    `;

    const form = this.container.querySelector('#signin-form');
    const emailInput = this.container.querySelector('#email-input') as HTMLInputElement;
    const status = this.container.querySelector('#status')!;

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value;

      status.textContent = 'Sending...';

      try {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.START_AUTH,
          email,
        });

        status.textContent = 'Check your email for a sign-in link.';
        emailInput.value = '';
      } catch (err) {
        status.textContent = 'Failed to send email. Please try again.';
      }
    });
  }

  private renderDashboard(
    userInfo: UserInfoWithUsage,
    enabled: boolean,
    hideRenderMode: HideRenderMode
  ): void {
    const isPro = userInfo.plan === 'pro' && userInfo.plan_status === 'active';

    // Usage display - data now embedded in userInfo
    let usageHtml = '';
    if (userInfo.current_usage !== undefined) {
      const usagePercent = Math.round((userInfo.current_usage / userInfo.limit!) * 100);
      const isLow = userInfo.remaining! < userInfo.limit! * 0.1;
      const barColor = isLow ? 'var(--warning)' : 'var(--good)';
      const resetDate = new Date(userInfo.reset_date!);
      const resetStr = resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      usageHtml = `
        <div class="card usage-card mb-8">
          <div class="usage-header">
            <span class="usage-label">Monthly Usage</span>
            <span class="usage-count ${isLow ? 'low' : ''}">${userInfo.remaining} remaining</span>
          </div>
          <div class="usage-bar-bg">
            <div class="usage-bar" style="width: ${Math.min(usagePercent, 100)}%; background: ${barColor};"></div>
          </div>
          <div class="usage-footer">
            <span>${userInfo.current_usage} / ${userInfo.limit} calls</span>
            <span>Resets ${resetStr}</span>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div>
        ${this.renderBrand()}

        <div class="mb-8">
          <label class="toggle-label">
            <input type="checkbox" id="enabled-toggle" ${enabled ? 'checked' : ''} />
            <div class="toggle"></div>
            <span class="toggle-text">Enable filtering</span>
          </label>
        </div>

        <div class="card mb-8">
          <label for="hide-render-mode" class="setting-label">Hide render mode</label>
          <select id="hide-render-mode" class="setting-select">
            <option value="collapse" ${hideRenderMode === 'collapse' ? 'selected' : ''}>Collapse (no placeholder)</option>
            <option value="label" ${hideRenderMode === 'label' ? 'selected' : ''}>Label (keep post visible)</option>
          </select>
        </div>

        ${usageHtml}

        <div class="card mb-8">
          <div><strong>Email:</strong> ${userInfo.email || 'Loading...'}</div>
          <div><strong>Plan:</strong> ${isPro ? 'Pro' : 'Free'}</div>
        </div>

        ${!isPro ? `
          <button id="upgrade-btn" class="primary mb-8">Upgrade to Pro ($5/mo)</button>
        ` : ''}

        <button id="stats-btn" class="secondary mb-8">View Statistics</button>

        <button id="signout-btn" class="ghost">Sign Out</button>
      </div>
    `;

    // Event listeners
    const enabledToggle = this.container.querySelector('#enabled-toggle') as HTMLInputElement;
    enabledToggle?.addEventListener('change', async () => {
      const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.TOGGLE_ENABLED });
      enabledToggle.checked = response.enabled;
    });

    const hideRenderModeSelect = this.container.querySelector('#hide-render-mode') as HTMLSelectElement;
    hideRenderModeSelect?.addEventListener('change', async () => {
      const nextMode = resolveHideRenderMode(hideRenderModeSelect.value);
      await chrome.storage.sync.set({ [HIDE_RENDER_MODE_STORAGE_KEY]: nextMode });
      hideRenderModeSelect.value = nextMode;

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (typeof activeTab?.id === 'number') {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.RELOAD_ACTIVE_TAB,
          tabId: activeTab.id,
        });
      }
    });

    const upgradeBtn = this.container.querySelector('#upgrade-btn');
    upgradeBtn?.addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CREATE_CHECKOUT });
      if (response.checkout_url) {
        chrome.tabs.create({ url: response.checkout_url });
      }
    });

    const statsBtn = this.container.querySelector('#stats-btn');
    statsBtn?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') });
    });

    const signoutBtn = this.container.querySelector('#signout-btn');
    signoutBtn?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_JWT });
      this.render();
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
