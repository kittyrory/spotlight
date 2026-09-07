//------------------
// FILTER
//------------------

window.applyFilters = function () {
  const query = document
    .getElementById("searchInput")
    .value.toLowerCase()
    .trim();
  const category = window.getActiveCategory
    ? window.getActiveCategory()
    : "All";

  const filtered = (window.WORLDS || []).filter(function (w) {
    const matchCat = category === "All" || w.category === category;
    const matchSearch =
      !query ||
      w.title.toLowerCase().includes(query) ||
      (w.description || w.descripton || "").toLowerCase().includes(query) ||
      (w.tags &&
        w.tags.some(function (t) {
          return t.toLowerCase().includes(query);
        }));
    return matchCat && matchSearch;
  });

  renderWorlds(filtered);
  attachClickListeners();
};

function attachClickListeners() {
  const container = document.getElementById("worldsContainer");
  container.querySelectorAll(".world-btn").forEach(function (btn) {
    const world = (window.WORLDS || []).find(function (w) {
      return w.id == btn.dataset.id;
    });
    if (!world) return;

    const isSelected = (window.getSelected ? window.getSelected() : []).some(
      function (w) {
        return w.id === world.id;
      },
    );
    btn.classList.toggle("selected", isSelected);

    btn.addEventListener("click", function () {
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

  shuffle(list).forEach((world) => {
    const tagsHTML = world.tags
      .map((tag) => `<span class="tag">${tag}</span>`)
      .join("");
    worldsContainer.innerHTML += `
      <button class="world-btn" data-id="${world.id}">
        <img class="world-btn-img" src="${world.image}">
        <div class="world-btn-body">
          <div class="world-btn-title">${world.title}</div>
          <div class="world-btn-description">${world.description || world.descripton || ""}</div>
          <div class="world-btn-tag">${tagsHTML}</div>
        </div>
      </button>
    `;
  });
}

//------------------
// CATEGORY FILTERS
//------------------

(function () {
  let activeCategory = "All";
  const catBtns = document.querySelectorAll(".cat-btn");
  catBtns[0].classList.add("active");
  catBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      catBtns.forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      activeCategory = btn.textContent.trim();
      applyFilters();
    });
  });
  window.getActiveCategory = function () {
    return activeCategory;
  };
})();

//------------------
// DROPDOWN
//------------------

(function () {
  let selected = [];
  const selectionEl = document.getElementById("selection");
  const container = document.getElementById("worldsContainer");

  function updateCount() {
    selectionEl.innerHTML = "<span>" + selected.length + "</span> / 3";
  }

  // selected card behavior
  function updateCardStyles() {
    container.querySelectorAll(".world-btn").forEach(function (btn) {
      const isSelected = selected.some(function (w) {
        return w.id == btn.dataset.id;
      });
      btn.classList.toggle("selected", isSelected);
    });
  }

  window.handleWorldClick = function (world) {
    const idx = selected.findIndex(function (w) {
      return w.id === world.id;
    });

    if (idx > -1) {
      selected.splice(idx, 1);
    } else {
      if (selected.length >= 3) {
        // text shake animation
        var bar = document.getElementById("confirmBar");
        bar.classList.remove("shake");
        void bar.offsetWidth;
        bar.classList.add("shake");
        bar.addEventListener(
          "animationend",
          function () {
            bar.classList.remove("shake");
          },
          { once: true },
        );
        return;
      }
      selected.push(world);
    }

    updateCount();
    updateCardStyles();
    updateConfirmBar();
  };

  window.getSelected = function () {
    return selected;
  };
  window.clearSelected = function () {
    selected = [];
    updateCount();
    updateCardStyles();
  };
})();

//------------------
// SHOW/HIDE + SELECTION PREVIEWS
//------------------

