FROM python:3.13-alpine

WORKDIR /app

# Copy static files
COPY index.html style.css app.js /app/zebra-label-maker/

# Copy the combined server (serves static + print bridge)
COPY zebra-print-server.py /app/server.py

EXPOSE 5555

HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://localhost:5555/health || exit 1

CMD ["python3", "/app/server.py"]
