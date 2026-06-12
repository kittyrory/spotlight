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

function shuffle(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function renderWorlds(list) {
  const worldsContainer = document.getElementById("worldsContainer");
  worldsContainer.innerHTML = "";

  shuffle(list).forEach(world => {      // <-- just wrap list with shuffle()
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

//------------------
// CUSTOM WORLD CREATION
//------------------

(function () {
  const overlay    = document.getElementById('cwOverlay');
  const closeBtn   = document.getElementById('cwClose');
  const cancelBtn  = document.getElementById('cwCancel');
  const submitBtn  = document.getElementById('cwSubmit');
  const imgZone    = document.getElementById('cwImgZone');
  const imgInput   = document.getElementById('cwImgInput');
  const imgPreview = document.getElementById('cwImgPreview');
  const tagInput   = document.getElementById('cwTagInput');
  const tagAddBtn  = document.getElementById('cwTagAdd');
  const tagPills   = document.getElementById('cwTagPills');
  const tagLimit   = document.getElementById('cwTagLimit');

  let tags         = [];
  let characters   = [];
  let imageDataUrl = '';

  // wire the existing create button
  document.querySelector('.create-btn').addEventListener('click', function () {
    overlay.classList.add('open');
    document.getElementById('cwTitleInput').focus();
  });

  function close() {
    overlay.classList.remove('open');
    reset();
  }

  function reset() {
    document.getElementById('cwTitleInput').value = '';
    document.getElementById('cwDesc').value = '';
    document.getElementById('cwCategory').value = '';
    document.getElementById('cwDramaSlider').value = 3;
    document.getElementById('cwDramaValue').textContent = getDramaLabel(3);
    document.getElementById('cwCrossUniverse').checked = false;
    tagInput.value = '';
    tags = []; characters = []; imageDataUrl = '';
    imgPreview.src = ''; imgZone.classList.remove('has-img');
    tagPills.innerHTML = ''; tagLimit.classList.remove('show');
    tagAddBtn.disabled = false;
    document.getElementById('cwCharList').innerHTML = '';
    document.getElementById('cwCharInput').value = '';
    ['cwTitleErr', 'cwDescErr', 'cwCatErr'].forEach(function (id) {
      document.getElementById(id).classList.remove('show');
    });
  }

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

  // image handling
  imgInput.addEventListener('change', function () {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      imageDataUrl = e.target.result;
      imgPreview.src = imageDataUrl;
      imgZone.classList.add('has-img');
    };
    reader.readAsDataURL(file);
  });

  // tag handling — limit bumped to 6
  function renderTags() {
    tagPills.innerHTML = tags.map(function (t, i) {
      return '<div class="cw-tag-pill">' + t +
        '<button class="cw-tag-pill-remove" data-i="' + i + '">&times;</button></div>';
    }).join('');
    tagPills.querySelectorAll('.cw-tag-pill-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tags.splice(parseInt(btn.dataset.i), 1);
        renderTags();
      });
    });
    const atMax = tags.length >= 6;
    tagAddBtn.disabled = atMax;
    atMax ? tagLimit.classList.add('show') : tagLimit.classList.remove('show');
  }

  function addTag() {
    const val = tagInput.value.trim();
    if (!val || tags.length >= 6 || tags.includes(val)) { tagInput.value = ''; return; }
    tags.push(val);
    tagInput.value = '';
    renderTags();
  }

  tagAddBtn.addEventListener('click', addTag);
  tagInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  });

  // drama slider
  function getDramaLabel(val) {
    const labels = { 1: 'Cozy', 2: 'Chill', 3: 'Balanced', 4: 'Spicy', 5: 'Chaotic' };
    return labels[val] || 'Balanced';
  }

  document.getElementById('cwDramaSlider').addEventListener('input', function () {
    document.getElementById('cwDramaValue').textContent = getDramaLabel(parseInt(this.value));
  });

  // character handling
  function renderCharacters() {
    const list = document.getElementById('cwCharList');
    list.innerHTML = characters.map(function (c, i) {
      return '<div class="cw-char-pill">' +
        '<span class="cw-char-handle">@' + c + '</span>' +
        '<button class="cw-tag-pill-remove" data-ci="' + i + '">&times;</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('.cw-tag-pill-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        characters.splice(parseInt(btn.dataset.ci), 1);
        renderCharacters();
      });
    });
  }

  function addCharacter() {
    let val = document.getElementById('cwCharInput').value.trim().replace(/^@/, '');
    if (!val || characters.includes(val)) {
      document.getElementById('cwCharInput').value = '';
      return;
    }
    characters.push(val);
    document.getElementById('cwCharInput').value = '';
    renderCharacters();
  }

  document.getElementById('cwCharAddBtn').addEventListener('click', addCharacter);
  document.getElementById('cwCharInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addCharacter(); }
  });

  // submit handling
  submitBtn.addEventListener('click', function () {
    let valid = true;
    const title = document.getElementById('cwTitleInput').value.trim();
    const desc  = document.getElementById('cwDesc').value.trim();
    const cat   = document.getElementById('cwCategory').value;
    const drama = parseInt(document.getElementById('cwDramaSlider').value);
    const crossUniverse = document.getElementById('cwCrossUniverse').checked;

    if (!title) { document.getElementById('cwTitleErr').classList.add('show'); valid = false; }
    else { document.getElementById('cwTitleErr').classList.remove('show'); }

    if (!desc) { document.getElementById('cwDescErr').classList.add('show'); valid = false; }
    else { document.getElementById('cwDescErr').classList.remove('show'); }

    if (!cat) { document.getElementById('cwCatErr').classList.add('show'); valid = false; }
    else { document.getElementById('cwCatErr').classList.remove('show'); }

    if (!valid) return;

    window.WORLDS.push({
      id: Date.now(),
      title, desc, category: cat,
      image: imageDataUrl || '',
      tags: [...tags],
      characters: [...characters],
      drama,
      crossUniverse
    });

    window.applyFilters();
    close();
  });
})();