(function () {
  const confirmBar = document.getElementById("confirmBar");
  const countText = document.getElementById("countText");
  const selectedPreviews = document.getElementById("selectedPreviews");

  window.updateConfirmBar = function () {
    const selected = window.getSelected();
    const count = selected.length;

    if (count > 0) {
      confirmBar.classList.add("visible");
    } else {
      confirmBar.classList.remove("visible");
    }

    countText.innerHTML = "<span>" + count + "</span> / 3";

    selectedPreviews.innerHTML = selected
      .map(function (w) {
        return (
          '<img src="' +
          (w.image || "") +
          '" alt="' +
          w.title +
          '" title="' +
          w.title +
          '" ' +
          'style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1.5px solid var(--gold);">'
        );
      })
      .join("");
  };
})();

//------------------
// CLEAR BUTTON
//------------------

(function () {
  const clearBtn = document.querySelector(".clear");
  clearBtn.addEventListener("click", function () {
    window.clearSelected();
    window.updateConfirmBar();
  });
})();

//------------------
// CUSTOM WORLD CREATION
//------------------

(function () {
  const overlay = document.getElementById("cwOverlay");
  const closeBtn = document.getElementById("cwClose");
  const cancelBtn = document.getElementById("cwCancel");
  const submitBtn = document.getElementById("cwSubmit");
  const imgZone = document.getElementById("cwImgZone");
  const imgInput = document.getElementById("cwImgInput");
  const imgPreview = document.getElementById("cwImgPreview");
  const tagInput = document.getElementById("cwTagInput");
  const tagAddBtn = document.getElementById("cwTagAdd");
  const tagPills = document.getElementById("cwTagPills");
  const tagLimit = document.getElementById("cwTagLimit");

  let tags = [];
  let characters = [];
  let imageDataUrl = "";
  let currentWorldId = crypto.randomUUID();

  // wire the existing create button
  document
    .querySelector(".create-btn")
    .addEventListener("click", async function () {
      currentWorldId = crypto.randomUUID();

      const {
        data: { user },
      } = await supabaseClient.auth.getUser();

      const { error } = await supabaseClient.from("worlds").insert({
        id: currentWorldId,
        created_by: user ? user.id : null,
        title: "",
        description: "",
        category: "",
        image: "",
        tags: [],
        characters: [],
        drama: 3,
        cross_universe: false,
      });

      if (error) {
        console.error("Error starting world draft:", error);
        return;
      }

      overlay.classList.add("open");
      document.getElementById("cwTitleInput").focus();
    });

  function close() {
    overlay.classList.remove("open");
    reset();
  }

  async function cancelCreate() {
    const { error } = await supabaseClient
      .from("worlds")
      .delete()
      .eq("id", currentWorldId);
    if (error) console.error("Error cleaning up draft world:", error);
    close();
  }

  function reset() {
    currentWorldId = crypto.randomUUID();
    document.getElementById("cwTitleInput").value = "";
    document.getElementById("cwdescription").value = "";
    document.getElementById("cwCategory").value = "";
    document.getElementById("cwDramaSlider").value = 3;
    document.getElementById("cwDramaValue").textContent = getDramaLabel(3);
    document.getElementById("cwCrossUniverse").checked = false;
    tagInput.value = "";
    tags = [];
    characters = [];
    imageDataUrl = "";
    imgPreview.src = "";
    imgZone.classList.remove("has-img");
    tagPills.innerHTML = "";
    tagLimit.classList.remove("show");
    tagAddBtn.disabled = false;
    document.getElementById("cwCharList").innerHTML = "";
    ["cwTitleErr", "cwdescriptionErr", "cwCatErr"].forEach(function (id) {
      document.getElementById(id).classList.remove("show");
    });
  }

  closeBtn.addEventListener("click", cancelCreate);
  cancelBtn.addEventListener("click", cancelCreate);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cancelCreate();
  });

  // image handling
  imgInput.addEventListener("change", function () {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      imageDataUrl = e.target.result;
      imgPreview.src = imageDataUrl;
      imgZone.classList.add("has-img");
    };
    reader.readAsDataURL(file);
  });

  function renderTags() {
    tagPills.innerHTML = tags
      .map(function (t, i) {
        return (
          '<div class="cw-tag-pill">' +
          t +
          '<button class="cw-tag-pill-remove" data-i="' +
          i +
          '">&times;</button></div>'
        );
      })
      .join("");
    tagPills.querySelectorAll(".cw-tag-pill-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        tags.splice(parseInt(btn.dataset.i), 1);
        renderTags();
      });
    });
    const atMax = tags.length >= 6;
    tagAddBtn.disabled = atMax;
    atMax ? tagLimit.classList.add("show") : tagLimit.classList.remove("show");
  }

  function addTag() {
    const val = tagInput.value.trim();
    if (!val || tags.length >= 6 || tags.includes(val)) {
      tagInput.value = "";
      return;
    }
    tags.push(val);
    tagInput.value = "";
    renderTags();
  }

  tagAddBtn.addEventListener("click", addTag);
  tagInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  });

  // drama slider
  function getDramaLabel(val) {
    const labels = {
      1: "Cozy",
      2: "Chill",
      3: "Balanced",
      4: "Spicy",
      5: "Chaotic",
    };
    return labels[val] || "Balanced";
  }

  document
    .getElementById("cwDramaSlider")
    .addEventListener("input", function () {
      document.getElementById("cwDramaValue").textContent = getDramaLabel(
        parseInt(this.value),
      );
    });

  // character handling
  function renderCharacters() {
    const list = document.getElementById("cwCharList");
    list.innerHTML = characters
      .map(function (c, i) {
        return (
          '<div class="cw-char-pill">' +
          '<span class="cw-char-handle">@' +
          c +
          "</span>" +
          '<button class="cw-tag-pill-remove" data-ci="' +
          i +
          '">&times;</button>' +
          "</div>"
        );
      })
      .join("");
    list.querySelectorAll(".cw-tag-pill-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        characters.splice(parseInt(btn.dataset.ci), 1);
        renderCharacters();
      });
    });
  }

  // character creator modal
  const ccOverlay = document.getElementById("ccOverlay");
  const ccClose = document.getElementById("ccClose");
  const ccCancel = document.getElementById("ccCancel");
  const ccSubmit = document.getElementById("ccSubmit");
  const ccHeaderZone = document.getElementById("ccHeaderZone");
  const ccAvatarZone = document.getElementById("ccAvatarZone");
  const ccHeaderInput = document.getElementById("ccHeaderInput");
  const ccAvatarInput = document.getElementById("ccAvatarInput");
  const ccHeaderImg = document.getElementById("ccHeaderImg");
  const ccAvatarImg = document.getElementById("ccAvatarImg");
  const ccBioInput = document.getElementById("ccBioInput");
  const ccBioBox = document.getElementById("ccBioBox");
  const ccCharCounter = document.getElementById("ccCharCounter");
  const ccTraitsContainer = document.getElementById("ccTraitsContainer");
  const ccTraitTagsEl = document.getElementById("ccTraitTags");
  const ccOverallTypeEl = document.getElementById("ccOverallType");

  let ccHeaderDataUrl = "";
  let ccAvatarDataUrl = "";

  const ccTraits = [
    {
      id: "kindness",
      name: "Kindness",
      axis: "warmth",
      value: 6,
      labels: {
        1: "Compassionate", 2: "Kind", 3: "Patient", 4: "Honest", 5: "Pragmatic",
        6: "Balanced", 7: "Stubborn", 8: "Competitive", 9: "Arrogant",
        10: "Cynical", 11: "Vindictive",
      },
    },
    {
      id: "courage",
      name: "Courage",
      axis: "energy",
      value: 6,
      labels: {
        1: "Timid", 2: "Fearful", 3: "Cautious", 4: "Careful", 5: "Guarded",
        6: "Balanced", 7: "Confident", 8: "Assertive", 9: "Daring",
        10: "Reckless", 11: "Bold",
      },
    },
    {
      id: "charisma",
      name: "Charisma",
      axis: "energy",
      value: 6,
      labels: {
        1: "Reserved", 2: "Guarded", 3: "Shy", 4: "Modest", 5: "Composed",
        6: "Balanced", 7: "Playful", 8: "Charming", 9: "Flirty",
        10: "Seductive", 11: "Irresistible",
      },
    },
  ];

  const ccOverallGrid = {
    "high-high": "Icon", "high-neutral": "Sweetheart", "high-low": "Guardian",
    "neutral-high": "Maverick", "neutral-neutral": "Independent", "neutral-low": "Wallflower",
    "low-high": "Villain", "low-neutral": "Rebel", "low-low": "Enigma",
  };

  const ccOverallDescriptions = {
    Icon: 'Warm and high-energy. People are drawn to you, and you know how to work a room without losing your heart.',
    Sweetheart: 'High warmth, low-key energy. Genuinely kind, easy to trust, and not out to prove anything.',
    Guardian: 'Warm but guarded. You care deeply and protect the people close to you, even if you don\u2019t show it loudly.',
    Maverick: 'Neutral warmth, big energy. Bold, unpredictable, and doing your own thing regardless of who\u2019s watching.',
    Independent: 'Balanced across the board. Not driven by warmth or energy extremes; you make your own calls.',
    Wallflower: 'Neutral warmth, low-key energy. Quiet and steady, more comfortable observing than performing.',
    Villain: 'Low warmth, high energy. Sharp, intense, and not afraid to make enemies to get where you\u2019re going.',
    Rebel: 'Low warmth, neutral energy. Cold on the surface and allergic to rules, but not chasing chaos for its own sake.',
    Enigma: 'Low warmth, low-key energy. Hard to read, keeps people guessing, and gives away very little.',
  };

  function ccBandFromScore(score) {
    if (score >= 2) return "high";
    if (score <= -2) return "low";
    return "neutral";
  }

  ccTraits.forEach(function (trait) {
    const row = document.createElement("div");
    row.className = "cc-trait-row";
    row.innerHTML =
      '<div class="cc-trait-name">' + trait.name + "</div>" +
      '<div class="cc-slider-row">' +
      '<span class="cw-drama-label-edge">' + trait.labels[1] + "</span>" +
      '<input type="range" min="1" max="11" value="' + trait.value +
      '" class="cc-slider" data-trait="' + trait.id + '">' +
      '<span class="cw-drama-label-edge">' + trait.labels[11] + "</span>" +
      "</div>";
    ccTraitsContainer.appendChild(row);
  });

  function ccUpdatePersonality() {
    ccTraitTagsEl.innerHTML = "";
    let warmthScore = 0;
    let energyScore = 0;

    ccTraits.forEach(function (trait) {
      const input = ccTraitsContainer.querySelector(
        '[data-trait="' + trait.id + '"]',
      );
      const val = parseInt(input.value, 10);
      trait.value = val;
      input.style.setProperty("--val", val);

      const deviation = 6 - val;
      if (trait.axis === "warmth") warmthScore += deviation;
      if (trait.axis === "energy") energyScore += -deviation;

      const chip = document.createElement("span");
      chip.className = "cc-trait-chip";
      chip.textContent = trait.name + ": " + trait.labels[val];
      ccTraitTagsEl.appendChild(chip);
    });

    const warmthBand = ccBandFromScore(warmthScore);
    const energyBand = ccBandFromScore(energyScore);
    ccOverallTypeEl.textContent = ccOverallGrid[warmthBand + "-" + energyBand];
  }

  ccTraitsContainer.addEventListener("input", ccUpdatePersonality);
  ccUpdatePersonality();

  function buildCcPersonalityPayload() {
    return {
      traits: ccTraits.reduce(function (acc, trait) {
        acc[trait.id] = { value: trait.value, label: trait.labels[trait.value] };
        return acc;
      }, {}),
      overallType: ccOverallTypeEl.textContent,
      overallDescription: ccOverallDescriptions[ccOverallTypeEl.textContent] || "",
    };
  }

  function ccReset() {
    document.getElementById("ccNameInput").value = "";
    document.getElementById("ccHandleInput").value = "";
    ccBioInput.value = "";
    ccCharCounter.textContent = "0/150";
    ccBioBox.classList.remove(
      "border-disrupter", "border-professional", "border-fan-favorite", "border-enigma",
    );
    ccHeaderImg.src = "";
    ccHeaderImg.style.display = "none";
    ccAvatarImg.src = "";
    ccAvatarImg.style.display = "none";
    document.getElementById("ccBannerText").style.display = "block";
    document.getElementById("ccAvatarPrompt").style.display = "block";
    ccHeaderDataUrl = "";
    ccAvatarDataUrl = "";

    ccTraits.forEach(function (trait) {
      trait.value = 6;
      const input = ccTraitsContainer.querySelector(
        '[data-trait="' + trait.id + '"]',
      );
      input.value = 6;
      input.style.setProperty("--val", 6);
    });
    ccUpdatePersonality();

    ["ccNameErr", "ccHandleErr", "ccBioErr"].forEach(function (id) {
      document.getElementById(id).classList.remove("show");
    });
  }

  document.getElementById("cwCharAddBtn").addEventListener("click", function () {
    ccOverlay.classList.add("open");
    document.getElementById("ccNameInput").focus();
  });

  function closeCc() {
    ccOverlay.classList.remove("open");
    ccReset();
  }

  ccClose.addEventListener("click", closeCc);
  ccCancel.addEventListener("click", closeCc);
  ccOverlay.addEventListener("click", function (e) {
    if (e.target === ccOverlay) closeCc();
  });

  ccHeaderZone.addEventListener("click", function () {
    ccHeaderInput.click();
  });
  ccAvatarZone.addEventListener("click", function (e) {
    e.stopPropagation();
    ccAvatarInput.click();
  });

  ccHeaderInput.addEventListener("change", function () {
    const file = ccHeaderInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      ccHeaderDataUrl = e.target.result;
      ccHeaderImg.src = ccHeaderDataUrl;
      ccHeaderImg.style.display = "block";
      document.getElementById("ccBannerText").style.display = "none";
    };
    reader.readAsDataURL(file);
  });

  ccAvatarInput.addEventListener("change", function () {
    const file = ccAvatarInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      ccAvatarDataUrl = e.target.result;
      ccAvatarImg.src = ccAvatarDataUrl;
      ccAvatarImg.style.display = "block";
      document.getElementById("ccAvatarPrompt").style.display = "none";
    };
    reader.readAsDataURL(file);
  });

  ccBioInput.addEventListener("input", function () {
    ccCharCounter.textContent = ccBioInput.value.length + "/150";

    ccBioBox.classList.remove(
      "border-disrupter", "border-professional", "border-fan-favorite", "border-enigma",
    );
    const val = ccBioInput.value;
    if (/drama|chaotic|wild/i.test(val)) {
      ccBioBox.classList.add("border-disrupter");
    } else if (/boss|hustle|grind/i.test(val)) {
      ccBioBox.classList.add("border-professional");
    } else if (/love|authentic|real/i.test(val)) {
      ccBioBox.classList.add("border-fan-favorite");
    } else if (/dark|iconic|mysterious/i.test(val)) {
      ccBioBox.classList.add("border-enigma");
    }

    document.getElementById("ccBioErr").classList.remove("show");
  });

  async function saveCharacterToDb(character) {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) return null;

    const { data, error } = await supabaseClient
      .from("bot_profiles")
      .insert({
        created_by: user.id,
        world_id: currentWorldId,
        display_name: character.display_name,
        handle: character.handle,
        bio: character.bio,
        avatar_url: character.avatar_url,
        header_url: character.header_url,
        personality: character.personality,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving character:", error);
      return null;
    }
    return data;
  }

  ccSubmit.addEventListener("click", async function () {
    let valid = true;
    const name = document.getElementById("ccNameInput").value.trim();
    const handle = document
      .getElementById("ccHandleInput")
      .value.trim()
      .replace(/^@/, "");
    const bio = ccBioInput.value.trim();

    if (!name) {
      document.getElementById("ccNameErr").classList.add("show");
      valid = false;
    } else {
      document.getElementById("ccNameErr").classList.remove("show");
    }

    if (!handle) {
      document.getElementById("ccHandleErr").classList.add("show");
      valid = false;
    } else {
      document.getElementById("ccHandleErr").classList.remove("show");
    }

    if (!bio) {
      document.getElementById("ccBioErr").classList.add("show");
      valid = false;
    } else {
      document.getElementById("ccBioErr").classList.remove("show");
    }

    if (!valid) return;

    ccSubmit.disabled = true;
    ccSubmit.textContent = "Saving...";

    const saved = await saveCharacterToDb({
      display_name: name,
      handle: handle,
      bio: bio,
      avatar_url: ccAvatarDataUrl || "",
      header_url: ccHeaderDataUrl || "",
      personality: buildCcPersonalityPayload(),
    });

    ccSubmit.disabled = false;
    ccSubmit.textContent = "Create Character";

    if (!saved) return;

    characters.push(handle);
    renderCharacters();
    closeCc();
  });

  // submit handling
  submitBtn.addEventListener("click", async function () {
    let valid = true;
    const title = document.getElementById("cwTitleInput").value.trim();
    const description = document.getElementById("cwdescription").value.trim();
    const cat = document.getElementById("cwCategory").value;
    const drama = parseInt(document.getElementById("cwDramaSlider").value);
    const crossUniverse = document.getElementById("cwCrossUniverse").checked;

    if (!title) {
      document.getElementById("cwTitleErr").classList.add("show");
      valid = false;
    } else {
      document.getElementById("cwTitleErr").classList.remove("show");
    }

    if (!description) {
      document.getElementById("cwdescriptionErr").classList.add("show");
      valid = false;
    } else {
      document.getElementById("cwdescriptionErr").classList.remove("show");
    }

    if (!cat) {
      document.getElementById("cwCatErr").classList.add("show");
      valid = false;
    } else {
      document.getElementById("cwCatErr").classList.remove("show");
    }

    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    const { error } = await supabaseClient
      .from("worlds")
      .update({
        title,
        description,
        category: cat,
        image: imageDataUrl || "",
        tags: [...tags],
        characters: [...characters],
        drama,
        cross_universe: crossUniverse,
      })
      .eq("id", currentWorldId);

    submitBtn.disabled = false;
    submitBtn.textContent = "Create World";

    if (error) {
      console.error("Error saving custom world:", error);
      return;
    }

    window.WORLDS.push({
      id: currentWorldId,
      title,
      description,
      category: cat,
      image: imageDataUrl || "",
      tags: [...tags],
      characters: [...characters],
      drama,
      crossUniverse,
    });

    window.applyFilters();
    close();
  });
})();

