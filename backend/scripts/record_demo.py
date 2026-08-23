import asyncio
import os
import time
from playwright.async_api import async_playwright

# Setup paths and timestamps
OUTPUT_DIR = r"D:\KSPAi"
os.makedirs(OUTPUT_DIR, exist_ok=True)
FINAL_MP4 = os.path.join(OUTPUT_DIR, "anvesha-demo.mp4")

TARGET_URL = "http://localhost:5173/login"

async def record_demo():
    print(f"Starting Anvesha showcase recording against {TARGET_URL}...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=OUTPUT_DIR,
            record_video_size={"width": 1920, "height": 1080}
        )
        
        page = await context.new_page()
        
        # Helper to inject clean captions
        async def set_caption(text):
            print(f"[CAPTION] {text}")
            await page.evaluate(f"""
                (() => {{
                    let el = document.getElementById('anvesha-demo-caption');
                    if (!el) {{
                        el = document.createElement('div');
                        el.id = 'anvesha-demo-caption';
                        el.style.position = 'fixed';
                        el.style.bottom = '30px';
                        el.style.left = '50%';
                        el.style.transform = 'translateX(-50%)';
                        el.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
                        el.style.color = '#38bdf8';
                        el.style.padding = '12px 28px';
                        el.style.borderRadius = '50px';
                        el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
                        el.style.fontSize = '20px';
                        el.style.fontWeight = '600';
                        el.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)';
                        el.style.zIndex = '999999';
                        el.style.textAlign = 'center';
                        el.style.maxWidth = '80%';
                        el.style.letterSpacing = '0.3px';
                        el.style.transition = 'all 0.3s ease';
                        document.body.appendChild(el);
                    }}
                    el.innerText = {repr(text)};
                    el.style.display = 'block';
                }})();
            """)

        async def clear_caption():
            await page.evaluate("""
                (() => {
                    let el = document.getElementById('anvesha-demo-caption');
                    if (el) el.style.display = 'none';
                })();
            """)

        # --- 0. OPENING (0-8s) ---
        print("--- Scene 1: Opening ---")
        await page.goto(TARGET_URL)
        await page.wait_for_selector("input[type='password']", timeout=10000)
        await set_caption("AI-assisted crime intelligence for Karnataka Police.")
        await asyncio.sleep(6.5)
        
        # --- 1. POLICE IT (8-30s) ---
        print("--- Scene 2: Police IT ---")
        await set_caption("Police IT: Statewide administrative visibility & invite management.")
        # Fill login
        inputs = await page.query_selector_all("input")
        await inputs[0].fill("KA-IT-0001")
        await inputs[1].fill("demo1234")
        await asyncio.sleep(1)
        await page.click("button[type='submit']")
        
        # Wait for dashboard
        await page.wait_for_selector("text=System Admin", timeout=10000)
        await asyncio.sleep(3)
        
        # Navigate to Invite Officers / Administration
        await set_caption("Statewide Administration: Scoped without operational case or copilot access.")
        try:
            invite_btn = await page.wait_for_selector("a:has-text('Invite'), button:has-text('Invite'), text=Invite Officers", timeout=3000)
            if invite_btn: await invite_btn.click()
        except:
            pass
        await asyncio.sleep(4)
        
        # Logout
        await set_caption("Switching command role...")
        try:
            profile_btn = await page.query_selector("button:has-text('KA-IT-0001'), button:has-text('Police IT')")
            if profile_btn: 
                await profile_btn.click()
                await asyncio.sleep(1)
                logout_btn = await page.wait_for_selector("text=Log out, text=Logout, text=Sign out", timeout=3000)
                if logout_btn: await logout_btn.click()
        except Exception as e:
            print("Logout via menu failed, navigating to /login:", e)
            await page.goto(TARGET_URL)
        await page.wait_for_selector("input[type='password']", timeout=10000)
        await asyncio.sleep(2)

        # --- 2. SP DISTRICT COMMAND (30-70s) ---
        print("--- Scene 3: SP Command ---")
        await set_caption("SP Command: Real-time district jurisdiction intelligence & early warnings.")
        inputs = await page.query_selector_all("input")
        await inputs[0].fill("KA-SP-9999")
        await inputs[1].fill("demo1234")
        await asyncio.sleep(1)
        await page.click("button[type='submit']")
        
        await page.wait_for_selector("text=Superintendent", timeout=10000)
        await asyncio.sleep(4)
        
        # Observe Early Warnings
        await set_caption("Early Warning Engine: Comparing 7-day crime velocity against 28-day baselines.")
        try:
            # Click early warning bell or tab if present
            bell_btn = await page.query_selector("button:has([class*='bell']), text=Warnings, text=Early Warnings")
            if bell_btn: await bell_btn.click()
        except:
            pass
        await asyncio.sleep(5)
        
        # GIS Hotspots
        await set_caption("GIS Hotspot Mapping: Dynamic spatial clustering across district beat grids.")
        try:
            map_btn = await page.wait_for_selector("a:has-text('Hotspot'), a:has-text('Map'), text=Hotspots, text=Maps", timeout=4000)
            if map_btn: await map_btn.click()
        except:
            pass
        await asyncio.sleep(6)
        
        # Cases & Deadlines
        await set_caption("Case Management & Statutory Deadlines: Strict hierarchy-scoped records.")
        try:
            cases_btn = await page.wait_for_selector("a:has-text('Case'), text=Cases, text=Case Ledger", timeout=4000)
            if cases_btn: await cases_btn.click()
        except:
            pass
        await asyncio.sleep(5)
        
        # Audit Trail
        await set_caption("Immutable Audit Trail: Timestamped accountability across all district queries.")
        try:
            audit_btn = await page.wait_for_selector("a:has-text('Audit'), text=Audit Trail", timeout=4000)
            if audit_btn: await audit_btn.click()
        except:
            pass
        await asyncio.sleep(5)

        # Logout SP
        await set_caption("Switching to station operations...")
        try:
            profile_btn = await page.query_selector("button:has-text('KA-SP-9999'), button:has-text('SP')")
            if profile_btn: 
                await profile_btn.click()
                await asyncio.sleep(1)
                logout_btn = await page.wait_for_selector("text=Log out, text=Logout, text=Sign out", timeout=3000)
                if logout_btn: await logout_btn.click()
        except:
            await page.goto(TARGET_URL)
        await page.wait_for_selector("input[type='password']", timeout=10000)
        await asyncio.sleep(2)

        # --- 3. INSPECTOR STATION OPERATIONS (70-105s) ---
        print("--- Scene 4: Inspector Operations ---")
        await set_caption("Inspector Station Operations: AI Copilot with officer-in-the-loop design.")
        inputs = await page.query_selector_all("input")
        await inputs[0].fill("KA-INS-4471")
        await inputs[1].fill("demo1234")
        await asyncio.sleep(1)
        await page.click("button[type='submit']")
        
        await page.wait_for_selector("text=Inspector", timeout=10000)
        await asyncio.sleep(4)
        
        # AI Copilot / FIR Intake
        await set_caption("Anvesha AI Copilot: Natural language querying with source-cited explainability.")
        try:
            copilot_btn = await page.wait_for_selector("a:has-text('Copilot'), a:has-text('AI'), text=AI Copilot", timeout=4000)
            if copilot_btn: await copilot_btn.click()
        except:
            pass
        await asyncio.sleep(6)
        
        await set_caption("FIR Intake & Entity Extraction: Automatic BNS/IPC legal code mapping.")
        try:
            intake_btn = await page.wait_for_selector("a:has-text('FIR'), a:has-text('Intake'), text=FIR Upload, text=Case Intake", timeout=4000)
            if intake_btn: await intake_btn.click()
        except:
            pass
        await asyncio.sleep(6)
        
        # Entity Network / Dossier
        await set_caption("Entity Network Analysis: Discovering cross-case suspect linkages instantly.")
        try:
            network_btn = await page.wait_for_selector("a:has-text('Network'), a:has-text('Intelligence'), text=Entity Network", timeout=4000)
            if network_btn: await network_btn.click()
        except:
            pass
        await asyncio.sleep(5)
        
        # --- 4. CLOSING (105-115s) ---
        print("--- Scene 5: Closing ---")
        await set_caption("One platform · role capabilities · jurisdiction-scoped data · audited actions.")
        await asyncio.sleep(5)
        await set_caption("Deployed live at: https://kspai-zgymgiew.onslate.in/")
        await asyncio.sleep(5)
        
        # Close context to flush video
        video_path = await page.video.path()
        print(f"Video captured to temp path: {video_path}")
        await context.close()
        await browser.close()
        
        return video_path

if __name__ == "__main__":
    temp_webm = asyncio.run(record_demo())
    print("Recording completed. Temp WebM file:", temp_webm)
    
    # Transcode to MP4 using imageio-ffmpeg
    import imageio_ffmpeg
    import subprocess
    
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    print(f"Transcoding {temp_webm} -> {FINAL_MP4} using {ffmpeg_exe}...")
    
    cmd = [
        ffmpeg_exe, "-y",
        "-i", temp_webm,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        FINAL_MP4
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        print("Transcoding successful! Final MP4:", FINAL_MP4)
        try:
            os.remove(temp_webm)
            print("Removed temporary WebM artifact.")
        except Exception as e:
            print("Could not delete temp WebM:", e)
    else:
        print("Transcoding failed:", res.stderr)
