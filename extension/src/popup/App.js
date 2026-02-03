export class App {
    constructor(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        this.container = container;
    }
    async render() {
        const storage = await chrome.storage.sync.get(['jwt', 'enabled']);
        if (!storage.jwt) {
            this.renderSignIn();
        }
        else {
            const userInfo = await this.getUserInfo();
            if (userInfo) {
                this.renderDashboard(userInfo, storage.enabled);
            }
            else {
                this.renderSignIn();
            }
        }
    }
    async getUserInfo() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_USER_INFO' });
            return response;
        }
        catch {
            return null;
        }
    }
    renderSignIn() {
        this.container.innerHTML = `
      <div style="text-align: center;">
        <h2 style="margin: 0 0 16px;">Unslop</h2>
        <p style="color: #666; font-size: 14px; margin-bottom: 16px;">
          Sign in to filter your LinkedIn feed
        </p>
        <form id="signin-form" style="display: flex; flex-direction: column; gap: 8px;">
          <input
            type="email"
            id="email-input"
            placeholder="your@email.com"
            required
            style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"
          />
          <button
            type="submit"
            style="padding: 8px 16px; background: #0077b5; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;"
          >
            Send Sign In Link
          </button>
        </form>
        <p id="status" style="font-size: 12px; color: #666; margin-top: 8px;"></p>
      </div>
    `;
        const form = this.container.querySelector('#signin-form');
        const emailInput = this.container.querySelector('#email-input');
        const status = this.container.querySelector('#status');
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
            }
            catch (err) {
                status.textContent = 'Failed to send email. Please try again.';
            }
        });
    }
    renderDashboard(userInfo, enabled) {
        const isPro = userInfo.plan === 'pro' && userInfo.plan_status === 'active';
        this.container.innerHTML = `
      <div>
        <h2 style="margin: 0 0 16px;">Unslop</h2>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="enabled-toggle" ${enabled ? 'checked' : ''} />
            <span>Enable filtering</span>
          </label>
        </div>

        <div style="padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 13px; margin-bottom: 16px;">
          <div><strong>Email:</strong> ${userInfo.email}</div>
          <div><strong>Plan:</strong> ${isPro ? 'Pro' : 'Free'}</div>
        </div>

        ${!isPro ? `
          <button id="upgrade-btn" style="width: 100%; padding: 8px; background: #0077b5; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Upgrade to Pro (3.99/mo)
          </button>
        ` : ''}

        <button id="signout-btn" style="width: 100%; padding: 8px; margin-top: 8px; background: transparent; color: #666; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 13px;">
          Sign Out
        </button>
      </div>
    `;
        // Event listeners
        const enabledToggle = this.container.querySelector('#enabled-toggle');
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
        const signoutBtn = this.container.querySelector('#signout-btn');
        signoutBtn?.addEventListener('click', async () => {
            await chrome.runtime.sendMessage({ type: 'CLEAR_JWT' });
            this.render();
        });
    }
}
