// extension/src/stats/index.ts
import { StatsInfo } from '../types';
import { Chart, registerables } from 'chart.js';
import { MESSAGE_TYPES } from '../lib/messages';

// Register Chart.js components
Chart.register(...registerables);

interface DailyData {
  date: string;
  keep: number;
  dim: number;
  hide: number;
  total: number;
}

async function loadStats(): Promise<void> {
  const contentEl = document.getElementById('content');
  const backBtn = document.getElementById('back-btn');

  // Back button just closes the tab
  backBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });

  try {
    const stats = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_STATS }) as StatsInfo | null;

    if (!stats) {
      contentEl!.innerHTML = `
        <div class="error">
          Unable to load statistics. Please make sure you're signed in.
        </div>
      `;
      return;
    }

    renderStats(stats);
  } catch (err) {
    console.error('Error loading stats:', err);
    contentEl!.innerHTML = `
      <div class="error">
        An error occurred while loading statistics.
      </div>
    `;
  }
}

function renderStats(stats: StatsInfo): void {
  const contentEl = document.getElementById('content')!;

  // Calculate blocked counts (dim + hide)
  const todayBlocked = stats.today.dim + stats.today.hide;
  const last30Blocked = stats.last_30_days.dim + stats.last_30_days.hide;
  const allTimeBlocked = stats.all_time.dim + stats.all_time.hide;

  // Process daily breakdown for chart
  const dailyMap = new Map<string, DailyData>();

  // Initialize last 30 days
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dailyMap.set(dateStr, { date: dateStr, keep: 0, dim: 0, hide: 0, total: 0 });
  }

  // Fill in actual data
  for (const item of stats.daily_breakdown) {
    const existing = dailyMap.get(item.date);
    if (existing) {
      const decision = item.decision as 'keep' | 'dim' | 'hide';
      existing[decision] = item.count;
      existing.total += item.count;
    }
  }

  const dailyData = Array.from(dailyMap.values());

  contentEl.innerHTML = `
    <!-- Summary Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Today</h3>
        <div class="stat-value">${todayBlocked}</div>
        <div class="stat-detail">posts filtered</div>
      </div>
      <div class="stat-card">
        <h3>Last 30 Days</h3>
        <div class="stat-value">${last30Blocked}</div>
        <div class="stat-detail">posts filtered</div>
      </div>
      <div class="stat-card">
        <h3>All Time</h3>
        <div class="stat-value">${allTimeBlocked}</div>
        <div class="stat-detail">posts filtered</div>
      </div>
    </div>

    <!-- Breakdown by Decision -->
    <div class="breakdown-section">
      <h2>Last 30 Days Breakdown</h2>
      ${renderBreakdownRow('Kept', 'keep', stats.last_30_days.keep, stats.last_30_days.total)}
      ${renderBreakdownRow('Dimmed', 'dim', stats.last_30_days.dim, stats.last_30_days.total)}
      ${renderBreakdownRow('Hidden', 'hide', stats.last_30_days.hide, stats.last_30_days.total)}
    </div>

    <!-- Daily Chart -->
    <div class="chart-section">
      <h2>Daily Activity (Last 30 Days)</h2>
      <div class="chart-container">
        <canvas id="activityChart"></canvas>
      </div>
    </div>
  `;

  // Create Chart.js chart
  createChart(dailyData);
}

function createChart(dailyData: DailyData[]): void {
  const ctx = document.getElementById('activityChart') as HTMLCanvasElement;

  const labels = dailyData.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Hidden',
          data: dailyData.map(d => d.hide),
          backgroundColor: '#FF6B6B',
          borderRadius: 4,
        },
        {
          label: 'Dimmed',
          data: dailyData.map(d => d.dim),
          backgroundColor: '#FFB54C',
          borderRadius: 4,
        },
        {
          label: 'Kept',
          data: dailyData.map(d => d.keep),
          backgroundColor: '#46E3A6',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: 'rgba(255,255,255,0.52)',
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 10,
          },
          grid: {
            display: false,
          },
        },
        y: {
          stacked: true,
          ticks: {
            color: 'rgba(255,255,255,0.52)',
            precision: 0,
          },
          grid: {
            color: 'rgba(255,255,255,0.08)',
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: 'rgba(255,255,255,0.68)',
            padding: 15,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(11,16,32,0.95)',
          titleColor: 'rgba(255,255,255,0.92)',
          bodyColor: 'rgba(255,255,255,0.68)',
          borderColor: 'rgba(255,255,255,0.14)',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
        },
      },
    },
  });
}

function renderBreakdownRow(label: string, type: string, count: number, total: number): string {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return `
    <div class="breakdown-row">
      <div class="breakdown-label">
        <div class="breakdown-dot ${type}"></div>
        <span class="breakdown-name">${label}</span>
      </div>
      <div class="breakdown-bar-container">
        <div class="breakdown-bar ${type}" style="width: ${percent}%;"></div>
      </div>
      <div class="breakdown-count">${count}</div>
    </div>
  `;
}

// Initialize
loadStats();
