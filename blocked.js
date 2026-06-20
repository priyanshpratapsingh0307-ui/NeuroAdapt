document.getElementById('close-tab').addEventListener('click', () => {
  window.close();
});

const circle = document.getElementById('b-circle');
const text = document.getElementById('b-text');

function runBreathing() {
  // Inhale 4s
  text.textContent = 'Inhale...';
  circle.style.transition = 'transform 4s ease-in-out';
  circle.style.transform = 'scale(1.5)';
  
  setTimeout(() => {
    // Hold 7s
    text.textContent = 'Hold...';
    
    setTimeout(() => {
      // Exhale 8s
      text.textContent = 'Exhale...';
      circle.style.transition = 'transform 8s ease-in-out';
      circle.style.transform = 'scale(1)';
    }, 7000);
  }, 4000);
}

runBreathing();
setInterval(runBreathing, 19000);
