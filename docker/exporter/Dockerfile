# SALEM: this image is built FROM THIS CHECKOUT. It compiles the exporter
# source in monitoring/exporter/ instead of downloading a prebuilt binary from
# the upstream Tinode release channel.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT:
#     docker build -f docker/exporter/Dockerfile .

# ---------------------------------------------------------------------------
# Stage 1: compile the metrics exporter from source.
# ---------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder

ARG TARGETARCH=amd64

COPY go.mod go.sum ./
RUN go mod download

COPY monitoring/exporter/ ./monitoring/exporter/

# Pure Go, no cgo: the resulting binary is static and portable.
RUN set -eu; \
	mkdir -p /out; \
	CGO_ENABLED=0 GOOS=linux GOARCH="$TARGETARCH" \
		go build -trimpath -o /out/exporter ./monitoring/exporter

# ---------------------------------------------------------------------------
# Stage 2: runtime image.
# ---------------------------------------------------------------------------
FROM alpine:3.22

ARG VERSION=0.16.4
ENV VERSION=$VERSION

LABEL maintainer="Tinode Team <info@tinode.co>"
LABEL name="TinodeMetricExporter"
LABEL version=$VERSION

ENV SERVE_FOR=""
ENV WAIT_FOR=""

ENV TINODE_ADDR=http://localhost/stats/expvar/
ENV INSTANCE="exporter-instance"

ENV INFLUXDB_VERSION=1.7
ENV INFLUXDB_ORGANIZATION="org"
ENV INFLUXDB_PUSH_INTERVAL=60
ENV INFLUXDB_PUSH_ADDRESS=""
ENV INFLUXDB_AUTH_TOKEN=""

ENV PROM_NAMESPACE="tinode"
ENV PROM_METRICS_PATH="/metrics"

WORKDIR /opt/tinode

RUN apk add --no-cache bash

# Exporter built from this checkout.
COPY --from=builder /out/exporter ./exporter

COPY docker/exporter/entrypoint.sh .

RUN chmod +x exporter && chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]

EXPOSE 6222