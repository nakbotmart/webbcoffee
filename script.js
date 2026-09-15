/* ==========================================================================
   Fresh Craft Coffee — script.js
   Handles: product.html (list + filter), order.html (autofill + submit),
            admin.html (orders table from published Google Sheet CSV)
   ========================================================================== */

(function () {
  'use strict';

  const PRODUCTS_URL = 'products.json';
  const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwndaMgVNnN8HabBVCLAPhLf_z926x9wfS41ZFkVbRIsfcfaLuJHb-BCP4j5Kdg51PS/exec';
  const ORDERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTQ3ZV_waOPVj20de-qGlnNKn5AygN13Sv71Nuwxig46_DtlCRlBb285HFKjPfVkiPL0L-qbS_hE91R/pub?gid=0&single=true&output=csv';

  const MOODS = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'espresso', label: 'เข้มข้น ตื่นตัว' },
    { value: 'latte', label: 'นุ่มนวล ผ่อนคลาย' },
    { value: 'fruity', label: 'สดชื่น ผลไม้' },
    { value: 'coldbrew', label: 'สกัดเย็น ดื่มง่าย' }
  ];

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('product-list')) initProductPage();
    if (document.getElementById('orderForm')) initOrderPage();
    if (document.getElementById('ordersTable')) initAdminPage();
  });

  /* ------------------------------------------------------------------------
     product.html — list products + mood filter bar
     ------------------------------------------------------------------------ */
  function initProductPage() {
    const listEl = document.getElementById('product-list');
    const filterBar = document.getElementById('filter-bar');

    renderFilterBar(filterBar);

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load products.json (' + res.status + ')');
        return res.json();
      })
      .then(function (products) {
        const params = new URLSearchParams(window.location.search);
        const mood = params.get('mood') || 'all';
        setActiveFilterButton(filterBar, mood);
        renderProducts(listEl, filterProducts(products, mood));

        // Re-filter on button click without reloading the page.
        filterBar.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-mood]');
          if (!btn) return;
          const selectedMood = btn.getAttribute('data-mood');
          setActiveFilterButton(filterBar, selectedMood);
          renderProducts(listEl, filterProducts(products, selectedMood));

          const url = new URL(window.location.href);
          if (selectedMood === 'all') {
            url.searchParams.delete('mood');
          } else {
            url.searchParams.set('mood', selectedMood);
          }
          window.history.replaceState({}, '', url);
        });
      })
      .catch(function (err) {
        console.error(err);
        listEl.innerHTML = '<p class="badge-empty">ไม่สามารถโหลดข้อมูลสินค้าได้ กรุณาลองใหม่อีกครั้ง</p>';
      });
  }

  function renderFilterBar(filterBar) {
    if (!filterBar) return;
    filterBar.innerHTML = MOODS.map(function (m) {
      return '<button type="button" class="filter-btn" data-mood="' + m.value + '">' + m.label + '</button>';
    }).join('');
  }

  function setActiveFilterButton(filterBar, mood) {
    if (!filterBar) return;
    const buttons = filterBar.querySelectorAll('[data-mood]');
    buttons.forEach(function (btn) {
      const isActive = btn.getAttribute('data-mood') === mood;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function filterProducts(products, mood) {
    if (!mood || mood === 'all') return products;
    return products.filter(function (p) { return p.mood === mood; });
  }

  function renderProducts(listEl, products) {
    if (!listEl) return;

    if (!products || products.length === 0) {
      listEl.innerHTML = '<p class="badge-empty">ไม่พบสินค้าในหมวดหมู่นี้</p>';
      return;
    }

    listEl.innerHTML = products.map(function (p) {
      const orderUrl = 'order.html?item=' + encodeURIComponent(p.name) + '&price=' + encodeURIComponent(p.price);
      return (
        '<article class="product-card">' +
          '<img class="product-image" src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">' +
          '<div class="product-body">' +
            '<span class="mood-tag mood-' + escapeHtml(p.mood) + '">' + escapeHtml(moodLabel(p.mood)) + '</span>' +
            '<h3 class="product-name">' + escapeHtml(p.name) + '</h3>' +
            '<div class="product-price">' + Number(p.price).toLocaleString('th-TH') + ' บาท</div>' +
            '<a class="btn btn-caramel" href="' + orderUrl + '">สั่งซื้อ</a>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function moodLabel(mood) {
    const found = MOODS.find(function (m) { return m.value === mood; });
    return found ? found.label : mood;
  }

  /* ------------------------------------------------------------------------
     order.html — autofill from URL params, submit to Apps Script endpoint
     ------------------------------------------------------------------------ */
  function initOrderPage() {
    const form = document.getElementById('orderForm');
    const itemsEl = document.getElementById('items');
    const totalEl = document.getElementById('total');
    const customerNameEl = document.getElementById('customerName');
    const contactEl = document.getElementById('contact');
    const noteEl = document.getElementById('note');

    const params = new URLSearchParams(window.location.search);
    const itemName = params.get('item') || '';
    const price = Number(params.get('price')) || 0;

    // Auto-fill items and total as soon as the page loads.
    if (itemsEl) {
      itemsEl.value = itemName
        ? itemName + ' x1'
        : 'ไม่พบรายการสินค้า กรุณาเลือกสินค้าจากหน้าเมนูอีกครั้ง';
    }
    if (totalEl) {
      totalEl.value = price.toLocaleString('th-TH') + ' บาท';
    }

    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const payload = {
        customerName: customerNameEl ? customerNameEl.value.trim() : '',
        contact: contactEl ? contactEl.value.trim() : '',
        item: itemName,
        price: price,
        total: price,
        note: noteEl ? noteEl.value.trim() : ''
      };

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
        .then(function () {
          window.location.href = 'thankyou.html';
        })
        .catch(function (err) {
          console.error(err);
          if (submitBtn) submitBtn.disabled = false;
          alert('ไม่สามารถส่งคำสั่งซื้อได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
        });
    });
  }

  /* ------------------------------------------------------------------------
     admin.html — load orders CSV into #ordersTable tbody
     ------------------------------------------------------------------------ */
  function initAdminPage() {
    const table = document.getElementById('ordersTable');
    const tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));

    fetch(ORDERS_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load orders CSV (' + res.status + ')');
        return res.text();
      })
      .then(function (csvText) {
        const rows = parseCsv(csvText);
        if (rows.length <= 1) {
          tbody.innerHTML = '<tr><td colspan="6">ยังไม่มีคำสั่งซื้อ</td></tr>';
          return;
        }
        const dataRows = rows.slice(1); // skip header row
        tbody.innerHTML = dataRows
          .filter(function (row) { return row.some(function (cell) { return cell.trim() !== ''; }); })
          .map(function (row) {
            return '<tr>' + row.map(function (cell) { return '<td>' + escapeHtml(cell) + '</td>'; }).join('') + '</tr>';
          })
          .join('');
      })
      .catch(function (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="6">ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้</td></tr>';
      });
  }

  // Minimal RFC4180-style CSV parser: handles quoted fields, commas and
  // newlines inside quotes, and escaped double quotes ("").
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') { field += '"'; i++; }
        else if (char === '"') { inQuotes = false; }
        else { field += char; }
      } else {
        if (char === '"') { inQuotes = true; }
        else if (char === ',') { row.push(field); field = ''; }
        else if (char === '\r') { /* skip */ }
        else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += char; }
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
  }

  /* ------------------------------------------------------------------------
     Utility
     ------------------------------------------------------------------------ */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
