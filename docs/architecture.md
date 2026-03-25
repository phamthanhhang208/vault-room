# VaultRoom — Architecture

## System Overview

```mermaid
graph TB
    subgraph USER["👤 Human Operator"]
        NOTION_UI["Notion Workspace<br/>(Browser / App)"]
    end

    subgraph NOTION_MCP["☁️ Notion MCP Server<br/><i>mcp.notion.com</i>"]
        MCP_API["MCP Protocol<br/>Streamable HTTP + OAuth 2.0 PKCE"]
    end

    subgraph AGENT["🏦 VaultRoom Agent<br/><i>Node.js + TypeScript</i>"]
        ORCH["Orchestrator<br/><i>node-cron scheduler</i>"]
        MCP_CLIENT["MCP Client<br/><i>@modelcontextprotocol/sdk</i>"]

        subgraph NOTION_LAYER["Notion Layer"]
            READER["NotionReader<br/><i>Config, Watchlist, Positions</i>"]
            WRITER["NotionWriter<br/><i>Alerts, Positions, Risk Events</i>"]
            DIGEST["DigestBuilder<br/><i>Daily AI-written reports</i>"]
        end

        subgraph RISK["Risk Engine"]
            SIGNALS["Signal Detector<br/><i>Rule-based checks</i>"]
            AI["Gemini 2.5 Pro<br/><i>AI risk analysis</i>"]
        end

        subgraph CHAINS["Chain Adapters"]
            CARDANO["CardanoAdapter<br/><i>Blockfrost API</i>"]
            ETHEREUM["EthereumAdapter<br/><i>ethers.js + RPC</i>"]
        end
    end

    subgraph EXTERNAL["🌐 External Services"]
        BLOCKFROST["Blockfrost API<br/><i>Cardano blockchain data</i>"]
        ETH_RPC["Ethereum RPC<br/><i>Sepolia / Mainnet</i>"]
        GEMINI["Google Gemini API<br/><i>AI analysis + digests</i>"]
    end

    %% Connections
    USER -.->|"reads / edits<br/>config & approvals"| NOTION_UI
    NOTION_UI <-->|"Notion internal"| MCP_API

    MCP_CLIENT <-->|"MCP tools<br/>(14 tools)"| MCP_API

    ORCH --> MCP_CLIENT
    ORCH --> READER
    ORCH --> WRITER
    ORCH --> DIGEST
    ORCH --> SIGNALS
    ORCH --> CARDANO
    ORCH --> ETHEREUM

    READER --> MCP_CLIENT
    WRITER --> MCP_CLIENT
    DIGEST --> MCP_CLIENT

    SIGNALS --> AI
    AI --> GEMINI

    CARDANO --> BLOCKFROST
    ETHEREUM --> ETH_RPC

    %% Styling
    classDef agent fill:#1a1a2e,stroke:#e94560,color:#fff
    classDef notion fill:#2d2d44,stroke:#0ea5e9,color:#fff
    classDef external fill:#1a1a2e,stroke:#a78bfa,color:#fff
    classDef mcp fill:#2d2d44,stroke:#22c55e,color:#fff

    class ORCH,MCP_CLIENT,READER,WRITER,DIGEST,SIGNALS,AI,CARDANO,ETHEREUM agent
    class NOTION_UI,MCP_API notion
    class BLOCKFROST,ETH_RPC,GEMINI external
```

## Component Summary

| Component | Role | Key Tech |
|-----------|------|----------|
| **Orchestrator** | Schedules monitor cycles, coordinates all subsystems | `node-cron` |
| **MCP Client** | Communicates with Notion via MCP protocol | `@modelcontextprotocol/sdk` |
| **NotionReader** | Reads config, watchlist, positions from Notion DBs | MCP `notion-search`, `notion-fetch` |
| **NotionWriter** | Writes alerts, positions, risk events to Notion | MCP `notion-create-pages`, `notion-update-page` |
| **DigestBuilder** | Generates daily AI-written portfolio reports | MCP `notion-create-pages` + Gemini |
| **Signal Detector** | Rule-based risk checks (health factor, TVL drop, whale moves) | Custom rules |
| **Gemini AI** | Enriches risk signals with analysis and recommendations | `@google/generative-ai` |
| **CardanoAdapter** | Fetches Cardano wallet data (balances, txs, staking) | `@blockfrost/blockfrost-js` |
| **EthereumAdapter** | Fetches Ethereum wallet data (balances, tokens, txs) | `ethers` v6 |
