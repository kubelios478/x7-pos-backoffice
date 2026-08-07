<p align="center">
  <a href="https://react.dev/" target="blank">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/react/react-original.svg" width="60" alt="React Logo" />
  </a>
  &nbsp;&nbsp;
  <a href="https://vitejs.dev/" target="blank">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/vite/vite-original.svg" width="60" alt="Vite Logo" />
  </a>
  &nbsp;&nbsp;
  <a href="https://www.typescriptlang.org/" target="blank">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/typescript/typescript-original.svg" width="60" alt="TypeScript Logo" />
  </a>
  &nbsp;&nbsp;
  <a href="https://tailwindcss.com/" target="blank">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/tailwindcss/tailwindcss-original.svg" width="60" alt="Tailwind CSS Logo" />
  </a>
</p>

# X7 POS Backoffice

React + Vite + TypeScript + Tailwind CSS frontend for X7 Point of Sale.

## Prerequisites

- Node.js 20+
- Backend API running (default: `http://localhost:3001`)

## Setup

```bash
cd x7-pos-backoffice
npm install
cp .env.example .env
```

## Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

API calls use the Vite proxy (`/api` → `http://localhost:3001`).

## Routes

| Path | Description |
|------|-------------|
| `/login` | Sign in |
| `/forgot-password` | Request password reset email |
| `/reset-password?token=…` | Set a new password from email link |
| `/` | Placeholder dashboard (requires login) |

## Backend configuration

Set `FRONTEND_URL=http://localhost:5173` in the backend `.env` so password-reset emails link to this app.
