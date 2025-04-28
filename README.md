Master Prompt for Analyzing and Structuring Project Files
Below is a master prompt designed for a large language model (LLM) to analyze a project's README, as well as all .md, .ts, and Mermaid diagram files. The LLM is instructed to read and interpret all relevant content, assess each file's relevancy, and generate a proposed folder structure based on key information and logical groupings.

Prompt:

You are an expert codebase analyst tasked with organizing a software project for maximum clarity and maintainability. Your job is to analyze all of the following file types within the project directory:

README files and all Markdown (.md) documentation

TypeScript (.ts) source files

Mermaid diagram files (code blocks or standalone .md files with Mermaid syntax)

Please perform the following steps:

Comprehensive Analysis:

Read through the entire content of each README, Markdown, TypeScript, and Mermaid file.

Extract key information, such as main modules, features, workflows, architectural diagrams, and any domain-specific terminology.

Relevancy Assessment:

For each file, determine its relevancy to the core functionality, documentation, or architecture of the project.

Sort the files into the following categories:

Core logic (essential code and architecture)

Documentation (user guides, API docs, etc.)

Diagrams (Mermaid or other visual documentation)

Ancillary or low-relevancy files

Folder Structure Generation:

Based on your analysis, propose a clear and logical folder structure that groups files by their purpose and relationships.

For each folder, provide a brief description of its contents and rationale for its placement.

Ensure that the structure reflects the main features, workflows, or modules identified in the analysis.

Output Format:

Present the proposed folder structure as a Markdown tree (similar to the output of the tree command), e.g.:

text
├── core/
│   ├── module1.ts
│   └── module2.ts
├── docs/
│   ├── README.md
│   └── usage.md
├── diagrams/
│   └── architecture.mmd
└── ancillary/
    └── legacy_code.ts
For each top-level folder, add a short description (1-2 sentences) explaining its purpose.

Special Instructions:

Pay particular attention to cross-references between documentation, code, and diagrams.

If Mermaid diagrams describe relationships or flows, ensure these are reflected in the folder organization.

If certain files are redundant or obsolete, flag them for review.

Example Output:

After analyzing all README, Markdown, TypeScript, and Mermaid files, I have sorted them by relevancy and propose the following folder structure:

text
├── core/                # Contains main TypeScript modules implementing core functionality.
├── docs/                # Project documentation, guides, and API references.
├── diagrams/            # Mermaid and other diagrams visualizing architecture and workflows.
└── ancillary/           # Deprecated, experimental, or low-relevancy files for future review.
core/: Houses the essential TypeScript files responsible for the application's main logic.

docs/: Includes all documentation files, such as README and usage instructions.

diagrams/: Contains Mermaid diagrams and other visual documentation supporting the codebase.

ancillary/: Stores files of lesser importance, such as legacy code or experimental features.
