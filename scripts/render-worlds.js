// This file should be loaded at the bottom of the page, after the HTML renders

const worldsContainer = document.getElementById("worldsContainer");

worlds.forEach(world => {
  const tagsHTML = world.tags
    .map(tag => `<span class="tag">${tag}</span>`)
    .join("");

  worldsContainer.innerHTML += `
    <button class="world-btn">
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
