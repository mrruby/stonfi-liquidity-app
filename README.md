# STON.fi Liquidity App

This project is a React-based web application for providing liquidity on STON.fi, built with TypeScript and Vite. It follows the structure and best practices outlined in the Omniston guide.

## Table of Contents

- [Guide Overview](#guide-overview)
- [Project Structure](#project-structure)
- [Running Locally](#running-locally)
- [Preview on Replit](#preview-on-replit)

## Guide Overview

This application demonstrates how to build a liquidity provision interface for STON.fi using React, TypeScript, and Vite. It includes:

- Type-safe development with TypeScript
- Modern React patterns and hooks
- Efficient build process with Vite
- ESLint configuration for code quality
- React-specific linting rules

## Project Structure

```
stonfi-liquidity-app/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
│   └── tonconnect-manifest.json
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Running Locally

1. Clone the repository:
```bash
git clone https://github.com/mrruby/stonfi-liquidity-app.git
cd stonfi-liquidity-app
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm run dev
```

The application will be available at `http://localhost:5173`

## Preview on Replit


1. Go to **[Replit Omniston Swap App](https://replit.com/@stonfi/omniston-swap-app?embed=true)**
2. Click Fork (top-right corner) to create your own copy of the project.
3. Wait for the environment to install dependencies.
4. Click the Run button to start the dev server.
5. Use the Replit preview to interact with the swap UI.

You can then modify any files (like App.jsx) directly in Replit and immediately see the changes reflected in the preview.

---

Happy building on TON and STON.fi!