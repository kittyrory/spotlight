// changes the color for the buttons when clicked

document.querySelectorAll('.option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  });
});
