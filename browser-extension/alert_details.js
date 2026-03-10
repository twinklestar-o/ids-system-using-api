document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const notificationId = urlParams.get("id");

    if (notificationId) {
        chrome.storage.local.get([notificationId], (data) => {
            const rawAnalysis = data[notificationId] || "";
            
            // 1. DATA CHECK
            if (!rawAnalysis) {
                document.getElementById("analysis-content").innerHTML = `
                    <div style="color: #94a3b8; padding: 20px; text-align: center;">
                        ⚠️ Analisis tidak ditemukan.<br>
                        <small>Pastikan Anda mengklik notifikasi yang baru saja muncul.</small>
                    </div>`;
                return;
            }

            // 2. DEFINE CLEAN TEXT FIRST (Avoid ReferenceError)
            const cleanText = rawAnalysis.replace(/["*#]/g, ""); 
            
            function extractSection(text, tagRegex) {
                // Modified regex to handle: [TAG], **TAG**, or just TAG:
                const regex = new RegExp(`(?:[\\[\\*]*)${tagRegex}(?:[\\]\\*]*):?\\s*([\\s\\S]+?)(?=\\s*[\\[\\*]+[A-Z_0-9\\s()]{5,}[\\]\\*]+|\\s*$)`, "i");
                const match = text.match(regex);
                return match ? match[1].trim() : null;
            }

            // 3. PARSING (Prioritize Tahap format requested by user)
            const alasan = extractSection(cleanText, "IDENTIFIKASI \\(Tahap 1\\)") || extractSection(cleanText, "ALASAN_USER") || "Aktivitas mencurigakan terdeteksi.";
            const mitigasiRaw = extractSection(cleanText, "KESIMPULAN & MITIGASI \\(Tahap 3\\)") || extractSection(cleanText, "MITIGASI_LENGKAP") || "- Sila ikuti panduan keamanan umum.";
            const cot = extractSection(cleanText, "ANALISIS \\(Tahap 2\\)") || extractSection(cleanText, "PENALARAN_COT") || "Detail analisis teknis tidak tersedia.";

            // Convert bullet points to HTML list
            const mitigasiHtml = mitigasiRaw.split('\n')
                .filter(line => line.trim().startsWith('-'))
                .map(line => `<li>${line.replace(/^-/, '').trim()}</li>`)
                .join('');
            
            const mitigasiFinal = mitigasiHtml ? `<ul style="margin: 0; padding-left: 20px; line-height: 1.6; color: #f1f5f9;">${mitigasiHtml}</ul>` : `<p style="margin: 0; color: #f1f5f9;">${mitigasiRaw}</p>`;

            // 4. SET BADGE
            const badge = document.getElementById("severity-badge");
            if (cleanText.includes("BAHAYA")) {
                badge.innerText = "Situs Diblokir";
                badge.className = "badge badge-danger";
            } else if (cleanText.includes("WASPADA")) {
                badge.innerText = "Status: Waspada";
                badge.className = "badge badge-warning";
            } else {
                badge.innerText = "Laporan Selesai";
                badge.className = "badge";
            }

            // 5. RENDER UI
            const contentDiv = document.getElementById("analysis-content");
            contentDiv.innerHTML = `
                <div style="background: rgba(255,255,255,0.07); padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="color: #4facfe; margin: 0 0 12px 0; font-size: 1.2rem;">🛡️ Kenapa Ini Berbahaya?</h3>
                    <p style="font-size: 1.05rem; line-height: 1.6; color: #f1f5f9; margin: 0;">${alasan}</p>
                </div>
                
                <div style="background: rgba(0,210,255,0.05); padding: 20px; border-radius: 12px; margin-bottom: 24px; border-left: 5px solid #00d2ff;">
                    <h3 style="color: #00d2ff; margin: 0 0 12px 0; font-size: 1.2rem;">✅ Tindakan yang Disarankan</h3>
                    <div style="margin: 0;">${mitigasiFinal}</div>
                </div>

                <details style="margin-top: 30px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
                    <summary style="cursor: pointer; color: #94a3b8; font-weight: 600; font-size: 0.9rem; margin-bottom: 10px;">
                        [Pakar] Lihat Analisis Teknis (Chain-of-Thought)
                    </summary>
                    <div style="padding: 15px; font-family: 'Consolas', monospace; font-size: 0.85rem; background: #0a0e14; border-radius: 8px; color: #94a3b8; line-height: 1.7; border: 1px solid rgba(255,255,255,0.05);">
                        ${cot.replace(/\n/g, '<br>')}
                    </div>
                </details>

                <details style="margin-top: 15px; opacity: 0.4;">
                    <summary style="cursor: pointer; color: #64748b; font-size: 0.75rem;">[Debug] Lihat Data Mentah Morpheus</summary>
                    <pre style="font-size: 0.75rem; background: #000; padding: 10px; color: #4ade80; overflow-x: auto; white-space: pre-wrap; margin-top: 10px; border-radius: 5px;">${rawAnalysis}</pre>
                </details>

                <div style="margin-top: 25px; font-size: 0.8rem; color: #475569; text-align: center;">
                    Event ID: ${notificationId}
                </div>
            `;
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
