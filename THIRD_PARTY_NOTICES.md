# 第三方组件与分发说明

便携版打包程序会获取并分发下列主要第三方组件：

- Python 3.13：Python Software Foundation License。
- uv：Apache-2.0 或 MIT 双重许可。
- PyInstaller：GPLv2，并带有分发商业程序所需的 bootloader exception。
- Ollama：MIT License。
- Qwen3 0.6B 模型：以模型发布页所附许可为准。
- CrewAI：MIT License。
- RapidOCR / ONNX Runtime / OpenCV 等 OCR 组件：分别遵循各自项目许可。
- PyMuPDF：AGPL 或商业许可双重授权。

打包程序不包含 LiteLLM，也不会关闭安全软件或创建杀毒白名单。AI 请求默认只发往本机 Ollama；程序仍会对模型输入进行去标识化，并在模型不可用或输出不合规时回退到本地规则。

向第三方分发前，请根据实际使用和分发方式复核所有依赖的许可证，并特别确认 PyMuPDF 的 AGPL 或商业授权要求。本说明用于列出组件，不构成法律意见。

