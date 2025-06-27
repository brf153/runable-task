import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Docker from 'dockerode';

const app = express();
const port = 8000;
// Connect to the Docker daemon via the socket
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const OUTPUTS_DIR = path.resolve("./outputs");
fs.mkdir(OUTPUTS_DIR, { recursive: true });

// Middleware to parse plain text body
app.use(express.text());

async function runAgentJob(jobId, task) {
    const jobDir = path.join(OUTPUTS_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    // Initial status
    await fs.writeFile(path.join(jobDir, "status.json"), JSON.stringify({ status: "starting", task }));

    try {
        console.log(`Starting container for job ${jobId}`);
        // Make sure the sandbox image is built: `docker build -t coding-agent-sandbox-node -f sandbox/Dockerfile_node .`
        await docker.run("coding-agent-sandbox-node:latest", [], process.stdout, {
            Env: [
                `TASK=${task}`,
                `OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`
            ],
            HostConfig: {
                // Mount the job-specific output directory
                Binds: [`${jobDir}:/home/agent/workspace`],
                // Automatically remove the container when it exits
                AutoRemove: true,
            }
        });
        console.log(`Container for job ${jobId} has finished.`);
    } catch (error) {
        const errorMessage = `Failed to start or run container: ${error.message}`;
        console.error(`ERROR for job ${jobId}: ${errorMessage}`);
        await fs.writeFile(path.join(jobDir, "status.json"), JSON.stringify({ status: "error", message: errorMessage }));
    }
}

app.post('/schedule', (req, res) => {
    const task = req.body;
    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not set on the orchestrator." });
    }
    if (!task) {
        return res.status(400).json({ error: "Task description cannot be empty." });
    }

    const jobId = uuidv4();
    
    // Run in the background (don't await the promise)
    runAgentJob(jobId, task);

    res.status(202).json({ job_id: jobId });
});

app.get('/status/:id', async (req, res) => {
    const { id: jobId } = req.params;
    const statusFile = path.join(OUTPUTS_DIR, jobId, "status.json");

    try {
        const statusData = JSON.parse(await fs.readFile(statusFile, 'utf8'));
        if (statusData.status === 'complete') {
            statusData.download_url = `/download/${jobId}`;
        }
        res.json(statusData);
    } catch (error) {
        // This can happen if the job exists but the status file isn't written yet
        if (await fs.stat(path.join(OUTPUTS_DIR, jobId)).catch(() => false)) {
             return res.json({ status: "pending", message: "Job is scheduled but has not started yet." });
        }
        res.status(404).json({ error: "Job not found" });
    }
});

app.get('/download/:id', async (req, res) => {
    const { id: jobId } = req.params;
    const zipPath = path.join(OUTPUTS_DIR, jobId, 'project.zip');
    
    try {
        // Check if file exists before sending
        await fs.access(zipPath);
        res.download(zipPath, `${jobId}_project.zip`);
    } catch (error) {
        res.status(404).json({ error: "Project archive not found." });
    }
});

app.listen(port, () => {
    console.log(`NodeJS Orchestrator listening on http://localhost:${port}`);
});