// selection logic
document.querySelectorAll('.option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  });
});

// continue button
const cardGrid = document.getElementById('card-grid');
const continueBtn = document.getElementById('continue-btn');

// error handling
continueBtn.addEventListener('click', () => {
  const hasSelection = document.querySelector('.option.selected');
  if (!hasSelection) {
    cardGrid.classList.remove('shake');
    void cardGrid.offsetWidth;
    cardGrid.classList.add('shake');
    return;
  }
  // read destination from the button's data-next attribute
  const next = continueBtn.dataset.next;
  if (next) window.location.href = next;
});

// back button
const backBtn = document.getElementById('back-btn');
if (backBtn) {
  const prev = backBtn.dataset.prev;
  backBtn.addEventListener('click', () => {
    if (prev) window.location.href = prev;
  });
}
