// extension/src/popup/App.ts
import { UserInfo, UsageInfo } from '../types';

export class App {
  private container: HTMLElement;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async render(): Promise<void> {
    const storage = await chrome.storage.sync.get(['jwt', 'enabled']);

    if (!storage.jwt) {
      this.renderSignIn();
    } else {
      const userInfo = await this.getUserInfo();
      if (userInfo) {
        const usageInfo = await this.getUsageInfo();
        this.renderDashboard(userInfo, usageInfo, storage.enabled);
      } else {
        this.renderSignIn();
      }
    }
  }

  private async getUserInfo(): Promise<UserInfo | null> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_USER_INFO' });
      if (!response || !response.email) {
        console.log('Invalid user info response:', response);
        return null;
      }
      return response;
    } catch (err) {
      console.error('GetUserInfo error:', err);
      return null;
    }
  }

  private async getUsageInfo(): Promise<UsageInfo | null> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE' });
      return response;
    } catch (err) {
      console.error('GetUsageInfo error:', err);
      return null;
    }
  }

  private renderSignIn(): void {
    this.container.innerHTML = `
      <div class="text-center">
        <h2>Unslop</h2>
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
          type: 'START_AUTH',
          email,
        });

        status.textContent = 'Check your email for a sign-in link.';
        emailInput.value = '';
      } catch (err) {
        status.textContent = 'Failed to send email. Please try again.';
      }
    });
  }

  private renderDashboard(userInfo: UserInfo, usageInfo: UsageInfo | null, enabled: boolean): void {
    const isPro = userInfo.plan === 'pro' && userInfo.plan_status === 'active';

    // Usage display
    let usageHtml = '';
    if (usageInfo) {
      const usagePercent = Math.round((usageInfo.current_usage / usageInfo.limit) * 100);
      const isLow = usageInfo.remaining < usageInfo.limit * 0.1;
      const barColor = isLow ? 'var(--warning)' : 'var(--accent)';
      const resetDate = new Date(usageInfo.reset_date);
      const resetStr = resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      usageHtml = `
        <div class="card usage-card mb-8">
          <div class="usage-header">
            <span class="usage-label">Monthly Usage</span>
            <span class="usage-count ${isLow ? 'low' : ''}">${usageInfo.remaining} remaining</span>
          </div>
          <div class="usage-bar-bg">
            <div class="usage-bar" style="width: ${Math.min(usagePercent, 100)}%; background: ${barColor};"></div>
          </div>
          <div class="usage-footer">
            <span>${usageInfo.current_usage} / ${usageInfo.limit} calls</span>
            <span>Resets ${resetStr}</span>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div>
        <h2>Unslop</h2>

        <div class="mb-8">
          <label class="toggle-label">
            <input type="checkbox" id="enabled-toggle" ${enabled ? 'checked' : ''} />
            <div class="toggle"></div>
            <span class="toggle-text">Enable filtering</span>
          </label>
        </div>

        ${usageHtml}

        <div class="card mb-8">
          <div><strong>Email:</strong> ${userInfo.email || 'Loading...'}</div>
          <div><strong>Plan:</strong> ${isPro ? 'Pro' : 'Free'}</div>
        </div>

        ${!isPro ? `
          <button id="upgrade-btn" class="primary mb-8">Upgrade to Pro ($3.99/mo)</button>
        ` : ''}

        <button id="stats-btn" class="secondary mb-8">View Statistics</button>

        <button id="signout-btn" class="ghost">Sign Out</button>
      </div>
    `;

    // Event listeners
    const enabledToggle = this.container.querySelector('#enabled-toggle') as HTMLInputElement;
    enabledToggle?.addEventListener('change', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED' });
      enabledToggle.checked = response.enabled;
    });

    const upgradeBtn = this.container.querySelector('#upgrade-btn');
    upgradeBtn?.addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'CREATE_CHECKOUT' });
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
      await chrome.runtime.sendMessage({ type: 'CLEAR_JWT' });
      this.render();
    });
  }
}

