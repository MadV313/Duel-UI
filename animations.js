function triggerAnimation(type) {
  const animationDiv = document.createElement('div');
  animationDiv.classList.add('animation', type);

  document.body.appendChild(animationDiv);

  setTimeout(() => {
    animationDiv.remove();
  }, 1000); // animation duration
}

// Example triggers you could call in-game:
// triggerAnimation('attack');
// triggerAnimation('heal');
// triggerAnimation('fire');
// triggerAnimation('explosion');
// triggerAnimation('poison');
