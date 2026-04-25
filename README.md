# PII Redaction Edge Compute Application

## Overview

This application demonstrates **edge compute** capabilities for real‑time personally identifiable information (PII) redaction directly in the browser. It leverages a lightweight transformer model running via WebAssembly, enabling fast inference without server round‑trips.

## Features & Status

- **Edge Inference** – Real‑time PII detection in the browser. *(✅ Complete)*
- **Model Quantization** – Optimized model size for fast loading. *(✅ Complete)*
- **Customizable Redaction Types** – Personal, Legal, Medical categories. *(🚧 In progress)*
- **Drag‑and‑Drop File Upload** – Easy UI for uploading documents. *(✅ Complete)*
- **Result Export** – Download redacted text as PDF/JSON. *(🚧 Planned)*

## Installation Guide

1. **Clone the repository**
   ```sh
   git clone https://github.com/yourusername/PII_Redaction.git
   ```
2. **Navigate to the project directory**
   ```sh
   cd PII_Redaction/app
   ```
3. **Install dependencies** (requires Node.js ≥ 18)
   ```sh
   npm install
   ```
4. **Run the development server**
   ```sh
   npm run dev
   ```
   Open `http://localhost:5173` in your browser to see the app.

---

*For production builds, run `npm run build` and serve the `dist` folder with any static file server.*
