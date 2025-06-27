#!/bin/bash
set -e

# ... (VNC, Xvfb, noVNC startup is identical to Python version) ...
Xvfb :1 -screen 0 1280x800x24 &
fluxbox &
x11vnc -display :1 -nopw -listen 0.0.0.0 -forever &
/usr/local/novnc/utils/launch.sh --vnc localhost:5900 --listen 6080 &
sleep 3
echo "----------------------------------------------------"
echo "Sandbox Environment Ready! (Node.js)"
echo "VNC running on port 5900"
echo "noVNC (web access) running on http://localhost:6080/vnc.html"
echo "----------------------------------------------------"

# Check if a TASK was provided
if [ -z "$TASK" ]; then
    echo "No TASK environment variable provided. Idling."
    tail -f /dev/null
else
    echo "Starting agent with task: $TASK"
    # Execute the agent using Node.js
    node /home/agent/agent/main.js "$TASK"
fi