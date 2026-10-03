# Dockerfile builds an image with a chatbot (Tino) for Tinode.
#
# SALEM: this image is built FROM THIS CHECKOUT. It installs the chatbot
# sources in chatbot/python/ instead of downloading a prebuilt tarball from
# the upstream Tinode release channel.
#
# NOTE: the Tinode chatbot is NOT on the Salem product roadmap. It is retained
# only so the inherited docker-build.sh path keeps working. See
# docs/salem-current-state.md.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT:
#     docker build -f docker/chatbot/Dockerfile .

FROM python:3.13-slim

ARG VERSION=0.25
ARG LOGIN_AS=
ARG TINODE_HOST=tinode-srv:16060
ENV VERSION=$VERSION

LABEL maintainer="Tinode Team <info@tinode.co>"
LABEL name="TinodeChatbot"
LABEL version=$VERSION

RUN mkdir -p /usr/src/bot

WORKDIR /usr/src/bot

# Volume with login cookie. Not created automatically.
# VOLUME /botdata

# Chatbot source and data from this checkout (chatbot.py, quotes.txt,
# requirements.txt).
COPY chatbot/python/ .

RUN pip install --no-cache-dir -r requirements.txt

# Healthcheck: try to connect to the gRPC port (40051)
HEALTHCHECK --interval=1m --timeout=3s --start-period=15s \
  CMD python -c "import socket; s=socket.create_connection(('localhost', 40051), timeout=1); s.close()" || exit 1

# Use docker's command line parameter `-e LOGIN_AS=user:password` to login as someone other than Tino.

CMD ["/bin/sh", "-c", "python chatbot.py --login-basic=${LOGIN_AS} --login-cookie=/botdata/.tn-cookie --host=${TINODE_HOST} >> /var/log/chatbot.log"]

# Plugin port
EXPOSE 40051