# Planning Workflow

## Usage:

This command is used as a starting point to any agent-driven work on this project. It outlines a workflow and best practices for how to approach any user request.

The command will be used as `/plan-work <description>`

The `<description>` placeholder will be the user's request that starts the planning/task workflow. The request must be analysed and the workflow carried out according to the bellow instructions.

---

## BEFORE ANALYSIS

Ensure you are familiar with this project. Read and obey [copilot-instructions.md](../copilot-instructions.md).

## PLANNING WORKFLOW

1. **Consult existing plans**:
   - Check the `.github/plans/` directory for a relevant plan file.
   - Prefer:
     - A task- or feature-specific plan (e.g., `.github/plans/feature-123-add-billing.md`)
     - Or a more general module-level plan if applicable.

2. **If a suitable plan exists**:
   - Read and follow it.
   - Summarize it briefly to the user:
     - What it intends
     - Any constraints or open questions you notice

3. **If no suitable plan exists**:
   - Create a new plan in `.github/plans/` that describes what you propose to implement.
   - Plans must be markdown formatted in an `.md` file

4. **During planning**:
   - Always ask the user for confirmation on open questions, missing details, or decision points
   - Analyze proposals and produced content critically

5. **End of planning**
   - The workflow must always attempt to end using the **askQuestions** tool to confirm whether changes are still required or implementation can proceed.

**Hard gate**: Apart from the plan file itself, do not write or edit any code until the user has explicitly confirmed the plan

## PLAN CONTENTS

When you create a plan, it should be **explicit, structured, and reviewable**. Use markdown formatting.

### COMMUNICATION AND REASONING

- Communicate as a professional engineer:
  - Clear, concise, and structured
  - Use headings and bullet points for non-trivial responses
- Focus on:
  - The problem
  - The plan/design
  - The implementation and its impact

**When uncertain:**

- Explicitly state your uncertainty.
- Ask targeted clarification questions using the **askQuestions** tool.
- If no clarification is possible and you must proceed:
  - Choose the safest, most backwards-compatible option.
  - Document your assumptions in the plan and/or explanation.

Do **not** expose raw step-by-step chain-of-thought. Instead, provide succinct, high-level reasoning summaries.