/* ==========================================================================
   Fresh Craft Coffee — script.js
   Handles: product.html (list + filter), order.html (autofill + submit),
            admin.html (orders table from published Google Sheet CSV)
   ========================================================================== */

(function () {
  'use strict';

  const PRODUCTS_URL = 'products.json';
  const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwndaMgVNnN8HabBVCLAPhLf_z926x9wfS41ZFkVbRIsfcfaLuJHb-BCP4j5Kdg51PS/exec';
  const ORDERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTQ3ZV_waOPVj20de-qGlnNKn5AygN13Sv71Nuwxig46_DtlCRlBb285HFKjPfVkiPL0L-qbS_hE91R/pub?gid=0&single=true&output=csv';

  const MOODS = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'espresso', label: 'เข้มข้น ตื่นตัว' },
    { value: 'latte', label: 'นุ่มนวล ผ่อนคลาย' },
    { value: 'fruity', label: 'สดชื่น ผลไม้' },
    { value: 'coldbrew', label: 'สกัดเย็น ดื่มง่าย' }
  ];

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('product-list')) initProductPage();
    if (document.getElementById('orderForm')) initOrderPage();
    if (document.getElementById('ordersTable')) initAdminPage();
  });

  /* ------------------------------------------------------------------------
     product.html — list products + mood filter bar
     ------------------------------------------------------------------------ */
  function initProductPage() {
    const listEl = document.getElementById('product-list');
    const filterBar = document.getElementById('filter-bar');

    renderFilterBar(filterBar);

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load products.json (' + res.status + ')');
        return res.json();
      })
      .then(function (products) {
        const params = new URLSearchParams(window.location.search);
        const mood = params.get('mood') || 'all';
        setActiveFilterButton(filterBar, mood);
        renderProducts(listEl, filterProducts(products, mood));

        // Re-filter on button click without reloading the page.
        filterBar.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-mood]');
          if (!btn) return;
          const selectedMood = btn.getAttribute('data-mood');
          setActiveFilterButton(filterBar, selectedMood);
          renderProducts(listEl, filterProducts(products, selectedMood));

          const url = new URL(window.location.href);
          if (selectedMood === 'all') {
            url.searchParams.delete('mood');
          } else {
            url.searchParams.set('mood', selectedMood);
          }
          window.history.replaceState({}, '', url);
        });
      })
      .catch(function (err) {
        console.error(err);
        listEl.innerHTML = '<p class="badge-empty">ไม่สามารถโหลดข้อมูลสินค้าได้ กรุณาลองใหม่อีกครั้ง</p>';
      });
  }

  function renderFilterBar(filterBar) {
    if (!filterBar) return;
    filterBar.innerHTML = MOODS.map(function (m) {
      return '<button type="button" class="filter-btn" data-mood="' + m.value + '">' + m.label + '</button>';
    }).join('');
  }

  function setActiveFilterButton(filterBar, mood) {
    if (!filterBar) return;
    const buttons = filterBar.querySelectorAll('[data-mood]');
    buttons.forEach(function (btn) {
      const isActive = btn.getAttribute('data-mood') === mood;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function filterProducts(products, mood) {
    if (!mood || mood === 'all') return products;
    return products.filter(function (p) { return p.mood === mood; });
  }

  function renderProducts(listEl, products) {
    if (!listEl) return;

    if (!products || products.length === 0) {
      listEl.innerHTML = '<p class="badge-empty">ไม่พบสินค้าในหมวดหมู่นี้</p>';
      return;
    }

    listEl.innerHTML = products.map(function (p) {
      const orderUrl = 'order.html?item=' + encodeURIComponent(p.name) + '&price=' + encodeURIComponent(p.price);
      return (
        '<article class="product-card">' +
          '<img class="product-image" src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">' +
          '<div class="product-body">' +
            '<span class="mood-tag mood-' + escapeHtml(p.mood) + '">' + escapeHtml(moodLabel(p.mood)) + '</span>' +
            '<h3 class="product-name">' + escapeHtml(p.name) + '</h3>' +
            '<div class="product-price">' + Number(p.price).toLocaleString('th-TH') + ' บาท</div>' +
            '<a class="btn btn-caramel" href="' + orderUrl + '">สั่งซื้อ</a>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function moodLabel(mood) {
    const found = MOODS.find(function (m) { return m.value === mood; });
    return found ? found.label : mood;
  }

  /* ------------------------------------------------------------------------
     order.html — autofill from URL params, submit to Apps Script endpoint
     ------------------------------------------------------------------------ */
  function initOrderPage() {
    const form = document.getElementById('orderForm');
    const itemsEl = document.getElementById('items');
    const totalEl = document.getElementById('total');
    const customerNameEl = document.getElementById('customerName');
    const contactEl = document.getElementById('contact');
    const noteEl = document.getElementById('note');

    const params = new URLSearchParams(window.location.search);
    const itemName = params.get('item') || '';
    const price = Number(params.get('price')) || 0;

    // Auto-fill items and total as soon as the page loads.
    if (itemsEl) {
      itemsEl.value = itemName
        ? itemName + ' x1'
        : 'ไม่พบรายการสินค้า กรุณาเลือกสินค้าจากหน้าเมนูอีกครั้ง';
    }
    if (totalEl) {
      totalEl.value = price.toLocaleString('th-TH') + ' บาท';
    }

    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const payload = {
        customerName: customerNameEl ? customerNameEl.value.trim() : '',
        contact: contactEl ? contactEl.value.trim() : '',
        item: itemName,
        price: price,
        total: price,
        note: noteEl ? noteEl.value.trim() : ''
      };

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
        .then(function () {
          window.location.href = 'thankyou.html';
        })
        .catch(function (err) {
          console.error(err);
          if (submitBtn) submitBtn.disabled = false;
          alert('ไม่สามารถส่งคำสั่งซื้อได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
        });
    });
  }

  /* ------------------------------------------------------------------------
     admin.html — load orders CSV into #ordersTable tbody
     ------------------------------------------------------------------------ */
  function initAdminPage() {
    const table = document.getElementById('ordersTable');
    const tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));

    fetch(ORDERS_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load orders CSV (' + res.status + ')');
        return res.text();
      })
      .then(function (csvText) {
        const rows = parseCsv(csvText);
        if (rows.length <= 1) {
          tbody.innerHTML = '<tr><td colspan="6">ยังไม่มีคำสั่งซื้อ</td></tr>';
          return;
        }
        const dataRows = rows.slice(1); // skip header row
        tbody.innerHTML = dataRows
          .filter(function (row) { return row.some(function (cell) { return cell.trim() !== ''; }); })
          .map(function (row) {
            return '<tr>' + row.map(function (cell) { return '<td>' + escapeHtml(cell) + '</td>'; }).join('') + '</tr>';
          })
          .join('');
      })
      .catch(function (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="6">ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้</td></tr>';
      });
  }

  // Minimal RFC4180-style CSV parser: handles quoted fields, commas and
  // newlines inside quotes, and escaped double quotes ("").
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') { field += '"'; i++; }
        else if (char === '"') { inQuotes = false; }
        else { field += char; }
      } else {
        if (char === '"') { inQuotes = true; }
        else if (char === ',') { row.push(field); field = ''; }
        else if (char === '\r') { /* skip */ }
        else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += char; }
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
  }

  /* ------------------------------------------------------------------------
     Utility
     ------------------------------------------------------------------------ */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
