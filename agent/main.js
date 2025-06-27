import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';

const execAsync = promisify(exec);

// --- Configuration ---
const WORKSPACE_DIR = "/home/agent/workspace";
const SCRATCHPAD_FILE = path.join(WORKSPACE_DIR, "agent_scratchpad.md");
const STATUS_FILE = path.join(WORKSPACE_DIR, "status.json");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Tool Definitions ---

async function execute_shell(command) {
    console.log(`Executing shell command: ${command}`);
    try {
        const { stdout, stderr } = await execAsync(command, { cwd: WORKSPACE_DIR, timeout: 30000 });
        return `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
    } catch (error) {
        return `ERROR: Command failed with exit code ${error.code}\nSTDOUT:\n${error.stdout}\nSTDERR:\n${error.stderr}`;
    }
}

async function read_file(filePath) {
    const fullPath = path.join(WORKSPACE_DIR, filePath);
    try {
        return await fs.readFile(fullPath, 'utf8');
    } catch (error) {
        return `ERROR: Could not read file: ${error.message}`;
    }
}

async function write_file(filePath, content) {
    const fullPath = path.join(WORKSPACE_DIR, filePath);
    try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
        return `File written successfully to ${filePath}`;
    } catch (error) {
        return `ERROR: Could not write to file: ${error.message}`;
    }
}

async function task_finished(final_project_path) {
    // A simple validation
    try {
        const stats = await fs.stat(path.join(WORKSPACE_DIR, final_project_path));
        if (!stats.isDirectory()) {
            return `ERROR: The specified project path '${final_project_path}' is not a directory.`;
        }
    } catch (e) {
        return `ERROR: The specified project path '${final_project_path}' does not exist.`;
    }
    const zipCommand = `zip -r /home/agent/workspace/project.zip ${final_project_path}`;
    await execute_shell(zipCommand);
    return "Task marked as finished. Project archived at project.zip.";
}

// --- Agent Core Logic ---

async function updateStatus(status, message = "") {
    await fs.writeFile(STATUS_FILE, JSON.stringify({ status, message }));
}

async function logToScratchpad(content) {
    await fs.appendFile(SCRATCHPAD_FILE, `${content}\n\n`);
}

async function getContextSummary() {
    const fileTree = await execute_shell("ls -R");
    let scratchpadContent = "";
    try {
        const fullContent = await fs.readFile(SCRATCHPAD_FILE, 'utf8');
        scratchpadContent = fullContent.split('\n').slice(-40).join('\n'); // Last 40 lines
    } catch (e) {
        // file doesn't exist yet, that's fine
    }
    return `
## Current File Tree in /workspace:
${fileTree}

## Recent Activity (from scratchpad):
${scratchpadContent}
`;
}

async function main() {
    const initialTask = process.argv[2];
    if (!initialTask) {
        console.error("Usage: node main.js \"<task>\"");
        process.exit(1);
    }

    await logToScratchpad(`# AGENT INITIATED\n\n**Goal:** ${initialTask}`);
    await updateStatus("running", "Agent started.");

    let messages = [
        { role: "system", content: "You are an expert software developer agent using a NodeJS environment. Your goal is to complete the user's task by using the provided tools. You operate in a sandboxed environment. All file paths are relative to the `/workspace` directory. Think step-by-step. When the task is fully complete, call the `task_finished` tool with the path to the final project folder." },
        { role: "user", content: `The main goal is: ${initialTask}. Here is the current state of your environment. Decide on your next action.\n${await getContextSummary()}` }
    ];
    
    const tools = [ /* Tool definitions are identical to the Python version's structure */ ];
    const available_functions = { execute_shell, read_file, write_file, task_finished };

    const maxTurns = 25;
    for (let i = 0; i < maxTurns; i++) {
        console.log(`--- Turn ${i + 1}/${maxTurns} ---`);

        const response = await client.chat.completions.create({
            model: "gpt-4-1106-preview",
            messages: messages,
            tools: [
                { type: "function", function: { name: "execute_shell", description: "Executes a shell command.", parameters: { type: "object", properties: { "command": { "type": "string" } }, required: ["command"] } } },
                { type: "function", function: { name: "read_file", description: "Reads a file's content.", parameters: { type: "object", properties: { "filePath": { "type": "string" } }, required: ["filePath"] } } },
                { type: "function", function: { name: "write_file", description: "Writes content to a file.", parameters: { type: "object", properties: { "filePath": { "type": "string" }, "content": { "type": "string" } }, required: ["filePath", "content"] } } },
                { type: "function", function: { name: "task_finished", description: "Marks the task as complete and archives the result.", parameters: { type: "object", properties: { "final_project_path": { "type": "string" } }, required: ["final_project_path"] } } },
            ],
            tool_choice: "auto",
        });

        const responseMessage = response.choices[0].message;
        messages.push(responseMessage);

        if (!responseMessage.tool_calls) {
            console.log("No tool call detected. Thinking...");
            messages.push({ role: "user", content: `You did not select a tool. Please review the goal and the current state, then choose a tool to proceed.\n${await getContextSummary()}` });
            continue;
        }

        for (const tool_call of responseMessage.tool_calls) {
            const functionName = tool_call.function.name;
            const functionArgs = JSON.parse(tool_call.function.arguments);
            
            await logToScratchpad(`**Thought:** The user wants me to perform \`${functionName}\`. I will call it with these arguments: \`${JSON.stringify(functionArgs)}\`.\n\n**Action:**`);
            
            const functionToCall = available_functions[functionName];
            const functionResponse = await functionToCall(...Object.values(functionArgs));
            
            await logToScratchpad(`Tool: \`${functionName}\`\nOutput:\n\`\`\`\n${functionResponse}\n\`\`\``);
            console.log(`Tool: ${functionName}, Output: ${functionResponse.substring(0, 200)}...`);

            messages.push({
                tool_call_id: tool_call.id,
                role: "tool",
                name: functionName,
                content: functionResponse,
            });

            if (functionName === "task_finished") {
                console.log("Task finished. Exiting.");
                await updateStatus("complete", "Project archived at project.zip");
                return;
            }
        }
        messages.push({ role: "user", content: `Okay, that action is complete. Here is the updated state of the environment. Continue with the next step towards the main goal: ${initialTask}.\n${await getContextSummary()}` });
    }

    console.log("Max turns reached. Exiting.");
    await updateStatus("error", "Agent stopped after reaching max turns.");
}

main().catch(console.error);