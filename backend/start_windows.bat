@echo off
echo Starting KSP Portal Backend...

:: Check if virtual environment exists and activate it
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) else (
    echo Virtual environment not found at .venv\Scripts\activate.bat. 
    echo Please make sure you have created it and installed requirements.
)

:: Run the FastAPI application
uvicorn app.main:app --reload