//------------------
// SAVE SELECTED WORLDS
//------------------

window.saveWorldsAndContinue = async function () {
  const confirmBtn = document.getElementById("confirmWorldsBtn");
  const selected = window.getSelected ? window.getSelected() : [];

  if (!selected.length) return;

  confirmBtn.disabled = true;
  const originalText = confirmBtn.textContent;
  confirmBtn.textContent = "Saving...";

  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    console.error("No logged in user:", userError);
    window.location.href = "login.html";
    return;
  }

  // just store the essentials per world, not the whole object
  const worldsToSave = selected.map(function (w) {
    return {
      id: w.id,
      title: w.title,
      category: w.category,
      image: w.image || "",
    };
  });

  const { error } = await supabaseClient.from("profiles").upsert({
    id: user.id,
    username: user.user_metadata?.username || user.email?.split("@")[0],
    selected_worlds: worldsToSave,
  });

  if (error) {
    console.error("Error saving selected worlds:", error);
    confirmBtn.disabled = false;
    confirmBtn.textContent = originalText;
    return;
  }

  window.location.href = "loadingpage.html";
};

//------------------
// LOAD WORLDS ON PAGE LOAD
//------------------

(async function loadWorlds() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  if (!user) return;

  const { data, error } = await supabaseClient
    .from("worlds")
    .select("*")
    .or(`created_by.is.null,created_by.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading worlds:", error);
    return;
  }

  const mapped = (data || []).map(function (row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      image: row.image || "",
      tags: row.tags || [],
      characters: row.characters || [],
      drama: row.drama,
      crossUniverse: row.cross_universe,
    };
  });

  window.WORLDS = mapped;
  window.applyFilters();
})();