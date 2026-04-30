/* ──────────────────────────────────────────────────────
   Comparison dashboard — vanilla JS, no libraries
   ────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ── State ────────────────────────────────────────── */
  let allItems = [];          // normalised recommendation objects
  let activeFilter = 'all';   // all | amazon | flipkart | single
  let currentSort = 'default';
  let searchTerm = '';

  /* ── DOM refs ─────────────────────────────────────── */
  const $list        = document.getElementById('product-list');
  const $loading     = document.getElementById('loading-indicator');
  const $error       = document.getElementById('error-container');
  const $queryLabel  = document.getElementById('query-label');
  const $searchInput = document.getElementById('search-input');
  const $sortSelect  = document.getElementById('sort-select');
  const $filterRow   = document.getElementById('filter-row');

  /* metric elements */
  const $mCount    = document.getElementById('m-count');
  const $mSaving   = document.getElementById('m-saving');
  const $mAmazon   = document.getElementById('m-amazon');
  const $mFlipkart = document.getElementById('m-flipkart');

  /* ── Boot ─────────────────────────────────────────── */
  const params = new URLSearchParams(window.location.search);
  const query  = params.get('query');

  if (!query) {
    showError('No search query provided. Please return to the home page and try again.');
    $loading.style.display = 'none';
    return;
  }

  $queryLabel.textContent = query;
  document.title = 'Price comparator / ' + query;
  fetchData(query);

  /* ── Events ───────────────────────────────────────── */
  $searchInput.addEventListener('input', function () {
    searchTerm = this.value.trim().toLowerCase();
    render();
  });

  $sortSelect.addEventListener('change', function () {
    currentSort = this.value;
    render();
  });

  $filterRow.addEventListener('click', function (e) {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $filterRow.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    render();
  });

  /* ── Fetch ────────────────────────────────────────── */
  function fetchData(q) {
    fetch('/compare-product?query=' + encodeURIComponent(q))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Failed to fetch product data'); });
        return r.json();
      })
      .then(function (data) {
        $loading.style.display = 'none';
        processData(data);
      })
      .catch(function (err) {
        $loading.style.display = 'none';
        showError('Error: ' + err.message);
      });
  }

  /* ── Process API response into normalised items ──── */
  function processData(data) {
    allItems = [];

    if ((!data.amazon || data.amazon.length === 0) && (!data.flipkart || data.flipkart.length === 0)) {
      showError('No products found matching your search criteria.');
      return;
    }

    var recs = data.recommendations || [];

    // sort matched first
    recs.sort(function (a, b) { return b.similarity - a.similarity; });

    recs.forEach(function (rec) {
      allItems.push(normalise(rec));
    });

    // if there are no recs, build them from raw lists
    if (recs.length === 0) {
      (data.amazon || []).forEach(function (p) {
        allItems.push(normalise({
          amazon_product: p,
          flipkart_product: null,
          better_platform: 'amazon',
          reason: 'Only available on Amazon',
          similarity: 0
        }));
      });
      (data.flipkart || []).forEach(function (p) {
        allItems.push(normalise({
          amazon_product: null,
          flipkart_product: p,
          better_platform: 'flipkart',
          reason: 'Only available on Flipkart',
          similarity: 0
        }));
      });
    }

    render();
  }

  /* ── Normalise a recommendation object ───────────── */
  function normalise(rec) {
    var ap = rec.amazon_product;
    var fp = rec.flipkart_product;

    var aPrice = ap ? parsePrice(ap.price) : null;
    var fPrice = fp ? parsePrice(fp.price) : null;

    var aRating = ap ? parseRating(ap.rating) : null;
    var fRating = fp ? parseRating(fp.rating) : null;

    // name
    var name = '';
    if (ap) name = ap.name;
    else if (fp) name = fp.name;
    // clean
    name = name.replace(/^[\d]+\.\s*/g, '');
    var ri = name.indexOf('ratings &');
    if (ri > -1) name = name.substring(0, ri).trim();

    // image
    var img = null;
    if (ap && ap.image_url && !ap.image_url.startsWith('data:image/svg')) img = ap.image_url;
    else if (fp && fp.image_url && !fp.image_url.startsWith('data:image/svg')) img = fp.image_url;

    // savings
    var savingPct = null;
    var savingAbs = null;
    if (aPrice !== null && fPrice !== null && aPrice > 0 && fPrice > 0) {
      savingAbs = Math.abs(aPrice - fPrice);
      savingPct = Math.round(savingAbs / Math.max(aPrice, fPrice) * 100);
    }

    // best rating (pick higher)
    var bestRating = null;
    if (aRating !== null && fRating !== null) bestRating = Math.max(aRating, fRating);
    else if (aRating !== null) bestRating = aRating;
    else if (fRating !== null) bestRating = fRating;

    // best price (pick lower)
    var bestPrice = null;
    if (aPrice !== null && fPrice !== null) bestPrice = Math.min(aPrice, fPrice);
    else if (aPrice !== null) bestPrice = aPrice;
    else if (fPrice !== null) bestPrice = fPrice;

    var isSingle = (ap === null || fp === null);

    return {
      name: name,
      img: img,
      aPrice: aPrice,
      fPrice: fPrice,
      aRating: aRating,
      fRating: fRating,
      bestRating: bestRating,
      bestPrice: bestPrice,
      winner: rec.better_platform,
      reason: rec.reason || '',
      savingPct: savingPct,
      savingAbs: savingAbs,
      similarity: rec.similarity,
      isSingle: isSingle,
      amazonProduct: ap,
      flipkartProduct: fp,
      rawRec: rec
    };
  }

  /* ── Filter + sort + render ──────────────────────── */
  function render() {
    var filtered = allItems.filter(function (item) {
      // chip filter
      if (activeFilter === 'amazon' && item.winner !== 'amazon') return false;
      if (activeFilter === 'flipkart' && item.winner !== 'flipkart') return false;
      if (activeFilter === 'single' && !item.isSingle) return false;

      // search filter
      if (searchTerm) {
        var hay = (item.name + ' ' + item.reason).toLowerCase();
        if (hay.indexOf(searchTerm) === -1) return false;
      }
      return true;
    });

    // sort
    var sorted = filtered.slice();
    if (currentSort === 'saving') {
      sorted.sort(function (a, b) { return (b.savingPct || 0) - (a.savingPct || 0); });
    } else if (currentSort === 'price') {
      sorted.sort(function (a, b) { return (a.bestPrice || Infinity) - (b.bestPrice || Infinity); });
    } else if (currentSort === 'rating') {
      sorted.sort(function (a, b) { return (b.bestRating || 0) - (a.bestRating || 0); });
    }

    updateMetrics(sorted);
    renderList(sorted);
  }

  /* ── Metrics ──────────────────────────────────────── */
  function updateMetrics(items) {
    $mCount.textContent = items.length;

    var totalSaving = 0;
    var savingCount = 0;
    var amazonWins = 0;
    var flipkartWins = 0;

    items.forEach(function (it) {
      if (it.savingAbs !== null && it.savingAbs > 0) {
        totalSaving += it.savingAbs;
        savingCount++;
      }
      if (!it.isSingle) {
        if (it.winner === 'amazon') amazonWins++;
        if (it.winner === 'flipkart') flipkartWins++;
      }
    });

    if (savingCount > 0) {
      var avgK = (totalSaving / savingCount) / 1000;
      $mSaving.textContent = '\u20B9' + avgK.toFixed(1) + 'k';
    } else {
      $mSaving.textContent = '\u2014';
    }

    $mAmazon.textContent = amazonWins;
    $mFlipkart.textContent = flipkartWins;
  }

  /* ── Render product list ─────────────────────────── */
  function renderList(items) {
    $list.innerHTML = '';
    $list.style.display = 'flex';

    if (items.length === 0) {
      $list.innerHTML = '<div class="empty-state">No products match your current filters.</div>';
      return;
    }

    items.forEach(function (item) {
      $list.appendChild(buildCard(item));
    });
  }

  /* ── Build a single product card ─────────────────── */
  function buildCard(item) {
    var card = document.createElement('div');
    card.className = 'product-card';

    /* Col 1 — thumbnail */
    var thumb = document.createElement('div');
    thumb.className = 'pc-thumb';
    if (item.img) {
      var imgEl = document.createElement('img');
      imgEl.src = item.img;
      imgEl.alt = item.name;
      imgEl.loading = 'lazy';
      thumb.appendChild(imgEl);
    } else {
      thumb.innerHTML = '<svg class="pc-thumb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
    }

    /* Col 2 — body */
    var body = document.createElement('div');
    body.className = 'pc-body';

    var nameEl = document.createElement('div');
    nameEl.className = 'pc-name';
    nameEl.textContent = item.name;

    var prices = document.createElement('div');
    prices.className = 'pc-prices';

    // amazon price
    var aPriceItem = document.createElement('div');
    aPriceItem.className = 'pc-price-item';
    var aPlatLabel = document.createElement('div');
    aPlatLabel.className = 'pc-price-platform';
    aPlatLabel.textContent = 'Amazon';
    var aPriceVal = document.createElement('div');
    if (item.aPrice !== null) {
      aPriceVal.className = 'pc-price-value' + (item.winner === 'amazon' && !item.isSingle ? ' best' : '');
      aPriceVal.textContent = '\u20B9' + item.aPrice.toLocaleString('en-IN');
    } else {
      aPriceVal.className = 'pc-price-value na';
      aPriceVal.textContent = 'N/A';
    }
    aPriceItem.appendChild(aPlatLabel);
    aPriceItem.appendChild(aPriceVal);

    // divider
    var divider = document.createElement('div');
    divider.className = 'pc-price-divider';

    // flipkart price
    var fPriceItem = document.createElement('div');
    fPriceItem.className = 'pc-price-item';
    var fPlatLabel = document.createElement('div');
    fPlatLabel.className = 'pc-price-platform';
    fPlatLabel.textContent = 'Flipkart';
    var fPriceVal = document.createElement('div');
    if (item.fPrice !== null) {
      fPriceVal.className = 'pc-price-value' + (item.winner === 'flipkart' && !item.isSingle ? ' best' : '');
      fPriceVal.textContent = '\u20B9' + item.fPrice.toLocaleString('en-IN');
    } else {
      fPriceVal.className = 'pc-price-value na';
      fPriceVal.textContent = 'N/A';
    }
    fPriceItem.appendChild(fPlatLabel);
    fPriceItem.appendChild(fPriceVal);

    prices.appendChild(aPriceItem);
    prices.appendChild(divider);
    prices.appendChild(fPriceItem);

    body.appendChild(nameEl);
    body.appendChild(prices);

    /* Col 3 — right */
    var right = document.createElement('div');
    right.className = 'pc-right';

    // winner badge
    var badge = document.createElement('span');
    badge.className = 'badge-winner ' + (item.winner === 'amazon' ? 'badge-amazon' : 'badge-flipkart');
    badge.textContent = item.winner === 'amazon' ? 'Amazon' : 'Flipkart';
    right.appendChild(badge);

    // saving or single-platform label
    var savingDiv = document.createElement('div');
    if (item.savingPct !== null && item.savingPct > 0) {
      savingDiv.className = 'pc-saving';
      var pctLine = document.createElement('div');
      pctLine.className = 'pc-saving-pct';
      pctLine.textContent = item.savingPct + '% cheaper';
      var absLine = document.createElement('div');
      absLine.className = 'pc-saving-abs';
      absLine.textContent = 'saves \u20B9' + item.savingAbs.toLocaleString('en-IN');
      savingDiv.appendChild(pctLine);
      savingDiv.appendChild(absLine);
    } else if (item.isSingle) {
      savingDiv.className = 'pc-saving-only';
      savingDiv.textContent = 'Only on ' + (item.winner === 'amazon' ? 'Amazon' : 'Flipkart');
    }
    right.appendChild(savingDiv);

    // star rating
    var ratingVal = item.bestRating;
    if (ratingVal !== null) {
      var ratingRow = document.createElement('div');
      ratingRow.className = 'pc-rating-row';

      var starsDiv = document.createElement('div');
      starsDiv.className = 'stars';
      starsDiv.innerHTML = buildStars(ratingVal);

      var numSpan = document.createElement('span');
      numSpan.className = 'pc-rating-num';
      numSpan.textContent = ratingVal.toFixed(1);

      ratingRow.appendChild(starsDiv);
      ratingRow.appendChild(numSpan);
      right.appendChild(ratingRow);
    }

    card.appendChild(thumb);
    card.appendChild(body);
    card.appendChild(right);

    return card;
  }

  /* ── Star SVG builder ────────────────────────────── */
  function buildStars(rating) {
    var html = '';
    var starPath = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
    for (var i = 1; i <= 5; i++) {
      if (rating >= i) {
        // full
        html += '<span class="star"><svg viewBox="0 0 24 24"><path d="' + starPath + '" class="star-filled"/></svg></span>';
      } else if (rating >= i - 0.5) {
        // half — two layered paths
        html += '<span class="star" style="position:relative;display:inline-block;width:10px;height:10px;">'
          + '<svg viewBox="0 0 24 24" style="position:absolute;left:0;top:0;"><path d="' + starPath + '" class="star-empty"/></svg>'
          + '<svg viewBox="0 0 24 24" style="position:absolute;left:0;top:0;clip-path:inset(0 50% 0 0);"><path d="' + starPath + '" class="star-filled"/></svg>'
          + '</span>';
      } else {
        // empty
        html += '<span class="star"><svg viewBox="0 0 24 24"><path d="' + starPath + '" class="star-empty"/></svg></span>';
      }
    }
    return html;
  }

  /* ── Helpers ──────────────────────────────────────── */
  function parsePrice(raw) {
    if (!raw || raw === 'Price not available') return null;
    var s = String(raw).replace(/[₹,\s]/g, '');
    var n = parseFloat(s);
    return isNaN(n) || n <= 0 ? null : n;
  }

  function parseRating(raw) {
    if (!raw || raw === 'N/A' || raw === 'Rating not available') return null;
    var n = parseFloat(String(raw).split(' ')[0]);
    return isNaN(n) ? null : n;
  }

  function showError(msg) {
    $error.style.display = 'block';
    $error.innerHTML = '<div class="error-box">' + msg + '<br><a href="/">Return to home</a></div>';
  }

})();
