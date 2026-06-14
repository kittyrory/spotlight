// selection logic

document.querySelectorAll('.option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  });
});

// error handling

const cardGrid = document.getElementById('card-grid');
document.getElementById('continue-btn').addEventListener('click', () => {
  const hasSelection = document.querySelector('.option.selected');

  if (!hasSelection) {
    cardGrid.classList.remove('shake');
    void cardGrid.offsetWidth;
    cardGrid.classList.add('shake');
    return;
  }
