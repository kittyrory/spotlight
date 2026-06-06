//------------------
// FILTER
//------------------

window.applyFilters = function () {
  const query    = document.getElementById('searchInput').value.toLowerCase().trim();
  const category = window.getActiveCategory ? window.getActiveCategory() : 'All';

  const filtered = (window.WORLDS || []).filter(function (w) {
    const matchCat    = category === 'All' || w.category === category;
    const matchSearch = !query
      || w.title.toLowerCase().includes(query)
      || (w.desc && w.desc.toLowerCase().includes(query))
      || (w.tags && w.tags.some(function (t) { return t.toLowerCase().includes(query); }));
    return matchCat && matchSearch;
  });

  renderWorlds(filtered);
  attachClickListeners();
};

function attachClickListeners() {
  const container = document.getElementById('worldsContainer');
  container.querySelectorAll('.world-btn').forEach(function (btn) {
    const world = (window.WORLDS || []).find(function (w) { return w.id == btn.dataset.id; });
    if (!world) return;

    const isSelected = (window.getSelected ? window.getSelected() : [])
      .some(function (w) { return w.id === world.id; });
    btn.style.borderColor = isSelected ? '#e2bb00' : '';
    btn.style.background  = isSelected ? '#0D0D0D' : '';

    btn.addEventListener('click', function () {
      window.handleWorldClick(world);
    });
  });
}

//------------------
// RENDER WORLDS
//------------------

function renderWorlds(list) {
  const worldsContainer = document.getElementById("worldsContainer");
  worldsContainer.innerHTML = "";

  list.forEach(world => {
    const tagsHTML = world.tags
      .map(tag => `<span class="tag">${tag}</span>`)
      .join("");

    worldsContainer.innerHTML += `
      <button class="world-btn" data-id="${world.id}">
        <img class="world-btn-img" src="${world.image}">
        <div class="world-btn-body">
          <div class="world-btn-title">${world.title}</div>
          <div class="world-btn-desc">${world.desc}</div>
          <div class="world-btn-tag">${tagsHTML}</div>
        </div>
      </button>
    `;
  });
}

worlds.forEach((world, i) => { world.id = i; });
window.WORLDS = worlds;
renderWorlds(worlds);
attachClickListeners();

//------------------
// SEARCH FUNCTION
//------------------

(function () {
  let searchQuery = '';
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', function (e) {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilters();
  });
})();

//------------------
// CATEGORY FILTERS
//------------------

(function () {
  let activeCategory = 'All';
  const catBtns = document.querySelectorAll('.cat-btn');
  catBtns[0].classList.add('active');
  catBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      catBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeCategory = btn.textContent.trim();
      applyFilters();
    });
  });
  window.getActiveCategory = function () { return activeCategory; };
})();

//------------------
// DROPDOWN
// (count, cap, dynamic "_/3" text, & shake)
//------------------

(function () {
  let selected = [];
  const selectionEl = document.getElementById('selection');
  const container   = document.getElementById('worldsContainer');

  function updateCount() {
    selectionEl.innerHTML = '<span>' + selected.length + '</span> / 3';
  }
  
  // selected card behavior
  function updateCardStyles() {
    container.querySelectorAll('.world-btn').forEach(function (btn) {
      const isSelected = selected.some(function (w) { return w.id == btn.dataset.id; });
      btn.style.borderColor = isSelected ? '#e2bb00' : '';
      btn.style.background  = isSelected ? '#0D0D0D' : '';
    });
  }

  window.handleWorldClick = function (world) {
    const idx = selected.findIndex(function (w) { return w.id === world.id; });

    if (idx > -1) {
      selected.splice(idx, 1);
    } else {
      if (selected.length >= 3) {
        // text shake animation
        var bar = document.getElementById('confirmBar');
        bar.classList.remove('shake');
        void bar.offsetWidth;
        bar.classList.add('shake');
        bar.addEventListener('animationend', function () {
          bar.classList.remove('shake');
        }, { once: true });
        return;
      }
      selected.push(world);
    }

    updateCount();
    updateCardStyles();
    updateConfirmBar();
  };

  window.getSelected   = function () { return selected; };
  window.clearSelected = function () { selected = []; updateCount(); updateCardStyles(); };
})();

//------------------
// SHOW/HIDE + SELECTION PREVIEWS
//------------------

(function () {
  const confirmBar       = document.getElementById('confirmBar');
  const countText        = document.getElementById('countText');
  const selectedPreviews = document.getElementById('selectedPreviews');

  window.updateConfirmBar = function () {
    const selected = window.getSelected();
    const count    = selected.length;

    if (count > 0) {
      confirmBar.classList.add('visible');
    } else {
      confirmBar.classList.remove('visible');
    }

    countText.innerHTML = '<span>' + count + '</span> / 3';

    selectedPreviews.innerHTML = selected.map(function (w) {
      return '<img src="' + (w.image || '') + '" alt="' + w.title + '" title="' + w.title + '" '
        + 'style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1.5px solid var(--accent);">';
    }).join('');
  };
})();

//------------------
// CLEAR BUTTON
//------------------

(function () {
  const clearBtn = document.querySelector('.clear');
  clearBtn.addEventListener('click', function () {
    window.clearSelected();
    window.updateConfirmBar();
  });
})();
