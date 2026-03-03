document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const notificationId = urlParams.get("id");

    if (notificationId) {
        chrome.storage.local.get([notificationId], (data) => {
            const analysis = data[notificationId] || "Analisis tidak ditemukan atau sudah kedaluwarsa.";
            
            // Set Badge
            const badge = document.getElementById("severity-badge");
            if (analysis.includes("BAHAYA")) {
                badge.innerText = "Bahaya Tinggi";
                badge.className = "badge badge-danger";
            } else if (analysis.includes("WASPADA")) {
                badge.innerText = "Waspada";
                badge.className = "badge badge-warning";
            } else {
                badge.innerText = "Informasi";
                badge.className = "badge";
            }

            // Set content with better formatting
            const contentDiv = document.getElementById("analysis-content");
            
            let formattedText = analysis
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Convert **bold** to <b>bold</b>
                .replace(/\n(\d+\.)/g, '<br><br>$1')     // Ensure list items (1., 2.) start on new lines
                .replace(/\n/g, '<br>');                // General newlines
            
            contentDiv.innerHTML = formattedText;
        });
    }

    // Add close button listener (CSP compliant)
    const closeBtn = document.getElementById("close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            window.close();
        });
    }
});
