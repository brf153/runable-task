import { ALLOWED_COMMANDS } from "./constants";

export const isCommandAllowed = (command) => {
    // Only allow commands that start with an allowed command
    const cmd = command.trim().split(/\s+/)[0];
    return ALLOWED_COMMANDS.includes(cmd);
}

export const callOpenAIWithRetry = async (client, request) => {
    try {
        return await client.chat.completions.create(request);
    } catch (err) {
        // Only retry on network or rate-limit errors
        if (
            err.code === 'ETIMEDOUT' ||
            err.code === 'ECONNRESET' ||
            err.response?.status === 429 ||
            err.response?.status >= 500
        ) {
            console.warn("OpenAI call failed, retrying in 2s...", err.message || err);
            await new Promise(res => setTimeout(res, 2000));
            // Try once more
            return await client.chat.completions.create(request);
        }
        throw err;
    }
}