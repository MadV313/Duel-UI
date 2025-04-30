function triggerAnimation(type) {
  const animationDiv = document.createElement('div');
  animationDiv.classList.add('animation', type);

  document.body.appendChild(animationDiv);

  // Set custom duration per animation type
  let duration = 1000;
  if (type === 'combo') duration = 1400;
  if (type === 'shield') duration = 1200;
  if (type === 'trap') duration = 1200;
  if (type === 'bullet') duration = 600;

  setTimeout(() => {
    animationDiv.remove();
  }, duration);
}

// Supported Trigger Types:
// triggerAnimation('attack');     // Melee attack pulse
// triggerAnimation('bullet');     // Gunfire flash
// triggerAnimation('heal');       // Healing aura
// triggerAnimation('fire');       // Burning effect
// triggerAnimation('explosion');  // Blast flash
// triggerAnimation('poison');     // Green toxic pulse
// triggerAnimation('shield');     // Defense/block flash
// triggerAnimation('trap');       // Trap trigger shake
// triggerAnimation('combo');      // Golden combo glow
