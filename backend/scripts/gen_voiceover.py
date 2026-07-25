import asyncio
import edge_tts
import sys

TEXT = """
Namaskara and welcome to Anvesha, the AI Intelligence and Investigation Copilot built specifically for the Karnataka State Police. 
Modern policing generates thousands of data points daily across police stations and district headquarters. 
Anvesha bridges the gap between raw police data and actionable investigative insight, transforming record management into proactive predictive policing.
When an officer uploads an FIR document or enters unstructured crime narratives, Anvesha's neural engine goes to work instantly. 
It extracts vital entities such as suspect names, vehicle registration numbers like Karnataka 03 and Karnataka 04 series, and timestamps, automatically mapping them to Bhartiya Nyaya Sanhita and Indian Penal Code legal sections.
With our interactive AI Copilot, investigators query case ledgers in plain language, uncovering cross-case linkages in seconds with complete source-cited explainability.
Furthermore, proactive crime prevention requires seeing tomorrow's patterns today. 
Anvesha renders real-time Geographic Information System crime hotspot maps, clustering offenses across beat grids. 
Powered by our new Early Warning Engine, the platform monitors crime velocity spikes. 
When a surge—such as an anomaly in vehicle thefts in Whitefield—exceeds statistical thresholds, Anvesha fires priority notification banners directly to commanders.
Security and command hierarchy are paramount. 
Built on PostgreSQL L-Tree structures, Anvesha enforces multi-tier Role-Based Access Control. 
A Station House Officer is restricted to their own station, while Superintendents of Police gain real-time command visibility across entire districts.
Our immutable Audit Trail features a new tabbed interface separating personal Portal Activity from jurisdiction-wide supervisory logs. 
Every query and summary export is timestamped to guarantee institutional transparency.
Containerized with Docker version 7 and featuring instant English to Kannada translation with voice capabilities, Anvesha represents the future of AI-assisted law enforcement. 
Anvesha: Empowering the Karnataka State Police with intelligent and predictive investigation. Jai Hind.
"""

async def main():
    output_path = sys.argv[1] if len(sys.argv) > 1 else "anvesha_narration.mp3"
    print(f"Generating voiceover to {output_path}...")
    communicate = edge_tts.Communicate(TEXT.strip(), "en-IN-NeerjaNeural")
    await communicate.save(output_path)
    print("Voiceover generated successfully!")

if __name__ == "__main__":
    asyncio.run(main())
