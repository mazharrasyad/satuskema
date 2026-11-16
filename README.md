# SatuSkema

**One data starts with one schema.** SatuSkema reads the database schemas of many siloed government apps and shows, in one click, where the same citizens, civil servants, businesses and regions are stored again and again — then generates the data dictionary, the canonical model and the SQL to consolidate them.

Live demo: **https://mazharrasyad.tech/satuskema** (English by default; `EN | ID` toggle in the header).

## The problem

Indonesian local governments run hundreds of separate information systems: health posts (*posyandu*), small-business registries (UMKM), civil-service performance (*e-kinerja*), dengue surveillance (DBD), and many more. Each was built by a different vendor, and each one re-creates its own "resident" table:

| System | Same person, stored as… |
|---|---|
| SIPOS Posyandu | `tb_balita.nik_ibu INT(16)`, `nama_ibu`, `kelurahan` (free text) |
| SI-UMKM | `pelaku_usaha.no_ktp VARCHAR(16)`, `nama` |
| E-Kinerja | `pegawai.nik BIGINT(16)`, `nama`, `jk CHAR(1)` |
| SI-DBD | `kasus_dbd.nik CHAR(16)`, `nama_pasien`, `kode_kelurahan` |

The national **Satu Data Indonesia** (One Data) policy requires these systems to share one reference per person, keyed by the **NIK** (16-digit national ID). In practice, nobody has a map of which system stores what, so integration projects start with weeks of manual schema reading.

I built many of these systems myself as a government software engineer. SatuSkema is the tool I wished I had.

## What it does

1. **Parses DDL deterministically** (MySQL and PostgreSQL): tables, types, PK/FK and `COMMENT`s. No database connection and no row data are needed.
2. **Recognises Indonesian public-sector data concepts** in every column: NIK, family card number (KK), civil servant ID (NIP), business ID (NIB), tax ID (NPWP), official region codes, name, date of birth and more. It understands local abbreviations (`no_ktp`, `tgl_lhr`, `kd_kel`, `jk`) and *roles*: `nik_ibu` is the **mother's** NIK, not the subject of the row.
3. **Detects master entities scattered across systems** (residents, civil servants, businesses). It separates transaction tables that only reference an entity (e.g. `skp.nip`) from real master copies, and follows foreign keys to find a business owner's NIK (`usaha.pelaku_id → pelaku_usaha.no_ktp`).
4. **Reports data-quality findings with fixes**, for example a 16-digit NIK stored as `INT` (guaranteed truncation), regions stored as free text, tables without a primary key, person data without an ID, and references without a foreign key.
5. **Builds a canonical model**, draws **before/after ERDs** (Mermaid) and generates **consolidation SQL**: master `CREATE TABLE`s with CHECK constraints, union `VIEW`s with type normalisation (`LPAD` for numeric NIKs, sex codes mapped to L/P) and `INSERT … ON CONFLICT`.
6. **Data dictionary** export (CSV/Markdown) and **"Ask the schema"** in natural language, e.g. *"Which tables hold toddler data?"*

## Where the AI fits

The core analysis is deterministic, so results are explainable and repeatable. An LLM (Gemini API free tier, or Groq) is layered on top:

- writes descriptions for tables and for columns the vocabulary does not recognise, in English or Indonesian;
- answers free-form questions grounded **only** in the parsed schema catalogue and findings.

Without an API key the app still works fully, with a keyword-search fallback for questions.

## MCP server for AI agents

SatuSkema is also a **Model Context Protocol** server, so AI agents can read legacy government schemas the way an engineer would. It fits the same idea as connecting agents to the systems an organisation already runs.

- **Remote (Streamable HTTP):** `https://mazharrasyad.tech/satuskema/mcp`
- **Local (stdio):** `node mcp-stdio.js`

| Tool | What it returns |
|---|---|
| `get_sample_schemas` | Four synthetic sample systems to try the other tools with |
| `analyze_schemas` | Stats, cross-system entities, findings with fixes, canonical model, Mermaid ERDs |
| `get_data_dictionary` | Column-level dictionary (concept, role, confidence, description), optional filter |
| `generate_consolidation_sql` | PostgreSQL master tables, union views and consolidation inserts |
| `ask_schema` | Answer to a natural-language question, grounded in the parsed catalogue |

All tools are read-only and take DDL only (`systems: [{ name, sql }]`, optional `lang: "en" | "id"`). Example client config:

```json
{ "mcpServers": { "satuskema": { "type": "http", "url": "https://mazharrasyad.tech/satuskema/mcp" } } }
```

Or for a local checkout:

```json
{ "mcpServers": { "satuskema": { "command": "node", "args": ["/path/to/satuskema/mcp-stdio.js"] } } }
```

Quick check with curl:

```bash
curl -s https://mazharrasyad.tech/satuskema/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Run locally

```bash
cp .env.example .env   # optional: set GEMINI_API_KEY (or GROQ_API_KEY)
npm start              # http://localhost:3170
npm test
```

No npm dependencies; Node ≥ 20 only. Docker: `docker compose up -d` (serves on 127.0.0.1:3170, set `BASE_PATH` for a sub-path).

## Privacy

Only the **structure** (DDL) is uploaded, never row data, and the server stores nothing. All schemas in `samples/` are synthetic.

## Project layout

- `lib/parser.js`: DDL parser
- `lib/concepts.js`: vocabulary of Indonesian public-data concepts and entities (with English labels)
- `lib/analyzer.js`: column tagging, entity detection, findings, canonical model, Mermaid and SQL generation
- `lib/llm.js`: optional AI layer (Gemini / Groq)
- `lib/search.js`: keyword fallback for "Ask the schema"
- `lib/mcp.js`: MCP server (tools, JSON-RPC); `mcp-stdio.js`: stdio transport
- `server.js`: zero-dependency HTTP server
- `public/`: web UI (EN/ID)

Built by Team HackRasaz for Vibe-a-thon 2026 (2nd Brain Labs × Geek Room).

---

*Ringkasan (ID): SatuSkema membaca DDL beberapa aplikasi pemerintahan, menemukan data penduduk/pegawai/usaha yang disimpan berulang, lalu membuat kamus data, model kanonik, ERD sebelum/sesudah, dan SQL konsolidasi. Antarmuka tersedia dalam bahasa Inggris dan Indonesia.*
