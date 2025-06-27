# Nomad Shell: Autonomous Code Generation Agent Orchestrator

## Overview

Nomad Shell is a system for orchestrating autonomous code-generation agents in isolated Docker containers. It allows you to submit coding tasks via an HTTP API, runs each task in a secure sandbox, and provides status updates and downloadable results.

## Architecture

- **Orchestrator (`orchestrator/server.js`)**:  
  An Express server that exposes endpoints to schedule jobs, check their status, and download results. It manages job directories and launches agent containers for each task.

- **Agent (`agent/main.js`)**:  
  The core logic that runs inside each Docker container. The agent receives a task, interacts with the OpenAI API, and uses a set of tools (shell commands, file read/write, etc.) to iteratively solve the task. It logs its actions and archives the final project.

- **Sandbox Environment (`sandbox/start.sh`)**:  
  Defines the entrypoint script. Each job runs in an isolated container with a mounted workspace directory for outputs.

## Workflow

1. **Submit a Task**  
   Send a POST request to `/schedule` with your task description. The orchestrator creates a unique job and starts a Docker container running the agent.

2. **Agent Execution**  
   The agent receives the task, logs its progress, and uses the OpenAI API to decide on actions (e.g., running shell commands, editing files). All actions are logged in a scratchpad and status file.

3. **Status Updates**  
   Check `/status/:job_id` to see the current status of your job (pending, running, complete, or error).

4. **Download Results**  
   Once complete, download the archived project from `/download/:job_id`.

## Key Files

- `orchestrator/server.js` — Orchestrator server and API endpoints.
- `agent/main.js` — Agent logic and OpenAI tool loop.
- `agent/constants.js`, `agent/helper.js` — Shared constants and helper functions.
- `sandbox/start.sh` — Sandbox setup.

## Endpoints

- `POST /schedule` — Schedule a new job. Body: plain text task description.
- `GET /status/:id` — Get the status of a job.
- `GET /download/:id` — Download the zipped project output.

## Requirements

- Docker installed and running.
- Node.js for orchestrator and agent.
- OpenAI API key set as `OPENAI_API_KEY` in the environment.

## Usage

1. **Build the Docker image:**
   ```sh
   docker build -t coding-agent-sandbox-node -f Dockerfile .
   ```

2. **Start the orchestrator:**
   ```sh
   node orchestrator/server.js
   ```

3. **Submit a task:**
   ```sh
   curl -X POST http://localhost:8000/schedule -d "Create a Node.js app that prints Hello World"
   ```

4. **Check status:**
   ```sh
   curl http://localhost:8000/status/<job_id>
   ```

5. **Download result:**
   ```sh
   curl -O http://localhost:8000/download/<job_id>
   ```

## Security

- All agent actions are sandboxed in Docker containers.
- Only a safe subset of shell commands is allowed.
- Each job has its own isolated workspace.

---

**Summary:**  
Nomad Shell lets you automate code generation tasks safely and reproducibly using LLM agents in containers, with a simple HTTP API for orchestration and result retrieval.