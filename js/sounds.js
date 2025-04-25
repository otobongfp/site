// Create audio context
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playButtonSound(frequency = 800, duration = 0.1, volume = 0.1) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();

  setTimeout(() => {
    oscillator.stop();
  }, duration * 1000);
}

// Add sound to all buttons with the 'sound-button' class
document.addEventListener("DOMContentLoaded", function () {
  const buttons = document.querySelectorAll(".sound-button");
  buttons.forEach((button) => {
    button.addEventListener("click", function () {
      playButtonSound();
    });
  });
});
