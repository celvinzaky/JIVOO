/**
 * client/js/dashboard.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('dashboard');
if (perms) {
  setPageTitle('Dashboard');

  const content = getContentEl();
  content.innerHTML = `
    <div class="stat-grid" id="stat-grid">
      ${skeletonStatCards(4)}
    </div>
    <div class="card" id="note-card" style="display:none;"></div>
    <div class="card mt-16">
      <div class="card-title-row"><h3>Stok Menipis</h3></div>
      <div id="low-stock-list"></div>
    </div>
  `;

  function skeletonStatCards(n) {
    return Array.from({ length: n })
      .map(() => `<div class="stat-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:26px;width:40%;"></div></div>`)
      .join('');
  }

  function statCard(label, value, sub) {
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;
  }

  function formatIDR(n) {
    return 'Rp' + Number(n || 0).toLocaleString('id-ID');
  }

  async function load() {
    try {
      const d = await api.get('/back-office/dashboard');

      document.getElementById('stat-grid').innerHTML =
        statCard('Penjualan Hari Ini', formatIDR(d.today.revenue), `${d.today.transactions} transaksi`) +
        statCard('Total Produk', d.totals.total_products) +
        statCard('Total Pelanggan', d.totals.total_customers) +
        statCard('Stok Menipis', d.totals.low_stock_count, d.totals.low_stock_count > 0 ? 'perlu restock' : 'aman');

      if (d.note) {
        const noteCard = document.getElementById('note-card');
        noteCard.style.display = 'block';
        noteCard.innerHTML = `<p class="text-sm" style="margin:0;">&#8505;&#65039; ${d.note}</p>`;
      }

      const lowStockEl = document.getElementById('low-stock-list');
      lowStockEl.innerHTML = d.low_stock_items.length
        ? `<div class="table-wrap"><table><thead><tr><th>Produk ID</th><th>Stok</th><th>Ambang Batas</th></tr></thead><tbody>${d.low_stock_items
            .map((i) => `<tr><td>${i.product_id}</td><td>${i.stock_qty}</td><td>${i.low_stock_threshold}</td></tr>`)
            .join('')}</tbody></table></div>`
        : `<div class="empty-state text-sm">Tidak ada produk dengan stok menipis</div>`;
    } catch (err) {
      showToast(err.message || 'Gagal memuat dashboard', 'error');
    }
  }

  load();
}
