"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Crosshair, Terminal, Activity, Database, MapPin, X, ArrowLeft, Network, FileDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiRequest } from "@/api/client";

export default function TacticalView({ caseData }: { caseData: any }) {
  const navigate = useNavigate();
  const [bootSequence, setBootSequence] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [selectedSuspect, setSelectedSuspect] = useState<any>(null);

  const fullText = `INITIATING TACTICAL ANALYSIS...
CASE NO: ${caseData.firNumber}
CLASSIFICATION: ${caseData.crimeType}
STATUS: SECURE
EXTRACTING NARRATIVE LOGS...
> ${caseData.summary}
ANALYSIS COMPLETE.`;

  // Boot sequence timer
  useEffect(() => {
    const timer = setTimeout(() => setBootSequence(1), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (bootSequence === 1) {
      let i = 0;
      const intervalId = setInterval(() => {
        setTypedText(fullText.substring(0, i));
        i++;
        if (i > fullText.length) {
          clearInterval(intervalId);
          setTimeout(() => setBootSequence(2), 500);
        }
      }, 20);
      return () => clearInterval(intervalId);
    }
  }, [bootSequence, fullText]);

  const generatePDF = async () => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(11, 27, 43); // Navy Blue
    doc.text("STATE POLICE - TACTICAL INTELLIGENCE REPORT", 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Report ID: TACTICAL-${Date.now()}`, 14, 35);
    
    // Line separator
    doc.setDrawColor(46, 143, 143); // Teal
    doc.setLineWidth(0.5);
    doc.line(14, 40, 196, 40);

    // Case Information
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`CASE NO: ${caseData.firNumber}`, 14, 50);
    doc.setFontSize(11);
    doc.text(`Crime Type: ${caseData.crimeType}`, 14, 58);
    doc.text(`Status: ${caseData.status}`, 14, 65);
    
    // Summary
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Incident Narrative:", 14, 78);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const splitSummary = doc.splitTextToSize(caseData.summary || "N/A", 180);
    doc.text(splitSummary, 14, 85);
    
    let yPos = 85 + (splitSummary.length * 5) + 10;

    // Suspects Table — only fields sourced from the case record. No telecom/NCRB
    // integration exists, so those columns are omitted rather than fabricated.
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Identified Persons (from case record)", 14, yPos);

    const tableData = caseData.casePersons.map((cp: any) => [
      cp.person.name,
      cp.role,
      cp.person.phone || "Not on file",
      cp.person.address || "Not on file",
    ]);

    autoTable(doc, {
      startY: yPos + 5,
      head: [['Name', 'Role', 'Phone', 'Address']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [46, 143, 143] }
    });

    // Predictive AI Matches
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Predictive AI Alerts:", 14, finalY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    let matchesText = caseData.matches.length > 0 
      ? caseData.matches.map((m: any) => `- ${m.reason}`).join("\n") 
      : "No predictive alerts detected.";
      
    const splitMatches = doc.splitTextToSize(matchesText, 180);
    doc.text(splitMatches, 14, finalY + 7);

    // Save
    doc.save(`Intelligence_Report_${caseData.firNumber.replace(/\//g, '_')}.pdf`);

    try {
      await apiRequest("/api/audit", {
        method: "POST",
        body: JSON.stringify({
          action: "EXPORT_CASE_PDF",
          targetType: "CASE",
          targetId: caseData.id,
          details: `Exported tactical intelligence report for ${caseData.firNumber}`,
        }),
      });
    } catch {
      // PDF already saved client-side; a failed audit write shouldn't block the officer.
    }
  };

  return (
    <div className="fixed inset-0 bg-[#020813] text-green-500 font-mono overflow-hidden z-[9999] flex flex-col">
      {/* Background Grids and Scans */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(2,8,19,0.9)_2px,transparent_2px),linear-gradient(90deg,rgba(2,8,19,0.9)_2px,transparent_2px)] bg-[size:40px_40px] opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#0f241a 1px, transparent 1px), linear-gradient(90deg, #0f241a 1px, transparent 1px)' }} />
      <motion.div 
        animate={{ y: ["0%", "100%", "0%"] }} 
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="absolute top-0 left-0 w-full h-[2px] bg-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.5)] pointer-events-none"
      />

      {/* Top Bar */}
      <div className="flex justify-between items-center p-6 border-b border-green-900/50 bg-[#020813]/80 backdrop-blur-md relative z-10">
        <div className="flex items-center gap-4">
          <ShieldAlert className="w-8 h-8 text-green-400 animate-pulse" />
          <div>
            <h1 className="text-2xl font-bold tracking-widest text-green-400">TACTICAL_AI_CORE</h1>
            <p className="text-xs text-green-600">STATE_POLICE_DATATHON_LINK // SECURE_CONNECTION</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <Button 
            onClick={generatePDF}
            className="bg-green-600 hover:bg-green-500 text-black font-bold uppercase tracking-wider h-10 px-6 rounded-none shadow-[0_0_15px_rgba(34,197,94,0.3)]"
          >
            <FileDown className="w-4 h-4 mr-2" /> Export PDF Report
          </Button>
          <Button 
            onClick={() => navigate(`/cases/${caseData.id}`)}
            variant="outline" 
            className="border-green-500 text-green-400 hover:bg-green-500 hover:text-black font-bold uppercase tracking-wider h-10 px-6 rounded-none"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Exit Tactical Mode
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative z-10">
        
        {/* Left Panel: Narrative Analysis */}
        <div className="w-1/2 p-8 border-r border-green-900/50 flex flex-col">
          <div className="flex items-center gap-2 mb-6 text-green-400 border-b border-green-900/50 pb-2">
            <Terminal className="w-5 h-5" /> 
            <span className="uppercase tracking-widest font-bold">SYSTEM_LOGS</span>
          </div>

          <div className="flex-1 bg-[#050f0a] border border-green-900/30 p-6 rounded shadow-inner overflow-y-auto">
            {bootSequence === 0 ? (
              <div className="flex items-center justify-center h-full text-green-600 animate-pulse">
                BOOTING AI KERNEL...
              </div>
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed text-sm">
                {typedText}
                {bootSequence === 1 && <span className="inline-block w-2 h-4 bg-green-500 animate-pulse ml-1 align-middle" />}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Suspect Deep Dive */}
        <div className="w-1/2 p-8 relative">
          
          <div className="flex items-center gap-2 mb-6 text-green-400 border-b border-green-900/50 pb-2">
            <Crosshair className="w-5 h-5" /> 
            <span className="uppercase tracking-widest font-bold">IDENTIFIED_TARGETS</span>
          </div>

          <AnimatePresence>
            {bootSequence === 2 && !selectedSuspect && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-2 gap-6"
              >
                {caseData.casePersons.map((cp: any, idx: number) => (
                  <motion.div
                    key={cp.id}
                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.2, type: "spring" }}
                    onClick={() => setSelectedSuspect(cp)}
                    className="border border-green-500/50 bg-[#050f0a]/80 p-6 cursor-pointer hover:bg-green-900/30 hover:border-green-400 transition-all group relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-2 h-full bg-green-500/20 group-hover:bg-green-500 transition-colors" />
                    
                    <h3 className="text-xl font-bold text-white mb-1 group-hover:text-green-300">{cp.person.name}</h3>
                    <p className="text-xs text-green-600 uppercase tracking-widest mb-4">ROLE: {cp.role}</p>
                    
                    <div className="flex items-center gap-2 text-xs text-green-500/70 group-hover:text-green-400">
                      <Activity className="w-4 h-4" /> View case record
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Suspect Interrogation Panel */}
          <AnimatePresence>
            {selectedSuspect && (
              <motion.div 
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                className="absolute inset-0 bg-[#020813] p-8 z-20 flex flex-col"
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">{selectedSuspect.person.name}</h2>
                    <span className="bg-green-900 text-green-300 px-2 py-1 text-xs uppercase tracking-widest border border-green-500">
                      TARGET ACQUIRED
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedSuspect(null)} className="text-green-500 hover:text-white hover:bg-green-900/50 rounded-none">
                    <X className="w-6 h-6" />
                  </Button>
                </div>

                <div className="bg-[#050f0a] border border-green-900/50 p-6 flex-1 flex flex-col overflow-y-auto">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="border border-green-900/30 p-4 bg-green-950/10">
                      <h4 className="flex items-center gap-2 text-sm font-bold text-white mb-4 border-b border-green-900/50 pb-2">
                        <Database className="w-4 h-4 text-green-500" /> CASE PERSON RECORD
                      </h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-green-900/30 pb-1 gap-4">
                          <span className="text-green-600 shrink-0">NAME:</span>
                          <span className="text-white text-right">{selectedSuspect.person?.name || "—"}</span>
                        </div>
                        <div className="flex justify-between border-b border-green-900/30 pb-1 gap-4">
                          <span className="text-green-600 shrink-0">ROLE:</span>
                          <span className="text-white text-right">{selectedSuspect.role || "—"}</span>
                        </div>
                        <div className="flex justify-between border-b border-green-900/30 pb-1 gap-4">
                          <span className="text-green-600 shrink-0">PHONE:</span>
                          <span className="text-white text-right">{selectedSuspect.person?.phone || "Not on record"}</span>
                        </div>
                        <div className="flex justify-between pb-1 gap-4">
                          <span className="text-green-600 shrink-0">ADDRESS:</span>
                          <span className="text-white text-right">{selectedSuspect.person?.address || "Not on record"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-green-900/30 p-4 bg-green-950/10">
                      <h4 className="flex items-center gap-2 text-sm font-bold text-white mb-4 border-b border-green-900/50 pb-2">
                        <MapPin className="w-4 h-4 text-green-500" /> CASE CONTEXT
                      </h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-green-900/30 pb-1 gap-4">
                          <span className="text-green-600 shrink-0">FIR:</span>
                          <span className="text-white text-right">{caseData.firNumber || "—"}</span>
                        </div>
                        <div className="flex justify-between border-b border-green-900/30 pb-1 gap-4">
                          <span className="text-green-600 shrink-0">CRIME:</span>
                          <span className="text-white text-right">{caseData.crimeType || "—"}</span>
                        </div>
                        <div className="flex justify-between border-b border-green-900/30 pb-1 gap-4">
                          <span className="text-green-600 shrink-0">STATUS:</span>
                          <span className="text-white text-right">{caseData.status || "—"}</span>
                        </div>
                        <div className="flex justify-between pb-1 gap-4">
                          <span className="text-green-600 shrink-0">STATION:</span>
                          <span className="text-white text-right">
                            {caseData.station?.name || caseData.stationName || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="mt-6 text-[11px] text-green-700">
                    Data shown is from the live case record only. No external telecom or NCRB lookup.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
