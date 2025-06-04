// animations.js — handles duel animation effects

// ✅ Optional visual testing toggle
const VISUAL_TEST_MODE = true;

// ✅ Optional dynamic animation trigger from allCards
let allCardsIndex = {};
if (VISUAL_TEST_MODE) {
  import('./allCards.js').then(module => {
    const allCards = module.default;
    allCards.forEach(card => {
      allCardsIndex[card.card_id] = card;
    });
    console.log('✅ Visual testing mode: allCards loaded for animation tagging.');
  }).catch(err => {
    console.warn('⚠️ Could not load allCards.js for visual animation testing:', err);
  });
}

// 🔄 Core animation logic (UNTOUCHED)
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

// ✅ Optional: trigger animation based on cardId using allCards tags (test only)
function triggerAnimationByCard(cardId) {
  if (!VISUAL_TEST_MODE || !allCardsIndex[cardId]) return;
  const tags = allCardsIndex[cardId].tags || [];

  if (tags.includes('fire')) triggerAnimation('fire');
  if (tags.includes('explosion')) triggerAnimation('explosion');
  if (tags.includes('poison')) triggerAnimation('poison');
  if (tags.includes('shield')) triggerAnimation('shield');
  if (tags.includes('combo_sniper') || tags.includes('combo_buff')) triggerAnimation('combo');
  if (tags.includes('trap')) triggerAnimation('trap');
  if (tags.includes('gun')) triggerAnimation('bullet');
  if (tags.includes('melee')) triggerAnimation('attack');
  if (tags.includes('heal')) triggerAnimation('heal');
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

export { triggerAnimation, triggerAnimationByCard };
