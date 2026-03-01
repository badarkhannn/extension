// Permission popup - Requests microphone access
const allowBtn = document.getElementById('allowBtn');
const statusEl = document.getElementById('status');

let micStream = null;

// Request microphone access
allowBtn.addEventListener('click', async () => {
  statusEl.innerHTML = '<span class="spinner"></span>Requesting permission...';
  allowBtn.disabled = true;

  try {
    // Request microphone access
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    console.log('✅ Microphone permission granted!');

    // Show success message
    statusEl.className = 'status success';
    statusEl.textContent = '✅ Permission granted! Closing...';

    // Store that permission was granted
    await chrome.storage.local.set({ microphonePermissionGranted: true });

    // Stop the stream (we just needed permission)
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
    }

    // Close window after a brief delay
    setTimeout(() => {
      window.close();
    }, 1000);

  } catch (error) {
    console.error('❌ Microphone permission denied:', error);

    // Show error message
    statusEl.className = 'status error';

    if (error.name === 'NotAllowedError') {
      statusEl.textContent = '❌ Permission denied. Please try again.';
    } else if (error.name === 'NotFoundError') {
      statusEl.textContent = '❌ No microphone found.';
    } else {
      statusEl.textContent = '❌ Error: ' + error.message;
    }

    allowBtn.disabled = false;
  }
});

// Auto-request on load if user clicks through from sidebar
window.addEventListener('load', () => {
  // Check if we should auto-request
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('auto') === 'true') {
    // Delay slightly for better UX
    setTimeout(() => {
      allowBtn.click();
    }, 500);
  }
});
