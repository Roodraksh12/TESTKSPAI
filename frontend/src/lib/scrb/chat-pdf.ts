// Native browser print — no jsPDF dependency required for transcript export.
import { apiRequest } from "@/api/client";
import type { ChatMessage } from "@/lib/store";

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~]/g, "")
    .trim();
}

export async function exportChatPdf(messages: ChatMessage[], activeCaseId: string | null): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow pop-ups to export the PDF.");
    return;
  }

  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Copilot_Transcript_${Date.now()}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; color: #111; max-width: 800px; margin: 0 auto; line-height: 1.6; }
          .header { border-bottom: 2px solid #eee; padding-bottom: 1rem; margin-bottom: 2rem; }
          .title { font-size: 1.25rem; font-weight: bold; margin: 0 0 0.5rem 0; }
          .meta { font-size: 0.875rem; color: #666; margin: 0; }
          .message { margin-bottom: 1.5rem; }
          .speaker { font-size: 0.75rem; font-weight: bold; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
          .content { font-size: 0.95rem; white-space: pre-wrap; }
          .officer .speaker { color: #0f172a; }
          .copilot .speaker { color: #0d9488; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">SCRB Sahayak - Investigation Copilot Transcript</h1>
          <p class="meta">Generated: ${new Date().toLocaleString()}</p>
          ${activeCaseId ? `<p class="meta">Active case: ${activeCaseId}</p>` : ""}
        </div>
  `;

  for (const message of messages) {
    const isUser = message.role === "user";
    const speaker = isUser ? "OFFICER" : "COPILOT";
    const text = stripMarkdown(message.content || "");

    html += `
        <div class="message ${isUser ? "officer" : "copilot"}">
          <div class="speaker">${speaker}</div>
          <div class="content">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        </div>
    `;
  }

  html += `
      </body>
      <script>
        window.onload = () => {
          window.print();
        };
      </script>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  try {
    await apiRequest("/api/audit", {
      method: "POST",
      body: JSON.stringify({
        action: "EXPORT_CHAT_PDF",
        targetType: "CHAT",
        targetId: activeCaseId || null,
        details: `Exported a ${messages.length}-message transcript`,
      }),
    });
  } catch {
    // The PDF already saved client-side; a failed audit write shouldn't block the officer.
  }
}
