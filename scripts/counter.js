const worldsContainer = document.getElementById("worldsContainer");
const selectionCounter = document.getElementById("selection");

let selectedWorlds = [];
const MAX_WORLDS = 3;

worlds.forEach((world, index) => {
  const tagsHTML = world.tags
    .map(tag => `<span class="tag">${tag}</span>`)
    .join("");

  worldsContainer.innerHTML += `
    <button class="world-btn" data-world-index="${index}">
      <img
        class="world-btn-img"
        src="${world.image}"
      >
      <div class="world-btn-body">
        <div class="world-btn-title">
          ${world.title}
        </div>
        <div class="world-btn-desc">
          ${world.desc}
        </div>
        <div class="world-btn-tag">
          ${tagsHTML}
        </div>
      </div>
    </button>
  `;
});

// click function
document.querySelectorAll(".world-btn").forEach(btn => {
  btn.addEventListener("click", function(e) {
    e.preventDefault();
    
    const worldIndex = this.dataset.worldIndex;
    const worldTitle = worlds[worldIndex].title;
    
    // selection toggle
    if (selectedWorlds.includes(worldTitle)) {
      selectedWorlds = selectedWorlds.filter(w => w !== worldTitle);
      this.classList.remove("selected");
    } 
    else {
      // only allow up to 3 selections
      if (selectedWorlds.length < MAX_WORLDS) {
        selectedWorlds.push(worldTitle);
        this.classList.add("selected");
      }
    }
    
    updateCounter();
  });
});

function updateCounter() {
  const count = selectedWorlds.length;
  selectionCounter.innerHTML = `<span>${count}</span> / ${MAX_WORLDS}`;
}
