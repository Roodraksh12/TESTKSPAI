"use client";

import { useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Button } from "@/components/ui/button";
import { Radio, Loader2, Signal } from "lucide-react";
import { motion } from "framer-motion";

export default function NetworkGraph({ graphData: initialGraphData }: { graphData: any }) {
  const fgRef = useRef<any>();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [graphData, setGraphData] = useState(initialGraphData);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
    
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const runTelecomAnalysis = () => {
    setIsAnalyzing(true);
    
    // Simulate API call for CDR analysis
    setTimeout(() => {
      const currentNodes = [...graphData.nodes];
      const currentLinks = [...graphData.links];
      
      // Find a couple of suspect nodes to link
      const suspects = currentNodes.filter(n => n.group === 'person');
      if (suspects.length >= 2) {
        const burnerNodeId = `ghost-burner-1`;
        const towerNodeId = `ghost-tower-1`;

        currentNodes.push({
          id: burnerNodeId,
          name: "Burner Phone (+91 98XXX XXXX)",
          group: "ghost",
          val: 1.5
        });

        currentNodes.push({
          id: towerNodeId,
          name: "Cell Tower (MG Road)",
          group: "ghost",
          val: 2.5
        });

        // Link suspect 1 to burner
        currentLinks.push({
          source: suspects[0].id,
          target: burnerNodeId,
          label: "CDR Ping (11:23 PM)",
          isGhost: true
        });

        // Link suspect 2 to burner
        currentLinks.push({
          source: suspects[1].id,
          target: burnerNodeId,
          label: "CDR Ping (11:25 PM)",
          isGhost: true
        });

        // Link burner to tower
        currentLinks.push({
          source: burnerNodeId,
          target: towerNodeId,
          label: "Triangulated Location",
          isGhost: true
        });
      }

      setGraphData({ nodes: currentNodes, links: currentLinks });
      setIsAnalyzing(false);
      setAnalysisComplete(true);
      
      // Re-center graph
      if (fgRef.current) {
        fgRef.current.d3ReheatSimulation();
      }
    }, 2500);
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0B1B2B] relative overflow-hidden rounded-xl border border-slate-700 shadow-inner">
      
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-10">
        <Button 
          onClick={runTelecomAnalysis}
          disabled={isAnalyzing || analysisComplete}
          className={`shadow-lg transition-all ${analysisComplete ? 'bg-[var(--coral-soft)] text-[var(--error)] border border-red-200' : 'btn-primary'}`}
        >
          {isAnalyzing ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Querying Telecom Providers...</>
          ) : analysisComplete ? (
            <><Signal className="w-4 h-4 mr-2" /> Telecom Data Injected</>
          ) : (
            <><Radio className="w-4 h-4 mr-2" /> Run Telecom Ping Analysis (CDR)</>
          )}
        </Button>
      </div>

      {analysisComplete && (
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-md p-5 rounded-[16px] border border-[var(--border-light)] shadow-xl max-w-sm"
        >
          <h4 className="text-[var(--action-blue)] font-bold mb-2 flex items-center gap-2">
            <Signal className="w-4 h-4" /> CDR Ghost-Mapping Results
          </h4>
          <p className="text-[var(--slate)] text-sm leading-relaxed">
            AI detected a hidden connection. Two suspects pinged the same burner phone near the MG Road cell tower at the exact time of the incident.
          </p>
        </motion.div>
      )}

      {/* Legend Overlay */}
      <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur-md p-4 rounded-[12px] border border-[var(--border-light)] shadow-lg text-xs font-medium text-[var(--ink)]">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 rounded-full bg-[var(--coral)]" /> <span>Suspect</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 rounded-full bg-[var(--deep-green)]" /> <span>Case / FIR</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[var(--action-blue)] shadow-[0_0_8px_rgba(10,76,255,0.4)]" /> <span>Ghost Node (Telecom)</span>
        </div>
      </div>

      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={(node: any) => {
          if (node.group === "person") return "#ff7759"; // coral
          if (node.group === "case") return "#003c33"; // deep green
          return "#0a4cff"; // Ghost nodes (action blue)
        }}
        nodeRelSize={6}
        linkColor={(link: any) => link.isGhost ? "#0a4cff" : "#e5e7eb"}
        linkWidth={(link: any) => link.isGhost ? 2 : 1.5}
        linkLineDash={(link: any) => link.isGhost ? [4, 4] : null}
        linkDirectionalParticles={(link: any) => link.isGhost ? 4 : 0}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        backgroundColor="#ffffff"
        onNodeDragEnd={node => {
          node.fx = node.x;
          node.fy = node.y;
        }}
      />
    </div>
  );
}
