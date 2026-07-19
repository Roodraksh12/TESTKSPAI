import jsPDF from "jspdf";
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
  const doc = new jsPDF();
  const marginX = 14;
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 20;

  doc.setFontSize(16);
  doc.text("SCRB Sahayak - Investigation Copilot Transcript", marginX, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y);
  y += 6;
  if (activeCaseId) {
    doc.text(`Active case: ${activeCaseId}`, marginX, y);
    y += 6;
  }
  doc.setDrawColor(180);
  doc.line(marginX, y, marginX + maxWidth, y);
  y += 10;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }
  };

  doc.setTextColor(0);
  for (const message of messages) {
    const speaker = message.role === "user" ? "OFFICER" : "COPILOT";
    const text = stripMarkdown(message.content || "");
    const lines: string[] = doc.splitTextToSize(text, maxWidth);

    ensureSpace(10);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(speaker, marginX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    for (const line of lines) {
      ensureSpace(6);
      doc.text(line, marginX, y);
      y += 5.5;
    }
    y += 4;
  }

  doc.save(`Copilot_Transcript_${Date.now()}.pdf`);

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
