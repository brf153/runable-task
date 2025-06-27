export const WORKSPACE_DIR = "/home/agent/workspace";
export const SCRATCHPAD_FILENAME = "agent_scratchpad.md";
export const STATUS_FILENAME = "status.json";
export const ARCHIVE_FILENAME = "project.zip";
export const ALLOWED_COMMANDS = [
    'ls', 'cat', 'echo', 'pwd', 'zip', 'unzip', 'cp', 'mv', 'mkdir', 'touch', 'find'
    // Add more as needed, but avoid dangerous ones like 'rm', 'apt', etc.
];