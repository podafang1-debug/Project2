from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules


project_root = Path.cwd()
backend_dir = project_root / "backend"

datas = []
binaries = []
hiddenimports = [
    "ocr_worker",
    "import_pipeline",
    "level_agent",
    "profile_agent",
    "question_variants",
]

# 这些库包含运行时加载的提供商、OCR 模型或原生 DLL，必须显式收集。
for package in (
    "crewai",
    "rapidocr_onnxruntime",
    "onnxruntime",
    "pymupdf",
):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden

hiddenimports += collect_submodules("crewai")

a = Analysis(
    [str(backend_dir / "server.py")],
    pathex=[str(backend_dir)],
    binaries=binaries,
    datas=datas,
    hiddenimports=sorted(set(hiddenimports)),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["litellm", "tkinter", "matplotlib", "IPython", "notebook", "gradio", "streamlit"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="QizhiTrainingPlatform",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="QizhiTrainingPlatform",
)

