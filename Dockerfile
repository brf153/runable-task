# Base image with a desktop environment
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install curl for NodeSource setup and other essential tools
RUN apt-get update && apt-get install -y \
    curl git wget unzip xvfb x11vnc fluxbox xdotool \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Node.js (LTS version) and build tools
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
RUN apt-get install -y nodejs build-essential

# Create a non-root user for the agent
RUN useradd --create-home --shell /bin/bash agent
USER agent
WORKDIR /home/agent

# Setup workspace
RUN mkdir /home/agent/workspace
WORKDIR /home/agent/workspace

# Install agent's Node.js dependencies
COPY --chown=agent:agent agent/package.json .
RUN npm install

# Copy agent code
COPY --chown=agent:agent agent/ /home/agent/agent/

# Copy the startup script
USER root
COPY sandbox/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh
USER agent

# Expose VNC and noVNC ports
EXPOSE 5900 6080

ENV HOME /home/agent
ENV DISPLAY=:1

# The start script will launch everything
ENTRYPOINT ["/usr/local/bin/start.sh"]