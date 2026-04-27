#!/usr/bin/env python3
"""
Zebra Label Maker — Combined static file server + ZPL print bridge.
Serves the web UI and forwards print jobs to the Zebra ZD421 via raw TCP.
Exposed via Cloudflare Tunnel at zebra.dlewis.me.
"""

import json
import socket
import os
import mimetypes
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger('zebra')

STATIC_DIR = Path(os.environ.get('STATIC_DIR', str(Path(__file__).parent / 'zebra-label-maker')))
DEFAULT_PRINTER_IP = os.environ.get('PRINTER_IP', '10.0.1.161')
DEFAULT_PRINTER_PORT = int(os.environ.get('PRINTER_PORT', '9100'))
LISTEN_PORT = int(os.environ.get('PORT', '5555'))

MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
}


class Handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            printer_ok = False
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(2)
                s.connect((DEFAULT_PRINTER_IP, DEFAULT_PRINTER_PORT))
                s.close()
                printer_ok = True
            except:
                pass
            self._json_response(200, {
                'status': 'ok',
                'printer': DEFAULT_PRINTER_IP,
                'printer_reachable': printer_ok
            })
            return

        # Static file serving
        path = self.path.split('?')[0]
        if path == '/':
            path = '/index.html'

        file_path = STATIC_DIR / path.lstrip('/')
        try:
            file_path = file_path.resolve()
            if not str(file_path).startswith(str(STATIC_DIR.resolve())):
                self.send_error(403)
                return
        except:
            self.send_error(400)
            return

        if file_path.is_file():
            ext = file_path.suffix
            content_type = MIME_TYPES.get(ext, mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream')
            try:
                data = file_path.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', len(data))
                self.send_header('Cache-Control', 'public, max-age=3600')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                log.error(f'Error serving {file_path}: {e}')
                self.send_error(500)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != '/print':
            self.send_error(404)
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
            zpl = data.get('zpl', '')
            ip = data.get('ip', DEFAULT_PRINTER_IP)
            port = int(data.get('port', DEFAULT_PRINTER_PORT))

            if not zpl:
                self._json_response(400, {'error': 'Missing zpl data'})
                return

            if not (ip.startswith('10.') or ip.startswith('192.168.') or ip.startswith('172.')):
                self._json_response(403, {'error': 'Only local network printers allowed'})
                return

            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect((ip, port))
            sock.sendall(zpl.encode('utf-8'))
            sock.close()

            self._json_response(200, {
                'status': 'ok',
                'bytes_sent': len(zpl),
                'printer': f'{ip}:{port}'
            })
            log.info(f'Sent {len(zpl)} bytes to {ip}:{port}')

        except socket.error as e:
            msg = f'Printer connection failed: {e}'
            self._json_response(502, {'error': msg})
            log.error(msg)

        except Exception as e:
            msg = f'Server error: {e}'
            self._json_response(500, {'error': msg})
            log.error(msg)

    def _json_response(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        log.info(format % args)


if __name__ == '__main__':
    if not STATIC_DIR.is_dir():
        log.error(f'Static directory not found: {STATIC_DIR}')
        exit(1)
    server = HTTPServer(('0.0.0.0', LISTEN_PORT), Handler)
    log.info(f'Zebra Label Maker serving on http://0.0.0.0:{LISTEN_PORT}')
    log.info(f'Static files: {STATIC_DIR}')
    log.info(f'Default printer: {DEFAULT_PRINTER_IP}:{DEFAULT_PRINTER_PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info('Shutting down.')
        server.shutdown()
