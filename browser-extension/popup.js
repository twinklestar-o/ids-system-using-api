document.getElementById('sync-btn').addEventListener('click', () => {
  const status = document.getElementById('status-msg');
  status.style.display = 'block';
  status.innerText = 'Syncing alerts...';
  
  chrome.runtime.sendMessage({ action: 'manualSync' }, (response) => {
    console.log('Sync response:', response);
    setTimeout(() => {
      status.innerText = '✓ Sync Complete';
      setTimeout(() => {
        status.style.display = 'none';
      }, 2000);
    }, 1000);
  });
});
