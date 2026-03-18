# Vault Room

## Overview
Vault Room is a Node.js application utilizing TypeScript in strict mode, designed to serve as an interactive vault management tool. It integrates various innovative libraries and APIs for enhanced functionality.

## Tech Stack
- **Node.js**: JavaScript runtime for server-side applications.
- **TypeScript**: Strict mode for type safety and development efficiency.
- **pnpm**: Fast, disk space efficient package manager.
- **@notionhq/client**: Client for Notion API integration.
- **@blockfrost/blockfrost-js**: Client library for interacting with Blockfrost.
- **ethers v6**: Lightweight Ethereum library.
- **@google/generative-ai**: Tools for generative tasks (Gemini 2.5 Pro).
- **node-cron**: For scheduling tasks.
- **zod**: Schema validation library.
- **winston**: Logging library for Node.js applications.

## Prerequisites
- Node.js (version 14 or above)
- pnpm

## Setup with pnpm
1. Clone the repository:
   ```bash
   git clone https://github.com/phamthanhhang208/vault-room.git
   cd vault-room
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```

## Environment Variables Template
Create a `.env` file in the root directory with the following:
```
NOTION_API_KEY=your_notion_api_key
BLOCKFROST_PROJECT_ID=your_blockfrost_project_id
ETHEREUM_PRIVATE_KEY=your_ethereum_private_key
GOOGLE_API_KEY=your_google_api_key
```

## Scripts
- `start`: Runs the application in development mode.
- `build`: Compiles TypeScript code.
- `test`: Runs the test suite.

## Architecture Outline
The application follows a modular structure:
- `src/`: Contains the source code.
- `tests/`: Contains test files.

## Basic Usage
To start the application, run:
```bash
pnpm start
```

Make sure to set the required environment variables before running the app.

---
This README serves as a starting point for contributing to and understanding the Vault Room project.